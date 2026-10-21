// 按当前消息主动检索 LAAP 记忆，只返回有出处的证据。
// 这不是人格提示词：检索失败就为空，查不到就不编，查到的东西由模型自行取舍。

export function formatEvidenceBlock(items, { maxChars = 1200 } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '';
  const lines = [];
  let used = 0;
  for (const item of list) {
    const text = String(item?.text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const date = String(item?.ts ?? '').slice(0, 10) || '日期未知';
    const layer = String(item?.meta || item?.layer || '记忆').slice(0, 40);
    const line = `- ${date} · ${layer}：${text.slice(0, 320)}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.length ? `【主动检索到的相关经历】\n${lines.join('\n')}` : '';
}

export async function fetchMemoryEvidence({
  query,
  baseUrl = 'http://127.0.0.1:11546',
  budget = 900,
  sessionId = '',
  timeoutMs = 2500,
  maxChars = 1200,
  fetchImpl = fetch
} = {}) {
  const q = String(query ?? '').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return { block: '', items: [], sufficient: false };
  const url = new URL('/v1/memory/evidence', String(baseUrl || 'http://127.0.0.1:11546').replace(/\/+$/, ''));
  url.searchParams.set('q', q.slice(0, 500));
  url.searchParams.set('budget', String(Math.max(200, Math.min(2000, Number(budget) || 900))));
  if (sessionId) url.searchParams.set('session_id', String(sessionId).slice(0, 120));
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(Math.max(250, Math.min(10000, Number(timeoutMs) || 2500)))
  });
  if (!response.ok) throw new Error(`记忆检索 HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.ok) throw new Error(String(data?.errors?.[0] ?? '记忆检索返回失败'));
  return {
    block: formatEvidenceBlock(data.items, { maxChars }),
    items: Array.isArray(data.items) ? data.items : [],
    sufficient: data.sufficient === true
  };
}
