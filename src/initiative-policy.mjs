const WRAPPED_PROMPT_RE =
  /【当前时间】|【你的身份】|【会话令牌】|【本次消息快照】|【唤醒】|【主动机会/
const GENERIC_WORKING_RE =
  /继续当前目标|若已完成.*等老大的下一条|还没做的是[:：]\s*继续当前目标|等老大的下一条/

/**
 * A claimed initiative is only worth waking the agent when its reason describes
 * a concrete human-facing follow-up. The engine may derive candidates from
 * working memory; if that memory was polluted with shell instructions or a
 * generic next_action, those are not reasons to contact anyone.
 */
export function isConcreteInitiativeOpportunity(opportunity) {
  if (!opportunity || typeof opportunity !== 'object') return false
  const reason = String(opportunity.reason ?? '').replace(/\s+/g, ' ').trim()
  if (reason.length < 8) return false
  if (WRAPPED_PROMPT_RE.test(reason)) return false
  if (GENERIC_WORKING_RE.test(reason)) return false
  if (
    String(opportunity.source ?? '') === 'working' &&
    !String(opportunity.content_hint ?? '').trim() &&
    reason.length < 24
  ) {
    return false
  }
  return true
}

export function initiativeRetryDelay(policy = {}) {
  const min = Math.max(
    60_000,
    Math.min(90 * 60_000, Number(policy.checkIntervalMinMs) || 30 * 60_000),
  )
  const max = Math.max(
    min,
    Math.min(90 * 60_000, Number(policy.checkIntervalMaxMs) || 90 * 60_000),
  )
  return Math.round(min + Math.random() * (max - min))
}
