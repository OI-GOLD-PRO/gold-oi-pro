// Gamma Flip (gmf) จากข้อมูล CME settlements — วางรันใน console/JS ของหน้า
// https://www.cmegroup.com/markets/metals/precious/gold.settlements.options.html (ต้องเป็น origin cmegroup.com)
// ผลลัพธ์: { itd, M, gex_itd, gex_M, F, tradeDate } → เขียนลงชีต webapp key "gmf" (JSON)
//   itd = flip จากสัญญาที่หมดอายุวันเทรดนั้น (ถ้าเป็นวันหยุด = สัญญาถัดไป)
//   M   = flip จากทุกสัญญาที่หมดอายุภายใน 30 วัน
// วิธี: OI ราย strike จาก CME, IV ต่อ strike ถอดจากราคา settle ฝั่ง OTM ด้วย Black-76,
//       GEX = Γ × OI × 100 × S² × 0.01 (Call +, Put −), สแกน S ±6% ทีละ $1 หาจุดตัดศูนย์ที่ใกล้ F ที่สุด
async function gmfCME({ expMap, F, tradeDate, now = Date.now(), days = 30 } = {}) {
  const exps = await (await fetch('/CmeWS/mvc/Settlements/Options/TradeDateAndExpirations/437?isProtected&_t=' + Date.now())).json();
  const fut = await (await fetch(`/CmeWS/mvc/Settlements/Futures/Settlements/437/FUT?strategy=DEFAULT&tradeDate=${tradeDate || ''}&pageSize=50&isProtected&_t=${Date.now()}`)).json();
  // ราคาอ้างอิง = settle ของฟิวเจอร์ Dec/ถัดไปที่ OI ออปชันอิง (ใส่ F เองได้)
  const N = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
  const pdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const b76 = (F, K, T, s, c) => { const v = s * Math.sqrt(T), d1 = (Math.log(F / K) + v * v / 2) / v, d2 = d1 - v; return c ? F * N(d1) - K * N(d2) : K * N(-d2) - F * N(-d1); };
  const ivOf = (F, K, T, p, c) => { let lo = 0.01, hi = 3; if (p <= Math.max(0, c ? F - K : K - F) + 1e-9) return null; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (b76(F, K, T, m, c) > p) hi = m; else lo = m; } return (lo + hi) / 2; };
  // วันหมดอายุ: CME ไม่บอกในรายการนี้ → ส่ง expMap {CME contractId: 'YYYY-MM-DD'} ที่ได้จาก tvExpMap() (รันบนหน้า TradingView)
  const list = [];
  exps.forEach(p => p.expirations.forEach(e => {
    const d = expMap[e.contractId]; if (!d) return;
    const cdt = d < '2026-11-01' || (d >= '2027-03-14' && d < '2027-11-07'); // 12:30 CT (CDT/CST)
    list.push({ pid: e.productId, code: e.expiration.code, cid: e.contractId, td: e.tradeDates[0].formatedDate, exp: Date.parse(d + 'T12:30:00' + (cdt ? '-05:00' : '-06:00')) });
  }));
  if (!F) { const s = (fut.settlements || []).find(s => /DEC|FEB|APR|JUN|AUG|OCT/.test(s.month) && +s.openInterest.replace(/,/g, '') > 100000); F = +String(s.settle).replace(/,/g, ''); }
  const opts = [];
  for (const x of list) {
    const T = (x.exp - now) / (365 * 864e5); if (T <= 0 || T > days / 365 + 1e-9) continue;
    const j = await (await fetch(`/CmeWS/mvc/Settlements/Options/Settlements/${x.pid}/OOF?strategy=DEFAULT&optionProductId=${x.pid}&monthYear=${x.cid}&optionExpiration=${x.pid}-${x.code}&tradeDate=${x.td}&pageSize=1000&isProtected&_t=${Date.now()}`)).json();
    (j.settlements || []).forEach(s => {
      const K = +s.strike, oi = +String(s.openInterest).replace(/,/g, ''), st = +String(s.settle).replace(/[^\d.]/g, '');
      if (isFinite(K) && K > 0 && oi > 0) opts.push({ cid: x.cid, exp: x.exp, K, c: s.type[0] === 'C', oi, st, T });
    });
  }
  const ivm = {};
  opts.forEach(o => { if ((o.c ? o.K >= F : o.K <= F) && o.st > 0) { const iv = ivOf(F, o.K, o.T, o.st, o.c); if (iv) ivm[o.cid + '|' + o.K] = iv; } });
  opts.forEach(o => { let iv = ivm[o.cid + '|' + o.K]; if (!iv) { const c = Object.keys(ivm).filter(k => k.startsWith(o.cid + '|')).map(k => [Math.abs(+k.split('|')[1] - o.K), ivm[k]]).sort((a, b) => a[0] - b[0])[0]; iv = c ? c[1] : 0.2; } o.iv = Math.min(Math.max(iv, 0.03), 1.5); });
  const gex = (os, S) => os.reduce((g, o) => { const v = o.iv * Math.sqrt(o.T), d1 = (Math.log(S / o.K) + v * v / 2) / v; return g + (o.c ? 1 : -1) * pdf(d1) / (S * v) * o.oi * 100 * S * S * 0.01; }, 0);
  const flip = os => { let best = null; let prev = null; for (let S = Math.round(F * 0.94); S <= F * 1.06; S++) { const g = gex(os, S); if (prev && prev[1] * g < 0) { const x = prev[0] + (S - prev[0]) * (prev[1] / (prev[1] - g)); if (best === null || Math.abs(x - F) < Math.abs(best - F)) best = x; } prev = [S, g]; } return best === null ? null : Math.round(best * 10) / 10; };
  const firstExp = Math.min(...opts.map(o => o.exp));
  const itdOpts = opts.filter(o => o.exp === firstExp);
  return { F, itd: flip(itdOpts), M: flip(opts), itd_c: itdOpts[0] && itdOpts[0].cid, gex_itd: Math.round(gex(itdOpts, F) / 1e5) / 10, gex_M: Math.round(gex(opts, F) / 1e5) / 10, n: opts.length };
}

// รันบนหน้า tradingview.com: คืน expMap สำหรับ gmfCME (แปลง root ของ TV เป็นรหัสสัญญา CME)
// weekly: root + เดือนที่หมดอายุ + ปี 2 หลัก (G4M 26 ต.ค. → G4MV26) / monthly OG: OG + เดือนถัดไป (OG 27 ต.ค. → OGX26)
async function tvExpMap(from, to) {
  const MC = 'FGHJKMNQUVXZ';
  const body = { columns: ['root', 'expiration'], filter: [{ left: 'type', operation: 'equal', right: 'option' }, { left: 'expiration', operation: 'in_range', right: [from, to] }], ignore_unknown_fields: false, index_filters: [{ name: 'underlying_symbol', values: ['COMEX:GCZ2026', 'COMEX:GCG2027', 'COMEX:GCJ2027'] }] };
  const j = await (await fetch('https://scanner.tradingview.com/options/scan2?label-product=symbols-options', { method: 'POST', body: JSON.stringify(body) })).json();
  const m = {};
  j.symbols.forEach(x => { const [root, ex] = x.f, y = Math.floor(ex / 10000), mo = Math.floor(ex / 100) % 100, d = `${y}-${String(mo).padStart(2, '0')}-${String(ex % 100).padStart(2, '0')}`;
    const cid = root === 'OG' ? 'OG' + MC[mo % 12] + String(mo === 12 ? y + 1 : y).slice(2) : root + MC[mo - 1] + String(y).slice(2); m[cid] = d; });
  return m;
}
