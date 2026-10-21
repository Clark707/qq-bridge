import assert from 'node:assert/strict';
import { bridgeHarness } from './audit-bridge-harness.mjs';

const h = await bridgeHarness({
  config: { socialV2: { voice: { enabled: true, synthesizeEnabled: true }, tools: { sendVoice: true } } }
});
try {
  h.setMode('reserved2');
  const key = 'private:123';
  h.markCapabilityV2(key, 'voice', {
    verified: true,
    messageId: -788856696,
    durationSec: 2.96,
    text: '语音通了'
  });
  const prompt = h.buildWakePromptV2(key, 'private');
  assert.match(prompt, /当前能力状态/);
  assert.match(prompt, /语音：可用/);
  assert.match(prompt, /-788856696/);
  assert.match(prompt, /旧对话.*冲突.*实际工具结果/);
} finally {
  await h.close();
}
console.log('qq-capability-state: pass');
