// 👥 โซนคนส่วนมาก (รายย่อย) เข้าออเดอร์ — จากการซื้อขายจริงของ XAUUSDT perp (Binance aggTrades ที่ 🐋 Big Traders ดึงอยู่แล้ว)
//  - ทุกไม้รู้ฝั่ง (ไล่ซื้อ/ไล่ขาย) และขนาด → "ไม้เล็ก" = ขนาดไม่เกินมัธยฐานของจำนวนไม้ ถือเป็นรายย่อย
//  - รวมจำนวนไม้รายย่อยตามราคา ช่องละ $1 ย้อนหลัง 24 ชม. (ไม้ใหม่น้ำหนักมากกว่า: ครึ่งชีวิต ~8 ชม.)
//  - โซน = ราคาที่ไม้รายย่อยหนาแน่นสุด 4 โซน · เอียงซื้อมีนัย (z ≥ 2) = 🟩 คนส่วนมากเข้า Buy · เอียงขาย = 🟥 Sell · ไม่ชัด = 🟨 สองฝั่ง
//  - ส่งให้ 💀 กับดัก: SL ของคนกลุ่มนี้ = ใต้โซน Buy / เหนือโซน Sell
//  ข้อจำกัด: ตลาดคริปโต (perp) ไม่ใช่โบรก CFD · ไม้เล็กไม่ใช่รายย่อย 100% (บอท/รายใหญ่หั่นไม้ได้) · ต้องเปิด 🐋 Big Traders
(() => {
  'use strict';
  const O = window.OI;
  if (!O || !O.hooks || !(O.sym === 'gold' || O.sym === 'gcy')) return;
  const $ = id => document.getElementById(id);
  const KEY = 'oi_retail' + (O.psfx || ''), SKEY = 'oi_retail_store_v1';
  const cfg = { on: true };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const saveCfg = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };
  const BK = 15 * 60e3, NC = 16, KEEP = 26 * 3600e3, HALF = 8 * 3600e3;
  const TFS = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
  // bins: "ช่วงเวลา 15 นาที|ราคา $1 (perp)" → [ซื้อ: จำนวนไม้ 16 ขนาด][ขาย: 16][ซื้อ oz 16][ขาย oz 16]
  let bins = new Map(), dirty = false;

  // ---------- กันนับซ้ำ: บิตแมปตาม id ของ aggTrade ----------
  let base = 0, bits = new Uint8Array(0);
  function mark(id) { // คืน true = เคยนับแล้ว
    if (!base) { base = id - 1e6; bits = new Uint8Array(250000); }
    let o = id - base;
    if (o < 0) { const add = Math.ceil(-o / 8) + 125000, nb = new Uint8Array(bits.length + add); nb.set(bits, add); bits = nb; base -= add * 8; o = id - base; }
    const by = o >> 3; if (by >= bits.length) { const nb = new Uint8Array(Math.max(by + 125000, bits.length * 2)); nb.set(bits); bits = nb; }
    const m = 1 << (o & 7); if (bits[by] & m) return true; bits[by] |= m; return false;
  }
  function intervals() { const out = []; let lo = -1; for (let by = 0; by < bits.length; by++) { const v = bits[by]; if (v === 0 && lo < 0) continue; if (v === 255 && lo >= 0) continue; for (let k = 0; k < 8; k++) { const on = v & (1 << k), id = base + by * 8 + k; if (on && lo < 0) lo = id; else if (!on && lo >= 0) { out.push([lo, id - 1]); lo = -1; } } } if (lo >= 0) out.push([lo, base + bits.length * 8 - 1]); return out; }

  function sink(t, p, q, s, id) {
    if (id !== undefined && mark(id)) return;
    if (!(q > 0) || !(p > 0) || t < Date.now() - KEEP) return;
    const c = Math.max(0, Math.min(NC - 1, Math.floor(Math.log2(q * 1000)))), k = Math.floor(t / BK) * BK + '|' + Math.round(p);
    let a = bins.get(k); if (!a) { a = new Float32Array(NC * 4); bins.set(k, a); }
    const i = (s > 0 ? 0 : NC) + c; a[i] += 1; a[2 * NC + i] += q; dirty = true;
  }
  window.OIRetailSink = sink;

  // ---------- เก็บในเครื่อง ----------
  function save() {
    if (!dirty) return; dirty = false;
    try {
      const lim = Date.now() - KEEP, d = {};
      bins.forEach((a, k) => { if (+k.split('|')[0] < lim) { bins.delete(k); return; } const f = []; a.forEach((v, i) => { if (v) f.push(i, i >= 2 * NC ? Math.round(v * 1000) / 1000 : v); }); d[k] = f; });
      localStorage.setItem(SKEY, JSON.stringify({ v: 1, iv: intervals(), d }));
    } catch (e) {}
  }
  (function restore() {
    try {
      const j = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (!j || j.v !== 1) return;
      const lim = Date.now() - KEEP;
      Object.entries(j.d || {}).forEach(([k, f]) => { if (+k.split('|')[0] < lim) return; const a = new Float32Array(NC * 4); for (let i = 0; i < f.length; i += 2) a[f[i]] = f[i + 1]; bins.set(k, a); });
      (j.iv || []).forEach(([lo, hi]) => { if (hi - lo > 5e6) return; for (let id = lo; id <= hi; id++) mark(id); });
    } catch (e) {}
  })();
  setInterval(save, 2 * 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  // 🐋 ใช้ cache ของตัวเองได้ก็ต่อเมื่อเรามีข้อมูลไม้เล็กย้อนถึงช่วงนั้นแล้ว (ไม่งั้นดึงใหม่ทั้ง 24 ชม. ครั้งแรก)
  function needFull(since) { let mn = Infinity; bins.forEach((a, k) => { const t = +k.split('|')[0]; if (t < mn) mn = t; }); return !bins.size || mn > since + 3600e3; }

  // ---------- คำนวณโซน ----------
  let Z = null, zAt = 0;
  function compute() {
    const now = Date.now(), cnt = new Float64Array(NC);
    bins.forEach((a, k) => { if (+k.split('|')[0] < now - 24 * 3600e3) return; for (let c = 0; c < NC; c++) cnt[c] += a[c] + a[NC + c]; });
    const tot = cnt.reduce((x, y) => x + y, 0); if (tot < 500) return null;
    let mc = 0, acc = 0; for (let c = 0; c < NC; c++) { acc += cnt[c]; if (acc >= tot / 2) { mc = c; break; } }
    const P = new Map(); let n = 0;
    bins.forEach((a, k) => {
      const [tb, pb] = k.split('|').map(Number); if (tb < now - 24 * 3600e3) return;
      const w = Math.pow(0.5, Math.max(0, now - tb - BK / 2) / HALF); let b = 0, s = 0, qb = 0, qs = 0;
      for (let c = 0; c <= mc; c++) { b += a[c]; s += a[NC + c]; qb += a[2 * NC + c]; qs += a[3 * NC + c]; }
      n += b + s; const o = P.get(pb) || { b: 0, s: 0, qb: 0, qs: 0 }; o.b += b * w; o.s += s * w; o.qb += qb * w; o.qs += qs * w; P.set(pb, o);
    });
    const ks = [...P.keys()].sort((x, y) => x - y); if (ks.length < 5) return null;
    const lo = ks[0], arr = []; for (let p = lo; p <= ks[ks.length - 1]; p++) arr.push(Object.assign({ p }, P.get(p) || { b: 0, s: 0, qb: 0, qs: 0 }));
    const mean = arr.reduce((x, o) => x + o.b + o.s, 0) / arr.filter(o => o.b + o.s > 0).length;
    // V4.9.12b: ไม้เล็กซื้อ/ขายแทบ 50/50 ทุกราคา → หาโซนจาก "ความหนาแน่น" (คนเข้าเยอะสุด) แล้วดูว่าเอียงฝั่งไหนแบบมีนัยสถิติ (z ≥ 2)
    const den = arr.map(o => o.b + o.s), sm = den.map((v, i) => v + 0.5 * ((den[i - 1] || 0) + (den[i + 1] || 0)));
    const peaks = sm.map((v, i) => ({ v, i })).filter(x => x.v > 0 && x.v >= (sm[x.i - 1] || 0) && x.v >= (sm[x.i + 1] || 0) && den[x.i] >= mean * 1.3).sort((a, b) => b.v - a.v);
    const pick = []; peaks.forEach(x => { if (pick.length < 4 && pick.every(y => Math.abs(y.i - x.i) >= 3)) pick.push(x); });
    const zones = pick.map((x, r) => {
      let a = x.i, b = x.i; while (a > 0 && x.i - a < 2 && den[a - 1] >= den[x.i] * 0.6) a--; while (b < arr.length - 1 && b - x.i < 2 && den[b + 1] >= den[x.i] * 0.6) b++;
      let cb = 0, cs = 0, pq = 0, q = 0; for (let i = a; i <= b; i++) { const o = arr[i]; cb += o.b; cs += o.s; pq += o.p * (o.qb + o.qs); q += o.qb + o.qs; }
      const z = (cb - cs) / Math.sqrt(Math.max(1, cb + cs)), pr = Math.round(cb / Math.max(1, cb + cs) * 100) / 100, side = (pr >= 0.49 && pr <= 0.51) ? 0 : z >= 2 ? 1 : z <= -2 ? -1 : 0; // V4.9.15: 49–51% = สองฝั่ง
      return { side, rank: r, lo: arr[a].p - 0.5, hi: arr[b].p + 0.5, avg: q ? pq / q : arr[x.i].p, n: cb + cs, pct: cb / Math.max(1, cb + cs), z };
    });
    return { zones, mc, maxSz: Math.pow(2, mc + 1) / 1000, n, hrs: (() => { let mn = Infinity; bins.forEach((a, k) => { mn = Math.min(mn, +k.split('|')[0]); }); return Math.min(24, (now - mn) / 3600e3); })() };
  }
  function off() { try { const bt = window.OI_bigtr, B = O.series.data() || []; return bt && B.length ? bt.offAt(B[B.length - 1].time) : 0; } catch (e) { return 0; } }
  // V4.9.15: โซนคำนวณที่เซิร์ฟเวอร์ (ไม้จริง Binance + Bybit + Bitget) → ทุกเครื่องได้โซนเดียวกัน ไม่ต้องเปิด 🐋
  //          ถ้าเซิร์ฟเวอร์ยังไม่พร้อม ค่อยใช้ที่เครื่องนี้เก็บเอง (ต้องเปิด 🐋)
  let SZ = null, SZat = 0;
  async function loadSrv() {
    if (!cfg.on || !O.worker) return;
    try { const j = await (await fetch(O.worker + '/retail', { cache: 'no-store' })).json(); if (j && j.ready && j.zones) { SZ = j; SZat = Date.now(); O.markDirty(); } } catch (e) {}
  }
  setTimeout(loadSrv, 1500); setInterval(() => { if (document.visibilityState === 'visible') loadSrv(); }, 30000);
  const srvOk = () => SZ && Date.now() - SZat < 5 * 60e3; // V4.9.17: ใช้โซนเซิร์ฟเวอร์ทันที (ไม่รอ 3 ชม.) ทุกเครื่องตรงกัน
  // โซนในสเกลราคากราฟ
  function zones() {
    if (!cfg.on) return [];
    if (srvOk()) { const d = O.sym === 'gcy' ? off() : (O.adj || 0); return SZ.zones.map(z => Object.assign({}, z, { lo: z.lo - d, hi: z.hi - d, avg: z.avg - d })); }
    if (!Z || Date.now() - zAt > 20000) { Z = compute(); zAt = Date.now(); }
    if (!Z) return []; const d = off();
    return Z.zones.map(z => Object.assign({}, z, { lo: z.lo - d, hi: z.hi - d, avg: z.avg - d }));
  }
  const live = () => { const bt = window.OI_bigtr; return srvOk() || !!(bt && bt.cfg && bt.cfg.on); };

  // ---------- วาด: แถบแนวนอนชิดขวา (ยาว = จำนวนไม้รายย่อย) ----------
  const fmt = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v) + '';
  O.hooks.push((ctx, w, h) => {
    if (!cfg.on || !live() || (TFS[O.tf] || 60) >= 86400) return;
    const Zs = zones(); if (!Zs.length) return;
    const ts = O.chart.timeScale(), sr = O.series, plotW = ts.width(), plotH = h - ts.height(), px = O.lastClose;
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace';
    const mx = Math.max(...Zs.map(z => z.n)); hit = [];
    ctx.save(); ctx.font = `bold 9px ${mono}`; ctx.textBaseline = 'middle';
    Zs.forEach(z => { // V4.9.17: แถบสีไม่มีตัวหนังสือ แตะแถบดูรายละเอียด · Buy ฟ้า / Sell ส้ม (ไม่ซ้ำแดง/เขียวของ OI) · สองฝั่ง = เทาจาง
      let y1 = sr.priceToCoordinate(z.hi), y2 = sr.priceToCoordinate(z.lo); if (y1 === null || y2 === null || y2 < 0 || y1 > plotH) return;
      if (y2 - y1 < 3) { const m = (y1 + y2) / 2; y1 = m - 1.5; y2 = m + 1.5; }
      const len = Math.max(24, plotW * 0.3 * z.n / mx), x0 = plotW - len, col = z.side > 0 ? '#38bdf8' : z.side < 0 ? '#ff9f43' : '#9aa3b8';
      ctx.globalAlpha = z.side ? 0.24 : 0.1; ctx.fillStyle = col; ctx.fillRect(x0, y1, len, y2 - y1);
      ctx.globalAlpha = z.side ? 0.9 : 0.35; ctx.fillRect(x0, y1, 2, y2 - y1);
      const under = z.side > 0 ? px < z.lo : z.side < 0 ? px > z.hi : false, prof = z.side > 0 ? px > z.hi : z.side < 0 ? px < z.lo : false;
      const lab = z.side > 0 ? `Buy ${Math.round(z.pct * 100)}%` : z.side < 0 ? `Sell ${Math.round((1 - z.pct) * 100)}%` : 'สองฝั่ง';
      hit.push({ x0, x1: plotW, y1: y1 - 4, y2: y2 + 4, txt: `👥 <b style="color:${col}">${lab}</b> · ${fmt(z.n)} ไม้ · ${z.lo.toFixed(1)}–${z.hi.toFixed(1)} (เฉลี่ย ${z.avg.toFixed(1)})${under ? ' · คนกลุ่มนี้ติดลบ' : prof ? ' · คนกลุ่มนี้กำไร' : ''}` });
    });
    ctx.restore();
  });

  // แตะแถบ 👥 = รายละเอียดโซน
  let hit = [], dn = null;
  O.chartEl.addEventListener('pointerdown', e => { dn = { x: e.clientX, y: e.clientY }; }, true);
  O.chartEl.addEventListener('pointerup', e => {
    if (!dn || Math.hypot(e.clientX - dn.x, e.clientY - dn.y) > 8) { dn = null; return; } dn = null;
    const r = O.chartEl.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const z = hit.find(b => x >= b.x0 && x <= b.x1 && y >= b.y1 && y <= b.y2);
    if (z && O.showToast) setTimeout(() => O.showToast(z.txt, 6000), 120);
  }, true);

  // ---------- เมนู ƒx ----------
  function info() {
    if (srvOk()) return `เซิร์ฟเวอร์ · ${Object.keys(SZ.src || {}).join('+') || '-'} · ${fmt(SZ.n)} ไม้ · ย้อน ${(SZ.hrs || 0).toFixed(0)} ชม.`;
    if (!live()) return 'รอข้อมูลจากเซิร์ฟเวอร์… (หรือเปิด 🐋 Big Traders ให้เครื่องนี้เก็บเอง)';
    if (!Z) Z = compute(); if (!Z) return 'กำลังเก็บไม้รายย่อย…';
    return `ไม้ ≤ ${Z.maxSz < 1 ? Z.maxSz.toFixed(3) : Z.maxSz} oz · ${fmt(Z.n)} ไม้ · ย้อน ${Z.hrs.toFixed(0)} ชม.`;
  }
  function section() { const d = document.createElement('div'); d.id = 'rtBox'; d.className = 'gsbox'; d.innerHTML = `<div class="row"><button class="gsb${cfg.on ? ' on' : ''}" data-rt="on"><i style="background:linear-gradient(90deg,#38bdf8 50%,#ff9f43 50%)"></i>👥 โซนรายย่อยเข้าออเดอร์</button><span class="gsinfo">${cfg.on ? info() : ''}</span></div>`; return d; }
  function mount() { const m = $('indMenu'); if (!m || m.hidden || $('rtBox')) return; const box = section(), anchor = $('btBox') || m.querySelector('.t'); anchor ? anchor.after(box) : m.prepend(box); }
  const menu = $('indMenu');
  if (menu) { new MutationObserver(() => mount()).observe(menu, { childList: true }); menu.addEventListener('click', e => { if (!e.target.closest('[data-rt]')) return; cfg.on = !cfg.on; saveCfg(); const b = $('rtBox'); if (b) b.remove(); mount(); O.markDirty(); }); }
  setInterval(() => { if (cfg.on && live()) O.markDirty(); }, 30000);

  window.OI_retail = { zones, compute, get server() { return srvOk() ? SZ : null; }, save, needFull, get bins() { return bins; }, get cfg() { return cfg; } };
})();
