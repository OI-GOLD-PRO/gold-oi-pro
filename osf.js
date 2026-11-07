// 🌏 OI Session Fade v0.5 — สวนกำแพง OI ตามช่วงตลาด (จากแบ็กเทส 12 ต.ค.–6 พ.ย. 2026)
//  v0.5: Asia เช้า ข้ามไม้ที่ราคาพุ่งเข้าโซนเกิน 3×ATR ใน 5 แท่ง M1 ก่อนแตะ (ATR = ค่าเฉลี่ย True Range 60 แท่ง) → เป็นไม้บันทึก (กรองพุ่ง)
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

  const ARM = 3, SLB = 3, TP = 5, RANGE = 60, MOM_N = 5, ATR_N = 60, MOM_MAX = 3, NB = 30 * 60, NA = 90 * 60, NCLOSE = 5 * 60;
  // นาทีของวัน (เวลาไทย) · NY ข้ามเที่ยงคืนถึง 01:30
  const SESS = [
    { id: 'AM', lab: 'Asia เช้า', a: 360, b: 600, half: 2, real: 2, realA: 3, mom: 3 },
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
  function levels(ref, src) {
    const R0 = src || (O.oi && O.oi.rows); if (!R0 || !R0.length) return [];
    const rows = R0.filter(r => r.price !== null && r.price !== undefined && Math.abs(r.price - ref) <= RANGE);
    const top = (k, n) => rows.filter(r => r[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, n).map(r => r.strike);
    const C = top('c', 3), P = top('p', 3), V = new Set(top('vc', 3).concat(top('vp', 3)));
    return [...new Set(C.concat(P))].map(k => { const r = rows.find(x => x.strike === k); return { k, p: r.price, side: C.includes(k) ? 'C' : 'P', grade: V.has(k) ? 'A' : 'B' }; }).sort((a, b) => a.p - b.p);
  }

  // ---------- โมเมนตัมเข้าโซน: ระยะที่ราคาวิ่งเข้าหาโซนใน 5 แท่งก่อนแท่ง i หารด้วย ATR 60 แท่ง ----------
  function atrArr(B) {
    const n = B.length, tr = new Array(n).fill(NaN), out = new Array(n).fill(NaN); let sum = 0;
    for (let j = 1; j < n; j++) tr[j] = Math.max(B[j].high, B[j - 1].close) - Math.min(B[j].low, B[j - 1].close);
    for (let i = ATR_N + 1; i < n; i++) { if (i === ATR_N + 1) { sum = 0; for (let j = 1; j <= ATR_N; j++) sum += tr[j]; } else sum += tr[i - 1] - tr[i - 1 - ATR_N]; out[i] = sum / ATR_N; }
    return out; // out[i] = เฉลี่ย TR ของแท่ง i-60..i-1
  }
  const momAt = (B, A, i, dir) => (i > MOM_N && A[i] > 0) ? (B[i - 1].close - B[i - 1 - MOM_N].close) * -dir / A[i] : null; // dir = ทิศเทรด (+1 BUY = ราคาวิ่งลงมาหา)

  // ---------- สแกน (ฟังก์ชันล้วน ใช้ทดสอบย้อนหลังได้) ----------
  // B = แท่ง M1 {time(วินาทีเวลาไทย), open, high, low, close} · L = [{k, p, side, grade}] · N = เวลาข่าว (วินาทีเวลาไทย)
  function scan(B, L, N, opt) {
    opt = opt || {}; N = N || []; const HOLD = opt.hold || 240, from = opt.from || 0, ATR = atrArr(B);
    const out = [], n = B.length; let cur = null, st = new Map();
    const inNews = t => N.some(x => t >= x - NB && t <= x + NA);
    for (let i = 0; i < n; i++) {
      const b = B[i]; if (b.time < from) continue;
      const S = sessOf(b.time), sk = S ? S.id + '|' + dayStart(b.time) : null;
      if (sk !== cur) { cur = sk; st = new Map(); }
      if (!S) continue;
      L.forEach(z => {
        const lo = z.p - S.half, hi = z.p + S.half, s = st.get(z.k) || { arm: 0, k: 0 }; st.set(z.k, s);
        if (s.arm && b.low <= hi && b.high >= lo) {
          s.k++; const dir = s.arm; s.arm = 0;
          if (s.k > 4 || inNews(b.time)) return;
          let real = S.real > 0 && (s.k <= S.real || (z.grade === 'A' && s.k <= (S.realA || 0)));
          const mv = momAt(B, ATR, i, dir), atr = ATR[i] > 0 ? ATR[i] : null, fast = !!(real && S.mom && mv !== null && mv > S.mom);
          if (fast) real = false;
          const entry = dir > 0 ? hi : lo, sl = dir > 0 ? lo - SLB : hi + SLB, tpd = (opt.tpA !== false && S.tpA && z.grade === 'A') ? S.tpA : TP;
          out.push({ z, S, dir, k: s.k, real, fast, mv: mv !== null ? Math.round(mv * 10) / 10 : null, atr, ei: i, entry, sl, tp: entry + dir * tpd, st: 3 });
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
    out.forEach(s => { s.R = Math.abs(s.entry - s.sl); s.t0 = B[s.ei].time; s.t1 = s.end !== undefined ? B[s.end].time : null; if (s.exit !== undefined) { s.pnl = Math.round((s.exit - s.entry) * s.dir * 100) / 100; s.res = Math.round(s.pnl / s.R * 100) / 100; } });
    return out;
  }

  // ---------- OI ย้อนหลังรายวัน (API เดียวกับ Historical OI Zones: oi_backup + oi_recovered) ----------
  let hist = new Map(), histAt = 0, histMsg = '';
  async function loadHist() {
    if (Date.now() - histAt < 30 * 60e3 || !window.OIHistoryZonesAPI) return;
    histAt = Date.now();
    try {
      const d = await window.OIHistoryZonesAPI();
      hist = new Map((d.days || []).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && Array.isArray(x.rows))
        .map(x => [x.date, x.rows.map(r => ({ strike: +r.strike, price: +r.strike, c: +r.c || 0, p: +r.p || 0, vc: 0, vp: 0 }))]));
      histMsg = '';
    } catch (e) { histMsg = 'โหลด OI ย้อนหลังไม่ได้: ' + (e.message || e); histAt = Date.now() - 25 * 60e3; }
  }
  const ymd = t => new Date(t * 1000).toISOString().slice(0, 10); // t = วินาทีเวลาไทย

  let setups = [], today = [], bars = [], lv = [], days = [], lastRun = 0, busy = false;
  async function run(force) {
    if (!isOn() || busy) return;
    if (!force && Date.now() - lastRun < 18000) return;
    busy = true; lastRun = Date.now();
    try {
      await loadHist();
      const [A1, A5] = await Promise.all([O.fetchTF('1m', 6000), O.fetchTF('5m', 1500)]);
      if (A1 && A1.length > 30) {
        const d0 = dayStart(A1[A1.length - 1].time), oldKeys = new Set(today.map(key));
        // วันนี้: M1 + OI สด (มีเกรด A จาก volume)
        const i0 = A1.findIndex(b => b.time >= d0);
        bars = i0 >= 0 ? A1.slice(Math.max(0, i0 - ATR_N - 10)) : []; // +70 แท่งก่อน 06:00 ไว้คำนวณ ATR
        lv = i0 >= 0 ? levels(A1[i0].open) : [];
        today = bars.length ? scan(bars, lv, news, { from: d0 }).map(s => Object.assign(s, { day: ymd(d0), tf: 'M1', live: true })) : [];
        // ย้อนหลัง: วันที่มี OI ในชีต · ใช้ M1 ถ้ามีครบวัน ไม่งั้น M5 (ประมาณ) · เกรด A ย้อนหลังไม่มี (ไม่มี volume รายวัน) = เกรด B ทั้งหมด
        const past = [], dl = [{ day: ymd(d0), tf: 'M1', n: today.length }];
        [...hist.keys()].sort().forEach(dt => {
          const ds = Date.parse(dt + 'T06:00:00Z') / 1000; if (!(ds < d0)) return;
          const de = ds + 86400, m1 = A1[0].time <= ds, src = m1 ? A1 : (A5 && A5.length && A5[0].time <= ds + 3600 ? A5 : null);
          if (!src) return;
          const j0 = src.findIndex(b => b.time >= ds), j1 = src.findIndex(b => b.time >= de);
          const B = src.slice(Math.max(0, j0 - ATR_N - 10), j1 < 0 ? src.length : j1); if (j0 < 0 || (j1 < 0 ? src.length : j1) - j0 < (m1 ? 300 : 60)) return;
          const L = levels(src[j0].open, hist.get(dt)); if (!L.length) return;
          const r = scan(B, L, news, { hold: m1 ? 240 : 48, from: ds }).map(s => Object.assign(s, { day: dt, tf: m1 ? 'M1' : 'M5' }));
          past.push(...r); dl.push({ day: dt, tf: m1 ? 'M1' : 'M5', n: r.length });
        });
        setups = past.concat(today); days = dl;
        notify(oldKeys); O.markDirty();
      }
    } catch (e) {} finally { busy = false; }
  }
  const key = s => s.S.id + '|' + s.z.k + '|' + s.k + '|' + s.t0;
  const told = new Set();
  function notify(old) {
    const n = bars.length;
    today.filter(s => s.real).forEach(s => {
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
    if (!isOn() || !setups.length && !lv.length) return;
    const ts = O.chart.timeScale(), sr = O.series, plotW = ts.width(), plotH = h - ts.height();
    const X = t => ts.timeToCoordinate(toChart(t)), Y = p => sr.priceToCoordinate(p), bw = Math.max(2, (X(bars.length ? bars[bars.length - 1].time : 0) || 0) - (X((bars.length ? bars[bars.length - 1].time : 0) - csec()) || 0));
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace';
    ctx.save(); ctx.font = `bold 10px ${mono}`; ctx.textBaseline = 'middle';
    // โซนของช่วงที่เทรดได้ตอนนี้ (Asia เช้า / London) = แถบจาง ๆ
    const S = fresh() ? sessOf(bars[bars.length - 1].time) : null;
    if (S && S.real) lv.forEach(z => {
      const y1 = Y(z.p + S.half), y2 = Y(z.p - S.half); if (y1 === null || y2 === null) return;
      ctx.globalAlpha = z.grade === 'A' ? 0.16 : 0.09; ctx.fillStyle = '#7fd0ff'; ctx.fillRect(0, y1, plotW, Math.max(1, y2 - y1));
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#7fd0ff'; ctx.textAlign = 'left'; ctx.fillText(`🌏 ${z.side}${z.k}${z.grade === 'A' ? ' A' : ''}`, 4, y1 - 5);
    });
    ctx.globalAlpha = 1;
    // ไม้ (แบ็กเทส + วันนี้): กรอบ TP เขียว / SL แดง จากแท่งเข้าถึงแท่งออก (ยังเปิด = ถึงแท่งล่าสุด)
    const lastT = bars.length ? bars[bars.length - 1].time : null;
    setups.filter(s => s.real || s.fast || cfg.paper).forEach(s => {
      let x0 = X(s.t0), x1 = X(s.t1 !== null ? s.t1 : (lastT || s.t0));
      if (x0 === null && x1 === null) return;
      if (x0 === null) x0 = 0; if (x1 === null) x1 = plotW;
      x1 = Math.max(x1 + bw, x0 + 6); if (x1 < 0 || x0 > plotW) return;
      const ye = Y(s.entry), yt = Y(s.tp), ys = Y(s.sl); if (ye === null || yt === null || ys === null) return;
      const a = (s.real ? 1 : 0.55) * (s.tf === 'M5' ? 0.75 : 1); // V4.9.76 เข้มขึ้น · ไม้กรองพุ่ง = จางแบบไม้บันทึก + ป้ายแดง
      ctx.globalAlpha = 0.32 * a; ctx.fillStyle = '#22e39a'; ctx.fillRect(x0, Math.min(ye, yt), x1 - x0, Math.abs(yt - ye));
      ctx.fillStyle = '#ff4d6a'; ctx.fillRect(x0, Math.min(ye, ys), x1 - x0, Math.abs(ys - ye));
      ctx.globalAlpha = a; ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#22e39a'; ctx.beginPath(); ctx.moveTo(x0, yt); ctx.lineTo(x1, yt); ctx.stroke();
      ctx.strokeStyle = '#ff4d6a'; ctx.beginPath(); ctx.moveTo(x0, ys); ctx.lineTo(x1, ys); ctx.stroke();
      ctx.strokeStyle = '#7fd0ff'; ctx.beginPath(); ctx.moveTo(x0, ye); ctx.lineTo(x1, ye); ctx.stroke();
      // จุดออก
      if (s.t1 !== null && s.exit !== undefined) { const yx = Y(s.exit); if (yx !== null) { ctx.fillStyle = s.pnl > 0 ? '#22e39a' : s.pnl < 0 ? '#ff4d6a' : '#e0b44c'; ctx.beginPath(); ctx.arc(x1 - bw / 2, yx, 3.5, 0, 7); ctx.fill(); } }
      // ป้าย: ทิศ · ครั้งที่แตะ · ผล
      const res = s.st === 3 ? 'เปิดอยู่' : `${s.st === 4 ? '✓' : s.st === 5 ? '✗' : s.why === 'ปิดก่อนข่าว' ? '📰' : '⏱'} ${s.pnl > 0 ? '+' : ''}${s.pnl}$`;
      const lab = `${s.tf === 'M5' ? '≈' : ''}${s.real ? '🌏' : '·'}${s.dir > 0 ? 'B' : 'S'}${s.k}${s.tf === 'M5' ? '' : ' ' + res}`;
      const ly = s.dir > 0 ? Math.max(yt, 0) - 7 : Math.min(yt, plotH) + 7; let lx = Math.max(2, x0 + 2);
      if (s.fast && lx < plotW) { const t = `⚡${s.mv}×ATR ข้าม `; ctx.globalAlpha = 1; ctx.fillStyle = '#ff3b5c'; ctx.textAlign = 'left'; ctx.fillText(t, lx, ly); lx += ctx.measureText(t).width; }
      ctx.globalAlpha = a; ctx.fillStyle = s.st === 3 ? '#7fd0ff' : s.pnl > 0 ? '#22e39a' : '#ff4d6a'; ctx.textAlign = 'left';
      if (lx < plotW) ctx.fillText(lab, lx, ly);
    });
    ctx.globalAlpha = 1;
    // ไม้จริงที่ยังเปิดอยู่: ราคาเข้า / SL / TP ที่ขอบขวา
    if (fresh()) today.filter(s => s.real && s.st === 3).forEach(s => {
      const line = (p, col, lab) => { const y = Y(p); if (y === null || y < 0 || y > plotH) return; ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(lab, plotW - 4, y - 6); };
      line(s.entry, '#7fd0ff', `🌏 ${s.dir > 0 ? 'BUY' : 'SELL'} ${s.entry.toFixed(1)} · ${s.z.side}${s.z.k} ครั้งที่ ${s.k}`);
      line(s.sl, '#ff4d6a', `SL ${s.sl.toFixed(1)}`); line(s.tp, '#22e39a', `TP ${s.tp.toFixed(1)}`);
    });
    ctx.restore();
  });

  // ---------- โมเมนตัมสด: ราคากำลังพุ่งเข้าหาเส้นไหน (ใช้แท่งที่ปิดแล้ว) ----------
  function liveMom() {
    const n = bars.length; if (n < ATR_N + MOM_N + 3 || !lv.length) return null;
    const A = atrArr(bars), i = n - 1, a = A[i]; if (!(a > 0)) return null;
    const mvDown = (bars[i - 1 - MOM_N].close - bars[i - 1].close) / a, P = bars[i - 1].close;
    const dn = mvDown > 0, mv = Math.abs(mvDown);
    // เส้นข้างหน้าในทิศที่ราคากำลังวิ่ง (ภายใน $15)
    const ahead = lv.filter(z => dn ? z.p < P : z.p > P).sort((x, y) => Math.abs(x.p - P) - Math.abs(y.p - P))[0];
    return { mv: Math.round(mv * 10) / 10, usd: Math.round(Math.abs(bars[i - 1].close - bars[i - 1 - MOM_N].close) * 10) / 10, dn, z: ahead && Math.abs(ahead.p - P) <= 15 ? ahead : null };
  }

  // ---------- ป้ายสถานะ ----------
  // ป้ายแดงหน้าสุด: ราคาพุ่งเข้าหาเส้นเกิน 3×ATR ใน 5 แท่ง M1 (Asia เช้า = ข้ามไม้ตามกฎ v0.5)
  (window.OIBadgeExtra = window.OIBadgeExtra || []).push(() => {
    if (!isOn() || !fresh()) return null;
    const m = liveMom(); if (!m || m.mv <= MOM_MAX) return null;
    const S = sessOf(bars[bars.length - 1].time);
    return [`⚡ พุ่ง${m.dn ? 'ลง' : 'ขึ้น'} ${m.mv}×ATR (${m.usd}$/5น.)${m.z ? ` → ${m.z.side}${m.z.k}` : ''}${S && S.mom ? ' · ข้ามไม้' : ''}`, '#ff3b5c', 'sfmom', 'rgba(255,59,92,.18)', 'first']; // key sfmom = หน้าสุดของแถบป้าย (live.js ORD)
  });
  (window.OIBadgeExtra = window.OIBadgeExtra || []).push(() => {
    if (!isOn() || !fresh()) return null;
    const open = today.filter(s => s.real && s.st === 3);
    if (open.length) { const s = open[open.length - 1]; return [`🌏 ${s.dir > 0 ? 'BUY' : 'SELL'} ${s.entry.toFixed(1)} SL ${s.sl.toFixed(1)} TP ${s.tp.toFixed(1)}`, s.dir > 0 ? '#22e39a' : '#ff8a3d', 'sfade']; }
    const S = sessOf(bars[bars.length - 1].time);
    if (S && S.real && lv.length) return [`🌏 ${S.lab} · รอแตะ ${lv.length} เส้น`, '#7fd0ff', 'sfade'];
    return null;
  });

  // ---------- เมนู ƒx ----------
  function sum(list) {
    const d = list.filter(s => s.st >= 4), w = d.filter(s => s.pnl > 0).length, usd = d.reduce((a, s) => a + s.pnl, 0), r = d.reduce((a, s) => a + s.res, 0);
    return { n: d.length, w, usd, r, wr: d.length ? Math.round(w / d.length * 100) : 0 };
  }
  const fmt = x => `${x.n} ไม้ · ชนะ ${x.wr}% · ${x.usd > 0 ? '+' : ''}${x.usd.toFixed(1)}$ (${x.r > 0 ? '+' : ''}${x.r.toFixed(1)}R)`;
  function stats() {
    const real = setups.filter(s => s.real), t = sum(today.filter(s => s.real));
    const nd = days.length, n5 = days.filter(d => d.tf === 'M5').length;
    const r1 = real.filter(s => s.tf === 'M1'), r5 = real.filter(s => s.tf === 'M5');
    const lines = [`<b>แบ็กเทส M1 ${nd - n5} วัน</b>: ${fmt(sum(r1))}`,
      `Asia เช้า: ${fmt(sum(r1.filter(s => s.S.id === 'AM')))}`, `London: ${fmt(sum(r1.filter(s => s.S.id === 'LDN')))}`,
      `วันนี้: ${t.n ? fmt(t) : 'ยังไม่มีไม้จริงจบ'}`];
    const f1 = setups.filter(s => s.fast && s.tf === 'M1'); if (f1.length) lines.push(`<span style="color:#ff6b82">⚡ กรองพุ่ง >${MOM_MAX}×ATR (Asia เช้า): ข้าม ${fmt(sum(f1))}</span>`);
    if (n5) lines.push(`<span style="opacity:.7">อีก ${n5} วันไม่มีแท่ง M1 ครบ: วาดจาก M5 เป็นกรอบจาง ≈ ไว้ดูตำแหน่งเท่านั้น ไม่คิดผล (M5 ทำให้ผลดีเกินจริง)</span>`);
    if (cfg.paper) lines.push(`ไม้บันทึก: ${fmt(sum(setups.filter(s => !s.real)))}`);
    if (histMsg) lines.push(histMsg); else if (!hist.size) lines.push('ยังไม่มี OI ย้อนหลัง (ต้องเข้าสู่ระบบ)');
    return lines.join('<br>') + '<br><small>ยังไม่หักสเปรด · ย้อนหลังเป็นเกรด B ทั้งหมด (ไม่มี volume รายวัน)</small>';
  }
  function section() {
    const d = document.createElement('div'); d.id = 'sfBox'; d.className = 'gsbox';
    d.innerHTML = `<div class="row"><button class="gsb${isOn() ? ' on' : ''}" data-sf="on"><i style="background:#7fd0ff"></i>🌏 OI Session Fade v0.5</button><span class="gsinfo">${isOn() ? '' : 'Asia เช้า + London สวนกำแพง OI'}</span></div>` + (isOn() ? `<div class="row ps"><span class="gsinfo" style="display:block;line-height:1.55;white-space:normal">${stats()}</span></div>` : '') +
      (isOn() ? `<div class="row ps"><button class="gsb${cfg.paper ? ' on' : ''}" data-sf="paper">แสดงไม้บันทึก (forward test)</button><button class="gsb" data-sf="reload">↻ โหลดแบ็กเทสใหม่</button></div>` : '');
    return d;
  }
  function mount() { const m = $('indMenu'); if (!m || m.hidden || $('sfBox')) return; const box = section(), anchor = $('s3Box') || $('dhBox') || $('btBox') || m.querySelector('.t'); anchor ? anchor.after(box) : m.prepend(box); }
  const menu = $('indMenu');
  if (menu) {
    new MutationObserver(() => mount()).observe(menu, { childList: true });
    menu.addEventListener('click', e => {
      const a = e.target.closest('[data-sf]'); if (!a) return;
      if (a.dataset.sf === 'on') cfg.on = !isOn(); else if (a.dataset.sf === 'reload') histAt = 0; else cfg.paper = !cfg.paper;
      save(); O.markDirty(); const b = $('sfBox'); if (b) b.remove(); mount(); run(true);
    });
  }
  if (window.OIAlerts) OIAlerts.reg('sfade', '🌏 OI Session Fade (เข้า/ออกไม้จริง)', { desc: 'Asia เช้า + London · เตือนตอนแตะกำแพงแล้วเข้าไม้ และตอนถึง TP/SL', active: isOn });
  window.OI_sfade = { stats, scan, levels, sessOf, dayStart, run, get setups() { return setups; }, get today() { return today; }, get days() { return days; }, get bars() { return bars; }, get levels_() { return lv; }, get cfg() { return cfg; }, isOn };
})();
