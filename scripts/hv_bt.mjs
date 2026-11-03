// Backtest: ป้าย 🌡 "±$/วัน" = ราคา × HV20 ÷ √252 จริงไหม (Yahoo GC=F รายวัน ตั้งแต่ 2000)
// ใช้ HV20 ณ ปิดวัน t ทำนายวัน t+1 (ไม่แอบดูอนาคต)
const UA = { 'User-Agent': 'Mozilla/5.0' };
async function yahoo(sym) {
  const now = Math.floor(Date.now() / 1000);
  for (const host of ['query1', 'query2']) {
    try {
      const j = await (await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=946684800&period2=${now}`, { headers: UA })).json();
      const r = j.chart.result[0], q = r.indicators.quote[0];
      const out = r.timestamp.map((t, i) => ({ t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] })).filter(b => b.c > 0 && b.o > 0 && b.h > 0 && b.l > 0 && b.h >= b.l);
      if (out.length > 300) return out;
    } catch (e) { console.log('fail', host, e.message); }
  }
  return null;
}
const sd = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const ymd = t => new Date(t * 1000).toISOString().slice(0, 10);
const pc = (a, f) => (a.filter(f).length / a.length * 100).toFixed(1).padStart(5) + '%';
const B = await yahoo('GC=F'); if (!B) { console.log('no data'); process.exit(1); }
console.log('bars', B.length, ymd(B[0].t), '→', ymd(B[B.length - 1].t));
const lr = B.map((b, i) => i ? Math.log(b.c / B[i - 1].c) : 0);
const rows = [];
for (let i = 21; i < B.length - 1; i++) {
  const hv = sd(lr.slice(i - 19, i + 1)) * Math.sqrt(252), d = B[i].c * hv / Math.sqrt(252); // ±$ ของวันพรุ่งนี้
  const n = B[i + 1]; if (n.t - B[i].t > 5 * 86400) continue;
  const cc = Math.abs(n.c - B[i].c), rng = n.h - n.l, ext = Math.max(n.h - B[i].c, B[i].c - n.l);
  rows.push({ y: +ymd(n.t).slice(0, 4), t: n.t, hv: hv * 100, d, z: cc / d, rz: rng / d, ez: ext / d, cc, rng });
}
function rep(name, R) {
  if (R.length < 15) return;
  const md = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  console.log(`${name.padEnd(22)} n=${String(R.length).padStart(5)} | ปิด-ปิด ≤1×: ${pc(R, r => r.z <= 1)} ≤2×: ${pc(R, r => r.z <= 2)} >3×: ${pc(R, r => r.z > 3)} | ไส้แตะ ±1× จากปิดเมื่อวาน: ${pc(R, r => r.ez >= 1)} | สูง-ต่ำ/1× มัธยฐาน ${md(R.map(r => r.rz)).toFixed(2)} | ±$เฉลี่ย ${(R.reduce((s, r) => s + r.d, 0) / R.length).toFixed(1)} จริง|ปิด-ปิด|เฉลี่ย ${(R.reduce((s, r) => s + r.cc, 0) / R.length).toFixed(1)}`);
}
console.log('\nทฤษฎี (ปกติ): ≤1× = 68.3% · ≤2× = 95.4% · >3× = 0.27%\n');
rep('ทั้งหมด', rows);
console.log('\n— รายช่วง —');
[[2000, 2007], [2008, 2012], [2013, 2019], [2020, 2022], [2023, 2024], [2025, 2026]].forEach(([a, b]) => rep(`${a}–${b}`, rows.filter(r => r.y >= a && r.y <= b)));
rep('1 ปีล่าสุด', rows.slice(-252)); rep('60 วันล่าสุด', rows.slice(-60)); rep('20 วันล่าสุด', rows.slice(-20));
console.log('\n— ตามระดับ HV —');
const hs = rows.map(r => r.hv).sort((a, b) => a - b), q = p => hs[Math.floor(hs.length * p)];
const q25 = q(0.25), q75 = q(0.75);
rep(`🟢 HV<${q25.toFixed(1)}`, rows.filter(r => r.hv < q25)); rep('🟠 กลาง', rows.filter(r => r.hv >= q25 && r.hv <= q75)); rep(`🔴 HV>${q75.toFixed(1)}`, rows.filter(r => r.hv > q75));
console.log('\n— 20 วันล่าสุด รายวัน —');
rows.slice(-20).forEach(r => console.log(ymd(r.t), `HV ${r.hv.toFixed(1)}%`, `±$${r.d.toFixed(0)}`, `ปิด-ปิดจริง ${r.cc.toFixed(0)} (${r.z.toFixed(2)}×)`, `สูง-ต่ำ ${r.rng.toFixed(0)}`, r.z <= 1 ? '✓' : '✗'));
