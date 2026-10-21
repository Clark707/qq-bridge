import assert from 'node:assert/strict';
import { parseCardPayload, formatCardMessage } from '../src/link-card.js';

const card = parseCardPayload(JSON.stringify({
  app: 'com.tencent.structmsg',
  meta: { news: {
    title: '<b>DeepSeek 接入 QQ</b>',
    desc: '一篇讲机制的文章',
    jumpUrl: 'https://example.com/article?id=1'
  } }
}));
assert.deepEqual(card, {
  title: 'DeepSeek 接入 QQ',
  description: '一篇讲机制的文章',
  url: 'https://example.com/article?id=1'
});
assert.equal(
  formatCardMessage({ data: JSON.stringify({ prompt: '[QQ小程序]', jumpUrl: 'https://example.com/x' }) }),
  '[卡片：[QQ小程序]｜https://example.com/x]'
);
assert.equal(formatCardMessage('not json'), '[卡片消息]');
assert.equal(formatCardMessage({ foo: 'bar' }), '[卡片消息]');

console.log('link-card: pass');
