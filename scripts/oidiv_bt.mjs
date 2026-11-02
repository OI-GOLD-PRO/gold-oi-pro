// Backtest OI Divergence แบบรายสัปดาห์ (OI จาก CFTC COT ย้อนถึงปี 2000 · ราคา GC=F Yahoo รายวัน)
// สัปดาห์ = พุธ–อังคาร (ตรงกับวัน OI ของ COT) · High/Low ใหม่ = เลย 10 สัปดาห์ก่อน · ผล = ผลตอบแทนหลังสัญญาณ 1/2/4 สัปดาห์
const UA = { 'User-Agent': 'Mozilla/5.0' };
const yj = await (await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&period1=946684800&period2=${Math.floor(Date.now() / 1000)}`, { headers: UA })).json();
const R = yj.chart.result[0], q = R.indicators.quote[0];
const D = R.timestamp.map((t, i) => ({ d: new Date(t * 1000 + 6 * 3600e3).toISOString().slice(0, 10), h: q.high[i], l: q.low[i], c: q.close[i] })).filter(x => x.h && x.l && x.c);
const cj = await (await fetch('https://publicreporting.cftc.gov/resource/6dca-aqww.json?cftc_contract_market_code=088691&$select=report_date_as_yyyy_mm_dd,open_interest_all&$order=report_date_as_yyyy_mm_dd&$limit=5000')).json();
const oi = cj.map(x => ({ d: x.report_date_as_yyyy_mm_dd.slice(0, 10), oi: +x.open_interest_all })).filter(x => x.d >= '2000-09-01');
console.log('days', D.length, D[0].d, '→', D[D.length - 1].d, '| COT weeks', oi.length, oi[0].d, '→', oi[oi.length - 1].d);
// สัปดาห์: จาก วันหลัง COT ก่อนหน้า ถึง วัน COT นี้
const W = [];
for (let i = 1; i < oi.length; i++) {
  const seg = D.filter(x => x.d > oi[i - 1].d && x.d <= oi[i].d); if (!seg.length) continue;
  W.push({ d: oi[i].d, h: Math.max(...seg.map(x => x.h)), l: Math.min(...seg.map(x => x.l)), c: seg[seg.length - 1].c, oi: oi[i].oi, chg: oi[i].oi / oi[i - 1].oi - 1 });
}
const LB = 10, H = [1, 2, 4];
const fwd = (i, k) => i + k < W.length ? W[i + k].c / W[i].c - 1 : null;
const groups = {};
const add = (g, i) => { (groups[g] = groups[g] || []).push(i); };
for (let i = LB; i < W.length - 4; i++) {
  const pr = W.slice(i - LB, i), nh = W[i].h > Math.max(...pr.map(x => x.h)), nl = W[i].l < Math.min(...pr.map(x => x.l)), ch = W[i].chg;
  add('ALL weeks', i);
  if (nh) { add('NH all', i); add(ch < 0 ? 'NH + OI ลด' : 'NH + OI เพิ่ม', i); if (ch <= -0.02) add('NH + OI ลด ≥2%', i); if (ch >= 0.03) add('NH + OI พุ่ง ≥3%', i); }
  if (nl) { add('NL all', i); add(ch < 0 ? 'NL + OI ลด' : 'NL + OI เพิ่ม', i); if (ch <= -0.02) add('NL + OI ลด ≥2%', i); if (ch >= 0.03) add('NL + OI พุ่ง ≥3%', i); }
}
const pct = v => (v * 100).toFixed(2).padStart(6) + '%';
console.log('\ngroup                 n   | avg 1w   2w     4w   | %up 1w  2w  4w');
for (const g of Object.keys(groups)) {
  const ix = groups[g], row = H.map(k => { const r = ix.map(i => fwd(i, k)).filter(v => v !== null); return { avg: r.reduce((a, b) => a + b, 0) / r.length, up: r.filter(v => v > 0).length / r.length }; });
  console.log(g.padEnd(20), String(ix.length).padStart(4), '|', row.map(x => pct(x.avg)).join(' '), '|', row.map(x => (x.up * 100).toFixed(0).padStart(3) + '%').join(' '));
}
// แยก 2 ช่วงเวลา (เช็กว่าคงที่ไหม)
for (const [a, b] of [['2000', '2013'], ['2013', '2027']]) {
  console.log(`\n${a}–${b}`);
  for (const g of ['NH + OI ลด', 'NH + OI เพิ่ม', 'NL + OI ลด', 'NL + OI เพิ่ม', 'ALL weeks']) {
    const ix = (groups[g] || []).filter(i => W[i].d >= a && W[i].d < b); const r = ix.map(i => fwd(i, 2)).filter(v => v !== null);
    console.log(g.padEnd(16), String(ix.length).padStart(4), 'avg2w', pct(r.reduce((x, y) => x + y, 0) / r.length), 'up', (r.filter(v => v > 0).length / r.length * 100).toFixed(0) + '%');
  }
}
