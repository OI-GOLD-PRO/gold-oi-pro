// Backtest แหล่งแถบ SL ของ 💀 กับดัก: swing เดี่ยว · ยอด/ก้นเท่ากัน (EQH/EQL) · High/Low รอบเทรดก่อน (PDH/PDL)
// ข้อมูล: Yahoo GC=F M5 ย้อนหลัง 60 วัน · กติกาเดียวกับแอป: ไส้เลยแถบ ≥ max(1, 0.3 ATR) แล้วปิดกลับภายใน 3 แท่ง → เข้าที่ราคาปิด
// SL = เลยไส้ $0.5 · วัดผลแบบเดียวกันทุกแหล่ง: ถึง 1R / 1.5R / 2R ก่อนโดน SL (ภายใน 72 แท่ง = 6 ชม.)
const UA = { 'User-Agent': 'Mozilla/5.0' };
const now = Math.floor(Date.now() / 1000);
const j = await (await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=5m&period1=${now - 59 * 86400}&period2=${now}`, { headers: UA })).json();
const r = j.chart.result[0], q = r.indicators.quote[0];
const B = r.timestamp.map((t, i) => ({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] })).filter(b => b.open && b.high && b.low && b.close);
console.log('bars', B.length, new Date(B[0].time * 1000).toISOString(), '→', new Date(B[B.length - 1].time * 1000).toISOString());
const n = B.length, PIV = 3, BACK = 3, HOLD = 72;
const atrAt = i => { let a = 0, c = 0; for (let k = Math.max(1, i - 50); k < i; k++) { a += Math.max(B[k].high - B[k].low, Math.abs(B[k].high - B[k - 1].close), Math.abs(B[k].low - B[k - 1].close)); c++; } return Math.max(0.8, a / Math.max(1, c)); };
// แถบ: {p, side (+1 = SL ฝั่งบน / −1 ฝั่งล่าง), from (index ที่เริ่มใช้ได้), type}
const pools = [];
const swings = [];
for (let i = PIV; i < n - PIV; i++) {
  let hi = true, lo = true;
  for (let k = i - PIV; k <= i + PIV; k++) { if (k === i) continue; if (B[k].high >= B[i].high) hi = false; if (B[k].low <= B[i].low) lo = false; }
  if (hi) swings.push({ p: B[i].high, side: 1, from: i + PIV, i });
  if (lo) swings.push({ p: B[i].low, side: -1, from: i + PIV, i });
}
// EQH/EQL: swing ที่มี swing ฝั่งเดียวกันก่อนหน้า (ภายใน 300 แท่ง) ห่างไม่เกิน 0.35 ATR และยังไม่ถูกกวาดในระหว่างนั้น
swings.forEach(s => {
  const tol = atrAt(s.i) * 0.35;
  const eq = swings.some(o => o !== s && o.side === s.side && o.i < s.i && s.i - o.i <= 300 && Math.abs(o.p - s.p) <= tol &&
    !B.slice(o.i + 1, s.i).some(b => s.side > 0 ? b.high > Math.max(o.p, s.p) + tol : b.low < Math.min(o.p, s.p) - tol));
  pools.push({ p: s.p, side: s.side, from: s.from, type: eq ? 'ยอด/ก้นเท่ากัน' : 'swing เดี่ยว' });
});
// PDH/PDL: รอบเทรดแบ่งที่ช่วงว่าง ≥ 40 นาที
const sess = [0]; for (let i = 1; i < n; i++) if (B[i].time - B[i - 1].time >= 2400) sess.push(i);
for (let k = 1; k < sess.length; k++) {
  const a = sess[k - 1], b = sess[k], seg = B.slice(a, b); if (seg.length < 30) continue;
  pools.push({ p: Math.max(...seg.map(x => x.high)), side: 1, from: b, type: 'High/Low เมื่อวาน' });
  pools.push({ p: Math.min(...seg.map(x => x.low)), side: -1, from: b, type: 'High/Low เมื่อวาน' });
}
const res = [];
pools.forEach(P => {
  for (let i = Math.max(P.from, 1); i < n - 1; i++) {
    const b = B[i], atr = atrAt(i), poke = Math.max(1, atr * 0.3), BRK = Math.max(2, atr * 0.6), above = P.side > 0;
    if (above ? b.high < P.p + poke : b.low > P.p - poke) { if (above ? b.high > P.p : b.low < P.p) break; continue; } // แตะแต่ไม่ถึงเกณฑ์ = SL ถูกเก็บบางส่วน หยุดใช้แถบนี้
    if (above ? B[i - 1].close > P.p : B[i - 1].close < P.p) break;
    let ext = above ? b.high : b.low, rk = -1;
    for (let k = i; k < Math.min(n, i + BACK + 1); k++) { const x = B[k]; ext = above ? Math.max(ext, x.high) : Math.min(ext, x.low); if (above ? x.close > P.p + BRK : x.close < P.p - BRK) break; if (above ? x.close < P.p : x.close > P.p) { rk = k; break; } }
    if (rk < 0) { res.push({ type: P.type, fail: true }); break; }
    const side = above ? -1 : 1, entry = B[rk].close, sl = ext - side * 0.5, R = Math.abs(entry - sl);
    if (R < 0.6 || R > atr * 4) break;
    const hit = { r1: false, r15: false, r2: false }, tgt = m => entry + side * m * R; let out = 'timeout', mfe = 0;
    for (let k = rk + 1; k < Math.min(n, rk + HOLD); k++) { const x = B[k];
      if (side > 0 ? x.low <= sl : x.high >= sl) { out = 'SL'; break; }
      mfe = Math.max(mfe, side > 0 ? (x.high - entry) / R : (entry - x.low) / R);
      if (mfe >= 1) hit.r1 = true; if (mfe >= 1.5) hit.r15 = true; if (mfe >= 2) { hit.r2 = true; out = '2R'; break; } }
    res.push({ type: P.type, side, R, hit, out, mfe });
    break;
  }
});
const pct = (a, b) => b ? (a / b * 100).toFixed(0) + '%' : '–';
console.log('\nแหล่ง                 กวาด  ไม่กลับเข้า | เข้า  ถึง1R  ถึง1.5R  ถึง2R | EV@1.5R');
['swing เดี่ยว', 'ยอด/ก้นเท่ากัน', 'High/Low เมื่อวาน'].forEach(t => {
  const all = res.filter(x => x.type === t), f = all.filter(x => x.fail).length, e = all.filter(x => !x.fail);
  const w1 = e.filter(x => x.hit.r1).length, w15 = e.filter(x => x.hit.r15).length, w2 = e.filter(x => x.hit.r2).length;
  const ev = e.length ? (w15 * 1.5 - (e.length - w15)) / e.length : 0;
  console.log(t.padEnd(20), String(all.length).padStart(5), String(f).padStart(8), ' |', String(e.length).padStart(5), pct(w1, e.length).padStart(6), pct(w15, e.length).padStart(8), pct(w2, e.length).padStart(6), ' |', (ev >= 0 ? '+' : '') + ev.toFixed(2) + 'R');
  ['BUY', 'SELL'].forEach(sd => { const ee = e.filter(x => (x.side > 0) === (sd === 'BUY')), w = ee.filter(x => x.hit.r15).length; console.log('   ', sd.padEnd(16), '          |', String(ee.length).padStart(5), '      ', pct(w, ee.length).padStart(8)); });
});
