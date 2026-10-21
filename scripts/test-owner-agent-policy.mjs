import assert from 'node:assert/strict';
import { resolveOwnerAgentPreset } from '../src/core/owner-agent-policy.mjs';

const base = {
  ownerQQ: 3440189193,
  mode: 'reserved2',
  ownerAgentPreset: 'standard',
  simulationPreset: 'qq-chat-v2',
};

assert.equal(
  resolveOwnerAgentPreset({ ...base, key: 'private:3440189193' }),
  'standard',
  'owner 私聊必须使用完整工具 preset',
);
assert.equal(
  resolveOwnerAgentPreset({ ...base, key: 'group:914566195' }),
  'qq-chat-v2',
  '群聊不能继承 owner 的完整工具权限',
);
assert.equal(
  resolveOwnerAgentPreset({ ...base, key: 'private:123456' }),
  'qq-chat-v2',
  '其他私聊不能继承 owner 的完整工具权限',
);
assert.equal(
  resolveOwnerAgentPreset({ ...base, key: 'private:3440189193', ownerAgentPreset: '' }),
  'qq-chat-v2',
  '未配置 ownerAgentPreset 时必须回到受限仿真 preset',
);
assert.equal(
  resolveOwnerAgentPreset({ ...base, key: 'private:3440189193', mode: 'chat' }),
  'qq-chat-v2',
  '只有 reserved2 才使用 ownerAgentPreset 覆盖；其他模式保持原规则',
);

console.log('owner-agent policy: ok');
