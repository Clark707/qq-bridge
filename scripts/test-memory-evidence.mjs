import assert from 'node:assert/strict';
import { formatEvidenceBlock, fetchMemoryEvidence } from '../src/memory-evidence.js';

const block = formatEvidenceBlock([
  { ts: '2026-10-19T20:00:00', meta: '经历', text: '以前修过 QQ 重复投递，根因是 message_id 没做幂等。' }
], { maxChars: 500 });
assert.match(block, /主动检索/);
assert.match(block, /message_id/);
assert.match(block, /2026-10-19/);
assert.equal(formatEvidenceBlock([], { maxChars: 500 }), '');

let seenUrl = null;
const result = await fetchMemoryEvidence({
  query: '以前那个 QQ 问题',
  sessionId: 'qq:private:123',
  fetchImpl: async (url) => {
    seenUrl = String(url);
    return {
      ok: true,
      async json() {
        return {
          ok: true,
          sufficient: true,
          items: [{ ts: '2026-10-20', meta: '经历·debug', text: '真正证据' }]
        };
      }
    };
  }
});
assert.match(result.block, /真正证据/);
assert.equal(result.sufficient, true);
const url = new URL(seenUrl);
assert.equal(url.pathname, '/v1/memory/evidence');
assert.equal(url.searchParams.get('session_id'), 'qq:private:123');

const empty = await fetchMemoryEvidence({ query: '', fetchImpl: async () => { throw new Error('不应请求'); } });
assert.equal(empty.block, '');

console.log('memory-evidence: pass');
