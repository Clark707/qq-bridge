// 入站媒体投影与本地富化。
//
// 职责边界：
// - 纯函数只处理 OneBot 段 → 元数据/文本标注，可在测试里独立验证。
// - 运行函数只负责“证据变文本/图片”：QQ 原生语音转写优先，失败后用本地
//   faster-whisper；视频先落临时文件，再由本地 ffmpeg 抽帧并转写音轨。
// - 所有网络字节都走 safeFetchBytes；不在这里复制 SSRF/重定向防护。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_SECONDS = 300;
const DEFAULT_MAX_FRAMES = 16;

function positiveInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

function safePathInside(root, candidate) {
  try {
    const realRoot = fs.realpathSync(root);
    const real = fs.realpathSync(candidate);
    return real === realRoot || real.startsWith(realRoot + path.sep);
  } catch {
    return false;
  }
}

/** 从 OneBot 消息段中提取语音/视频。图片和表情仍由 bridge 的既有链路处理。 */
export function extractInboundMediaFromSegments(segments) {
  const out = [];
  for (const seg of Array.isArray(segments) ? segments : []) {
    if (!seg || typeof seg !== 'object') continue;
    const d = seg.data && typeof seg.data === 'object' ? seg.data : {};
    if (seg.type !== 'record' && seg.type !== 'video') continue;
    const file = String(d.file ?? d.file_id ?? '').trim();
    const url = String(d.url ?? d.src ?? '').trim();
    if (!file && !url) continue;
    out.push({
      kind: seg.type,
      file,
      url,
      durationSec: Number.isFinite(Number(d.duration)) ? Math.max(0, Number(d.duration)) : null,
      thumbUrl: seg.type === 'video' ? String(d.thumb ?? d.thumb_url ?? d.cover ?? '').trim() : ''
    });
  }
  return out;
}

/** 把已有占位标注按消息段顺序替换成富化后的标注。 */
export function applyInboundAnnotations(text, annotations) {
  let out = String(text ?? '');
  for (const item of Array.isArray(annotations) ? annotations : []) {
    const placeholder = item?.kind === 'record' ? '[语音]' : item?.kind === 'video' ? '[视频]' : '';
    const replacement = String(item?.text ?? '').trim();
    if (!placeholder || !replacement) continue;
    const index = out.indexOf(placeholder);
    if (index >= 0) out = out.slice(0, index) + replacement + out.slice(index + placeholder.length);
  }
  return out;
}

export function annotationForAsset(asset) {
  if (asset.kind === 'record') {
    if (asset.transcript) return `[语音转写：${asset.transcript}]`;
    const duration = asset.durationSec ? ` ${asset.durationSec.toFixed(1)}秒` : '';
    return `[语音${duration}，转写失败]`;
  }
  if (asset.kind === 'video') {
    const duration = asset.durationSec ? ` ${asset.durationSec.toFixed(1)}秒` : '';
    const frames = asset.frames?.length ? `，${asset.frames.length}帧` : '';
    const transcript = asset.transcript ? `；音轨转写：${asset.transcript}` : '';
    return `[视频${duration}${frames}${transcript}]`;
  }
  return '';
}

