// 🧱 Wall Rejection (หนังสือ The Invisible Money บทที่ 9) — ดักกลับตัวหลังราคาแหย่ทะลุกำแพง OI หนาแล้วถูกตบกลับ
//  1) Location     : ราคาวิ่งเข้าหากำแพง OI อันดับ 1–5 (ฝั่ง Call หรือ Put)
//  2) Manipulation : แท่งแหย่ทะลุเส้นกำแพงไปอย่างน้อย $1 (หลอกคนเล่น Breakout) แต่ไม่เกินระยะสูงสุด
//  3) Rejection    : ภายใน N แท่ง มีแท่ง "ปิด" กลับเข้าใต้/เหนือเส้นกำแพง → เข้าเทรดที่ราคาปิดนั้นทันที
//  SL = เลยจุดสุดของไส้ที่แหย่ไป $0.5 · TP = โซน OI ถัดไปที่ห่าง ≥ 1R (ไม่มีใช้ 2R)
//  ตัวกรอง: ป้าย ⚠️ Squeeze ส้ม/แดงไปทางเดียวกับที่แหย่ = อาจเป็นเบรกจริง (เตือน ห้ามสวน) · โหมด 🔴 = ลดไม้
(() => {
  'use strict';
  const O = window.OI;
  if (!O || !O.hooks || !(O.sym === 'gold' || O.sym === 'gcy')) return;
  const $ = id => document.getElementById(id);
  const KEY = 'oi_wallrej' + (O.psfx || '');
  const cfg = { on: true, tf: '1m' };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };
  const TFS = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
  const P = { '1m': { poke: 1, maxExt: 6, back: 10, cool: 20, hold: 240, maxRisk: 9 }, '5m': { poke: 1, maxExt: 9, back: 4, cool: 6, hold: 60, maxRisk: 12 } };
  const SL_PAD = 0.5;
  let setups = [], bars = [], lastRun = 0, busy = false;

  function walls() { // กำแพงหนา = OI อันดับ 1–5 ต่อฝั่ง
    const oi = O.oi; if (!oi || !oi.rows) return [];
    const out = [];
    oi.rows.forEach(r => {
      if (r.price === null || r.price === undefined) return;
      const rc = r.c > 0 && oi.rankC ? oi.rankC.get(r.strike) || 0 : 0, rp = r.p > 0 && oi.rankP ? oi.rankP.get(r.strike) || 0 : 0;
      const best = [rc && rc <= 5 ? ['C', rc] : null, rp && rp <= 5 ? ['P', rp] : null].filter(Boolean).sort((a, b) => a[1] - b[1])[0];
      if (best) out.push({ k: r.strike, p: r.price, lab: best[0] + r.strike, rk: best[1] });
    });
    return out.sort((a, b) => a.p - b.p);
  }
  const tpZones = () => (window.OI_step3 && window.OI_step3.zones ? window.OI_step3.zones() : walls().map(w => ({ ...w, lo: w.p - 1, hi: w.p + 1 })));

  function scan(B, W, Z) {
    const n = B.length, L = P[cfg.tf] || P['1m'], res = [], cool = new Map();
    let act = [];
    for (let i = 1; i < n; i++) {
      const b = B[i], pc = B[i - 1].close;
      // 2) แหย่ทะลุ: มาจากฝั่งหนึ่งของเส้น แล้วไส้/ตัวแท่งทะลุไป ≥ poke
      W.forEach(w => {
        if (cool.has(w.k) && i - cool.get(w.k) < L.cool) return;
        if (act.some(s => s.w.k === w.k)) return;
        let dir = 0;
        if (pc < w.p && b.high >= w.p + L.poke) dir = -1;      // แหย่ขึ้นเหนือกำแพง → รอ SELL
        else if (pc > w.p && b.low <= w.p - L.poke) dir = 1;   // แหย่ลงใต้กำแพง → รอ BUY
        if (!dir) return;
        act.push({ w, dir, t: i, st: 1, ext: dir < 0 ? b.high : b.low, xi: i }); cool.set(w.k, i);
      });
      act.forEach(s => {
        const w = s.w;
        if (s.st === 1) {
          if (s.dir < 0 ? b.high > s.ext : b.low < s.ext) { s.ext = s.dir < 0 ? b.high : b.low; s.xi = i; }
          if (Math.abs(s.ext - w.p) > L.maxExt) { s.st = -1; s.why = 'วิ่งไกลเกิน = เบรกจริง'; s.end = i; return; }
          // 3) ปิดกลับเข้าฝั่งเดิม
          if (s.dir < 0 ? b.close < w.p : b.close > w.p) {
            const entry = b.close, sl = s.ext - s.dir * SL_PAD, risk = Math.abs(entry - sl);
            if (risk > L.maxRisk || risk < 0.8) { s.st = -1; s.why = risk < 0.8 ? 'SL แคบเกิน' : 'SL กว้างเกิน'; s.end = i; return; }
            const Zs = Z, nxt = s.dir > 0 ? Zs.find(q => q.lo >= entry + risk) : [...Zs].reverse().find(q => q.hi <= entry - risk);
            Object.assign(s, { st: 3, ei: i, entry, sl, tp: nxt ? (s.dir > 0 ? nxt.lo : nxt.hi) : entry + s.dir * 2 * risk, tpLab: nxt ? nxt.lab : '2R' });
            return;
          }
          if (i - s.t >= L.back) { s.st = -1; s.why = 'ยืนนอกกำแพงได้ = เบรกจริง'; s.end = i; }
        } else if (s.st === 3 && i > s.ei) {
          const hitSL = s.dir > 0 ? b.low <= s.sl : b.high >= s.sl, hitTP = s.dir > 0 ? b.high >= s.tp : b.low <= s.tp;
          if (hitSL) { s.st = 5; s.end = i; s.why = 'SL'; } else if (hitTP) { s.st = 4; s.end = i; s.why = 'TP'; }
          else if (i - s.ei > L.hold) { s.st = 6; s.end = i; s.why = 'หมดเวลา'; }
        }
      });
      act.filter(s => s.st < 0 || s.st >= 4).forEach(s => res.push(s));
      act = act.filter(s => s.st > 0 && s.st < 4);
    }
    return res.concat(act);
  }

  async function run(force) {
    if (!cfg.on || busy) return;
    if (!force && Date.now() - lastRun < 18000) return;
    busy = true; lastRun = Date.now();
    try {
      const B = await O.fetchTF(cfg.tf, cfg.tf === '1m' ? 480 : 300);
      if (B && B.length > 20) { bars = B; setups = scan(B, walls(), tpZones()); notify(); O.markDirty(); }
    } catch (e) {} finally { busy = false; }
  }
  const fresh = () => bars.length && Date.now() / 1000 + 7 * 3600 - bars[bars.length - 1].time < 3 * 3600;
  function filt(s) { // คำเตือนจากป้ายอื่น ณ ตอนนี้
    const out = [], sq = window.OI_squeeze && window.OI_squeeze.result, vr = window.OI_vol && window.OI_vol.regime && window.OI_vol.regime();
    if (sq && sq.lv >= 2 && sq.dir === -s.dir) out.push('<b style="color:#ff4d6a">⚠️ Squeeze ไปทางที่แหย่ → อาจเป็นเบรกจริง ห้ามสวน</b>');
    if (vr && vr.z === 'r') out.push(`🔴 โหมดแกว่งแรง: ไม้ ×${vr.size.toFixed(2)}`);
    if (vr && vr.z === 'g') out.push('🟢 โหมดสงบ: ท่าสวนได้เปรียบน้อย');
    return out;
  }
  const told = new Set();
  function notify() {
    if (!fresh()) return;
    const n = bars.length;
    setups.forEach(s => {
      const key = s.w.k + '|' + bars[s.t].time, d = s.dir > 0 ? 'BUY' : 'SELL';
      if (s.st === 1 && n - 1 - s.t <= 1 && !told.has('m' + key)) {
        told.add('m' + key);
        alertMsg(`🧱 <b>แหย่ทะลุกำแพง ${s.w.lab}</b> ${s.dir < 0 ? '▲ ขึ้นไป' : '▼ ลงไป'} ${s.ext.toFixed(1)}<br>รอแท่งปิดกลับ${s.dir < 0 ? 'ใต้' : 'เหนือ'} ${s.w.p.toFixed(1)} → ${d}`, false);
      }
      if (s.st >= 3 && s.ei !== undefined && n - 1 - s.ei <= 1 && !told.has('e' + key)) {
        told.add('e' + key);
        const f = filt(s);
        alertMsg(`🧱 <b>Wall Rejection ${d}</b> ${s.entry.toFixed(2)} (กำแพง ${s.w.lab} ถูกตบกลับ)<br>SL ${s.sl.toFixed(2)} (เลยไส้) · TP ${s.tp.toFixed(2)} (${s.tpLab}) · R:R ${(Math.abs(s.tp - s.entry) / Math.abs(s.entry - s.sl)).toFixed(1)}${f.length ? '<br>' + f.join('<br>') : ''}`, true);
      }
    });
  }
  function alertMsg(html, strong) {
    if (window.OIAlerts && !OIAlerts.on('wallrej')) return;
    O.beep && O.beep();
    try { navigator.vibrate && navigator.vibrate(strong ? [200, 100, 200] : [120]); } catch (e) {}
    O.showToast && O.showToast(html, strong ? 15000 : 8000);
  }
  setInterval(() => run(false), 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(true); });
  setTimeout(() => run(true), 6500);

  // ---------- วาด ----------
  const csec = () => TFS[O.tf] || 60, toChart = t => Math.floor(t / csec()) * csec();
  O.hooks.push((ctx, w, h) => {
    if (!cfg.on || !setups.length || !bars.length) return;
    const ts = O.chart.timeScale(), sr = O.series, plotW = ts.width(), plotH = h - ts.height();
    const X = i => ts.timeToCoordinate(toChart(bars[Math.min(i, bars.length - 1)].time)), Y = p => sr.priceToCoordinate(p);
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace';
    ctx.save(); ctx.font = `bold 9px ${mono}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    // ไส้ที่แหย่ (M) ของทุก setup ที่เข้าแล้ว + ผล
    setups.filter(s => s.ei !== undefined).forEach(s => {
      const xm = X(s.xi), ym = Y(s.ext);
      if (xm !== null && ym !== null && xm >= 0 && xm <= plotW) { ctx.fillStyle = '#c9b8ff'; ctx.fillText('🧱', xm, ym + (s.dir < 0 ? -9 : 9)); }
      const x = X(s.ei), y = Y(s.entry); if (x === null || y === null || x < 0 || x > plotW) return;
      const col = s.st === 4 ? '#22e39a' : s.st === 5 ? '#ff4d6a' : '#e0b44c';
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
      if (s.st >= 4) ctx.fillText(s.st === 4 ? '✓' : s.st === 5 ? '✗' : '⌛', x + 8, y);
    });
    if (fresh()) setups.filter(s => s.st === 1 || s.st === 3).forEach(s => {
      const x0 = X(s.st === 3 ? s.ei : s.t); if (x0 === null) return;
      const xr = plotW - 2;
      const line = (p, col, dash, lab) => { const y = Y(p); if (y === null || y < 0 || y > plotH) return; ctx.strokeStyle = col; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(xr, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(lab, xr - 2, y - 6); };
      ctx.lineWidth = 1;
      if (s.st === 1) line(s.w.p, '#c9b8ff', [2, 2], `🧱 รอปิดกลับ ${s.w.lab}`);
      else { line(s.entry, '#e0b44c', [], `🧱 ${s.dir > 0 ? 'BUY' : 'SELL'} ${s.entry.toFixed(1)}`); line(s.sl, '#ff4d6a', [4, 3], `SL ${s.sl.toFixed(1)}`); line(s.tp, '#22e39a', [4, 3], `TP ${s.tp.toFixed(1)} ${s.tpLab}`); }
    });
    ctx.restore();
  });

  // ---------- ป้าย ----------
  (window.OIBadgeExtra = window.OIBadgeExtra || []).push(() => {
    if (!cfg.on || !fresh()) return null;
    const cur = setups.filter(s => s.st === 1 || s.st === 3).sort((a, b) => b.st - a.st)[0]; if (!cur) return null;
    const warn = filt(cur).some(t => t.includes('Squeeze'));
    if (cur.st === 1) return [`🧱 แหย่ ${cur.w.lab} รอปิดกลับ`, '#c9b8ff', 'wallrej'];
    return [`🧱 ${cur.dir > 0 ? 'BUY' : 'SELL'} ${cur.entry.toFixed(1)} SL ${cur.sl.toFixed(1)}${warn ? ' ⚠️' : ''}`, cur.dir > 0 ? '#22e39a' : '#ff8a3d', 'wallrej'];
  });

  // ---------- เมนู ----------
  function stats(S) {
    const d = (S || setups).filter(s => s.st === 4 || s.st === 5), w = d.filter(s => s.st === 4).length;
    return d.length ? `ย้อนหลัง ${cfg.tf === '1m' ? '8 ชม.' : '25 ชม.'}: เข้า ${d.length} · TP ${w} · SL ${d.length - w}` : 'ยังไม่มีสัญญาณครบในช่วงนี้';
  }
  function section() {
    const d = document.createElement('div'); d.id = 'wrBox'; d.className = 'gsbox';
    d.innerHTML = `<div class="row"><button class="gsb${cfg.on ? ' on' : ''}" data-wr="on"><i style="background:#c9b8ff"></i>🧱 Wall Rejection (แหย่ทะลุแล้วตบกลับ)</button><span class="gsinfo">${cfg.on ? stats() : ''}</span></div>` +
      (cfg.on ? `<div class="row ps"><button class="gsb${cfg.tf === '1m' ? ' on' : ''}" data-wrtf="1m">M1</button><button class="gsb${cfg.tf === '5m' ? ' on' : ''}" data-wrtf="5m">M5</button></div>` : '');
    return d;
  }
  function mount() { const m = $('indMenu'); if (!m || m.hidden || $('wrBox')) return; const box = section(), anchor = $('s3Box') || $('dhBox') || $('btBox') || m.querySelector('.t'); anchor ? anchor.after(box) : m.prepend(box); }
  const menu = $('indMenu');
  if (menu) {
    new MutationObserver(() => mount()).observe(menu, { childList: true });
    menu.addEventListener('click', e => {
      const a = e.target.closest('[data-wr]'), t = e.target.closest('[data-wrtf]'); if (!a && !t) return;
      if (a) cfg.on = !cfg.on; else cfg.tf = t.dataset.wrtf;
      save(); setups = []; O.markDirty(); const b = $('wrBox'); if (b) b.remove(); mount(); run(true);
    });
  }
  if (window.OIAlerts) OIAlerts.reg('wallrej', '🧱 Wall Rejection (แหย่ทะลุ + ตบกลับ)', { desc: 'เตือนตอนราคาแหย่ทะลุกำแพง OI อันดับ 1–5 และตอนแท่งปิดกลับ = จุดเข้า', active: () => cfg.on });
  window.OI_wallrej = { get setups() { return setups; }, get bars() { return bars; }, scan, walls, run, stats, get cfg() { return cfg; } };
})();
