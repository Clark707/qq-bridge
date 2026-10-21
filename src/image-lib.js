// 本地图片库的路径、格式与文件检查。
//
// AI 只能引用图片库内的相对路径。这里不负责 QQ 发送，只把“可安全读取的图片”
// 和“任意本地文件”分开，避免图片工具有一天被拿来读令牌、配置或其它进程文件。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { looksLikeImageBuffer } from './safe-fetch.js';

export const IMAGE_EXTENSIONS = Object.freeze(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

export function imageMimeFromBuffer(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

/**
 * Resolve a user/model supplied image reference inside the configured library.
 * Absolute paths, drive paths, URL/data prefixes, traversal and symlink escapes
 * are rejected. The returned path is the real path after symlink resolution.
 */
export function resolveImageLibraryPath(rootDir, ref) {
  const root = path.resolve(String(rootDir ?? ''));
  const raw = String(ref ?? '').trim();
  if (!raw) throw new Error('图片路径不能为空');
  if (raw.length > 512) throw new Error('图片路径过长');
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw new Error('图片路径包含控制字符');
  if (/^(?:[a-z]+:)?[\\/]/i.test(raw) || /^[a-z]:/i.test(raw) || /^(?:file|https?|data|base64):/i.test(raw)) {
    throw new Error('图片路径必须是图片库内的相对路径');
  }
  const normalized = raw.replaceAll('\\', '/');
  if (normalized.split('/').some((part) => part === '..')) throw new Error('图片路径不能包含 ..');
  const candidate = path.resolve(root, normalized);
  if (!isInside(root, candidate)) throw new Error('图片路径越出图片库');

  fs.mkdirSync(root, { recursive: true });
  const realRoot = fs.realpathSync(root);
  let realCandidate;
  try {
    realCandidate = fs.realpathSync(candidate);
  } catch {
    throw new Error(`图片不存在：${normalized}`);
  }
  if (!isInside(realRoot, realCandidate)) throw new Error('图片路径经符号链接越出图片库');
  const ext = path.extname(realCandidate).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) throw new Error(`不支持的图片扩展名：${ext || '(无)'}`);
  return { path: realCandidate, root: realRoot, relativePath: path.relative(realRoot, realCandidate).replaceAll('\\', '/') };
}

export function readImageFile(rootDir, ref, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const resolved = resolveImageLibraryPath(rootDir, ref);
  const stat = fs.statSync(resolved.path);
  if (!stat.isFile()) throw new Error('图片路径不是普通文件');
  if (stat.size <= 0) throw new Error('图片文件为空');
  if (stat.size > maxBytes) throw new Error(`图片文件超过大小上限（${stat.size} > ${maxBytes} bytes）`);
  const buffer = fs.readFileSync(resolved.path);
  if (!looksLikeImageBuffer(buffer)) throw new Error('文件内容不是有效的 PNG/JPEG/GIF/WebP 图片');
  const mimeType = imageMimeFromBuffer(buffer);
  if (!mimeType) throw new Error('无法识别图片格式');
  return {
    ...resolved,
    buffer,
    bytes: buffer.length,
    mimeType,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
  };
}

export function listImageFiles(rootDir, { limit = 100 } = {}) {
  const root = path.resolve(String(rootDir ?? ''));
  fs.mkdirSync(root, { recursive: true });
  const realRoot = fs.realpathSync(root);
  const cap = Math.min(500, Math.max(1, Number(limit) || 100));
  const out = [];

  function walk(dir) {
    if (out.length >= cap) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    for (const entry of entries) {
      if (out.length >= cap) return;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.includes(ext)) continue;
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      const real = fs.realpathSync(full);
      if (!isInside(realRoot, real)) continue;
      out.push({
        path: real,
        relativePath: path.relative(realRoot, real).replaceAll('\\', '/'),
        name: entry.name,
        bytes: stat.size,
        updatedAt: stat.mtime.toISOString()
      });
    }
  }

  walk(realRoot);
  return out;
}

export function sanitizeComposeText(value, maxChars = 200) {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) return '';
  if (text.length > maxChars) throw new Error(`图片文字超过 ${maxChars} 字上限`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error('图片文字包含控制字符');
  return text;
}
