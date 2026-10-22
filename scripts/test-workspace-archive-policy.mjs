import assert from 'node:assert/strict'
import {
  archivedConversationKeys,
  nextArchivedSessionIds,
} from '../src/core/workspace-archive-policy.mjs'

assert.deepEqual(
  nextArchivedSessionIds([], { type: 'baseline', value: { archivedSessionIds: ['a', 'b', 'a'] } }),
  ['a', 'b'],
)
assert.deepEqual(
  nextArchivedSessionIds(['a'], { type: 'archived', archivedSessionIds: ['a', 'c'] }),
  ['a', 'c'],
)
assert.deepEqual(
  nextArchivedSessionIds(['a'], { type: 'upsert', workspace: {} }),
  ['a'],
)
assert.deepEqual(
  nextArchivedSessionIds(['a'], { type: 'replace', value: { archivedSessionIds: [] } }),
  [],
)
assert.deepEqual(
  archivedConversationKeys(
    { 'private:1': 's1', 'group:2': 's2', 'group:3': 's3' },
    ['s2'],
  ),
  ['group:2'],
)
assert.deepEqual(
  archivedConversationKeys({ 'group:2': 's2' }, new Set(['s2'])),
  ['group:2'],
)

console.log('workspace-archive-policy: 6 assertions passed')
