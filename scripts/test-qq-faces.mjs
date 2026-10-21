import assert from 'node:assert/strict';
import { buildFaceMap, textToQqSegments } from '../src/qq-faces.js';

const map = buildFaceMap({
  packs: [{ emojis: [
    { q_sid: '179', q_des: '/doge', emoji_name_alias: [] },
    { q_sid: '178', q_des: '/斜眼笑', emoji_name_alias: [] },
    { q_sid: '🐶', q_des: '/狗', emoji_name_alias: [] }
  ] }]
});

assert.equal(map.get('旺柴'), '179');
assert.equal(map.get('doge'), '179');
assert.equal(map.get('斜眼笑'), '178');
assert.equal(map.get('狗'), undefined, '非数字 q_sid 不得被当作 face id');

const segments = textToQqSegments('行[旺柴]你说得对', map, (s) => s.replaceAll('&', '&amp;'));
assert.deepEqual(segments, [
  { type: 'text', data: { text: '行' } },
  { type: 'face', data: { id: '179' } },
  { type: 'text', data: { text: '你说得对' } }
]);
assert.deepEqual(textToQqSegments('[未知]原文', map), [{ type: 'text', data: { text: '[未知]原文' } }]);
assert.deepEqual(textToQqSegments('[旺柴]', map), [{ type: 'face', data: { id: '179' } }]);

console.log('qq-faces: pass');
