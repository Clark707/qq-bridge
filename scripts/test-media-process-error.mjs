import assert from 'node:assert/strict';
import { mediaProcessFailure } from '../src/core/media-process-error.mjs';

const message = mediaProcessFailure({
  label: '本地图片生成',
  code: 1,
  stdout: 'noise\n{"ok":false,"error":"RuntimeError: ComfyUI startup timed out"}\n',
  stderr: '',
});
assert.match(message, /exit 1/);
assert.match(message, /ComfyUI startup timed out/, '必须透传 Python stdout 里的 JSON 错误');
assert.doesNotMatch(message, /无错误输出/);

console.log('media process error: ok');
