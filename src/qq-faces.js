// 模型回复中的 `[旺柴]` 等 QQ 系统表情文本 → OneBot face 段。
//
// 不去猜 id：目录由 SnowLuma 的 fetch_sys_faces 提供；只对目录里真实存在、
// 且 q_sid 为纯数字的系统表情做转换。`旺柴` 是 QQ 客户端常用名，目录里叫
// `/doge`，因此保留一张极小的人工别名表。
const FACE_ALIASES = Object.freeze({
  旺柴: '179',
  doge: '179',
  狗头: '179',
  斜眼笑: '178',
  笑哭: '182',
  捂脸: '264',
  摸鱼: '285',
  吃瓜: '271',
  打call: '311',
  比心: '319'
});

function normalizeName(value) {
  return String(value ?? '').trim().replace(/^\/+/, '').toLowerCase();
}

export function buildFaceMap(catalogPayload) {
  const map = new Map();
  const packs = Array.isArray(catalogPayload?.packs) ? catalogPayload.packs : [];
  for (const pack of packs) {
    for (const face of Array.isArray(pack?.emojis) ? pack.emojis : []) {
      const id = String(face?.q_sid ?? '').trim();
      if (!/^\d+$/.test(id)) continue;
      const names = [face?.q_des, ...(Array.isArray(face?.emoji_name_alias) ? face.emoji_name_alias : [])];
      for (const name of names) {
        const key = normalizeName(name);
        if (key && !map.has(key)) map.set(key, id);
      }
    }
  }
  for (const [name, id] of Object.entries(FACE_ALIASES)) {
    if (map.has(normalizeName(name))) map.set(normalizeName(name), id);
    else map.set(normalizeName(name), id);
  }
  return map;
}

/**
 * 将文本拆成 `{type:'text'}` / `{type:'face'}` 段。
 * 只识别独立的方括号 token，不影响普通正文；未知 `[xxx]` 原样保留。
 */
export function textToQqSegments(text, faceMap, escapeText = (value) => value) {
  const source = String(text ?? '');
  const map = faceMap instanceof Map ? faceMap : new Map();
  const re = /\[([^\[\]\r\n]{1,24})\]/g;
  const segments = [];
  let last = 0;
  let match;
  while ((match = re.exec(source)) !== null) {
    const id = map.get(normalizeName(match[1]));
    if (!id) continue;
    if (match.index > last) {
      segments.push({ type: 'text', data: { text: escapeText(source.slice(last, match.index)) } });
    }
    segments.push({ type: 'face', data: { id } });
    last = match.index + match[0].length;
  }
  if (last < source.length) {
    segments.push({ type: 'text', data: { text: escapeText(source.slice(last)) } });
  }
  return segments.length ? segments.filter((seg) => seg.type !== 'text' || seg.data.text) : [{ type: 'text', data: { text: escapeText(source) } }];
}
