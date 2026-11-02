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
const out = await p.evaluate(async () => {
  const g = async u => { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 'isProtected&_t=' + Date.now()); return r.json(); };
  const groups = await g('/CmeWS/mvc/Volume/Options/Expirations?productid=437&tradedate=20261030');
  const res = {};
  for (const [grp, lab, root] of [['Weekly Tuesday Option', 'Week 1 - NOV 2026', 'G1T'], ['Weekly Monday Option', 'Week 2 - NOV 2026', 'G2M'], ['American Options', 'DEC 2026', 'OG']]) {
    const gg = groups.find(x => x.label === grp), e = gg && gg.expirations.find(x => x.label === lab);
    if (!e) { res[root] = 'not found ' + (gg ? gg.expirations.map(x => x.label).join(',') : Object.keys(groups.map(x=>x.label))); continue; }
    const code = e.expirationCode, ex = code[0] + code.slice(-1);
    try {
      const sj = await g(`/CmeWS/mvc/Settlements/Options/Settlements/${e.productId}/OOF?strategy=DEFAULT&optionProductId=${e.productId}&monthYear=${root}${code}&optionExpiration=${e.productId}-${ex}&tradeDate=10/30/2026&pageSize=500`);
      res[root] = { pid: e.productId, code, rows: (sj.settlements || []).map(x => [+x.strike, /^c/i.test(x.type) ? 'C' : 'P', +String(x.settle).replace(/[^0-9.]/g, '')]).filter(x => x[0] > 0 && x[2] > 0) };
    } catch (er) { res[root] = 'ERR ' + er.message; }
  }
  return res;
});
fs.writeFileSync('probe_out.json', JSON.stringify(out));
for (const k in out) console.log('PROBE_' + k, JSON.stringify(out[k]));
await b.close(); process.exit(0);
for (const u of ['https://www.cmegroup.com/markets/cme-group-benchmark-administration/cme-group-volatility-indexes.html', 'https://www.cmegroup.com/market-data/cme-group-benchmark-administration/cme-group-volatility-indexes.html', 'https://www.cmegroup.com/tools-information/quikstrike/options-volatility.html']) {
  try { const r = await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }); console.log('PAGE', r && r.status(), u); await p.waitForTimeout(9000); } catch (e) { console.log('PAGE ERR', u, e.message); }
}
console.log('SEEN\n' + seen.join('\n'));
await b.close();
