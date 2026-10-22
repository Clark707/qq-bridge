import assert from 'node:assert/strict'
import { bridgeHarness } from './audit-bridge-harness.mjs'

const h = await bridgeHarness({
  config: {
    ownerAgentPreset: 'standard',
    socialV2: { agentPreset: 'qq-chat-v2', enabled: true, paused: false },
  },
})

try {
  h.setMode('reserved2')
  h.setReady(true)

  const ownerSession = await h.ensureSession('private:123')
  assert.equal(h.calls.created.at(-1).agentPreset, 'standard', 'owner private must get full preset')
  console.log('PASS owner-private -> standard full-tool preset')

  const groupSession = await h.ensureSession('group:456')
  assert.equal(h.calls.created.at(-1).agentPreset, 'qq-chat-v2', 'group must stay restricted')
  console.log('PASS group -> qq-chat-v2 restricted preset')

  await h.sendSystemNotice('group:456', '⚠️ 系统错误不应该进群')
  assert.equal(h.calls.sent.length, 0, 'group system notice must be suppressed')
  await h.sendSystemNotice('private:123', '⚠️ owner 可见的短提示')
  assert.equal(h.calls.sent.length, 1, 'owner private notice may pass')
  assert.equal(h.calls.sent[0].kind, 'private')
  console.log('PASS system notices -> owner private only')

  h.socialV2.paused = true
  h.scheduleProactiveCheckV2('group:456')
  assert.equal(h.getSocialV2State('group:456').proactiveTimer, null, 'pause must stop proactive timer')
  console.log('PASS pause -> no proactive timer')
  h.socialV2.paused = false

  h.applyWorkspaceFollowFrame({
    type: 'baseline',
    value: { archivedSessionIds: [groupSession] },
  })
  assert.equal(h.state.sessions['group:456'], undefined, 'archived session must be retired')
  assert.equal(h.isSessionArchived('group:456'), true, 'archive cache must remain while no binding')
  assert.equal(h.getSocialV2State('group:456').sleepTimer, null, 'archive must clear timers')
  console.log('PASS archive -> retire binding, preserve conversation, clear timers')

  const recreatedGroup = await h.ensureSession('group:456')
  assert.notEqual(recreatedGroup, groupSession, 'new user activity must not resurrect archived DSH session')
  assert.equal(h.isSessionArchived('group:456'), false, 'creating a fresh binding clears archive cache')
  console.log('PASS re-open -> new session, archive cache cleared only after fresh binding')

  h.applyWorkspaceFollowFrame({
    type: 'archived',
    archivedSessionIds: [groupSession, ownerSession],
  })
  const ownerAfterArchive = await h.ensureSession('private:123')
  assert.equal(h.calls.created.at(-1).agentPreset, 'standard')
  assert.notEqual(ownerAfterArchive, ownerSession)
  console.log('PASS owner re-open -> fresh standard session')

  const clean = h.sendToQQ('group:456', '普通回复：没有系统标记')
  await clean
  assert.equal(h.calls.sent.at(-1).text, '普通回复：没有系统标记')
  console.log('PASS normal group text -> unchanged')
} finally {
  await h.close()
}

console.log('bridge-flow-demo: all scenarios passed')
