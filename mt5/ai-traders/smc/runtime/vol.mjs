// ความผันผวนทองคำ → vol.json + ประวัติ IV → iv_hist.json (รันทุกชั่วโมงใน GitHub Actions: .github/workflows/vol.yml)
//  vol.json
//   gc  : HV 20 วันของ GC=F (Yahoo รายวันตั้งแต่ปี 2000) + เปอร์เซ็นไทล์เทียบทั้งประวัติ + เกณฑ์ 25/50/75 + Skew/Kurtosis
//   gvz : ดัชนี CBOE Gold Volatility (^GVZ = IV 30 วันของทอง) + เปอร์เซ็นไทล์ตั้งแต่ปี 2008
//  iv_hist.json  (ไม่ลบของเก่า)
//   daily  : [วันเทรด, IV ATM จากราคา settlement CME, สัญญา, F] — IV ของเราเอง (Black-76) ตรงกับเส้น Vol Settle
//   hourly : [unix, IV ATM สดจาก bid/ask, สัญญา, F]       — เก็บเฉพาะตอนตลาดเปิดและข้อมูล Worker สด (<15 นาที)
import fs from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0' };
const YEAR = 365 * 864e5;
const r2 = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

// ---------- Black-76 (เหมือน live.js) ----------
const NCDF = x => { const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z); return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y); };
const b76 = (F, K, T, s, call) => { const v = s * Math.sqrt(T), d1 = (Math.log(F / K) + v * v / 2) / v, d2 = d1 - v; return call ? F * NCDF(d1) - K * NCDF(d2) : K * NCDF(-d2) - F * NCDF(-d1); };
function implVol(p, F, K, T, call) {
  const intr = Math.max(0, call ? F - K : K - F);
  if (!(p > intr + 0.02) || !(T > 0)) return null;
  let lo = 0.01, hi = 3;
  if (b76(F, K, T, hi, call) < p) return null;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (b76(F, K, T, m, call) > p) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
// IV ATM จากฟังก์ชันราคา px(k,'C'|'P') · F จาก put-call parity ของ 3 strike ที่ใกล้ราคาอ้างอิงที่สุด
export function atmIV(ks, px, T, ref) {
  const par = ks.filter(k => px(k, 'C') && px(k, 'P')).sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref)).slice(0, 3).map(k => k + px(k, 'C') - px(k, 'P')).sort((a, b) => a - b);
  const F = par.length ? par[Math.floor(par.length / 2)] : ref;
  const pts = [];
  ks.forEach(k => {
    if (Math.abs(k - F) > F * 0.08) return;
    const otmC = k >= F, p1 = px(k, otmC ? 'C' : 'P');
    let iv = p1 ? implVol(p1, F, k, T, otmC) : null;
    if (iv === null) { const p2 = px(k, otmC ? 'P' : 'C'); if (p2) iv = implVol(p2, F, k, T, !otmC); }
    if (iv !== null && iv > 0.02 && iv < 2.5) pts.push([k, iv]);
  });
  if (pts.length < 3) return null;
  for (let i = 1; i < pts.length; i++) if (F <= pts[i][0]) { const [k0, v0] = pts[i - 1], [k1, v1] = pts[i]; if (F < k0) break; return { iv: v0 + (v1 - v0) * (F - k0) / (k1 - k0), F }; }
  const nb = pts.reduce((b, p) => Math.abs(p[0] - F) < Math.abs(b[0] - F) ? p : b);
  return { iv: nb[1], F };
}
// เวลา (ms) ชิคาโก hh:mm ของวัน y-m-d (CDT/CST)
export function chiMs(y, m, d, hh, mm) {
  const nthSun = (mo, n) => { const f = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(); return 1 + ((7 - f) % 7) + (n - 1) * 7; };
  const t = Date.UTC(y, m - 1, d), dst = t >= Date.UTC(y, 2, nthSun(3, 2)) && t < Date.UTC(y, 10, nthSun(11, 1));
  return Date.UTC(y, m - 1, d, hh + (dst ? 5 : 6), mm);
}
const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
export function cmeOpen(ms) { const p = Object.fromEntries(etFmt.formatToParts(new Date(ms)).map(x => [x.type, x.value])), h = +p.hour, wd = p.weekday; return !(wd === 'Sat' || (wd === 'Fri' && h >= 17) || (wd === 'Sun' && h < 18) || h === 17); }

