/** Evaluate a fixed-window send budget without mutating the caller's state. */
export function evaluateSendBudget({ sendTimes, now, perMinute, perHour, incoming = 1 }) {
  const times = (Array.isArray(sendTimes) ? sendTimes : [])
    .map(Number)
    .filter((t) => Number.isFinite(t) && t > 0 && t <= now)
    .sort((a, b) => a - b);
  const want = Math.max(0, Math.round(Number(incoming) || 0));
  const minuteLimit = Math.max(0, Math.round(Number(perMinute) || 0));
  const hourLimit = Math.max(0, Math.round(Number(perHour) || 0));
  const minute = times.filter((t) => now - t < 60_000);
  if (minuteLimit > 0 && minute.length + want > minuteLimit) {
    const expireAt = minute[minute.length + want - minuteLimit - 1] + 60_000;
    return {
      blocked: true,
      scope: 'minute',
      used: minute.length,
      limit: minuteLimit,
      retryAfterMs: Math.max(0, expireAt - now),
    };
  }
  const hour = times.filter((t) => now - t < 3_600_000);
  if (hourLimit > 0 && hour.length + want > hourLimit) {
    const expireAt = hour[hour.length + want - hourLimit - 1] + 3_600_000;
    return {
      blocked: true,
      scope: 'hour',
      used: hour.length,
      limit: hourLimit,
      retryAfterMs: Math.max(0, expireAt - now),
    };
  }
  return { blocked: false };
}
