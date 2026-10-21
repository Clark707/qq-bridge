import assert from 'node:assert/strict';
import { isOwnerPrivateKey, ownerActionAllowed } from '../src/core/qq-owner-control.mjs';

const ownerQQ = 3440189193;
const actions = new Map([
  ['set_qq_profile', { name: 'set_qq_profile', readOnly: false }],
  ['send_qzone_msg', { name: 'send_qzone_msg', readOnly: false }],
  ['get_qzone_msg_list', { name: 'get_qzone_msg_list', readOnly: true }],
  ['send_group_msg', { name: 'send_group_msg', readOnly: false }],
]);

assert.equal(isOwnerPrivateKey(`private:${ownerQQ}`, ownerQQ), true);
assert.equal(isOwnerPrivateKey(`private:${ownerQQ}`, String(ownerQQ)), true);
assert.equal(isOwnerPrivateKey('private:123', ownerQQ), false);
assert.equal(isOwnerPrivateKey(`group:${ownerQQ}`, ownerQQ), false);

assert.equal(ownerActionAllowed('set_qq_profile', actions), true);
assert.equal(ownerActionAllowed('send_qzone_msg', actions), true);
assert.equal(ownerActionAllowed('get_qzone_msg_list', actions), true);
assert.equal(ownerActionAllowed('send_group_msg', actions), false, '群发不能借 owner 通用动作绕过专用发送门');
assert.equal(ownerActionAllowed('unknown_action', actions), false);

console.log('owner QQ control policy: ok');
