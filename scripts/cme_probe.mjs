// ชั่วคราว: LastTotals ย้อนได้กี่วัน
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1366, height: 900 } });
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const p = await ctx.newPage();
await p.goto('https://www.cmegroup.com/markets/metals/precious/gold.volume.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(8000);
const out = await p.evaluate(async () => {
  const res = {};
  for (const d of ['20260915', '20260801', '20260601', '20251103', '20240603']) {
    try { const r = await fetch(`/CmeWS/mvc/Volume/Details/F/437/${d}/F?tradeDate=${d}&pageSize=500&isProtected&_t=` + Date.now()); const t = await r.text(); res[d] = r.status + ' ' + t.slice(0, 220); } catch (e) { res[d] = 'ERR ' + e.message; }
  }
  return res;
});
for (const k in out) console.log('DT_' + k, out[k]);
await b.close(); process.exit(0);
