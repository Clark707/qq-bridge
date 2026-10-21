import assert from 'node:assert/strict';
import { classifyContextPressure, contextTokensFromProjection, summarizeContextPressure } from '../src/context-pressure.js';

const base = {
  surfaceTokens: 200_000,
  contextWindow: 1_048_576,
  warnRatio: 0.3,
  criticalRatio: 0.38,
  compactionRatio: 0.4,
  retainTokens: 64_000
};

assert.equal(classifyContextPressure(base).level, 'ok');
assert.equal(classifyContextPressure({ ...base, surfaceTokens: 320_000 }).level, 'warn');
assert.equal(classifyContextPressure({ ...base, surfaceTokens: 410_000 }).level, 'critical');
assert.equal(classifyContextPressure({ ...base, surfaceTokens: 419_431 }).level, 'compacting');
assert.equal(classifyContextPressure({ ...base, surfaceTokens: 1_048_576 }).level, 'overflow');
assert.equal(classifyContextPressure({ ...base, contextWindow: 0 }).level, 'unknown');
assert.equal(contextTokensFromProjection({ surfaceTokens: 200_000 }), 200_000);
assert.equal(contextTokensFromProjection({ pressureTokens: 402_162, contextWindow: 1_048_576 }), 402_162);
assert.equal(contextTokensFromProjection({ projectedTokens: 402_311 }), 402_311);
assert.equal(contextTokensFromProjection({ surfaceTokens: 76_745, pressureTokens: 168_759 }), 168_759);

const summary = summarizeContextPressure(base);
assert.equal(summary.surfaceTokens, 200_000);
assert.equal(summary.remainingTokens, 848_576);
assert.equal(summary.compactionAtTokens, 419_430);
assert.match(summary.text, /19\.1%/);
assert.match(summary.text, /64,000/);

console.log('context-pressure: pass');
