import assert from 'node:assert/strict'
import { mdToPlain, stripToolProtocol } from '../src/md-to-plain.js'

const fullwidth = [
  '先去找调用点。',
  '<｜｜DSML｜｜ calls>',
  '<｜｜DSML｜｜ invoke name="bash">',
  '<｜｜DSML｜｜ parameter name="command">pwd</｜｜DSML｜｜ parameter>',
  '</｜｜DSML｜｜ invoke>',
  '</｜｜DSML｜｜ calls>',
].join('\n')

assert.equal(stripToolProtocol(fullwidth), '先去找调用点。')
assert.equal(
  stripToolProtocol('可见回答\n<|DSML| calls>\n<|DSML| invoke name="x">\n</|DSML| calls>\n后面的真话'),
  '可见回答\n\n后面的真话',
)
assert.equal(stripToolProtocol('普通 <代码> 和 | 符 号 保留'), '普通 <代码> 和 | 符 号 保留')
assert.equal(mdToPlain(fullwidth), '先去找调用点。')

const plain = mdToPlain('**结果**\n\n- 第一条\n- 第二条')
assert.equal(plain, '结果\n• 第一条\n• 第二条')

console.log('model-output-sanitizer: 5 assertions passed')
