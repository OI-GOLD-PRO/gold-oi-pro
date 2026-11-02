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
  for (const d of [90, 365, 1000, 3000]) {
    try { const r = await fetch(`/CmeWS/mvc/Volume/LastTotals/437?days=${d}&isProtected&_t=` + Date.now()); const j = await r.json(); const v = j.vdate || []; res[d] = { n: v.length, first: v[0] && v[0].formattedDate, last: v.length && v[v.length - 1].formattedDate, rows: d === 3000 || v.length < 3000 ? v.map(x => [x.formattedDate, +x.futureOi, +x.futureVolume]) : null }; } catch (e) { res[d] = 'ERR ' + e.message; }
  }
  return res;
});
for (const k in out) console.log('LT_' + k, JSON.stringify(typeof out[k] === 'string' ? out[k] : { n: out[k].n, first: out[k].first, last: out[k].last }));
const best = Object.values(out).filter(x => x && x.rows).sort((a, b) => b.n - a.n)[0];
console.log('ROWS ' + JSON.stringify(best ? best.rows : []));
await b.close(); process.exit(0);