// IV ATM จาก settlement ใน cme_oi.json
export function settleIV(j) {
  if (!j || !j.settle || !j.settle.rows || !j.exp) return null;
  const [m, d, y] = String(j.settle.tradeDate).split('/').map(Number); if (!y) return null;
  const e = String(j.exp), t0 = Date.UTC(y, m - 1, d, 17, 0), tx = Date.UTC(+e.slice(0, 4), +e.slice(4, 6) - 1, +e.slice(6, 8), 12, 30); // เวลาแบบ CME/QuikStrike: 17:00 → 12:30 ชิคาโก ตามนาฬิกา
  if (!(tx > t0)) return null;
  const sm = new Map(j.settle.rows.map(([k, t, v]) => [k + t, v])), ks = [...new Set(j.settle.rows.map(r => r[0]))].sort((a, b) => a - b);
  const px = (k, t) => sm.get(k + t) || null;
  // ราคาอ้างอิงเริ่มต้น = strike ที่ |C−P| น้อยสุด
  const ref = ks.filter(k => px(k, 'C') && px(k, 'P')).reduce((b, k) => b === null || Math.abs(px(k, 'C') - px(k, 'P')) < Math.abs(px(b, 'C') - px(b, 'P')) ? k : b, null);
  if (ref === null) return null;
  const r = atmIV(ks, px, (tx - t0) / YEAR, ref);
  return r && { date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, iv: r.iv, F: r.F, root: j.root, exp: j.exp };
}
// IV ATM สดจาก Worker /opt (ค่ากลาง bid/ask เฉพาะ spread แคบ)
export function liveIV(o, now) {
  if (!o || !o.rows || !o.rows.length || !o.expTs || !o.updated) return null;
  if (!cmeOpen(now) || now / 1000 - o.updated > 900) return null;
  const map = new Map();
  o.rows.forEach(([k, t, iv, delta, g, bid, ask]) => { const r = map.get(k) || {}; r[t] = { bid, ask }; map.set(k, r); });
  const ks = [...map.keys()].sort((a, b) => a - b);
  const px = (k, t) => { const q = (map.get(k) || {})[t]; if (!q) return null; const b = +q.bid, a = +q.ask; if (b > 0 && a > b) { const m = (a + b) / 2; if (a - b <= Math.max(0.6, m * 0.25)) return m; } return null; };
  const T = Math.max((o.expTs * 1000 - now) / YEAR, 60e3 / YEAR);
  const r = atmIV(ks, px, T, o.F || ks[Math.floor(ks.length / 2)]);
  return r && { iv: r.iv, F: r.F, root: o.root, hrs: (o.expTs * 1000 - now) / 3600e3 };
}

// ---------- สถิติ ----------
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
const pctRank = (a, v) => a.filter(x => x <= v).length / a.length * 100;
function moments(r) { const m = mean(r), s = sd(r), n = r.length; return { skew: r.reduce((a, v) => a + ((v - m) / s) ** 3, 0) / n, kurt: r.reduce((a, v) => a + ((v - m) / s) ** 4, 0) / n - 3 }; }
const ymd = t => new Date(t * 1000).toISOString().slice(0, 10);

