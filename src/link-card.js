// QQ 卡片/分享消息投影：只提取标题、说明和链接，不把整段 JSON 原样塞给模型。
// 这样模型能看到“这条卡片讲什么、点哪里”，同时避免卡片里的任意字段伪造提示词。
const TITLE_KEYS = ['title', 'prompt', 'tag', 'desc', 'description'];
const URL_KEYS = ['jumpUrl', 'jump_url', 'url', 'qqdocurl', 'musicUrl', 'music_url'];

function clean(value, max) {
  const text = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, max);
}

function findFirst(object, keys, max, depth = 0, seen = new Set()) {
  if (!object || typeof object !== 'object' || depth > 5 || seen.has(object)) return '';
  seen.add(object);
  for (const key of keys) {
    if (typeof object[key] === 'string' && object[key].trim()) return clean(object[key], max);
  }
  for (const value of Object.values(object)) {
    const found = findFirst(value, keys, max, depth + 1, seen);
    if (found) return found;
  }
  return '';
}

export function parseCardPayload(value) {
  let payload = value;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return null; }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  let rawRoot = payload.data ?? payload;
  if (typeof rawRoot === 'string') {
    try { rawRoot = JSON.parse(rawRoot); } catch { return null; }
  }
  const root = rawRoot && typeof rawRoot === 'object' && !Array.isArray(rawRoot) ? rawRoot : payload;
  const title = findFirst(root, ['title'], 120)
    || findFirst(root?.meta?.news ?? {}, ['title'], 120)
    || findFirst(root, ['prompt'], 120);
  const description = findFirst(root?.meta?.news ?? {}, ['desc'], 180)
    || findFirst(root, ['desc', 'description', 'summary'], 180);
  let url = findFirst(root, URL_KEYS, 500);
  if (url && !/^https?:\/\//i.test(url)) {
    const match = String(url).match(/https?:\/\/[^\s"'<>]+/i);
    url = match ? match[0] : '';
  }
  if (!title && !description && !url) {
    const serialized = JSON.stringify(root);
    const match = serialized.match(/https?:\/\/[^\s"'<>\\]+/i);
    if (match) url = clean(match[0], 500);
  }
  return (title || description || url) ? { title, description, url } : null;
}

export function formatCardMessage(value) {
  const card = parseCardPayload(value);
  if (!card) return '[卡片消息]';
  const detail = [card.description, card.url].filter(Boolean).join('｜');
  return card.title ? `[卡片：${card.title}${detail ? `｜${detail}` : ''}]` : `[卡片：${detail}]`;
}
