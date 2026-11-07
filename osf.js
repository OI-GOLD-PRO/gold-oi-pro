// 🌏 OI Session Fade v0.4 — สวนกำแพง OI ตามช่วงตลาด (จากแบ็กเทส 12 ต.ค.–6 พ.ย. 2026)
//  เส้น: Call OI 3 อันดับ + Put OI 3 อันดับ ของสัญญาวันนี้ ในระยะ ±$60 จากราคาตอน 06:00 · เกรด A = strike ติด top 3 volume Call หรือ Put
//  ตั้งรอ: แท่ง M1 ปิดห่างขอบโซน ≥ $3 (เหนือ = รอ BUY / ใต้ = รอ SELL) → แตะขอบใกล้ = เข้า limit ที่ขอบใกล้ · นับครั้งแตะใหม่ทุกช่วงตลาด
//  SL = ขอบไกล ∓ $3 · TP = $5 (London เกรด A = $8) · ถือสูงสุด 240 แท่ง M1 · ข่าวแดง USD: ไม่เข้า −30/+90 นาที · ปิดไม้ก่อนข่าว 5 นาที
//  ไม้จริง: Asia เช้า 06:00–10:00 โซน ±2 แตะครั้งที่ 1–2 (เกรด A ถึง 3) · London 14:00–19:30 โซน ±1.5 แตะครั้งที่ 1
//  ที่เหลือ (แตะครั้งอื่น / Asia สาย / NY) = ไม้บันทึก ไว้ forward test เทียบ ไม่ใช่สัญญาณเข้า
(() => {
  'use strict';
  const O = window.OI;
  if (!O || !O.hooks || !(O.sym === 'gold' || O.sym === 'gcy')) return;
  const $ = id => document.getElementById(id);
  const KEY = 'oi_sfade' + (O.psfx || '');
  const cfg = { on: null, paper: false }; // on = null → ยังไม่เคยตั้ง: เปิดให้รหัสไม่จำกัดวันที่ไม่ใช่เครื่องใหม่
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };
  const isOn = () => cfg.on === null ? (!!O.unlimited && !window.OI_NEWDEV) : !!cfg.on;

  const ARM = 3, SLB = 3, TP = 5, HOLD = 240, RANGE = 60, NB = 30 * 60, NA = 90 * 60, NCLOSE = 5 * 60;
  // นาทีของวัน (เวลาไทย) · NY ข้ามเที่ยงคืนถึง 01:30
  const SESS = [
    { id: 'AM', lab: 'Asia เช้า', a: 360, b: 600, half: 2, real: 2, realA: 3 },
    { id: 'AL', lab: 'Asia สาย', a: 600, b: 840, half: 1, real: 0 },
    { id: 'LDN', lab: 'London', a: 840, b: 1170, half: 1.5, real: 1, tpA: 8 },
    { id: 'NY', lab: 'NY', a: 1170, b: 1530, half: 1.5, real: 0 },
  ];
  const mod = t => Math.floor((((t % 86400) + 86400) % 86400) / 60);
  const sessOf = t => { const m = mod(t); return SESS.find(s => (m >= s.a && m < s.b) || (s.b > 1440 && m < s.b - 1440)) || null; };
  // วันเทรด = เริ่ม 06:00 (หลัง OI สิ้นวันเข้า) · คืนค่าเวลาเริ่ม (วินาทีเวลาไทย)
  const dayStart = t => Math.floor((t - 6 * 3600) / 86400) * 86400 + 6 * 3600;

  // ---------- ข่าวแดง USD (news.json เดียวกับอินดี้อื่น) → เวลาไทยบนแกน ----------
  let news = [];
  async function loadNews() {
    try {
      const own = location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : 'OI-GOLD-PRO';
      const j = await (await fetch(`https://raw.githubusercontent.com/${own}/gold-oi-pro/main/news.json?t=${Math.floor(Date.now() / 300000)}`, { cache: 'no-store' })).json();
      news = (j.events || []).filter(e => e.c === 'USD' && (e.i || 'H') === 'H').map(e => Date.parse(e.date) / 1000 + 7 * 3600).filter(isFinite).sort((a, b) => a - b);
    } catch (e) {}
  }
  loadNews(); setInterval(loadNews, 10 * 60e3);

  // ---------- เส้นของวัน ----------
  function levels(ref) {
    const oi = O.oi; if (!oi || !oi.rows || !oi.rows.length) return [];
    const rows = oi.rows.filter(r => r.price !== null && r.price !== undefined && Math.abs(r.price - ref) <= RANGE);
    const top = (k, n) => rows.filter(r => r[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, n).map(r => r.strike);
    const C = top('c', 3), P = top('p', 3), V = new Set(top('vc', 3).concat(top('vp', 3)));
    return [...new Set(C.concat(P))].map(k => { const r = rows.find(x => x.strike === k); return { k, p: r.price, side: C.includes(k) ? 'C' : 'P', grade: V.has(k) ? 'A' : 'B' }; }).sort((a, b) => a.p - b.p);
  }

  // ---------- สแกน (ฟังก์ชันล้วน ใช้ทดสอบย้อนหลังได้) ----------
  // B = แท่ง M1 {time(วินาทีเวลาไทย), open, high, low, close} · L = [{k, p, side, grade}] · N = เวลาข่าว (วินาทีเวลาไทย)
  function scan(B, L, N, opt) {
    opt = opt || {}; N = N || [];
    const out = [], n = B.length; let cur = null, st = new Map();
    const inNews = t => N.some(x => t >= x - NB && t <= x + NA);
    for (let i = 0; i < n; i++) {
      const b = B[i], S = sessOf(b.time), sk = S ? S.id + '|' + dayStart(b.time) : null;
      if (sk !== cur) { cur = sk; st = new Map(); }
      if (!S) continue;
      L.forEach(z => {
        const lo = z.p - S.half, hi = z.p + S.half, s = st.get(z.k) || { arm: 0, k: 0 }; st.set(z.k, s);
        if (s.arm && b.low <= hi && b.high >= lo) {
          s.k++; const dir = s.arm; s.arm = 0;
          if (s.k > 4 || inNews(b.time)) return;
          const real = S.real > 0 && (s.k <= S.real || (z.grade === 'A' && s.k <= (S.realA || 0)));
          const entry = dir > 0 ? hi : lo, sl = dir > 0 ? lo - SLB : hi + SLB, tpd = (opt.tpA !== false && S.tpA && z.grade === 'A') ? S.tpA : TP;
          out.push({ z, S, dir, k: s.k, real, ei: i, entry, sl, tp: entry + dir * tpd, st: 3 });
          return;
        }
        if (b.close > hi + ARM) s.arm = 1; else if (b.close < lo - ARM) s.arm = -1;
      });
    }
    // ติดตามผล: แท่งที่เข้าเช็ก SL อย่างเดียว · จากนั้น SL ก่อน TP · หมดเวลา 240 แท่ง · ปิดก่อนข่าว 5 นาที
    out.forEach(s => {
      for (let j = s.ei; j < n && j < s.ei + HOLD; j++) {
        const b = B[j];
        if (j > s.ei && N.some(x => b.time >= x - NCLOSE && B[j - 1].time < x - NCLOSE)) { s.st = 7; s.end = j - 1; s.exit = B[j - 1].close; s.why = 'ปิดก่อนข่าว'; return; }
        if (s.dir > 0 ? b.low <= s.sl : b.high >= s.sl) { s.st = 5; s.end = j; s.exit = s.sl; s.why = 'SL'; return; }
        if (j > s.ei && (s.dir > 0 ? b.high >= s.tp : b.low <= s.tp)) { s.st = 4; s.end = j; s.exit = s.tp; s.why = 'TP'; return; }
        if (j === s.ei + HOLD - 1) { s.st = 6; s.end = j; s.exit = b.close; s.why = 'หมดเวลา'; return; }
      }
    });
    out.forEach(s => { s.R = Math.abs(s.entry - s.sl); if (s.exit !== undefined) s.res = Math.round((s.exit - s.entry) * s.dir / s.R * 100) / 100; });
    return out;
  }

  let setups = [], bars = [], lv = [], lastRun = 0, busy = false;
  async function run(force) {
    if (!isOn() || busy) return;
    if (!force && Date.now() - lastRun < 18000) return;
    busy = true; lastRun = Date.now();
    try {
      const A = await O.fetchTF('1m', 1000);
      if (A && A.length > 30) {
        const d0 = dayStart(A[A.length - 1].time), B = A.filter(b => b.time >= d0);
        if (B.length) { bars = B; lv = levels(B[0].open); const old = new Set(setups.map(key)); setups = scan(B, lv, news); notify(old); O.markDirty(); }
        else { bars = []; setups = []; }
      }
    } catch (e) {} finally { busy = false; }
  }
  const key = s => s.S.id + '|' + s.z.k + '|' + s.k + '|' + bars[s.ei].time;
  const told = new Set();
  function notify(old) {
    const n = bars.length;
    setups.filter(s => s.real).forEach(s => {
      const k = key(s);
      if (n - 1 - s.ei <= 2 && !told.has('e' + k) && !old.has(k)) {
        told.add('e' + k);
        alertMsg(`🌏 <b>${s.dir > 0 ? 'BUY' : 'SELL'} ${s.entry.toFixed(2)}</b> · ${s.S.lab} · ${s.z.side}${s.z.k} เกรด ${s.z.grade} · แตะครั้งที่ ${s.k}<br>SL ${s.sl.toFixed(2)} · TP ${s.tp.toFixed(2)}`);
      }
      if (s.st >= 4 && s.end !== undefined && n - 1 - s.end <= 2 && !told.has('x' + k)) {
        told.add('x' + k);
        alertMsg(`🌏 ${s.why === 'TP' ? '✓ ถึง TP' : s.why === 'SL' ? '✗ โดน SL' : s.why} · ${s.dir > 0 ? 'BUY' : 'SELL'} ${s.z.side}${s.z.k} (${s.res > 0 ? '+' : ''}${s.res}R)`);
      }
    });
  }
  function alertMsg(html) {
    if (window.OIAlerts && !OIAlerts.on('sfade')) return;
    O.beep && O.beep();
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
    O.showToast && O.showToast(html, 15000);
  }
  setInterval(() => run(false), 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(true); });
  setTimeout(() => run(true), 7000);

  // ---------- วาด ----------
  const TFS = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
  const csec = () => TFS[O.tf] || 60, toChart = t => Math.floor(t / csec()) * csec();
  const fresh = () => bars.length && Date.now() / 1000 + 7 * 3600 - bars[bars.length - 1].time < 3 * 3600;
  O.hooks.push((ctx, w, h) => {
    if (!isOn() || !bars.length) return;
    const ts = O.chart.timeScale(), sr = O.series, plotW = ts.width(), plotH = h - ts.height();
    const X = i => ts.timeToCoordinate(toChart(bars[Math.min(i, bars.length - 1)].time)), Y = p => sr.priceToCoordinate(p);
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace';
    ctx.save(); ctx.font = `bold 9px ${mono}`; ctx.textBaseline = 'middle';
    // โซนของช่วงที่เทรดได้ตอนนี้ (Asia เช้า / London) = แถบจาง ๆ
    const S = fresh() ? sessOf(bars[bars.length - 1].time) : null;
    if (S && S.real) lv.forEach(z => {
      const y1 = Y(z.p + S.half), y2 = Y(z.p - S.half); if (y1 === null || y2 === null) return;
      ctx.globalAlpha = z.grade === 'A' ? 0.16 : 0.09; ctx.fillStyle = '#7fd0ff'; ctx.fillRect(0, y1, plotW, Math.max(1, y2 - y1));
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#7fd0ff'; ctx.textAlign = 'left'; ctx.fillText(`🌏 ${z.side}${z.k}${z.grade === 'A' ? ' A' : ''}`, 4, y1 - 5);
    });
    ctx.globalAlpha = 1;
    setups.filter(s => s.real || cfg.paper).forEach(s => {
      const x = X(s.ei), y = Y(s.entry); if (x === null || y === null || x < 0 || x > plotW) return;
      const col = s.st === 4 ? '#22e39a' : s.st === 5 ? '#ff4d6a' : s.st === 3 ? '#7fd0ff' : '#e0b44c';
      ctx.globalAlpha = s.real ? 1 : 0.45; ctx.fillStyle = col; ctx.strokeStyle = col; ctx.beginPath();
      if (s.dir > 0) { ctx.moveTo(x, y + 2); ctx.lineTo(x - 4, y + 9); ctx.lineTo(x + 4, y + 9); } else { ctx.moveTo(x, y - 2); ctx.lineTo(x - 4, y - 9); ctx.lineTo(x + 4, y - 9); }
      ctx.closePath(); s.real ? ctx.fill() : ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText((s.real ? '🌏' : '') + s.k + (s.st === 4 ? '✓' : s.st === 5 ? '✗' : ''), x, s.dir > 0 ? y + 16 : y - 16);
    });
    ctx.globalAlpha = 1;
    // ไม้จริงที่ยังเปิดอยู่: เส้น entry / SL / TP
    if (fresh()) setups.filter(s => s.real && s.st === 3).forEach(s => {
      const x0 = X(s.ei); if (x0 === null) return;
      const line = (p, col, dash, lab) => { const y = Y(p); if (y === null || y < 0 || y > plotH) return; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(plotW - 2, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(lab, plotW - 4, y - 6); };
      line(s.entry, '#7fd0ff', [], `🌏 ${s.dir > 0 ? 'BUY' : 'SELL'} ${s.entry.toFixed(1)} · ${s.z.side}${s.z.k} ครั้งที่ ${s.k}`);
      line(s.sl, '#ff4d6a', [4, 3], `SL ${s.sl.toFixed(1)}`);
      line(s.tp, '#22e39a', [4, 3], `TP ${s.tp.toFixed(1)}`);
    });
    ctx.restore();
  });

  // ---------- ป้ายสถานะ ----------
  (window.OIBadgeExtra = window.OIBadgeExtra || []).push(() => {
    if (!isOn() || !fresh()) return null;
    const open = setups.filter(s => s.real && s.st === 3);
    if (open.length) { const s = open[open.length - 1]; return [`🌏 ${s.dir > 0 ? 'BUY' : 'SELL'} ${s.entry.toFixed(1)} SL ${s.sl.toFixed(1)} TP ${s.tp.toFixed(1)}`, s.dir > 0 ? '#22e39a' : '#ff8a3d', 'sfade']; }
    const S = sessOf(bars[bars.length - 1].time);
    if (S && S.real && lv.length) return [`🌏 ${S.lab} · รอแตะ ${lv.length} เส้น`, '#7fd0ff', 'sfade'];
    return null;
  });

  // ---------- เมนู ƒx ----------
  function stats() {
    const r = setups.filter(s => s.real && s.st >= 4), w = r.filter(s => s.res > 0).length, sum = r.reduce((a, s) => a + (s.res || 0), 0), p = setups.filter(s => !s.real).length;
    return r.length ? `วันนี้: ไม้จริง ${r.length} · ชนะ ${w} · รวม ${sum > 0 ? '+' : ''}${sum.toFixed(1)}R · ไม้บันทึก ${p}` : `วันนี้ยังไม่มีไม้จริงจบ · ไม้บันทึก ${p}`;
  }
  function section() {
    const d = document.createElement('div'); d.id = 'sfBox'; d.className = 'gsbox';
    d.innerHTML = `<div class="row"><button class="gsb${isOn() ? ' on' : ''}" data-sf="on"><i style="background:#7fd0ff"></i>🌏 OI Session Fade v0.4</button><span class="gsinfo">${isOn() ? stats() : 'Asia เช้า + London สวนกำแพง OI'}</span></div>` +
      (isOn() ? `<div class="row ps"><button class="gsb${cfg.paper ? ' on' : ''}" data-sf="paper">แสดงไม้บันทึก (forward test)</button></div>` : '');
    return d;
  }
  function mount() { const m = $('indMenu'); if (!m || m.hidden || $('sfBox')) return; const box = section(), anchor = $('s3Box') || $('dhBox') || $('btBox') || m.querySelector('.t'); anchor ? anchor.after(box) : m.prepend(box); }
  const menu = $('indMenu');
  if (menu) {
    new MutationObserver(() => mount()).observe(menu, { childList: true });
    menu.addEventListener('click', e => {
      const a = e.target.closest('[data-sf]'); if (!a) return;
      if (a.dataset.sf === 'on') cfg.on = !isOn(); else cfg.paper = !cfg.paper;
      save(); O.markDirty(); const b = $('sfBox'); if (b) b.remove(); mount(); run(true);
    });
  }
  if (window.OIAlerts) OIAlerts.reg('sfade', '🌏 OI Session Fade (เข้า/ออกไม้จริง)', { desc: 'Asia เช้า + London · เตือนตอนแตะกำแพงแล้วเข้าไม้ และตอนถึง TP/SL', active: isOn });
  window.OI_sfade = { scan, levels, sessOf, dayStart, run, get setups() { return setups; }, get bars() { return bars; }, get levels_() { return lv; }, get cfg() { return cfg; }, isOn };
})();
