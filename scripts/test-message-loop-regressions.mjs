import assert from 'node:assert/strict';
import {
  evaluateReplyCheckWake,
} from '../src/core/reply-check-policy.mjs';

const now = 1_800_000_000_000;

assert.deepEqual(
  evaluateReplyCheckWake({
    recentMessages: [
      { isSelf: false, time: now - 20_000 },
      { isSelf: true, time: now - 10_000 },
    ],
    unread: [],
  }),
  { shouldWake: false, reason: 'no-unread' },
  'after the agent answered, an empty reply check must stay asleep',
);

assert.deepEqual(
  evaluateReplyCheckWake({
    recentMessages: [
      { isSelf: true, time: now - 20_000 },
      { isSelf: false, time: now - 10_000 },
    ],
    unread: [{ seq: 11, time: now - 10_000 }],
  }),
  { shouldWake: true, reason: 'inbound-after-last-send' },
  'a genuinely unread inbound reply may wake the agent',
);

assert.deepEqual(
  evaluateReplyCheckWake({
    recentMessages: [
      { isSelf: false, time: now - 20_000 },
      { isSelf: true, time: now - 10_000 },
    ],
    unread: [{ seq: 10, time: now - 20_000 }],
  }),
  { shouldWake: false, reason: 'stale-unread' },
  'an already answered inbound message must not trigger another reply',
);

console.log('message loop regressions: ok');
