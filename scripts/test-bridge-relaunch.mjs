import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bridge = fs.readFileSync(path.join(root, 'src/bridge.js'), 'utf8');
const launcherPath = path.join(root, 'scripts/bridge-relaunch-hidden.vbs');
const launcher = fs.readFileSync(launcherPath, 'utf8');
const guard = fs.readFileSync(path.join(root, 'scripts/qq-stack-guard.mjs'), 'utf8');
const restartAt = bridge.indexOf("url.pathname === '/api/restart'");

assert.ok(restartAt >= 0);
assert.match(bridge, /bridge-relaunch-hidden\.vbs/);
assert.match(bridge, /windowsHide:\s*true/);
assert.match(bridge, /bridge-restarting\.json/);
assert.ok(bridge.indexOf('bridge-relaunch-hidden.vbs', restartAt) < bridge.indexOf('releaseLock();', restartAt));
assert.match(launcher, /WScript\.Sleep 1600/);
assert.match(launcher, /sh\.Run cmd, 0, False/);
assert.match(guard, /ensureBridge/);
assert.match(guard, /src\/bridge\.js/);
assert.match(guard, /selfRestartPending/);
assert.match(guard, /45000/);

console.log('bridge-relaunch: pass');
