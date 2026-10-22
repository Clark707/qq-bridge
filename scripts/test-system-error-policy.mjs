import assert from 'node:assert/strict'
import {
  classifyExecutionFailure,
  planSystemErrorNotice,
  SYSTEM_ERROR_POLICY_VERSION,
} from '../src/core/system-error-policy.mjs'

assert.equal(SYSTEM_ERROR_POLICY_VERSION, 'owner-private-v1')
assert.equal(
  classifyExecutionFailure('Insufficient Balance (request_id: 1fe28bdc)'),
  'quota',
)
assert.equal(classifyExecutionFailure('HTTP 401 unauthorized'), 'auth')
assert.equal(classifyExecutionFailure('upstream timed out'), 'unavailable')
assert.equal(classifyExecutionFailure('random exploded'), 'unknown')

const recent = new Map()
const groupNotice = planSystemErrorNotice({
  key: 'group:123',
  ownerQQ: '456',
  message: 'Insufficient Balance (request_id: secret-token-123)',
  now: 1_000,
  recent,
})
assert.deepEqual(groupNotice, {
  send: true,
  targetKey: 'private:456',
  failure: 'quota',
  text: '老大，额度不够，这轮没回。',
  reason: 'owner-private-only',
})
assert.equal(groupNotice.text.includes('secret-token'), false)
assert.equal(groupNotice.text.includes('Insufficient'), false)

const first = planSystemErrorNotice({
  key: 'group:123',
  ownerQQ: '456',
  message: 'Insufficient Balance',
  now: 2_000,
  recent,
})
assert.equal(first.send, true)
recent.set(first.failure, first.send ? 2_000 : 0)
const duplicate = planSystemErrorNotice({
  key: 'group:123',
  ownerQQ: '456',
  message: 'Insufficient Balance',
  now: 2_001,
  recent,
})
assert.equal(duplicate.send, false)
assert.equal(duplicate.reason, 'cooldown')

const ownerPrivate = planSystemErrorNotice({
  key: 'private:456',
  ownerQQ: '456',
  message: 'socket timeout',
  now: 20_000,
  recent,
})
assert.equal(ownerPrivate.send, true)
assert.equal(ownerPrivate.targetKey, 'private:456')
assert.equal(ownerPrivate.failure, 'unavailable')

const noOwner = planSystemErrorNotice({
  key: 'group:123',
  ownerQQ: '',
  message: 'Insufficient Balance',
})
assert.equal(noOwner.send, false)
assert.equal(noOwner.reason, 'owner-unconfigured')

console.log('system-error-policy: 13 assertions passed')
