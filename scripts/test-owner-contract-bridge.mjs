import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'src', 'bridge.js'), 'utf8')

assert.match(
  source,
  /\/v1\/owner_directive/,
  'owner private corrections must reach LAAP shared memory',
)
assert.match(
  source,
  /isOwner && isOwnerPrivateKey\(key, cfg\.ownerQQ\)[\s\S]{0,180}captureOwnerDirectiveV2/,
  'only owner private text is promoted to a cross-shell directive',
)
assert.match(
  source,
  /source_ref: `qq:\$\{messageId \|\| ''\}`/,
  'directive provenance keeps the QQ message identity',
)

console.log('owner-contract bridge: ok')
