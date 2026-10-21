import assert from 'node:assert/strict';
import { bridgeHarness } from './audit-bridge-harness.mjs';

async function test(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name} — ${error?.stack ?? error}`);
    process.exitCode = 1;
  }
}

await test('二代入站语音：先进入未读，再把原生转写写回同一消息', async () => {
  const h = await bridgeHarness();
  try {
    h.setMode('reserved2');
    h.socialV2.paused = true;
    await h.handleIncoming('private', '123', {
      self_id: 999,
      user_id: 123,
      message_id: 7001,
      message: [{ type: 'record', data: { file: 'voice.amr', url: 'https://example.invalid/voice.amr', duration: 3 } }],
      raw_message: '',
      sender: { nickname: '落柯', card: '' }
    }, h.cfg);
    const st = h.getSocialV2State('private:123');
    const msg = st.recentMessages.at(-1);
    assert.match(msg.text, /fixture-transcript/);
    assert.equal(msg.media.some((m) => m.kind === 'record'), true);
  } finally { await h.close(); }
});

await test('回复中的 [旺柴] 变成 OneBot face 段，普通文字保留', async () => {
  const h = await bridgeHarness();
  try {
    h.setMode('chat');
    await h.sendToQQ('private:123', '好[旺柴]就这样');
    const sent = h.calls.sent.at(-1);
    assert.ok(Array.isArray(sent.message));
    assert.equal(sent.message[0].type, 'text');
    assert.deepEqual(sent.message[1], { type: 'face', data: { id: '179' } });
    assert.equal(sent.message[2].data.text, '就这样');
  } finally { await h.close(); }
});

await test('投递前按当前问题主动查 LAAP 证据，并把出处带入本轮', async () => {
  const h = await bridgeHarness();
  try {
    h.setMode('chat');
    await h.deliverPrompt('group:456', '以前是不是修过 QQ 重复投递？');
    const delivered = h.calls.prompts.at(-1).content.map((part) => String(part?.text ?? '')).join('\n');
    assert.match(delivered, /主动检索到的相关经历/);
    assert.match(delivered, /2026-10-20/);
    assert.match(delivered, /以前修过 QQ 重复投递/);
    assert.ok(h.calls.http.some((call) => String(call.url).includes('/v1/memory/evidence')));
  } finally { await h.close(); }
});
