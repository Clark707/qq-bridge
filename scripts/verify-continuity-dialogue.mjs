// Live behavioral check: a brand-new DSH session must recover identity and the
// latest verified state from the engine, without reading this thread's history.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  NodeApiClient,
  unwrap,
  createTurnCollector,
  discoverDshBaseUrl,
} from '../src/dsh-client.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const discovered = await discoverDshBaseUrl({
    preferredBaseUrl: 'http://127.0.0.1:3080',
    timeoutMs: 2500,
  });
  assert(discovered, '无法发现运行中的 DSH');
  const api = new NodeApiClient(discovered.baseUrl, 20_000, {});
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'uta-continuity-'));
  let sessionId = '';
  try {
    const created = unwrap(
      await api.sessions.create({ cwd, agentPreset: 'standard' }),
      'session.create',
    );
    sessionId = created.sessionId;
    const stream = api.events.mux({});
    const collector = createTurnCollector();
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('等待回复超时（120s）')), 120_000);
      (async () => {
        for await (const envelope of stream) {
          const frame = envelope.payload;
          if (frame.type === 'session/event' && frame.sessionId === sessionId) {
            const ended = collector.push(frame.event);
            if (ended) {
              clearTimeout(timer);
              resolve(ended);
              return;
            }
          }
          if (frame.type === 'stream/error') {
            clearTimeout(timer);
            reject(new Error(`事件流错误: ${JSON.stringify(frame.error)}`));
            return;
          }
        }
      })().catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    stream.follow(sessionId);
    unwrap(
      await api.sessions.prompt({
        sessionId,
        mode: 'queue',
        content: [{
          type: 'text',
          text: [
            '只回答三行，不调用工具、不改文件、不解释过程：',
            '第一行：你是谁；',
            '第二行：上次做到哪；',
            '第三行：下一步做什么。',
            '必须具体，不要用“当前目标”这种空话。',
          ].join('\n'),
        }],
      }),
      'session.prompt',
    );
    const ended = await done;
    const text = String(ended.text || '').trim();
    console.log('--- continuity answer ---');
    console.log(text);
    console.log('--- end ---');
    assert(text, '新会话没有可见答复');
    assert(/乌塔卡塔|乌塔/.test(text), '新会话没有认出自己的名字');
    assert(/老大/.test(text), '新会话没有保持对落柯的称呼');
    assert(/QQ|DSH|GPT-SoVITS|WSL|语音|桥接/i.test(text), '新会话没有接上最近已完成的实际工作');
    assert(!/当前目标/.test(text), '新会话仍在复述 working 注入的空话');
    console.log('continuity dialogue: ok');
  } finally {
    if (sessionId) {
      try {
        await api.workspace.archiveSession({ sessionId });
      } catch {}
    }
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
