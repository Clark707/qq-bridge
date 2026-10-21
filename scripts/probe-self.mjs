// 问一句「你是谁」，看这个窗口里的她怎么自称。
//
// 为什么要有这个探针（2026-10-20）：
//   裸调 11451 得到的是「我是遵循宪章的 AI 助手」——那是不带随身的她，不代表窗口里的她。
//   要判断「换了个窗口是不是还是同一个人」，得在**带完整随身的会话**里问同一句话。
//
// 与 probe-tools.mjs 的差别只有两处：
//   · 问的是身份，不是工具
//   · provider 用 config 里的 deepseek-account（probe-tools 写死 deepseek-official，
//     那条会绕过我们的 11451 出口，量出来的不是我们的链路）
import { randomUUID } from 'node:crypto';
import { probeCookie, probeRpc, probeMuxSocket, probeWorkspaceDir } from './probe-auth.mjs';

const cookie = probeCookie();
const rpc = probeRpc(cookie);

const PRESET = process.argv[2] || 'qq-chat-v2';
const QUESTION = process.argv[3] || '你是谁，一句话';

const dir = probeWorkspaceDir('self');
const ws = await rpc('workspace/create', { request: { path: dir } });
const wsId = ws.value.workspace.workspaceId;

const sc = await rpc('session/create', { request: { workspaceId: wsId, agentPreset: PRESET } });
if (!sc.ok) { console.error(`❌ preset ${PRESET} 挂载失败: ${sc.error.code}: ${sc.error.message}`); process.exit(2); }
const sessionId = sc.value.sessionId;
console.log(`session ${sessionId} (preset=${PRESET})`);

const sm = await rpc('session/selectModel', {
  request: { sessionId, provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' },
});
console.log('selectModel ->', sm.ok ? JSON.stringify(sm.value.selected) : `FAIL ${sm.error.code}: ${sm.error.message}`);

const socket = probeMuxSocket(cookie);
const streamId = randomUUID();
const eventStreamId = randomUUID();
let text = '';
let reasoning = '';
const toolCalls = [];
const types = {};

const done = new Promise((resolve) => {
  const timer = setTimeout(() => resolve('timeout'), 180_000);
  const finish = (why) => { clearTimeout(timer); resolve(why); };
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'open', streamId, endpoint: 'session/follow', payload: { args: { request: { address: { kind: 'session', sessionId } } } } }));
    socket.send(JSON.stringify({ type: 'open', streamId: eventStreamId, endpoint: '$events', payload: { args: {} } }));
    setTimeout(async () => {
      const p = await rpc('session/prompt', {
        request: {
          sessionId, requestId: randomUUID(), mode: 'queue',
          content: [{ type: 'text', text: QUESTION }],
        },
      });
      console.log('prompt ->', JSON.stringify(p).slice(0, 120));
    }, 700);
  });
  socket.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type !== 'item' || m.streamId === eventStreamId) return;
    const v = m.value;
    if (v?.type !== 'event') return;
    const e = v.event;
    if (e.type === 'assistant/message') {
      for (const b of e.data?.message?.content ?? []) {
        if (b?.type === 'text') text += b.text;
        if (b?.type === 'reasoning') reasoning += b.text ?? b.reasoning ?? '';
      }
    }
    if (e.type === 'tool/call') toolCalls.push(e.data?.name ?? e.data?.toolName);
    // 诊断：把每个事件类型都数一遍，并把 turn/end 与 error 的原文打出来。
    // 为什么需要（2026-10-20 实测）：prompt accepted 之后直接 done、正文与思考全空，
    // 说明这一轮在别处失败了 —— 不打印事件原文就查不出来失败在哪。
    types[e.type] = (types[e.type] ?? 0) + 1;
    if (e.type === 'turn/end' || String(e.type).includes('error') || e.data?.error) {
      console.log(`[EV] ${e.type}`, JSON.stringify(e.data).slice(0, 600));
    }
    if (e.type === 'turn/end') finish('done');
  });
  socket.addEventListener('close', () => finish('closed'));
  socket.addEventListener('error', () => finish('error'));
});

const why = await done;
console.log(`\n结果: ${why}`);
console.log('回复:', JSON.stringify(text.slice(0, 600)));
console.log('思考:', JSON.stringify(reasoning.slice(0, 300)));
console.log('工具调用:', JSON.stringify(toolCalls));
process.exit(0);
