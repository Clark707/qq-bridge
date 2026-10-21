const BLOCKED_OWNER_ACTIONS = new Set([
  'send_group_msg',
  'send_private_msg',
  'send_msg',
  'send_group_forward_msg',
  'send_private_forward_msg',
  '_send_group_notice',
]);

export function isOwnerPrivateKey(key, ownerQQ) {
  const owner = ownerQQ === null || ownerQQ === undefined ? '' : String(ownerQQ).trim();
  return Boolean(owner) && String(key ?? '').trim() === `private:${owner}`;
}

/**
 * SnowLuma actions are exposed only through this owner-only gate.
 *
 * Message delivery stays on the dedicated send tools so it cannot bypass their
 * allowlist, throttling and outbound audit. QQ profile/space actions do not have
 * a second delivery path and are available here.
 */
export function ownerActionAllowed(action, catalog) {
  const name = String(action ?? '').trim();
  if (!name || BLOCKED_OWNER_ACTIONS.has(name)) return false;
  return catalog instanceof Map && catalog.has(name);
}
