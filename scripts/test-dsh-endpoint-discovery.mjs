// DSH desktop 的 API 端口是动态端口；这里钉住“只认 DSH 进程的监听端口，
// 且所有候选随后必须过鉴权 RPC”的边界。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDshCandidateBaseUrls,
  discoverDshListeningPorts,
  parseDshListeningPorts,
} from '../src/dsh-client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'src', 'dsh-client.js'), 'utf8');
assert.match(source, /dsh-port-scan\.vbs/, 'DSH discovery must use the hidden WScript launcher');
assert.ok(
  !/execFileSync\(\s*['"]powershell\.exe['"]/.test(source),
  'DSH discovery must not launch a visible PowerShell console directly',
);

assert.deepEqual(parseDshListeningPorts(''), []);
assert.deepEqual(parseDshListeningPorts('51531'), [51531]);
assert.deepEqual(parseDshListeningPorts('[51531,"8326",51531,0,70000,"bad"]'), [51531, 8326]);
assert.deepEqual(parseDshListeningPorts('[{"LocalPort":51531},{"LocalPort":"8326"}]'), [51531, 8326]);
assert.deepEqual(parseDshListeningPorts('{broken'), []);
const livePorts = discoverDshListeningPorts();
assert.ok(Array.isArray(livePorts), 'live discovery must always return an array');
assert.ok(livePorts.every(Number.isSafeInteger), `live discovery returned invalid ports: ${livePorts}`);

const previous = process.env.DSH_BASE_URL;
try {
  delete process.env.DSH_BASE_URL;
  assert.deepEqual(
    buildDshCandidateBaseUrls({
      preferredBaseUrl: 'http://127.0.0.1:3080/',
      ports: [51531, 8326, 51531],
    }),
    [
      'http://127.0.0.1:3080',
      'http://127.0.0.1:51531',
      'http://127.0.0.1:8326',
    ],
  );
  process.env.DSH_BASE_URL = 'http://127.0.0.1:51531';
  assert.deepEqual(
    buildDshCandidateBaseUrls({ preferredBaseUrl: 'http://127.0.0.1:3080', ports: [8326] }),
    ['http://127.0.0.1:51531', 'http://127.0.0.1:3080', 'http://127.0.0.1:8326'],
  );
  process.env.DSH_BASE_URL = 'http://10.0.0.5:51531';
  assert.deepEqual(
    buildDshCandidateBaseUrls({ preferredBaseUrl: 'http://127.0.0.1:3080', ports: [] }),
    ['http://127.0.0.1:3080'],
    '非回环环境变量不得成为隐式凭据目的地',
  );
} finally {
  if (previous === undefined) delete process.env.DSH_BASE_URL;
  else process.env.DSH_BASE_URL = previous;
}

console.log('dsh endpoint discovery: ok');
