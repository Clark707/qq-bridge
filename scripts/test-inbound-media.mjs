import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  extractInboundMediaFromSegments,
  applyInboundAnnotations,
  annotationForAsset,
  enrichInboundMessage
} from '../src/inbound-media.js';

const failures = [];
async function test(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`FAIL ${name} — ${error?.stack ?? error}`);
  }
}

await test('从 OneBot 段提取语音和视频，不误拿图片', () => {
  const media = extractInboundMediaFromSegments([
    { type: 'text', data: { text: '看' } },
    { type: 'record', data: { file: 'voice.amr', url: 'https://example.com/v.amr', duration: 3.2 } },
    { type: 'video', data: { file: 'clip.mp4', url: 'https://example.com/v.mp4', duration: 8 } },
    { type: 'image', data: { file: 'x.jpg' } }
  ]);
  assert.deepEqual(media.map((m) => m.kind), ['record', 'video']);
  assert.equal(media[0].durationSec, 3.2);
  assert.equal(media[1].url, 'https://example.com/v.mp4');
});

await test('按段顺序替换占位，不碰普通正文', () => {
  const text = applyInboundAnnotations('前面[语音]中间[视频]后面', [
    { kind: 'record', text: '[语音转写：你好]' },
    { kind: 'video', text: '[视频 8.0秒，4帧；音轨转写：看这个]' }
  ]);
  assert.equal(text, '前面[语音转写：你好]中间[视频 8.0秒，4帧；音轨转写：看这个]后面');
});

await test('语音/视频标注包含可判断的证据与降级状态', () => {
  assert.match(annotationForAsset({ kind: 'record', transcript: '现在好了吗' }), /现在好了吗/);
  assert.match(annotationForAsset({ kind: 'record', durationSec: 2.5 }), /转写失败/);
  assert.match(annotationForAsset({ kind: 'video', durationSec: 8, frames: ['a'], transcript: '看这里' }), /1帧.*看这里/);
});

await test('QQ 原生转写成功时不再启动本地模型', async () => {
  let localStarted = false;
  const result = await enrichInboundMessage({
    segments: [{ type: 'record', data: { file: 'x.amr', url: 'https://example.invalid/x.amr' } }],
    messageId: 123,
    bot: {
      async request(action) {
        if (action === 'fetch_ptt_text') return { status: 'ok', retcode: 0, data: { text: '原生转写' } };
        throw new Error('不应走到 get_record');
      }
    },
    safeFetchBytes: async () => { localStarted = true; throw new Error('不应下载'); },
    pythonPath: process.execPath,
    log: () => {}
  });
  assert.equal(localStarted, false);
  assert.equal(result.annotations[0].text, '[语音转写：原生转写]');
});

// 独立的本地模型/ffmpeg 验收。默认不放进 42 项快检，避免每次全套都加载 CUDA；
// 设置 QQ_BRIDGE_TEST_MEDIA_LOCAL=1 时真生成 2 秒视频并抽帧，验证脚本确实能跑。
if (process.env.QQ_BRIDGE_TEST_MEDIA_LOCAL === '1') {
  console.log('RUN local video extraction');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-inbound-integration-'));
  const ffmpeg = process.env.FFMPEG_PATH || 'C:\\Users\\Clark\\AppData\\Roaming\\Python\\Python314\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
  const video = path.join(temp, 'fixture.mp4');
  const generated = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video
  ], { windowsHide: true, encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  const result = spawnSync('C:\\Python314\\python.exe', [
    path.resolve('scripts/inbound_media.py'), 'video',
    '--input', video,
    '--model', 'Z:\\Ds工作箱\\工具\\models\\Systran\\faster-whisper-small',
    '--ffmpeg', ffmpeg,
    '--out-dir', path.join(temp, 'frames'),
    '--max-seconds', '5',
    '--max-frames', '4'
  ], { windowsHide: true, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.ok, true);
  assert.ok(payload.frames.length >= 1 && payload.frames.length <= 4);
  for (const frame of payload.frames) assert.ok(fs.statSync(path.join(temp, 'frames', frame)).size > 0);

  const gif = path.join(temp, 'fixture.gif');
  const gifGenerated = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x64:rate=5', gif
  ], { windowsHide: true, encoding: 'utf8' });
  assert.equal(gifGenerated.status, 0, gifGenerated.stderr);
  const gifFrames = spawnSync('C:\\Python314\\python.exe', [
    path.resolve('scripts/inbound_media.py'), 'frames',
    '--input', gif,
    '--ffmpeg', ffmpeg,
    '--out-dir', path.join(temp, 'gif-frames'),
    '--max-frames', '4'
  ], { windowsHide: true, encoding: 'utf8', timeout: 60000 });
  assert.equal(gifFrames.status, 0, gifFrames.stderr || gifFrames.stdout);
  const gifPayload = JSON.parse(gifFrames.stdout.trim().split(/\r?\n/).at(-1));
  assert.ok(gifPayload.frames.length >= 1 && gifPayload.frames.length <= 4);
  fs.rmSync(temp, { recursive: true, force: true });
}

if (failures.length) process.exitCode = 1;
