// 🧱 OI Wall Break v0.1 — เทรดตามการทะลุกำแพง OI (ตรงข้าม Session Fade · ใช้ช่วงตลาดแรง/เทรนด์)
//  กติกา (แบ็กเทส 13–26 พ.ย. +754.6$ PF 1.88 · ช่วง range 1–12 พ.ย. +72.2$): แท่ง M5 ปิดทะลุขอบกำแพง OI (top-3 Call/Put) เกิน $2
//  → เข้าราคาปิด · SL กลางโซน (strike) · TP 2R · กำแพงละ 1 ไม้/ทิศ/วัน · หักสเปรด $0.50 ในสรุป
//  โหมดตลาด: ATR(M5) วันนี้ เทียบค่าเฉลี่ยย้อนหลัง ≥1.5× = TREND (เหมาะ Wall Break) · ต่ำกว่า = RANGE (เหมาะ Session Fade)
(() => {
  'use strict';
  const O = window.OI;
  if (!O || !O.hooks || !(O.sym === 'gold' || O.sym === 'gcy')) return;
  const $ = id => document.getElementById(id);
  const KEY = 'oi_wbreak' + (O.psfx || '');
  const cfg = { on: true, buf: 2, half: 1.5, tpR: 2, spread: 0.5 };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };
  const THAI = 7 * 3600, RANGE = 60, HIST_DAYS = 10;
  const dayStart = t => Math.floor((t - 6 * 3600) / 86400) * 86400 + 6 * 3600;
  const ymd = t => new Date(t * 1000).toISOString().slice(0, 10);
  const isOn = () => cfg.on !== false;

  let hist = new Map(), histAt = 0, setups = [], today = [], walls = [], mode = null, atrRatio = null, lastRun = 0, busy = false, told = new Set();

  // ---------- กำแพง OI: top-3 Call + top-3 Put ใน ±$60 ของราคาอ้างอิง ----------
  function levels(ref, src) {
    const R0 = src || (O.oi && O.oi.rows); if (!R0 || !R0.length || ref == null) return [];
    const rows = R0.filter(r => r.price !== null && r.price !== undefined && Math.abs(r.price - ref) <= RANGE);
    const top = (k, n) => rows.filter(r => r[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, n).map(r => r.strike);
    const C = top('c', 3), P = top('p', 3);
    return [...new Set(C.concat(P))].map(k => { const r = rows.find(x => x.strike === k); return { k, p: r.price, side: C.includes(k) ? 'C' : 'P' }; }).sort((a, b) => a.p - b.p);
  }
  const histRows = d => (hist.get(d) || []).map(r => ({ strike: +r.strike, price: +r.strike, c: +r.c || 0, p: +r.p || 0 }));

  async function loadHist() {
    if (Date.now() - histAt < 30 * 60e3 || !window.OIHistoryZonesAPI) return;
    histAt = Date.now();
    try {
      const d = await window.OIHistoryZonesAPI();
      hist = new Map((d.days || []).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && Array.isArray(x.rows)).map(x => [x.date, x.rows]));
    } catch (e) { histAt = Date.now() - 25 * 60e3; }
  }

  // ---------- M1 → M5 ----------
  const toM5 = bars => {
    const g = new Map();
    for (const b of bars) {
      const k = Math.floor(b.time / 300) * 300; let x = g.get(k);
      if (!x) { x = { time: k, open: b.open, high: b.high, low: b.low, close: b.close }; g.set(k, x); }
      else { x.high = Math.max(x.high, b.high); x.low = Math.min(x.low, b.low); x.close = b.close; }
    }
    return [...g.values()].sort((a, b) => a.time - b.time);
  };
  const atrOf = (B, n) => { const N = B.length, out = new Array(N).fill(NaN); let s = 0; for (let i = 1; i < N; i++) { const tr = Math.max(B[i].high, B[i - 1].close) - Math.min(B[i].low, B[i - 1].close); s += tr; if (i > n) s -= out[i - n] || 0; out[i] = s / Math.min(i, n); } return out; };

  // ---------- สแกนไม้เข้า (B1) · B = แท่ง M5 · W = กำแพง [{k,p,side}] ----------
  function scan(B, W, d0, d1) {
    const out = [], done = new Set(), n = B.length;
    for (let i = 1; i < n; i++) {
      const b = B[i]; if (b.time < d0 || b.time >= d1) continue;
      for (const z of W) {
        const lo = z.p - cfg.half, hi = z.p + cfg.half;
        let dir = 0;
        if (b.close > hi + cfg.buf) dir = 1; else if (b.close < lo - cfg.buf) dir = -1;
        if (!dir) continue;
        const kk = z.k + '|' + dir; if (done.has(kk)) continue; done.add(kk);
        const entry = b.close, sl = z.p, R = Math.abs(entry - sl);
        if (R < 1) continue;
        const tp = entry + dir * cfg.tpR * R;
        let why = null, exit = null, end = i;
        for (let j = i + 1; j < n; j++) {
          const x = B[j];
          if (dir > 0 ? x.low <= sl : x.high >= sl) { why = 'SL'; exit = sl; end = j; break; }
          if (dir > 0 ? x.high >= tp : x.low <= tp) { why = 'TP'; exit = tp; end = j; break; }
        }
        const pnl = exit !== null ? (exit - entry) * dir - cfg.spread : null;
        out.push({ z, dir, entry, sl, tp, R, ei: i, t0: b.time, why, exit, end, pnl, day: ymd(b.time) });
      }
    }
    return out;
  }

  // ---------- รัน ----------
  async function run(force) {
    if (!isOn() || busy) return;
    if (!force && Date.now() - lastRun < 18000) return;
    busy = true; lastRun = Date.now();
    try {
      await loadHist();
      const A5 = await O.fetchTF('5m', 1500);
      if (!A5 || A5.length < 100) return;
      const now = Date.now() / 1000 + THAI, d0 = dayStart(now);
      // แบ็กเทส: วันที่มี OI ในชีต (สูงสุด HIST_DAYS วัน) · แท่งจาก A5 ถ้าครอบ ไม่งั้นดึง M1 ย้อนหลัง
      const dts = [...hist.keys()].sort().filter(dt => { const ds = Date.parse(dt + 'T06:00:00Z') / 1000, wd = new Date(ds * 1000).getUTCDay(); return wd >= 1 && wd <= 5 && ds < d0; }).slice(-HIST_DAYS);
      setups = [];
      const atrs = [];
      for (const dt of dts) {
        const ds = Date.parse(dt + 'T06:00:00Z') / 1000, de = ds + 86400;
        let B = null;
        if (A5[0].time <= ds - 300) B = A5;
        else if (O.fetchHist) {
          try { const h = await O.fetchHist('1m', (ds - 7 * 3600 - 3600) * 1000, (de + 6 * 3600 - 7 * 3600) * 1000); if (h && h.length > 300) B = toM5(h.map(x => ({ time: x.time, open: x.open, high: x.high, low: x.low, close: x.close }))); } catch (e) {}
        }
        if (!B) continue;
        const j0 = B.findIndex(b => b.time >= ds); if (j0 < 0) continue;
        const W = levels(B[j0].open, histRows(dt)); if (!W.length) continue;
        const dayB = B.slice(j0, B.findIndex(b => b.time >= de) < 0 ? B.length : B.findIndex(b => b.time >= de));
        if (dayB.length < 60) continue;
        const a = atrOf(dayB, 14); atrs.push(a[a.length - 1]);
        setups.push(...scan(B, W, ds, de));
      }
      // วันนี้: กำแพงสดจาก OI ที่โหลดอยู่ · สแกนบน A5
      const i0 = A5.findIndex(b => b.time >= d0);
      walls = i0 >= 0 ? levels(A5[i0].open) : [];
      today = i0 >= 0 && walls.length ? scan(A5, walls, d0, Infinity) : [];
      // โหมดตลาด: ATR(M5) ล่าสุด เทียบค่าเฉลี่ยของวันย้อนหลัง
      const aNow = atrOf(A5.slice(Math.max(0, i0)), 14), aLast = aNow.length ? aNow[aNow.length - 1] : NaN;
      const aAvg = atrs.length ? atrs.reduce((x, y) => x + y, 0) / atrs.length : NaN;
      atrRatio = (aLast && aAvg) ? aLast / aAvg : null;
      mode = atrRatio == null ? null : (atrRatio >= 1.5 ? 'TREND' : 'RANGE');
      notify();
      O.markDirty();
      const box = $('wbBox'); if (box) { box.remove(); mount(); }
    } finally { busy = false; }
  }

  function notify() {
    today.forEach(s => {
      const k = s.z.k + '|' + s.dir + '|' + ymd(s.t0);
      if (!told.has('e' + k) && Date.now() / 1000 + THAI - s.t0 < 300) {
        told.add('e' + k);
        if (typeof alertMsg === 'function') alertMsg(`🧱 <b>${s.dir > 0 ? 'BUY' : 'SELL'} ${s.entry.toFixed(2)}</b> · ทะลุกำแพง ${s.z.side}${s.z.k} ${s.dir > 0 ? 'ขึ้น' : 'ลง'}<br>SL ${s.sl.toFixed(2)} · TP ${s.tp.toFixed(2)} (${cfg.tpR}R)`);
      }
      if (s.why && !told.has('x' + k) && Date.now() / 1000 + THAI - s.t0 < 86400) {
        told.add('x' + k);
        if (typeof alertMsg === 'function') alertMsg(`🧱 ${s.why === 'TP' ? '✓ ถึง TP' : '✗ โดน SL'} · ${s.dir > 0 ? 'BUY' : 'SELL'} ${s.z.side}${s.z.k} (${s.pnl > 0 ? '+' : ''}${s.pnl == null ? '–' : s.pnl.toFixed(2)}$)`);
      }
    });
  }

  // ---------- สรุป ----------
  function stats() {
    const fin = setups.filter(s => s.pnl !== null);
    const usd = fin.reduce((a, s) => a + s.pnl, 0), w = fin.filter(s => s.pnl > 0).length;
    const gp = fin.filter(s => s.pnl > 0).reduce((a, s) => a + s.pnl, 0), gl = -fin.filter(s => s.pnl <= 0).reduce((a, s) => a + s.pnl, 0);
    let cum = 0, dd = 0; fin.forEach(s => { cum += s.pnl; dd = Math.min(dd, cum); });
    const days = [...new Set(setups.map(s => s.day))].sort();
    const t = today.filter(s => s.pnl !== null);
    return `<b>แบ็กเทส ${fin.length} ไม้${days.length ? ` (${days[0].slice(5)} → ${days[days.length - 1].slice(5)})</b>` : '</b>'} · ชนะ ${fin.length ? Math.round(w / fin.length * 100) : 0}% · ${usd >= 0 ? '+' : ''}${usd.toFixed(1)}$ · PF ${gl ? (gp / gl).toFixed(2) : '∞'} · DD ${dd.toFixed(0)}$<br>` +
      `<span style="opacity:.75">หักสเปรด $${cfg.spread}/ไม้ · SL กลางโซน · TP ${cfg.tpR}R · กำแพงละ 1 ไม้/ทิศ/วัน</span><br>` +
      `โหมดตลาด: ${mode ? `<b style="color:${mode === 'TREND' ? '#ff9d5c' : '#7fd0ff'}">${mode === 'TREND' ? 'แรง/เทรนด์ → เหมาะ Wall Break' : 'Range → เหมาะ Session Fade'}</b> (ATR วันนี้ ${atrRatio ? (atrRatio * 100).toFixed(0) : '–'}% ของค่าเฉลี่ย)` : '–'}<br>` +
      `วันนี้: ${today.length ? `${today.length} ไม้ · ${t.length ? (t.reduce((a, s) => a + s.pnl, 0) >= 0 ? '+' : '') + t.reduce((a, s) => a + s.pnl, 0).toFixed(1) + '$' : 'ยังไม่จบไม้'}` : 'ยังไม่มี'}`;
  }

  // ---------- เมนู ƒx ----------
  function section() {
    const d = document.createElement('div'); d.id = 'wbBox'; d.className = 'gsbox';
    d.innerHTML = `<div class="row"><button class="gsb${isOn() ? ' on' : ''}" data-wb="on"><i style="background:#ff9d5c"></i>🧱 OI Wall Break v0.1</button><span class="gsinfo">${isOn() ? '' : 'ทะลุกำแพง OI → เข้าตามทิศ'}</span></div>` +
      (isOn() ? `<div class="row ps"><span class="gsinfo" style="display:block;line-height:1.55;white-space:normal">${stats()}</span></div><div class="row ps"><button class="gsb" data-wb="reload">↻ โหลดใหม่</button></div>` : '');
    return d;
  }
  function mount() { const m = $('indMenu'); if (!m || m.hidden || $('wbBox')) return; const anchor = $('sfBox') || m.querySelector('.t'); anchor ? anchor.after(section()) : m.prepend(section()); }
  const menu = $('indMenu');
  if (menu) {
    new MutationObserver(() => mount()).observe(menu, { childList: true });
    menu.addEventListener('click', e => {
      const a = e.target.closest('[data-wb]'); if (!a) return;
      if (a.dataset.wb === 'on') cfg.on = !isOn(); else if (a.dataset.wb === 'reload') { histAt = 0; } else return;
      save(); O.markDirty(); const b = $('wbBox'); if (b) b.remove(); mount(); run(true);
    });
  }
  if (window.OIAlerts) OIAlerts.reg('wbreak', '🧱 OI Wall Break (ทะลุกำแพง OI)', { desc: 'เตือนตอน M5 ปิดทะลุกำแพง OI และตอนถึง TP/SL', active: isOn });

  // ---------- วาดบนกราฟ ----------
  O.hooks.push((ctx, w, h) => {
    if (!isOn()) return;
    const ts = O.chart.timeScale(), sr = O.series, plotW = ts.width();
    const Y = p => sr.priceToCoordinate(p);
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace';
    ctx.save(); ctx.font = `bold 10px ${mono}`; ctx.textBaseline = 'middle';
    // กำแพงวันนี้: เส้นประ + ป้าย
    walls.forEach(z => {
      const y = Y(z.p); if (y === null || y < 0 || y > h) return;
      ctx.strokeStyle = '#ff9d5c'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ff9d5c'; ctx.textAlign = 'left'; ctx.fillText(`🧱 ${z.side}${z.k}`, 4, y - 7);
    });
    // ไม้วันนี้: เส้นเข้า/SL/TP
    today.forEach(s => {
      const lab = `${s.dir > 0 ? 'BUY' : 'SELL'} ${s.z.side}${s.z.k}`;
      [[s.entry, '#e6e6e6', lab], [s.sl, '#e05b5b', `SL ${s.z.side}${s.z.k}`], [s.tp, '#59c98d', `TP ${s.z.side}${s.z.k}`]].forEach(([p, col, txt]) => {
        const y = Y(p); if (y === null || y < 0 || y > h) return;
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(txt, plotW - 4, y - 7);
      });
    });
    ctx.restore();
  });

  window.OI_wbreak = { get setups() { return setups; }, get today() { return today; }, get walls() { return walls; }, get mode() { return mode; }, get atrRatio() { return atrRatio; }, run, scan, stats, levels };
  setInterval(() => run(false), 60 * 1000);
  run(true);
})();
