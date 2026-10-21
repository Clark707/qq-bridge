#!/usr/bin/env node
// QQ 链路守护：观察 3080(DSH) / 5099(SnowLuma) / 3100(bridge) 三环。
//
// 为什么要有它（2026-10-20 真实事故）：
//   3080 那个 DSH 实例停了，bridge 一直在重试一个没人监听的端口，
//   日志全是「0 帧」，QQ 里只回了一句「⏳ 服务重启中，消息已排队」。
//   我自己不知道，直到老大说「神了」才发现。链路每一环都不报错，只是安静地不工作。
//
// 设计取舍：
//   · 不用常驻进程（从受管 shell 起的会被回收），改成计划任务每分钟跑一次本脚本，
//     检查+拉起+记日志后退出。失败一次不影响下一次。
//   · 端口只是第一层。bridge 的 /api/status 必须同时证明 DSH 可用、SnowLuma WS 已连、
//     QQ 账号在线且接收链路没有自报 good=false，才允许记 all-up。
//   · 拉起一律 detached + unref，父进程退出不带走它。
//   · 只记事实，不记判断：每次写一行 JSONL。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LOG = process.env.QQ_GUARD_LOG ?? 'Z:\\Utakata\\state\\qq_stack_guard.log';
const NODE = process.env.QQ_GUARD_NODE ?? 'Z:\\Ds工作箱\\工具\\nodejs\\node.exe';
const WSCRIPT = process.env.QQ_GUARD_WSCRIPT ?? 'C:\\Windows\\System32\\wscript.exe';
const SNOWLUMA_DIR = 'C:\\utakata\\snowluma';
const BRIDGE_DIR = 'Z:\\Ds工作箱\\工具\\qq-bridge';
const SNOWLUMA_HIDDEN = path.join(BRIDGE_DIR, 'scripts', 'snowluma-hidden.vbs');
const BRIDGE_TOKEN = path.join(BRIDGE_DIR, 'state', 'console-token');
const BRIDGE_RESTART_MARKER = path.join(BRIDGE_DIR, 'state', 'bridge-restarting.json');

function log(rec) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...rec });
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, line + '\n');
  } catch { /* 日志写不了也不能让守护本身挂掉 */ }
  process.stdout.write(line + '\n');
}

async function alive(url, timeoutMs = 4000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    // 401 = 服务在、只是没带凭据；也算活。要的是「端口有人应答」。
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, error: String(e?.cause?.code ?? e?.name ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

function bridgeConsoleToken() {
  try {
    return fs.readFileSync(BRIDGE_TOKEN, 'utf8').trim();
  } catch {
    return '';
  }
}

async function bridgeStatus(timeoutMs = 5000) {
  const token = bridgeConsoleToken();
  if (!token) return { ok: false, error: 'console-token-missing' };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch('http://127.0.0.1:3100/api/status', {
      headers: { 'x-console-token': token },
      signal: ac.signal
    });
    const body = await r.json().catch(() => null);
    if (!r.ok || !body || typeof body !== 'object') return { ok: false, status: r.status, error: 'status-invalid' };
    const snow = body.snowluma ?? {};
    return {
      ok: true,
      status: r.status,
      mode: body.mode ?? null,
      dshReady: body.dshReady === true,
      snowlumaConnected: snow.connected === true,
      accountOnline: snow.accountOnline === true,
      good: snow.good,
      lastPacketAgoMs: snow.lastPacketAgoMs,
      hint: snow.hint ?? null
    };
  } catch (e) {
    return { ok: false, error: String(e?.cause?.code ?? e?.name ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

function launch(cmd, args, opts) {
  const child = spawn(cmd, args, { ...opts, detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return child.pid;
}

function selfRestartPending() {
  try {
    const marker = JSON.parse(fs.readFileSync(BRIDGE_RESTART_MARKER, 'utf8'));
    const startedAt = Number(marker?.startedAt) || 0;
    return startedAt > 0 && Date.now() - startedAt < 45000;
  } catch {
    return false;
  }
}

async function ensure3080() {
  const a = await alive('http://127.0.0.1:3080/');
  if (a.ok) return { name: 'dsh3080', up: true, status: a.status };
  // DSH 是交互壳，不由后台守护偷偷拉起。静默启动仍可能制造重复窗口，
  // 也可能覆盖用户正在手工重启的实例；这里只报告，交给用户完整退出后重开。
  return { name: 'dsh3080', up: false, manualRestartRequired: true };
}

async function ensureSnowLuma() {
  const a = await alive('http://127.0.0.1:5099/api/status');
  if (a.ok) return { name: 'snowluma', up: true, status: a.status };
  // Node's windowsHide is not reliable for detached console children on this
  // host: it produced a visible Windows Terminal every minute while SnowLuma
  // was down. WScript.Run(..., 0, ...) hides the child at the shell layer.
  const pid = launch(WSCRIPT, ['//B', SNOWLUMA_HIDDEN, SNOWLUMA_DIR], { cwd: SNOWLUMA_DIR });
  return { name: 'snowluma', up: false, restarted: true, launcherPid: pid };
}

async function ensureBridge() {
  const a = await alive('http://127.0.0.1:3100/');
  if (a.ok) {
    const health = await bridgeStatus();
    if (health.ok) {
      const degraded = !health.dshReady || !health.snowlumaConnected || !health.accountOnline || health.good === false;
      return {
        name: 'bridge',
        up: true,
        healthy: !degraded,
        status: a.status,
        accountOnline: health.accountOnline,
        dshReady: health.dshReady,
        snowlumaConnected: health.snowlumaConnected,
        good: health.good,
        lastPacketAgoMs: health.lastPacketAgoMs,
        ...(degraded ? { degraded: true, hint: health.hint } : {})
      };
    }
    return { name: 'bridge', up: true, healthy: false, status: a.status, degraded: true, error: health.error };
  }
  if (selfRestartPending()) {
    return { name: 'bridge', up: false, healthy: false, selfRestartPending: true };
  }
  // bridge 依赖前两环；先把它们确认起来再拉 bridge。
  const pid = launch(NODE, ['src/bridge.js'], { cwd: BRIDGE_DIR });
  return { name: 'bridge', up: false, healthy: false, restarted: true, pid };
}

const results = [];
results.push(await ensure3080());
results.push(await ensureSnowLuma());
// SnowLuma 刚拉起时要几秒才监听，这里不强等，下一次轮询会看到。
results.push(await ensureBridge());
for (const r of results) {
  if (!r.up) log({ action: r.manualRestartRequired ? 'manual-restart-required' : (r.selfRestartPending ? 'self-restart-pending' : 'restart'), ...r });
  else if (r.healthy === false) log({ action: 'degraded', ...r });
}
if (results.every((r) => r.up && r.healthy !== false)) {
  log({ action: 'all-up', ports: [3080, 5099, 3100], deepHealth: true });
}
