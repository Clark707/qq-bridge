// 会话上下文预算的只读判定。
//
// DSH 自己负责压缩；这里不复制压缩器，只把真实 contextPressure 投影归一成
// 可观测状态，让桥接能在接近阈值时留日志、在控制台展示，并让测试钉住算法。

function finiteNonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 兼容 DSH 快照的 surfaceTokens 与现役 projections 的 pressureTokens。 */
export function contextTokensFromProjection(projection) {
  if (!projection || typeof projection !== 'object') return null;
  // 2026-10-21 实测：DSH 在 pressureTokens 跨过 40% 后才压缩，压缩后从 420,129
  // 降到 168,759；因此预算判断必须优先 pressureTokens，而不是较小的 surfaceTokens。
  for (const key of ['pressureTokens', 'projectedTokens', 'surfaceTokens']) {
    const value = finiteNonNegative(projection[key]);
    if (value && value > 0) return value;
  }
  return null;
}

export function classifyContextPressure({
  surfaceTokens,
  contextWindow,
  warnRatio = 0.3,
  criticalRatio = 0.38,
  compactionRatio = 0.4
} = {}) {
  const surface = finiteNonNegative(surfaceTokens);
  const window = finiteNonNegative(contextWindow);
  if (!surface || !window) return { level: 'unknown', ratio: null, surfaceTokens: surface, contextWindow: window };
  const ratio = surface / window;
  let level = 'ok';
  if (ratio >= 1) level = 'overflow';
  else if (ratio >= compactionRatio) level = 'compacting';
  else if (ratio >= criticalRatio) level = 'critical';
  else if (ratio >= warnRatio) level = 'warn';
  return {
    level,
    ratio,
    surfaceTokens: Math.round(surface),
    contextWindow: Math.round(window)
  };
}

export function summarizeContextPressure(options = {}) {
  const state = classifyContextPressure(options);
  if (state.level === 'unknown') {
    return { ...state, remainingTokens: null, compactionAtTokens: null, text: '上下文压力未知' };
  }
  const window = state.contextWindow;
  const retainTokens = Math.max(0, Math.round(Number(options.retainTokens) || 0));
  const compactionAtTokens = Math.floor(window * Math.max(0, Math.min(1, Number(options.compactionRatio) || 0.4)));
  const percent = (state.ratio * 100).toFixed(1);
  return {
    ...state,
    remainingTokens: Math.max(0, window - state.surfaceTokens),
    compactionAtTokens,
    retainTokens,
    text: `上下文 ${percent}%（${state.surfaceTokens.toLocaleString()} / ${window.toLocaleString()} tokens），` +
      `DSH 在 ${compactionAtTokens.toLocaleString()} tokens 触发压缩，逐字保留 ${retainTokens.toLocaleString()} tokens`
  };
}
