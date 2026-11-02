// ชั่วคราว: สำรวจว่า CME ให้ค่า IV (Vol settle / CVOL) ทาง API ไหนได้บ้าง
import { chromium } from 'playwright';
import fs from 'node:fs';
const j0 = JSON.parse(fs.readFileSync('cme_oi.json', 'utf8'));
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1366, height: 900 } });
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const p = await ctx.newPage();
const seen = [];
p.on('response', async r => { const u = r.url(); if (/CmeWS|cvol|Cvol|CVOL|quikstrike|vol/i.test(u) && !/\.(js|css|png|svg|woff)/.test(u)) seen.push(r.status() + ' ' + u.slice(0, 220)); });
await p.goto('https://www.cmegroup.com/markets/metals/precious/gold.volume.options.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(8000);
const [m, d, y] = j0.settle.tradeDate.split('/');
const out = await p.evaluate(async ({ pid, code, mdY }) => {
  const g = async u => { try { const r = await fetch(u); return [r.status, (await r.text()).slice(0, 3000)]; } catch (e) { return ['ERR', e.message]; } };
  return {
    settle: await g(`/CmeWS/mvc/Settlements/Options/Settlements/${pid}/OOF?strategy=DEFAULT&optionProductId=${pid}&monthYear=G1M${code}&optionExpiration=${pid}-X6&tradeDate=${mdY}&pageSize=5`),
  };
}, { pid: j0.productId, code: 'X26', mdY: j0.settle.tradeDate });
console.log('SETTLE', JSON.stringify(out).slice(0, 3500));
for (const u of ['https://www.cmegroup.com/markets/cme-group-benchmark-administration/cme-group-volatility-indexes.html', 'https://www.cmegroup.com/market-data/cme-group-benchmark-administration/cme-group-volatility-indexes.html', 'https://www.cmegroup.com/tools-information/quikstrike/options-volatility.html']) {
  try { const r = await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }); console.log('PAGE', r && r.status(), u); await p.waitForTimeout(9000); } catch (e) { console.log('PAGE ERR', u, e.message); }
}
console.log('SEEN\n' + seen.join('\n'));
await b.close();
