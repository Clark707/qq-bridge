import assert from 'node:assert/strict';
import { createTurnCollector } from '../src/dsh-client.js';

const collector = createTurnCollector();
collector.push({ type: 'turn/start', data: { turn: 7 } });
const message = {
  id: 'message-a',
  content: [{ type: 'text', text: '完整回复' }],
};
assert.equal(
  collector.push({ type: 'assistant/message', data: { turn: 7, message } }),
  null,
);
assert.equal(
  collector.push({ type: 'assistant/message', data: { turn: 7, message } }),
  null,
  '相同 message id 的重放事件必须幂等',
);
const ended = collector.push({ type: 'turn/end', data: { turn: 7, reason: { kind: 'completed' } } });
assert.equal(ended.text, '完整回复', '重放事件不能把全文追加两遍');

collector.push({ type: 'turn/start', data: { turn: 8 } });
for (const id of ['message-b', 'message-c']) {
  collector.push({
    type: 'assistant/message',
    data: {
      turn: 8,
      message: { id, content: [{ type: 'text', text: '同样文字' }] },
    },
  });
}
const twoDistinct = collector.push({
  type: 'turn/end',
  data: { turn: 8, reason: { kind: 'completed' } },
});
assert.equal(
  twoDistinct.text,
  '同样文字同样文字',
  '不同 message id 即使正文相同也必须保留',
);

console.log('turn collector dedup: ok');
