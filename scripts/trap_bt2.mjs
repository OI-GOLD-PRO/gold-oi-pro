// Backtest 2: 💀 กับดัก "ออกกลางทาง" — ทดสอบตัวกรอง "ไส้ที่กวาดต้องเป็นจุดสูง/ต่ำสุดของ N แท่งล่าสุด" (สวิงจริง)
// ข้อมูล Yahoo GC=F M5 60 วัน · แหล่ง: swing เดี่ยว / ยอด-ก้นเท่ากัน / High-Low เมื่อวาน / เลขกลม 25-50-100
// เลขกลม: ใช้ได้เมื่อ 12 แท่งก่อนหน้าไม่แตะ (เหมือนในแอป) · TP ตามนโยบายแอป: EQ 1R · PDH/L 2R · อื่น 1.5R
const UA = { 'User-Agent': 'Mozilla/5.0' };
const now = Math.floor(Date.now() / 1000);
const j = await (await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=5m&period1=${now - 59 * 86400}&period2=${now}`, { headers: UA })).json();
const r = j.chart.result[0], q = r.indicators.quote[0];
const B = r.timestamp.map((t, i) => ({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] })).filter(b => b.open && b.high && b.low && b.close);
console.log('bars', B.length, new Date(B[0].time * 1000).toISOString(), '→', new Date(B[B.length - 1].time * 1000).toISOString());
const n = B.length, PIV = 3, BACK = 3, HOLD = 72;
const ATR = []; for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = Math.max(1, i - 50); k < i; k++) { a += Math.max(B[k].high - B[k].low, Math.abs(B[k].high - B[k - 1].close), Math.abs(B[k].low - B[k - 1].close)); c++; } ATR.push(Math.max(0.8, a / Math.max(1, c))); }
const TPM = { 'swing เดี่ยว': 1.5, 'ยอด/ก้นเท่ากัน': 1, 'High/Low เมื่อวาน': 2, 'เลขกลม': 1.5 };
// ลองกวาดที่แท่ง i: คืน null = ไม่ใช่การกวาด, {stop:true} = แตะไม่ถึง/มาผิดฝั่ง (เลิกใช้แถบ)
function trySweep(P, i) {
  const b = B[i], atr = ATR[i], poke = Math.max(1, atr * 0.3), BRK = Math.max(2, atr * 0.6), above = P.side > 0;
  if (above ? b.high < P.p + poke : b.low > P.p - poke) return (above ? b.high > P.p : b.low < P.p) ? { stop: true } : null;
  if (above ? B[i - 1].close > P.p : B[i - 1].close < P.p) return { stop: true };
  let ext = above ? b.high : b.low, rk = -1;
  for (let k = i; k < Math.min(n, i + BACK + 1); k++) { const x = B[k]; ext = above ? Math.max(ext, x.high) : Math.min(ext, x.low); if (above ? x.close > P.p + BRK : x.close < P.p - BRK) break; if (above ? x.close < P.p : x.close > P.p) { rk = k; break; } }
  if (rk < 0) return { fail: true, i };
  const side = above ? -1 : 1, entry = B[rk].close, sl = ext - side * 0.5, R = Math.abs(entry - sl);
  if (R < 0.6 || R > atr * 4) return { stop: true };
  // จุดสูง/ต่ำสุดย้อนหลัง: ไส้กวาดสุดขั้วกว่ากี่แท่งก่อนหน้า (นับต่อเนื่องย้อนหลัง)
  let lb = 0; for (let k = i - 1; k >= 0 && i - k <= 200; k--) { if (above ? B[k].high > ext : B[k].low < ext) break; lb++; }
  // ระยะวิ่งเข้ามา: ราคาเดินมาจากไกลแค่ไหนใน 12 แท่งก่อนกวาด (หน่วย ATR)
  const w = B.slice(Math.max(0, i - 12), i), run = w.length ? (above ? ext - Math.min(...w.map(x => x.low)) : Math.max(...w.map(x => x.high)) - ext) / atr : 0;
  const m = TPM[P.type], tgt = entry + side * m * R; let res = -1, mfe = 0, out = 'timeout';
  for (let k = rk + 1; k < Math.min(n, rk + HOLD); k++) { const x = B[k];
    if (side > 0 ? x.low <= sl : x.high >= sl) { out = 'SL'; break; }
    if (side > 0 ? x.high >= tgt : x.low <= tgt) { out = 'TP'; break; } }
  if (out === 'timeout') { const last = B[Math.min(n - 1, rk + HOLD - 1)].close; res = (last - entry) * side / R; } else res = out === 'TP' ? m : -1;
  return { type: P.type, side, i, lb, run, res, out };
}
const res = [];
// swing / EQ
const swings = [];
for (let i = PIV; i < n - PIV; i++) { let hi = true, lo = true; for (let k = i - PIV; k <= i + PIV; k++) { if (k === i) continue; if (B[k].high >= B[i].high) hi = false; if (B[k].low <= B[i].low) lo = false; } if (hi) swings.push({ p: B[i].high, side: 1, from: i + PIV, i }); if (lo) swings.push({ p: B[i].low, side: -1, from: i + PIV, i }); }
const pools = [];
swings.forEach(s => { const tol = ATR[s.i] * 0.35; const eq = swings.some(o => o !== s && o.side === s.side && o.i < s.i && s.i - o.i <= 300 && Math.abs(o.p - s.p) <= tol && !B.slice(o.i + 1, s.i).some(b => s.side > 0 ? b.high > Math.max(o.p, s.p) + tol : b.low < Math.min(o.p, s.p) - tol)); pools.push({ p: s.p, side: s.side, from: s.from, type: eq ? 'ยอด/ก้นเท่ากัน' : 'swing เดี่ยว' }); });
const sess = [0]; for (let i = 1; i < n; i++) if (B[i].time - B[i - 1].time >= 2400) sess.push(i);
for (let k = 1; k < sess.length; k++) { const a = sess[k - 1], b = sess[k], seg = B.slice(a, b); if (seg.length < 30) continue; pools.push({ p: Math.max(...seg.map(x => x.high)), side: 1, from: b, type: 'High/Low เมื่อวาน' }); pools.push({ p: Math.min(...seg.map(x => x.low)), side: -1, from: b, type: 'High/Low เมื่อวาน' }); }
pools.forEach(P => { for (let i = Math.max(P.from, 1); i < n - 1; i++) { const x = trySweep(P, i); if (!x) continue; if (!x.stop) res.push(x.fail ? { type: P.type, fail: true } : x); break; } });
// เลขกลม 25/50/100: ใช้ได้ถ้า 12 แท่งก่อนหน้าไม่แตะเลย · กวาดแล้วพัก 9 แท่ง
const cool = new Map();
for (let i = 13; i < n - 1; i++) {
  const b = B[i];
  for (let L = Math.ceil((b.low - 3) / 25) * 25; L <= b.high + 3; L += 25) {
    if ((cool.get(L) || 0) > i) continue;
    const pc = B[i - 1].close, side = pc < L ? 1 : -1, P = { p: L + side * 0.3, side, type: 'เลขกลม' };
    if (B.slice(i - 12, i).some(x => side > 0 ? x.high > P.p + 0.2 : x.low < P.p - 0.2)) continue;
    const x = trySweep(P, i); if (!x || x.stop) continue;
    cool.set(L, i + BACK + 6); res.push(x.fail ? { type: 'เลขกลม', fail: true } : x);
  }
}
const E = res.filter(x => !x.fail);
const line = (lab, a) => { if (!a.length) { console.log(lab.padEnd(34), '   0'); return; } const ev = a.reduce((s, x) => s + x.res, 0) / a.length, win = a.filter(x => x.res > 0).length / a.length * 100; console.log(lab.padEnd(34), String(a.length).padStart(4), `ชนะ ${win.toFixed(0).padStart(3)}%`, `EV ${(ev >= 0 ? '+' : '') + ev.toFixed(2)}R`, `รวม ${(a.reduce((s, x) => s + x.res, 0)).toFixed(1).padStart(6)}R`); };
const types = ['swing เดี่ยว', 'ยอด/ก้นเท่ากัน', 'High/Low เมื่อวาน', 'เลขกลม'];
console.log('\n=== ตัวกรอง A: ไส้กวาดเป็นจุดสุดขั้วของ N แท่งก่อนหน้า (N=0 = ไม่กรอง) ===');
[0, 6, 12, 24, 48].forEach(N => { console.log(`\n-- N = ${N} แท่ง (${N * 5} นาที) --`); types.forEach(t => line('  ' + t, E.filter(x => x.type === t && x.lb >= N))); line('  รวมทุกแหล่ง', E.filter(x => x.lb >= N)); line('  รวม (ไม่นับ swing เดี่ยว)', E.filter(x => x.type !== 'swing เดี่ยว' && x.lb >= N)); });
console.log('\n=== ตัวกรอง B: ราคาวิ่งเข้ามา ≥ k ATR ใน 12 แท่งก่อนกวาด ===');
[0, 2, 3, 4].forEach(k => line(`  k = ${k} (ไม่นับ swing เดี่ยว)`, E.filter(x => x.type !== 'swing เดี่ยว' && x.run >= k)));
console.log('\n=== A(N=12) + B(k=2) ===');
types.forEach(t => line('  ' + t, E.filter(x => x.type === t && x.lb >= 12 && x.run >= 2)));
line('  รวม (ไม่นับ swing เดี่ยว)', E.filter(x => x.type !== 'swing เดี่ยว' && x.lb >= 12 && x.run >= 2));
