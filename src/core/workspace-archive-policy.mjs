function sessionIds(value) {
  if (value === null || value === undefined || typeof value === 'string') return []
  if (typeof value[Symbol.iterator] !== 'function') return []
  return [...new Set(Array.from(value).map(String).filter(Boolean))]
}

/**
 * Workspace follow sends a complete archive set in baseline/replace/archived
 * frames. Other increments do not change it.
 */
export function nextArchivedSessionIds(previous, frame) {
  const current = sessionIds(previous)
  const type = String(frame?.type ?? '')
  if (type === 'baseline' || type === 'replace') {
    return sessionIds(frame?.value?.archivedSessionIds)
  }
  if (type === 'archived') {
    return sessionIds(frame?.archivedSessionIds)
  }
  return current
}

/** Conversation keys whose mapped DSH Session is archived. */
export function archivedConversationKeys(sessions, archivedSessionIds) {
  const archived = new Set(sessionIds(archivedSessionIds))
  return Object.entries(sessions && typeof sessions === 'object' ? sessions : {})
    .filter(([, sessionId]) => archived.has(String(sessionId ?? '')))
    .map(([key]) => key)
}
