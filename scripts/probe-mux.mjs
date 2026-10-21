import { randomUUID } from 'node:crypto';
import { probeCookie, probeMuxSocket } from './probe-auth.mjs';
const cookie = probeCookie();
const socket = probeMuxSocket(cookie);
const sid = randomUUID();
socket.addEventListener('open', () => {
  console.log('open');
  socket.send(JSON.stringify({ type: 'open', streamId: sid, endpoint: '$events', payload: { args: {} } }));
  setTimeout(() => { console.log('closing after 8s'); process.exit(0); }, 8000);
});
socket.addEventListener('message', (ev) => { console.log('MSG', String(ev.data).slice(0, 400)); });
socket.addEventListener('close', (e) => { console.log('CLOSE', e.code, e.reason); process.exit(0); });
socket.addEventListener('error', (e) => { console.log('ERR', e.message ?? e); });
