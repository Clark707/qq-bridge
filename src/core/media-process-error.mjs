export function mediaProcessFailure({ label, code, stdout = '', stderr = '' }) {
  const lines = String(stdout).trim().split(/\r?\n/).filter(Boolean);
  let payload = null;
  try {
    payload = JSON.parse(lines.at(-1) ?? '');
  } catch {}
  const detail = String(payload?.error ?? '').trim()
    || String(stderr).trim().slice(-1200)
    || String(stdout).trim().slice(-1200)
    || '无错误输出';
  return `${label}失败（exit ${code}）：${detail}`;
}
