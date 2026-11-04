// Backtest 🛡 กรอบดีลเลอร์รับ (กติกาเดียวกับแอป) — Yahoo GC=F M5 60 วัน
// ไม่มีประวัติ GEX ย้อนหลัง → ใช้ strike ทุก $25 (ที่ OI หนาบ่อย) เป็นตัวแทนแนว · วัดพฤติกรรมราคา "ทดสอบแล้วปิดผ่านไม่ได้ ≥ 2 ครั้ง"
//  1) ตอนยังยืน: ทดสอบครั้งถัดไปยืนต่อ (เด้ง) กี่ % · เด้งไปไกลแค่ไหน
//  2) ตอนทะลุ (ปิดเลย $2): วิ่งต่อไกลแค่ไหนใน 4 ชม. · กลับเข้ามา (หลอก) กี่ %
//  เทียบกับแนวที่ทดสอบ < 2 ครั้ง (ไม่เป็นกรอบ)
const UA = { 'User-Agent': 'Mozilla/5.0' }, now = Math.floor(Date.now() / 1000);
const j = await (await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=5m&period1=${now - 59 * 86400}&period2=${now}`, { headers: UA })).json();
const r = j.chart.result[0], q = r.indicators.quote[0];
const B = r.timestamp.map((t, i) => ({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] })).filter(b => b.open && b.high && b.low && b.close);
const n = B.length; console.log('bars', n, new Date(B[0].time * 1000).toISOString().slice(0, 10), '→', new Date(B[n - 1].time * 1000).toISOString().slice(0, 10));
const ATR = []; for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = Math.max(1, i - 30); k < i; k++) { a += Math.max(B[k].high - B[k].low, Math.abs(B[k].high - B[k - 1].close), Math.abs(B[k].low - B[k - 1].close)); c++; } ATR.push(Math.max(0.8, a / Math.max(1, c))); }
const BRK = 2, GAP = 2, AHEAD = 48, FAKE = 12;
const events = []; // {kind:'test'|'break', tests, side, i, L}
const lo = Math.floor(Math.min(...B.map(b => b.low)) / 25) * 25, hi = Math.ceil(Math.max(...B.map(b => b.high)) / 25) * 25;
for (let L = lo; L <= hi; L += 25) {
  let cur = null;
  for (let i = 1; i < n; i++) {
    const b = B[i], pc = B[i - 1].close, tol = Math.max(0.8, ATR[i] * 0.25);
    if (cur && (cur.side < 0 ? b.close > L + BRK : b.close < L - BRK)) { events.push({ kind: 'break', tests: cur.tests.length, side: cur.side, i, L }); cur = null; continue; }
    let side = 0;
    if (pc < L && b.high >= L - tol && b.close < L) side = -1; else if (pc > L && b.low <= L + tol && b.close > L) side = 1;
    if (!side) continue;
    if (cur && cur.side !== side) cur = null;
    if (!cur) cur = { side, tests: [] };
    if (!cur.tests.length || i - cur.tests[cur.tests.length - 1] > GAP) { cur.tests.push(i); events.push({ kind: 'test', tests: cur.tests.length, side, i, L }); }
  }
}
const pct = (a, b) => b ? (a / b * 100).toFixed(0) + '%' : '–';
const med = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
// 1) ทดสอบครั้งที่ k (k ≥ 3 = กรอบที่ยืนมาแล้ว ≥ 2 ครั้ง) → เด้งไปไกลแค่ไหนใน 12 แท่ง (ATR)
function bounce(e) { let mx = 0; for (let k = e.i + 1; k < Math.min(n, e.i + 13); k++) { const d = e.side < 0 ? e.L - B[k].low : B[k].high - e.L; mx = Math.max(mx, d / ATR[e.i]); } return mx; }
console.log('\n=== 1) ทดสอบแล้วปิดกลับ (เด้ง) — เด้งสูงสุดใน 1 ชม. (หน่วย ATR) ===');
[[1, 1], [2, 2], [3, 99]].forEach(([a, b]) => { const E = events.filter(e => e.kind === 'test' && e.tests >= a && e.tests <= b), bo = E.map(bounce);
  console.log(`ทดสอบครั้งที่ ${a === b ? a : a + '+'}`.padEnd(18), `n=${E.length}`.padEnd(8), `เด้ง ≥1 ATR ${pct(bo.filter(x => x >= 1).length, bo.length)}`, `≥2 ATR ${pct(bo.filter(x => x >= 2).length, bo.length)}`, `มัธยฐาน ${med(bo).toFixed(2)} ATR`); });
// โอกาสที่ "ครั้งถัดไป" ยังยืน: หลังทดสอบครั้งที่ k เหตุการณ์ถัดไปของแนวเดียวกันเป็น test (ยืน) หรือ break
console.log('\n=== 2) หลังยืนมาแล้ว k ครั้ง เหตุการณ์ถัดไป: ยืนอีก หรือ ทะลุ ===');
for (const k of [1, 2, 3, 4]) { let hold = 0, brk = 0; events.forEach((e, idx) => { if (e.kind !== 'test' || e.tests !== k) return; const nx = events.slice(idx + 1).find(x => x.L === e.L); if (!nx) return; if (nx.kind === 'test' && nx.tests === k + 1) hold++; else if (nx.kind === 'break' && nx.tests === k) brk++; }); console.log(`ยืนมา ${k} ครั้ง`.padEnd(14), `ยืนต่อ ${pct(hold, hold + brk)}`, `ทะลุ ${pct(brk, hold + brk)}`, `(n=${hold + brk})`); }
// 3) ตอนทะลุ: วิ่งต่อไกลแค่ไหน
function follow(e) { const dir = e.side < 0 ? 1 : -1; let mfe = 0, back = false; for (let k = e.i + 1; k < Math.min(n, e.i + AHEAD + 1); k++) { mfe = Math.max(mfe, dir > 0 ? B[k].high - e.L : e.L - B[k].low); if (k <= e.i + FAKE && (dir > 0 ? B[k].close < e.L : B[k].close > e.L)) back = true; } return { usd: mfe, atr: mfe / ATR[e.i], back }; }
console.log('\n=== 3) ทะลุ (ปิดเลยแนว $2) — วิ่งต่อสูงสุดใน 4 ชม. · กลับเข้ามาภายใน 1 ชม. = หลอก ===');
[[0, 1, 'แนวที่ทดสอบ < 2 ครั้ง (ไม่เป็นกรอบ)'], [2, 2, 'กรอบที่ยืน 2 ครั้ง'], [3, 99, 'กรอบที่ยืน ≥ 3 ครั้ง'], [2, 99, 'กรอบทั้งหมด (≥ 2)']].forEach(([a, b, lab]) => {
  const E = events.filter(e => e.kind === 'break' && e.tests >= a && e.tests <= b), F = E.map(follow);
  console.log(lab.padEnd(34), `n=${E.length}`.padEnd(7), `มัธยฐาน $${med(F.map(f => f.usd)).toFixed(1)} (${med(F.map(f => f.atr)).toFixed(1)} ATR)`, `≥$10 ${pct(F.filter(f => f.usd >= 10).length, F.length)}`, `≥$20 ${pct(F.filter(f => f.usd >= 20).length, F.length)}`, `≥3 ATR ${pct(F.filter(f => f.atr >= 3).length, F.length)}`, `หลอก ${pct(F.filter(f => f.back).length, F.length)}`);
});
