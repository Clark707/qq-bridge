import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  initiativeRetryDelay,
  isConcreteInitiativeOpportunity,
} from '../src/initiative-policy.mjs';

const bridge = fs.readFileSync('src/bridge.js', 'utf8');
const mcp = fs.readFileSync('src/mcp-snowluma-safe.js', 'utf8');
const consoleHtml = fs.readFileSync('public/console.html', 'utf8');
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));

function between(start, end) {
  const i = bridge.indexOf(start);
  const j = bridge.indexOf(end, i + start.length);
  assert.ok(i >= 0 && j > i, `missing section ${start}`);
  return bridge.slice(i, j);
}

const scheduler = between('function scheduleProactiveCheckV2', 'function clearSocialV2Timers');
assert.match(scheduler, /claimInitiativeV2/);
assert.match(scheduler, /isConcreteInitiativeOpportunity/);
assert.doesNotMatch(scheduler, /Math\.random/);
assert.doesNotMatch(scheduler, /proactiveProbability/);
assert.match(bridge, /\/v1\/initiative\/claim/);
assert.match(bridge, /\/api\/socialV2\/schedule-intention/);
assert.match(bridge, /\/api\/socialV2\/initiative/);
assert.match(bridge, /initiativeStatusV2/);
assert.match(bridge, /scheduleIntentionV2/);
assert.match(mcp, /'qq_schedule_intention'/);
assert.equal(cfg.socialV2?.tools?.scheduleIntention, true);
assert.equal(cfg.socialV2?.proactive?.scanIntervalMs, 60000);
assert.equal('probability' in (cfg.socialV2?.proactive || {}), false);
assert.match(consoleHtml, /v2ProactiveScanSec/);
assert.match(consoleHtml, /v2InitiativeLoad/);
assert.match(consoleHtml, /共享意图账本/);
assert.doesNotMatch(consoleHtml, /v2ProactiveProbability/);

assert.equal(
  isConcreteInitiativeOpportunity({
    source: 'working',
    reason: '当前目标：【当前时间】2026/10/21 【你的身份】你在 QQ 上的昵称是「落柯.」；还没做的是：继续当前目标',
    content_hint: '',
  }),
  false,
  'prompt-shaped working memory must not wake the agent',
);
assert.equal(
  isConcreteInitiativeOpportunity({
    source: 'working',
    reason: '当前目标：检查 QQ 主动机会频率；还没做的是：继续当前目标；若已完成，等老大的下一条',
  }),
  false,
  'generic next_action must not wake the agent',
);
assert.equal(
  isConcreteInitiativeOpportunity({
    source: 'commitment',
    reason: '还没闭环：修复 QQ 桌面端消息；下一步是：回读新发送消息并比对手机端',
    content_hint: '刚发现桌面端未显示新消息',
  }),
  true,
);
for (let i = 0; i < 20; i += 1) {
  const delay = initiativeRetryDelay({ checkIntervalMinMs: 30 * 60e3, checkIntervalMaxMs: 90 * 60e3 });
  assert.ok(delay >= 30 * 60e3 && delay <= 90 * 60e3, String(delay));
}

console.log('  ✅ QQ 主动扫描接共享意图账本');
console.log('  ✅ 空壳/提示词形态的机会不会触发主动唤醒');
console.log('  ✅ 旧随机概率不在调度路径里');
console.log('  ✅ 控制台只暴露扫描周期与共享账本状态，不再展示旧概率参数');
console.log('  ✅ qq_schedule_intention 已注册并可登记具体未来意图');
console.log('\nQQ 主动机制静态契约通过');