function runProcess(command, args, { timeoutMs = 180000, cwd = undefined } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(new Error(`入站媒体处理超时（${Math.round(timeoutMs / 1000)}秒）`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
    });
    child.on('error', (error) => finish(new Error(`无法启动媒体处理进程：${error?.message ?? error}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
        let detail = '';
        try { detail = String(JSON.parse(lines.at(-1) ?? '')?.error ?? ''); } catch {}
        finish(new Error(detail || stderr.trim().slice(-1200) || `媒体处理进程退出码 ${code}`));
        return;
      }
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      let payload = null;
      try { payload = JSON.parse(lines.at(-1) ?? ''); } catch {}
      if (!payload?.ok) {
        finish(new Error(stdout.trim().slice(-1200) || '媒体处理进程没有返回有效 JSON'));
        return;
      }
      finish(null, payload);
    });
  });
}

/**
 * 把一条消息中的语音/视频富化成模型可读证据。
 *
 * @returns {Promise<{annotations: Array, media: Array, temporaryFiles: string[]}>}
 */
export async function enrichInboundMessage({
  segments,
  messageId,
  bot,
  safeFetchBytes,
  pythonPath,
  ffmpegPath,
  modelPath,
  maxBytes = DEFAULT_MAX_BYTES,
  maxSeconds = DEFAULT_MAX_SECONDS,
  maxFrames = DEFAULT_MAX_FRAMES,
  workDir = path.join(os.tmpdir(), 'qq-inbound-media'),
  log = () => {}
} = {}) {
  const assets = extractInboundMediaFromSegments(segments);
  const annotations = [];
  const media = [];
  const temporaryFiles = [];
  if (!assets.length) return { annotations, media, temporaryFiles };

  fs.mkdirSync(workDir, { recursive: true });
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'inbound_media.py');
  const byteLimit = positiveInt(maxBytes, DEFAULT_MAX_BYTES, 1024, 64 * 1024 * 1024);
  const secondsLimit = positiveInt(maxSeconds, DEFAULT_MAX_SECONDS, 1, 900);
  const frameLimit = positiveInt(maxFrames, DEFAULT_MAX_FRAMES, 1, 16);

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const base = `inbound-${String(messageId ?? 'unknown')}-${i + 1}`;
    try {
      if (asset.kind === 'record' && messageId != null) {
        try {
          const native = await bot.request('fetch_ptt_text', { message_id: Number(messageId) }, { timeoutMs: 6000 });
          if (native?.status === 'ok' && native?.retcode === 0 && native?.data?.text) {
            asset.transcript = String(native.data.text).trim().slice(0, 1200);
            annotations.push({ kind: asset.kind, text: annotationForAsset(asset) });
            continue;
          }
        } catch (error) {
          log(`QQ 原生语音转写不可用，改用本地模型：${error?.message ?? error}`);
        }
      }

      let localAudio = null;
      if (asset.kind === 'record' && asset.file) {
        try {
          const rec = await bot.request('get_record', { file: asset.file, out_format: 'wav' });
          const b64 = rec?.status === 'ok' && rec?.retcode === 0 ? String(rec?.data?.base64 ?? '') : '';
          if (b64) {
            localAudio = path.join(workDir, `${base}.wav`);
            fs.writeFileSync(localAudio, Buffer.from(b64, 'base64'));
          }
        } catch (error) {
          log(`get_record 转码失败，尝试直接下载：${error?.message ?? error}`);
        }
      }
      if (!localAudio && asset.url) {
        const fetched = await safeFetchBytes(asset.url, byteLimit);
        localAudio = path.join(workDir, `${base}${asset.kind === 'video' ? '.mp4' : '.audio'}`);
        fs.writeFileSync(localAudio, fetched.buffer);
      }
      if (!localAudio) {
        annotations.push({ kind: asset.kind, text: annotationForAsset(asset) });
        continue;
      }

      if (asset.kind === 'record') {
        const result = await runProcess(pythonPath, [
          script, 'transcribe',
          '--input', localAudio,
          '--model', String(modelPath ?? ''),
          '--max-seconds', String(secondsLimit)
        ], { timeoutMs: 180000 });
        asset.transcript = String(result.text ?? '').trim().slice(0, 1200);
        if (Number.isFinite(Number(result.duration))) asset.durationSec = Number(result.duration);
        fs.rmSync(localAudio, { force: true });
      } else {
        const frameDir = path.join(workDir, `${base}-frames`);
        fs.mkdirSync(frameDir, { recursive: true });
        const result = await runProcess(pythonPath, [
          script, 'video',
          '--input', localAudio,
          '--model', String(modelPath ?? ''),
          '--ffmpeg', String(ffmpegPath ?? ''),
          '--out-dir', frameDir,
          '--max-seconds', String(secondsLimit),
          '--max-frames', String(frameLimit)
        ], { timeoutMs: 240000 });
        asset.transcript = String(result.transcript ?? '').trim().slice(0, 1200);
        if (Number.isFinite(Number(result.duration))) asset.durationSec = Number(result.duration);
        asset.frames = [];
        for (const frame of Array.isArray(result.frames) ? result.frames : []) {
          const p = path.resolve(frameDir, String(frame));
          if (!safePathInside(frameDir, p)) continue;
          const stat = fs.statSync(p);
          if (!stat.isFile() || stat.size <= 0 || stat.size > byteLimit) continue;
          asset.frames.push(p);
          temporaryFiles.push(p);
          media.push({ kind: 'inbound-frame', path: p, mimeType: 'image/jpeg' });
        }
        fs.rmSync(localAudio, { force: true });
      }
      annotations.push({ kind: asset.kind, text: annotationForAsset(asset) });
    } catch (error) {
      log(`入站 ${asset.kind} 富化失败，保留占位并继续：${error?.message ?? error}`);
      annotations.push({
        kind: asset.kind,
        text: asset.kind === 'record' ? '[语音，转写失败]' : '[视频，抽帧或音轨理解失败]'
      });
    }
  }
  return { annotations, media, temporaryFiles };
}

export const _test = { positiveInt, safePathInside };

/** 为动图/GIF 抽取少量关键帧。返回可直接进入视觉模型的本地 JPEG 路径。 */
export async function extractAnimatedImageFrames({
  inputPath,
  pythonPath,
  ffmpegPath,
  outDir,
  maxFrames = 4,
  maxBytes = DEFAULT_MAX_BYTES,
  log = () => {}
} = {}) {
  const source = path.resolve(String(inputPath ?? ''));
  const output = path.resolve(String(outDir ?? ''));
  fs.mkdirSync(output, { recursive: true });
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'inbound_media.py');
  try {
    const result = await runProcess(pythonPath, [
      script, 'frames',
      '--input', source,
      '--ffmpeg', String(ffmpegPath ?? ''),
      '--out-dir', output,
      '--max-frames', String(positiveInt(maxFrames, 4, 1, 8))
    ], { timeoutMs: 90000 });
    const frames = [];
    for (const name of Array.isArray(result.frames) ? result.frames : []) {
      const candidate = path.resolve(output, String(name));
      if (!safePathInside(output, candidate)) continue;
      const stat = fs.statSync(candidate);
      if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) continue;
      frames.push(candidate);
    }
    return { frames, duration: Number(result.duration) || null };
  } catch (error) {
    log(`动图抽帧失败：${error?.message ?? error}`);
    return { frames: [], duration: null };
  }
}
