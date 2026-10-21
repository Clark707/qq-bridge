import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  imageMimeFromBuffer,
  listImageFiles,
  readImageFile,
  resolveImageLibraryPath,
  sanitizeComposeText
} from '../src/image-lib.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-image-lib-'));
const nested = path.join(root, 'nested');
fs.mkdirSync(nested, { recursive: true });
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);
fs.writeFileSync(path.join(nested, 'one.png'), png);
fs.writeFileSync(path.join(root, 'not-image.txt'), 'no');

let passed = 0;
function ok(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.error(`  ❌ ${name}: ${error?.message ?? error}`);
    process.exitCode = 1;
  }
}

console.log('## image-lib');
ok('识别 PNG 签名', () => assert.equal(imageMimeFromBuffer(png), 'image/png'));
ok('解析库内相对路径', () => assert.equal(resolveImageLibraryPath(root, 'nested/one.png').relativePath, 'nested/one.png'));
ok('拦截 .. 穿越', () => assert.throws(() => resolveImageLibraryPath(root, '../secret.png'), /\.\./));
ok('拦截绝对路径', () => assert.throws(() => resolveImageLibraryPath(root, 'C:\\Windows\\win.ini'), /相对路径/));
ok('拦截 URL', () => assert.throws(() => resolveImageLibraryPath(root, 'https://example.com/a.png'), /相对路径/));
ok('非图片扩展名不读取', () => assert.throws(() => readImageFile(root, 'not-image.txt'), /不支持/));
ok('读取有效图片', () => assert.equal(readImageFile(root, 'nested/one.png').mimeType, 'image/png'));
ok('列表只返回图片', () => assert.deepEqual(listImageFiles(root).map((item) => item.relativePath), ['nested/one.png']));
ok('图片文字上限', () => assert.throws(() => sanitizeComposeText('x'.repeat(5), 4), /超过/));

console.log('## compose-image runtime');
const output = path.join(root, 'composed.png');
const python = process.env.UTA_PYTHON || (process.platform === 'win32' ? 'C:\\Python314\\python.exe' : 'python3');
const result = spawnSync(python, [
  path.resolve('scripts/compose-image.py'),
  '--base', path.join(nested, 'one.png'),
  '--output', output,
  '--text', '测试',
  '--max-side', '320'
], { encoding: 'utf8' });
ok('合成进程成功', () => assert.equal(result.status, 0, result.stderr || result.stdout));
ok('合成文件是 PNG', () => assert.equal(imageMimeFromBuffer(fs.readFileSync(output)), 'image/png'));
const overlay = path.join(nested, 'overlay.png');
fs.writeFileSync(overlay, png);
const layeredOutput = path.join(root, 'layered.png');
const layered = spawnSync(python, [
  path.resolve('scripts/compose-image.py'),
  '--base', path.join(nested, 'one.png'),
  '--overlay', overlay,
  '--output', layeredOutput,
  '--overlay-position', 'top-right',
  '--overlay-scale', '0.2',
  '--max-side', '320'
], { encoding: 'utf8' });
ok('叠加图合成成功', () => assert.equal(layered.status, 0, layered.stderr || layered.stdout));
ok('叠加图输出是 PNG', () => assert.equal(imageMimeFromBuffer(fs.readFileSync(layeredOutput)), 'image/png'));

console.log('## MCP / bridge wiring');
const mcp = fs.readFileSync(path.resolve('src/mcp-snowluma-safe.js'), 'utf8');
const bridge = fs.readFileSync(path.resolve('src/bridge.js'), 'utf8');
const cfg = JSON.parse(fs.readFileSync(path.resolve('config.json'), 'utf8'));
ok('MCP 注册列图工具', () => assert.match(mcp, /'qq_list_images'/));
ok('MCP 注册合成图工具', () => assert.match(mcp, /'qq_compose_image'/));
ok('MCP 注册发图工具', () => assert.match(mcp, /'qq_send_image'/));
ok('bridge 注册图片列表路由', () => assert.match(bridge, /'\/api\/socialV2\/images'/));
ok('bridge 注册合成图路由', () => assert.match(bridge, /'\/api\/socialV2\/compose-image'/));
ok('bridge 注册发图路由', () => assert.match(bridge, /'\/api\/socialV2\/send-image'/));
ok('配置开启 sendImage', () => assert.equal(cfg.socialV2?.tools?.sendImage, true));

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n结果：${passed} 通过，${process.exitCode ? '有失败' : '0 失败'}`);
