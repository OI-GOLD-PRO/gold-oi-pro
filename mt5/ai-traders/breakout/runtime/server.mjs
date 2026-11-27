import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createOptionsReader } from './oi-snapshot.mjs';
import { demoRoute, decisions } from './demo.mjs';
import { dailyJournal } from './journal.mjs';
import { startViewer } from './viewer.mjs';

const port = Number(process.env.OI_Breakout_PORT || 4193);
const readOptions = createOptionsReader();
const bridgePaths = new Set(['/api/bridge/check', '/api/demo/decision', '/api/demo/report']);
const assets = new Map([
  ['/', ['owner.html', 'text/html; charset=utf-8']],
  ['/dashboard.js', ['dashboard.js', 'text/javascript; charset=utf-8']]
]);

function reply(res, status, contentType, body) {
  res.writeHead(status, {
    'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

async function dashboard(req, res) {
  const path = req.url.split('?', 1)[0];
  if (path.startsWith('/api/demo/')) return demoRoute(req, res, path, readOptions);
  if (req.method !== 'GET') return reply(res, 405, 'text/plain', 'Method not allowed');
  const json = (status, data) => reply(res, status, 'application/json', JSON.stringify(data));
  if (path === '/api/journal') {
    const day = new URL(req.url, 'http://localhost').searchParams.get('day');
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(400, { error: 'วันที่ไม่ถูกต้อง' });
    try { return json(200, await dailyJournal(process.env.OI_Breakout_JOURNAL_FILE, day, await decisions(), process.env.OI_MT5_SYMBOL)); }
    catch { return json(503, { error: 'รอรายงาน Breakout จาก MT5' }); }
  }
  if (path === '/api/oi-snapshot') {
    try { return json(200, await readOptions()); }
    catch { return json(502, { status: 'unavailable' }); }
  }
  if (!assets.has(path)) return reply(res, 404, 'text/plain', 'Not found');
  try {
    const [file, type] = assets.get(path);
    return reply(res, 200, type, await readFile(new URL(file, import.meta.url)));
  } catch {
    return reply(res, 500, 'text/plain', 'Could not load dashboard');
  }
}

const server = createServer((req, res) => {
  // EA requests use the loopback listener and bridge bearer authentication.
  const absolute = /^http:\/\/(?:127\.0\.0\.1|localhost):(\d+)(\/[^?#]*)$/i.exec(req.url);
  const bridgePath = absolute && Number(absolute[1]) === port ? absolute[2] : req.url;
  if (req.method === 'POST' && bridgePaths.has(bridgePath)) {
    return demoRoute(req, res, bridgePath, readOptions);
  }
  if (req.headers.host !== '127.0.0.1:' + port) return reply(res, 403, 'text/plain', 'Local dashboard required');
  req.dashboardOrigin = 'http://' + req.headers.host;
  return dashboard(req, res);
});
server.listen(port, '127.0.0.1', () => console.log('Breakout dashboard http://127.0.0.1:' + port));
if (process.env.OI_VIEW_PASSWORD)
  startViewer(dashboard, process.env.OI_VIEW_PASSWORD, Number(process.env.OI_Breakout_VIEW_PORT || 4194));
