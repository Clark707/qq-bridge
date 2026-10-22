function messageTime(message) {
  const value = Number(
    message?.time
      ?? message?.timestamp
      ?? message?.createdAt
      ?? 0,
  );
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Decide whether a delayed reply check has any new inbound message to inspect.
 *
 * A reply check exists for a reply that arrived while the previous turn was
 * busy or the event stream was reconnecting. It is not permission to start a
 * new conversational turn after silence.
 */
export function evaluateReplyCheckWake({ recentMessages, unread } = {}) {
  const unreadItems = Array.isArray(unread) ? unread.filter(Boolean) : [];
  if (unreadItems.length === 0) {
    return { shouldWake: false, reason: 'no-unread' };
  }

  const recent = Array.isArray(recentMessages) ? recentMessages.filter(Boolean) : [];
  const latestSelfAt = Math.max(
    0,
    ...recent.filter((message) => message.isSelf).map(messageTime),
  );
  const latestInboundAt = Math.max(
    0,
    ...recent.filter((message) => !message.isSelf).map(messageTime),
    ...unreadItems.map(messageTime),
  );

  if (latestInboundAt <= latestSelfAt) {
    return { shouldWake: false, reason: 'stale-unread' };
  }
  return { shouldWake: true, reason: 'inbound-after-last-send' };
}