export function hvStats(bars) { // bars: [[unix, close]]
  const r = []; for (let i = 1; i < bars.length; i++) if (bars[i][1] > 0 && bars[i - 1][1] > 0) r.push([bars[i][0], Math.log(bars[i][1] / bars[i - 1][1])]);
  const hv = []; for (let i = 19; i < r.length; i++) hv.push([r[i][0], sd(r.slice(i - 19, i + 1).map(x => x[1])) * Math.sqrt(252) * 100]);
  const hv60 = r.length >= 60 ? sd(r.slice(-60).map(x => x[1])) * Math.sqrt(252) * 100 : null;
  const vals = hv.map(h => h[1]), last = vals[vals.length - 1], rr = r.map(x => x[1]);
  const all = moments(rr), y1 = moments(rr.slice(-252));
  return {
    last: r2(last), hv60: hv60 && r2(hv60), pct: r2(pctRank(vals, last), 1),
    p25: r2(quant(vals, 0.25)), p50: r2(quant(vals, 0.5)), p75: r2(quant(vals, 0.75)),
    skew: r2(all.skew), kurt: r2(all.kurt), skew1y: r2(y1.skew), kurt1y: r2(y1.kurt),
    daySd: r2(last / Math.sqrt(252), 3), close: bars[bars.length - 1][1], asof: ymd(bars[bars.length - 1][0]),
    since: ymd(bars[0][0]), n: vals.length,
    series: hv.slice(-260).map(h => [ymd(h[0]), r2(h[1])]),
  };
}
export function lvlStats(bars) {
  const vals = bars.map(b => b[1]), last = vals[vals.length - 1];
  return { last: r2(last), pct: r2(pctRank(vals, last), 1), p25: r2(quant(vals, 0.25)), p50: r2(quant(vals, 0.5)), p75: r2(quant(vals, 0.75)),
    asof: ymd(bars[bars.length - 1][0]), since: ymd(bars[0][0]), series: bars.slice(-260).map(b => [ymd(b[0]), r2(b[1])]) };
}

async function yahoo(sym) {
  const now = Math.floor(Date.now() / 1000);
  for (const host of ['query1', 'query2']) {
    try {
      const res = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=946684800&period2=${now}`, { headers: UA });
      const j = await res.json(), r = j.chart.result[0], c = r.indicators.quote[0].close;
      const out = r.timestamp.map((t, i) => [t, c[i]]).filter(x => x[1] !== null && x[1] > 0);
      if (out.length > 300) return out;
      console.log('short', sym, out.length);
    } catch (e) { console.log('fail', sym, host, e.message); }
  }
  return null;
}

async function main() {
  const now = Date.now();
  const vol = readJ('vol.json', {});
  const gc = await yahoo('GC=F'); if (gc) vol.gc = hvStats(gc);
  const gvz = await yahoo('^GVZ'); if (gvz) vol.gvz = lvlStats(gvz);
  vol.updated = Math.floor(now / 1000);
  fs.writeFileSync('vol.json', JSON.stringify(vol));
  console.log('gc', vol.gc && { last: vol.gc.last, pct: vol.gc.pct, p25: vol.gc.p25, p75: vol.gc.p75, skew: vol.gc.skew, kurt: vol.gc.kurt }, 'gvz', vol.gvz && { last: vol.gvz.last, pct: vol.gvz.pct });

  const H = readJ('iv_hist.json', { daily: [], hourly: [] });
  const s = settleIV(readJ('cme_oi.json', null));
  if (s) {
    H.daily = H.daily.filter(r => r[0] !== s.date);
    H.daily.push([s.date, r2(s.iv * 100), s.root, r2(s.F, 1)]); H.daily.sort((a, b) => a[0].localeCompare(b[0]));
    console.log('settle IV', s.date, s.root, (s.iv * 100).toFixed(2));
  }
  try {
    const o = await (await fetch('https://gc-yahoo.oigoldpro.workers.dev/opt', { headers: UA })).json();
    const l = liveIV(o, now);
    if (l) {
      const t = Math.floor(now / 1000);
      H.hourly = H.hourly.filter(r => t - r[0] < 120 * 86400 && Math.abs(t - r[0]) > 1200);
      H.hourly.push([t, r2(l.iv * 100), l.root, r2(l.F, 1)]);
      console.log('live IV', l.root, (l.iv * 100).toFixed(2), 'hrs to exp', l.hrs.toFixed(1));
    } else console.log('live IV skipped (market closed or stale)', o && o.updated);
  } catch (e) { console.log('opt fail', e.message); }
  H.updated = Math.floor(now / 1000);
  fs.writeFileSync('iv_hist.json', JSON.stringify(H));
}
if (process.argv[1] && process.argv[1].endsWith('vol.mjs') && !process.env.VOL_NOMAIN) main();
