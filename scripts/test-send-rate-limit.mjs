import assert from 'node:assert/strict';
import { evaluateSendBudget } from '../src/core/send-rate-limit.mjs';

const now = 1_800_000_000_000;

assert.deepEqual(
  evaluateSendBudget({ sendTimes: [], now, perMinute: 8, perHour: 180, incoming: 1 }),
  { blocked: false },
);

const minuteTimes = Array.from({ length: 8 }, (_, i) => now - 50_000 + i * 1_000);
assert.deepEqual(
  evaluateSendBudget({ sendTimes: minuteTimes, now, perMinute: 8, perHour: 180, incoming: 1 }),
  { blocked: true, scope: 'minute', used: 8, limit: 8, retryAfterMs: 10_000 },
  'minute exhaustion must report when the oldest reservation expires',
);

const hourTimes = Array.from({ length: 60 }, (_, i) => now - 3_000_000 + i * 1_000);
assert.deepEqual(
  evaluateSendBudget({ sendTimes: hourTimes, now, perMinute: 8, perHour: 60, incoming: 1 }),
  { blocked: true, scope: 'hour', used: 60, limit: 60, retryAfterMs: 600_000 },
  'hour exhaustion must report the exact remaining wait',
);

console.log('send rate limit: ok');
