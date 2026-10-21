import assert from 'node:assert/strict';
import fs from 'node:fs';

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

const guard = fs.readFileSync('scripts/qq-stack-guard.mjs', 'utf8');
const hiddenGuard = fs.readFileSync('scripts/qq-guard-hidden.vbs', 'utf8');
const hiddenBridge = fs.readFileSync('start-hidden.vbs', 'utf8');
const hiddenSnowLumaPath = 'scripts/snowluma-hidden.vbs';

console.log('## QQ guard');
ok('读取 bridge 深度状态', () => assert.match(guard, /\/api\/status/));
ok('检查 SnowLuma connected 与账号 online', () => {
  assert.match(guard, /snowlumaConnected/);
  assert.match(guard, /accountOnline/);
});
ok('DSH 缺失只要求人工重启', () => assert.match(guard, /manualRestartRequired/));
ok('guard 不再自动启动 DSH', () => assert.doesNotMatch(guard, /DeepSeek Harness\.exe/));
ok('SnowLuma 自愈必须走隐藏启动器', () => {
  assert.equal(fs.existsSync(hiddenSnowLumaPath), true, '缺少 scripts/snowluma-hidden.vbs');
  const hiddenSnowLuma = fs.readFileSync(hiddenSnowLumaPath, 'utf8');
  assert.match(guard, /snowluma-hidden\.vbs/);
  assert.doesNotMatch(guard, /launch\(NODE,\s*\['index\.mjs'\]/);
  assert.match(hiddenSnowLuma, /node\.exe/);
  assert.match(hiddenSnowLuma, /index\.mjs/);
  assert.match(hiddenSnowLuma, /sh\.Run cmd, 0, False/);
  assert.doesNotMatch(hiddenSnowLuma, /cmd\.exe/);
  assert.equal([...Buffer.from(hiddenSnowLuma)].filter((b) => b > 127).length, 0);
});
ok('计划任务入口由 wscript 隐藏运行', () => assert.match(hiddenGuard, /nodeExe/));
ok('bridge 隐藏入口直接启动 node', () => {
  assert.match(hiddenBridge, /node\.exe/);
  assert.match(hiddenBridge, /bridge\.js/);
  assert.match(hiddenBridge, /sh\.Run cmd, 0, False/);
  assert.doesNotMatch(hiddenBridge, /cmd\.exe/);
});
ok('隐藏启动器保持 ASCII', () => {
  assert.equal([...Buffer.from(hiddenGuard)].filter((b) => b > 127).length, 0);
  assert.equal([...Buffer.from(hiddenBridge)].filter((b) => b > 127).length, 0);
});

console.log(`\n结果：${passed} 通过，${process.exitCode ? '有失败' : '0 失败'}`);
