import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createOptionsReader } from './oi-snapshot.mjs';

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
  if (request.headers.origin !== 'http://' + request.headers.host ||
      !/^127[.]0[.]0[.]1:[0-9]+$/.test(request.headers.host) ||
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
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', max_tokens: 1000,
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

const server = createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/analyze') return analyze(request, response);
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return reply(response, 405, 'text/plain', 'Method not allowed');
  }

  const path = request.url.split('?', 1)[0];
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
});

server.listen(Number(process.env.OI_TRADER_PORT ?? 4173), '127.0.0.1', () => {
  console.log('OI Gold AI Trader dashboard at http://127.0.0.1:' + server.address().port);
});
