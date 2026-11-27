import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createOptionsReader } from './oi-snapshot.mjs';

import { demoRoute, decisions } from './demo.mjs';
import { dailyJournal } from './journal.mjs';

const readOptions = createOptionsReader();
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);

function reply(response, status, contentType, body) {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

let analysisPending = false;
async function analyze(request, response) {
  const json = (status, body) => reply(response, status, 'application/json', JSON.stringify(body));
  if (request.headers.origin !== request.dashboardOrigin ||
      request.headers['x-oi-dashboard'] !== '1') return json(403, { error: 'ต้องเปิดจากแดชบอร์ดในเครื่อง' });
  if (!process.env.DEEPSEEK_API_KEY) return json(503, { error: 'ยังไม่ได้ตั้งค่า DEEPSEEK_API_KEY บนเซิร์ฟเวอร์' });
  if (analysisPending) return json(409, { error: 'กำลังวิเคราะห์ข้อมูล' });
  analysisPending = true;
  try {
    const snapshot = await readOptions();
    if (snapshot.status !== 'fresh' || !snapshot.oi_coverage.reported)
      return json(409, { error: 'ยังไม่มีข้อมูลออปชันและ OI ที่พร้อมวิเคราะห์' });
    const result = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { Authorization: 'Bearer ' + process.env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-flash', max_tokens: 1000,
        messages: [
          { role: 'system', content: 'สรุปข้อมูล GC options เป็นภาษาไทย ระบุแนว OI สำคัญพร้อม strike และฝั่ง อธิบาย volume และความไม่แน่นอน ระบุเวลา OI แยกจากราคา ห้ามสมมุติข้อมูลที่ขาดหรือส่งคำสั่งเทรด' },
          { role: 'user', content: JSON.stringify(snapshot) }
        ]
      })
    });
    if (!result.ok) return json(502, { error: 'DeepSeek ตอบ HTTP ' + result.status });
    const answer = (await result.json()).choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('Empty analysis');
    return json(200, { answer, quotes_as_of_utc: snapshot.quotes_as_of_utc });
  } catch {
    return json(502, { error: 'อ่านฟีดหรือเรียก DeepSeek ไม่สำเร็จ' });
  } finally {
    analysisPending = false;
  }
}

async function dashboard(request, response) {

  if (request.url.startsWith('/api/demo/')) return demoRoute(request,response,request.url,readOptions);
  if (request.method === 'POST' && request.url === '/api/analyze') return analyze(request, response);
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return reply(response, 405, 'text/plain', 'Method not allowed');
  }

  const path = request.url.split('?', 1)[0];
  if (path === '/api/journal') {
    const day = new URL(request.url, 'http://localhost').searchParams.get('day');
    const send = (status, result) => reply(response, status, 'application/json', JSON.stringify(result));
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return send(400, { error: 'วันที่ไม่ถูกต้อง' });
    if (!process.env.OI_JOURNAL_FILE) return send(503, { error: 'รอเชื่อมไฟล์ประวัติ MT5' });
    try { return send(200, await dailyJournal(process.env.OI_JOURNAL_FILE, day, await decisions())); }
    catch { return send(503, { error: 'อ่านรายงาน MT5 ไม่สำเร็จ' }); }
  }
  if (path === '/api/oi-snapshot') {
    try {
      return reply(response, 200, 'application/json', JSON.stringify(await readOptions()));
    } catch (error) {
      console.error('OI snapshot unavailable:', error.message);
      return reply(response, 502, 'application/json', JSON.stringify({ status: 'unavailable' }));
    }
  }

  const asset = assets.get(path);
  if (!asset) return reply(response, 404, 'text/plain', 'Not found');
  try {
    const [file, type] = asset;
    return reply(response, 200, type, await readFile(new URL(file, import.meta.url)));
  } catch {
    return reply(response, 500, 'text/plain', 'Could not load dashboard');
  }
}

const server = createServer((req,res)=>{
  if (!/^127[.]0[.]0[.]1:\d+$/.test(req.headers.host||'')) return reply(res,403,'text/plain','Local dashboard required');
  req.dashboardOrigin='http://'+req.headers.host;
  return dashboard(req,res);
});

if (process.env.OI_MOBILE_ORIGIN) {
  const origin=new URL(process.env.OI_MOBILE_ORIGIN);
  const password=process.env.OI_MOBILE_PASSWORD;
  if(origin.protocol!=='https:' || !password || password.length<24) throw Error('Configure HTTPS origin and mobile password (24+ characters)');
  const expected=Buffer.from('Basic '+Buffer.from('dashboard:'+password).toString('base64'));
  const tls={key:await readFile(process.env.OI_TLS_KEY),cert:await readFile(process.env.OI_TLS_CERT)};
  createTlsServer(tls,(req,res)=>{
    if(req.headers.host!==origin.host || req.url.startsWith('/api/demo/decision')) return reply(res,403,'text/plain','Forbidden');
    const auth=Buffer.from(req.headers.authorization||'');
    if(auth.length!==expected.length || !timingSafeEqual(auth,expected)){
      res.setHeader('WWW-Authenticate','Basic realm="OI Trader"');
      return reply(res,401,'text/plain','Sign in');
    }
    req.dashboardOrigin=origin.origin;
    return dashboard(req,res);
  }).listen(Number(origin.port||443),process.env.OI_MOBILE_BIND||'0.0.0.0');
}

server.listen(Number(process.env.OI_TRADER_PORT ?? 4173), '127.0.0.1', () => {
  console.log('OI Gold AI Trader dashboard at http://127.0.0.1:' + server.address().port);
});

if(process.env.OI_VIEW_PASSWORD){
  const {startViewer}=await import('./viewer.mjs');
  startViewer(dashboard,process.env.OI_VIEW_PASSWORD);
}
