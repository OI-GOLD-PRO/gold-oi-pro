// ชั่วคราว: หา API OI รวมฟิวเจอร์สทอง (GC) รายวันของ CME
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1366, height: 900 } });
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const p = await ctx.newPage();
const seen = [];
p.on('request', r => { const u = r.url(); if (/CmeWS/.test(u)) seen.push(u.slice(0, 250)); });
await p.goto('https://www.cmegroup.com/markets/metals/precious/gold.volume.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(10000);
console.log('SEEN_VOL\n' + seen.join('\n')); seen.length = 0;
const out = await p.evaluate(async () => {
  const g = async u => { try { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 'isProtected&_t=' + Date.now()); return [r.status, (await r.text()).slice(0, 1500)]; } catch (e) { return ['ERR', e.message]; } };
  return {
    volF: await g('/CmeWS/mvc/Volume/Details/F/437/20261030/P'),
    volF2: await g('/CmeWS/mvc/Volume/Details/F/437/20261029/F'),
    tradeDates: await g('/CmeWS/mvc/Volume/TradeDates?exchange=CMX'),
    settleF: await g('/CmeWS/mvc/Settlements/Futures/Settlements/437/FUT?strategy=DEFAULT&tradeDate=10/30/2026&pageSize=50'),
    settleF2: await g('/CmeWS/mvc/Settlements/Futures/Settlements/437/FUT?strategy=DEFAULT&tradeDate=10/01/2026&pageSize=50'),
  };
});
for (const k in out) console.log('OUT_' + k, JSON.stringify(out[k]));
await p.goto('https://www.cmegroup.com/markets/metals/precious/gold.settlements.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(9000);
console.log('SEEN_SET\n' + seen.join('\n'));
await b.close(); process.exit(0);
