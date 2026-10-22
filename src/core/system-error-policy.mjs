const QUOTA_RE =
  /insufficient\s+balance|insufficient\s+quota|quota\s+exceeded|余额不足|额度不足|账户余额|billing/i
const AUTH_RE =
  /unauthorized|authentication|invalid\s+(?:api\s+)?key|forbidden|权限不足|认证失败|鉴权失败/i
const UNAVAILABLE_RE =
  /service\s+unavailable|temporarily\s+unavailable|upstream|timeout|timed\s+out|连接失败|服务不可用|超时/i

const FAILURE_TEXT = Object.freeze({
  quota: '老大，额度不够，这轮没回。',
  auth: '老大，模型认证出了点问题，这轮没回。',
  unavailable: '老大，上游服务暂时不通，这轮没回。',
  unknown: '老大，这轮处理失败了，详情在日志里。',
})

export const SYSTEM_ERROR_POLICY_VERSION = 'owner-private-v1'

export function classifyExecutionFailure(message) {
  const text = String(message ?? '')
  if (QUOTA_RE.test(text)) return 'quota'
  if (AUTH_RE.test(text)) return 'auth'
  if (UNAVAILABLE_RE.test(text)) return 'unavailable'
  return 'unknown'
}

/**
 * System failures are operational signals, not conversation material.
 *
 * They never go back to a group or to a non-owner chat. If an owner private
 * key is configured, at most one short notice per failure class is sent there
 * during the cooldown window. The full error stays in the bridge log.
 */
export function planSystemErrorNotice({
  key,
  ownerQQ,
  message,
  now = Date.now(),
  recent = new Map(),
  cooldownMs = 10 * 60 * 1000,
} = {}) {
  const failure = classifyExecutionFailure(message)
  const owner = ownerQQ === null || ownerQQ === undefined ? '' : String(ownerQQ).trim()
  const targetKey = owner ? `private:${owner}` : ''
  const sourceKey = String(key ?? '')
  const last = Number(recent.get?.(failure) || 0)

  if (!targetKey) {
    return { send: false, targetKey: '', failure, text: '', reason: 'owner-unconfigured' }
  }
  if (last > 0 && now - last < cooldownMs) {
    return { send: false, targetKey, failure, text: '', reason: 'cooldown' }
  }

  return {
    send: true,
    targetKey,
    failure,
    text: FAILURE_TEXT[failure],
    reason: sourceKey.startsWith('group:') ? 'owner-private-only' : 'owner-private',
  }
}
