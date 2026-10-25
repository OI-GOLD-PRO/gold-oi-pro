// ถาดลับ AI Price Action: ปัดซ้ายที่ข้อความ "OI · Powered by … · V…" บนหัวแอป → ถาดสไลด์ออกมาครึ่งจอบน
// กดปุ่ม → แอนิเมชัน AI + กราฟวิ่ง → DeepSeek อ่านกราฟสด ณ ตอนนั้น (แท่งเทียน + Price Action ที่ระบบตรวจไว้ + แนว OI/EM/gmf/VWAP) → ควรเข้าออเดอร์ไหม
(() => {
  'use strict';
  const O = window.OI;
  if (!O || !O.chartEl || /[?&]pane=b/.test(location.search)) return;
  const $ = id => document.getElementById(id);
  const TZ = 7 * 3600, SESS = 5 * 3600;
  const TFN = { '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30', '1h': 'H1', '4h': 'H4', '1d': 'D1' };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const f2 = v => (v === null || v === undefined || !isFinite(v)) ? '–' : Number(v).toFixed(2);
  const hhmm = sec => { const d = new Date(sec * 1000); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };

  // ---------- หน้าตา ----------
  const css = document.createElement('style');
  css.textContent = `
  #paTray { position: fixed; left: 0; right: 0; top: 0; z-index: 45; height: calc(52vh + env(safe-area-inset-top, 0px)); padding-top: env(safe-area-inset-top, 0px); box-sizing: border-box;
    background: linear-gradient(180deg, #0d1330 0%, #0a0f24 100%); border-bottom: 1px solid rgba(224,180,76,.45); box-shadow: 0 10px 40px rgba(0,0,0,.6), 0 1px 0 rgba(224,180,76,.25);
    transform: translateX(104%); transition: transform .38s cubic-bezier(.2,.9,.25,1); display: flex; flex-direction: column; color: #e8ecf6; font-family: var(--sans, -apple-system, sans-serif); touch-action: pan-y; }
  #paTray.open { transform: translateX(0); }
  #paTray .hd { display: flex; align-items: center; gap: 8px; padding: 10px 14px 6px; }
  #paTray .hd b { font: 700 15px var(--mono, monospace); color: #e0b44c; letter-spacing: .03em; }
  #paTray .hd .sub { font-size: 11px; color: #8a93ad; }
  #paTray .hd .x { margin-left: auto; width: 32px; height: 32px; border-radius: 9px; border: 1px solid #2a3358; background: #141b3a; color: #c9d1ea; font-size: 15px; }
  #paTray .bd { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 4px 14px 14px; }
  #paTray .go { width: 100%; padding: 14px; border: 0; border-radius: 12px; font: 700 16px var(--sans, sans-serif); color: #1a1405; background: linear-gradient(90deg, #e0b44c, #ffd97a, #e0b44c); background-size: 200% 100%; animation: paGlow 2.4s linear infinite; box-shadow: 0 0 18px rgba(224,180,76,.35); }
  @keyframes paGlow { to { background-position: -200% 0; } }
  #paTray .info { margin: 10px 0 0; font-size: 12px; color: #8a93ad; line-height: 1.55; }
  #paTray canvas { width: 100%; height: 150px; display: block; border-radius: 10px; background: #070b1a; border: 1px solid #1d2547; }
  #paTray .steps { margin-top: 8px; font: 12px var(--mono, monospace); color: #8fa0d0; min-height: 64px; }
  #paTray .steps div { opacity: .35; transition: opacity .3s; } #paTray .steps div.on { opacity: 1; color: #e0b44c; } #paTray .steps div.ok { opacity: .8; color: #2fbf8f; }
  #paTray .think { font: 600 13px var(--mono, monospace); color: #22d3ee; margin: 8px 0 2px; }
  #paTray .think i { display: inline-block; width: 6px; height: 6px; margin-left: 3px; border-radius: 50%; background: #22d3ee; animation: paDot 1s infinite; } #paTray .think i:nth-child(2) { animation-delay: .15s; } #paTray .think i:nth-child(3) { animation-delay: .3s; }
  @keyframes paDot { 50% { opacity: .2; transform: translateY(-3px); } }
  #paTray .act { display: flex; align-items: center; gap: 12px; margin: 10px 0 8px; }
  #paTray .badge { font: 800 24px var(--mono, monospace); padding: 6px 16px; border-radius: 12px; letter-spacing: .05em; animation: paPop .5s cubic-bezier(.2,1.5,.4,1) both; }
  @keyframes paPop { from { transform: scale(.6); opacity: 0; } }
  #paTray .BUY { background: rgba(47,191,143,.16); color: #2fe3a6; border: 1px solid #2fbf8f; box-shadow: 0 0 20px rgba(47,191,143,.3); }
  #paTray .SELL { background: rgba(229,87,107,.16); color: #ff6b82; border: 1px solid #e5576b; box-shadow: 0 0 20px rgba(229,87,107,.3); }
  #paTray .WAIT { background: rgba(138,147,173,.14); color: #c9d1ea; border: 1px solid #56607f; }
  #paTray .conf { flex: 1; } #paTray .conf small { font-size: 11px; color: #8a93ad; }
  #paTray .conf .bar { height: 6px; border-radius: 6px; background: #1b2240; overflow: hidden; margin-top: 4px; } #paTray .conf .bar i { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, #e0b44c, #ffd97a); transition: width .8s ease; }
  #paTray .pat { font-weight: 700; font-size: 14px; color: #ffd97a; }
  #paTray p { margin: 4px 0; font-size: 13px; line-height: 1.55; }
  #paTray .plan { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 8px 0; }
  #paTray .plan div { background: #11183a; border: 1px solid #1f2850; border-radius: 9px; padding: 6px 4px; text-align: center; font: 600 13px var(--mono, monospace); }
  #paTray .plan small { display: block; font: 10px var(--sans, sans-serif); color: #8a93ad; margin-bottom: 2px; }
  #paTray ul { margin: 6px 0; padding-left: 18px; font-size: 13px; line-height: 1.55; }
  #paTray .warn { font-size: 12px; color: #f0a35b; } #paTray .muted { font-size: 11px; color: #6f7896; margin-top: 8px; }
  #paTray .row2 { display: flex; gap: 8px; margin-top: 10px; } #paTray .row2 button { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid #2a3358; background: #141b3a; color: #e8ecf6; font-size: 13px; }
  #paTray .err { color: #ff6b82; font-size: 13px; margin: 10px 0; }
  #paTray .grab { position: absolute; left: 50%; bottom: 5px; width: 40px; height: 4px; margin-left: -20px; border-radius: 4px; background: #2a3358; }`;
  document.head.appendChild(css);
  const tray = document.createElement('div');
  tray.id = 'paTray'; tray.setAttribute('aria-hidden', 'true');
  tray.innerHTML = `<div class="hd"><b>🤖 AI Price Action</b><span class="sub" id="paSub"></span><button class="x" id="paX" aria-label="ปิดถาด">✕</button></div><div class="bd" id="paBd"></div><div class="grab"></div>`;
  document.body.appendChild(tray);

  // ---------- ข้อมูลกราฟสด ----------
  let news = [];
  async function loadNews() {
    try {
      const own = location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : 'OI-GOLD-PRO';
      const j = await (await fetch(`https://raw.githubusercontent.com/${own}/gold-oi-pro/main/news.json?t=${Math.floor(Date.now() / 300000)}`, { cache: 'no-store' })).json();
      news = (j.events || []).filter(e => e.c === 'USD' && (e.i || 'H') === 'H').map(e => ({ t: e.title, ms: Date.parse(e.date), f: e.forecast })).filter(e => isFinite(e.ms));
    } catch (e) {}
  }
  const ema = (arr, n) => { const k = 2 / (n + 1); let e = null; arr.forEach(v => { e = e === null ? v : v * k + e * (1 - k); }); return e; };

  function levelsNow(px) {
    const L = [], oi = O.oi, live = window.OILive && window.OILive.calc;
    const add = (name, p) => { if (p !== null && p !== undefined && isFinite(p)) L.push({ name, p: Math.round(p * 100) / 100, dist: Math.round((p - px) * 100) / 100 }); };
    const iv = window.OI_intraday && window.OI_intraday.result;
    if (iv && iv.L) { add('Call Wall', iv.L.cw); add('Put Wall', iv.L.pw); }
    else if (live && live.strikes) {
      let bc = 0, bp = 0, cw = null, pw = null;
      live.strikes.forEach(s => { const gc = (s.gC || 0) * s.c, gp = (s.gP || 0) * s.p; if (s.k >= px - 10 && gc > bc) { bc = gc; cw = s.k; } if (s.k <= px + 10 && gp > bp) { bp = gp; pw = s.k; } });
      add('Call Wall', cw); add('Put Wall', pw);
    }
    if (live && live.openEM) { add('ขอบบน EM', live.openF + live.openEM); add('ขอบล่าง EM', live.openF - live.openEM); }
    if (oi) {
      (oi.gmf || []).forEach(g => add(g.lab, g.p));
      add('Max Pain', oi.maxPain);
      (oi.rows || []).forEach(r => {
        const rc = oi.rankC && oi.rankC.get(r.strike), rp = oi.rankP && oi.rankP.get(r.strike);
        if ((rc && rc <= 5) || (rp && rp <= 5)) add(`โซน OI ${r.strike} (Call ${r.c} / Put ${r.p})`, r.price);
        if (oi.topV && oi.topV.includes(r.strike)) add(`เส้น Volume ${r.strike} (C${r.vc || 0}/P${r.vp || 0})`, r.price);
      });
    }
    return L.filter(l => Math.abs(l.dist) <= 120).sort((a, b) => b.p - a.p);
  }

  // ตรวจรูปแบบ Price Action แบบตายตัว (ให้ AI ใช้เป็นข้อเท็จจริง ไม่ต้องอ่านตัวเลขเอง)
  function patterns(B, atr, levels) {
    const out = [], n = B.length;
    const near = (b, side) => { const tol = Math.max(2, atr * 0.5); const hit = levels.filter(l => side > 0 ? Math.abs(b.low - l.p) <= tol || (b.low < l.p && b.close > l.p) : Math.abs(b.high - l.p) <= tol || (b.high > l.p && b.close < l.p)); return hit.length ? hit.map(l => l.name).slice(0, 2).join(', ') : null; };
    for (let k = 1; k <= 3; k++) {
      const i = n - 1 - k; if (i < 21) break;
      const b = B[i], p = B[i - 1], rng = b.high - b.low; if (rng <= 0) continue;
      const body = Math.abs(b.close - b.open), up = b.high - Math.max(b.open, b.close), dn = Math.min(b.open, b.close) - b.low;
      const tag = k === 1 ? 'แท่งล่าสุดที่ปิด' : `ย้อนหลัง ${k} แท่ง`, t = hhmm(b.time);
      const push = (name, dir, side) => out.push({ bar: tag, time: t, name, dir, at: side ? near(b, side) : null });
      if (dn >= 0.6 * rng && body <= 0.35 * rng) push('Pin Bar ขาขึ้น (ไส้ล่างยาว ปฏิเสธราคาต่ำ)', 'up', 1);
      if (up >= 0.6 * rng && body <= 0.35 * rng) push('Pin Bar ขาลง (ไส้บนยาว ปฏิเสธราคาสูง)', 'down', -1);
      const pb = Math.abs(p.close - p.open);
      if (b.close > b.open && p.close < p.open && b.close >= Math.max(p.open, p.close) && b.open <= Math.min(p.open, p.close) && body > pb) push('Bullish Engulfing', 'up', 1);
      if (b.close < b.open && p.close > p.open && b.close <= Math.min(p.open, p.close) && b.open >= Math.max(p.open, p.close) && body > pb) push('Bearish Engulfing', 'down', -1);
      if (b.high < p.high && b.low > p.low) push('Inside Bar (บีบตัว รอเบรก)', 'side');
      if (b.high > p.high && b.low < p.low && body >= 0.5 * rng) push(`Outside Bar ${b.close > b.open ? 'ปิดเขียว' : 'ปิดแดง'}`, b.close > b.open ? 'up' : 'down', b.close > b.open ? 1 : -1);
      if (body <= 0.1 * rng && rng >= atr * 0.6) push('Doji (ลังเล)', 'side');
      if (body >= 0.8 * rng && rng >= atr * 1.2) push(`แท่งแรง (Marubozu) ${b.close > b.open ? 'ขาขึ้น' : 'ขาลง'} ใหญ่กว่า ATR`, b.close > b.open ? 'up' : 'down');
      const hh = Math.max(...B.slice(i - 20, i).map(x => x.high)), ll = Math.min(...B.slice(i - 20, i).map(x => x.low));
      if (b.close > hh) push('ปิดทะลุ High 20 แท่ง (Breakout)', 'up');
      if (b.close < ll) push('ปิดหลุด Low 20 แท่ง (Breakdown)', 'down');
      if (b.high > hh && b.close < hh) push('กวาด High 20 แท่งแล้วปิดกลับ (Liquidity Sweep บน)', 'down', -1);
      if (b.low < ll && b.close > ll) push('กวาด Low 20 แท่งแล้วปิดกลับ (Liquidity Sweep ล่าง)', 'up', 1);
    }
    return out;
  }

  function snapshot() {
    const B = (O.series.data() || []).filter(b => isFinite(b.close));
    if (B.length < 30) return null;
    const vol = new Map((O.rawBars || []).map(k => [Math.floor(k[0] / 1000) + TZ, k[5] || 0]));
    const px = B[B.length - 1].close;
    const closed = B.slice(0, -1);
    let atr = 0; { const s = closed.slice(-15); for (let i = 1; i < s.length; i++) atr += Math.max(s[i].high - s[i].low, Math.abs(s[i].high - s[i - 1].close), Math.abs(s[i].low - s[i - 1].close)); atr = atr / Math.max(1, s.length - 1); }
    // VWAP วันเทรด (เริ่ม 05:00 ไทย)
    let vwap = null; { const day = Math.floor((B[B.length - 1].time - SESS) / 86400); let pv = 0, vv = 0; B.forEach(b => { if (Math.floor((b.time - SESS) / 86400) !== day) return; const v = vol.get(b.time) || 0; pv += (b.high + b.low + b.close) / 3 * v; vv += v; }); if (vv > 0) vwap = pv / vv; }
    const iv = window.OI_intraday && window.OI_intraday.result; if (iv && iv.vwapNow) vwap = iv.vwapNow;
    const levels = levelsNow(px); if (vwap) levels.push({ name: 'VWAP วันนี้', p: Math.round(vwap * 100) / 100, dist: Math.round((vwap - px) * 100) / 100 });
    levels.sort((a, b) => b.p - a.p);
    const last = B.slice(-40);
    const sw = closed.slice(-30), hi = sw.reduce((a, b) => b.high > a.high ? b : a), lo = sw.reduce((a, b) => b.low < a.low ? b : a);
    const nowMs = Date.now(), nx = news.filter(e => e.ms > nowMs - 30 * 60e3 && e.ms < nowMs + 3 * 3600e3).sort((a, b) => a.ms - b.ms)[0];
    const lastBarAgeMin = Math.round((nowMs / 1000 + TZ - B[B.length - 1].time) / 60);
    return {
      sym: (O.cfg && O.cfg.name) || 'XAUUSD', tf: TFN[O.tf] || O.tf, time_th: new Date(nowMs + TZ * 1000).toISOString().slice(0, 16).replace('T', ' '),
      price: Math.round(px * 100) / 100, atr: Math.round(atr * 100) / 100,
      ema20: Math.round(ema(closed.map(b => b.close), 20) * 100) / 100, ema50: Math.round(ema(closed.map(b => b.close), 50) * 100) / 100,
      vwap: vwap ? Math.round(vwap * 100) / 100 : null,
      swing_30: { high: hi.high, high_time: hhmm(hi.time), low: lo.low, low_time: hhmm(lo.time) },
      patterns: patterns(B, atr, levels),
      levels, nearest_above: levels.filter(l => l.p > px).slice(-1)[0] || null, nearest_below: levels.filter(l => l.p < px)[0] || null,
      market: lastBarAgeMin > 30 ? `ตลาดปิดอยู่ ข้อมูลล่าสุดเมื่อ ${lastBarAgeMin} นาทีก่อน (วิเคราะห์เพื่อเตรียมแผนตอนตลาดเปิด)` : 'ตลาดเปิด ข้อมูลสด',
      red_news: nx ? { title: nx.t, minutes_from_now: Math.round((nx.ms - nowMs) / 60e3), forecast: nx.f || null } : null,
      bars_note: 'bars: [เวลาไทย, open, high, low, close, volume] เก่า→ใหม่ แท่งสุดท้ายยังไม่ปิด',
      bars: last.map(b => [hhmm(b.time), +b.open.toFixed(2), +b.high.toFixed(2), +b.low.toFixed(2), +b.close.toFixed(2), vol.get(b.time) || 0]),
      _draw: last, // ใช้วาดในถาด (ไม่ส่งไปเซิร์ฟเวอร์)
    };
  }

  // ---------- วาดกราฟในถาด ----------
  function drawMini(cv, bars, upto, scanX, plan, lvls) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    // กริด
    g.strokeStyle = 'rgba(120,140,200,.08)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 24) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, H); g.stroke(); }
    for (let y = 0; y < H; y += 24) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(W, y + .5); g.stroke(); }
    const vis = bars.slice(Math.max(0, upto - 40), upto); if (!vis.length) return;
    let hi = Math.max(...vis.map(b => b.high)), lo = Math.min(...vis.map(b => b.low));
    if (plan) [plan.sl, plan.tp1, plan.tp2, plan.entry].forEach(v => { if (v) { hi = Math.max(hi, v); lo = Math.min(lo, v); } });
    const pad = (hi - lo) * 0.08 || 1; hi += pad; lo -= pad;
    const R = 46, cw = (W - R) / 40, y = p => (hi - p) / (hi - lo) * H;
    (lvls || []).forEach(l => { if (l.p < lo || l.p > hi) return; const yy = Math.round(y(l.p)) + .5; g.setLineDash([3, 4]); g.strokeStyle = 'rgba(224,180,76,.28)'; g.beginPath(); g.moveTo(0, yy); g.lineTo(W - R, yy); g.stroke(); g.setLineDash([]); });
    vis.forEach((b, i) => {
      const x = i * cw + cw / 2, up = b.close >= b.open, col = up ? '#2fbf8f' : '#e5576b';
      g.strokeStyle = col; g.beginPath(); g.moveTo(Math.round(x) + .5, y(b.high)); g.lineTo(Math.round(x) + .5, y(b.low)); g.stroke();
      g.fillStyle = col; const t = y(Math.max(b.open, b.close)), bt = y(Math.min(b.open, b.close)); g.fillRect(x - cw * 0.32, t, cw * 0.64, Math.max(1, bt - t));
    });
    if (plan) {
      const row = (v, c, lab, dash) => { if (!v) return; const yy = Math.round(y(v)) + .5; g.setLineDash(dash || []); g.strokeStyle = c; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, yy); g.lineTo(W - R, yy); g.stroke(); g.setLineDash([]); g.lineWidth = 1; g.fillStyle = c; g.font = '600 10px ui-monospace, monospace'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(lab, W - R + 3, yy); };
      row(plan.tp2, '#2fe3a6', 'TP2', [4, 3]); row(plan.tp1, '#2fe3a6', 'TP1', [4, 3]); row(plan.entry, '#ffd97a', 'Entry'); row(plan.sl, '#ff6b82', 'SL', [2, 2]);
    }
    const lastB = vis[vis.length - 1]; g.fillStyle = '#e0b44c'; g.font = '600 10px ui-monospace, monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
    if (!plan) g.fillText(lastB.close.toFixed(2), W - R + 3, y(lastB.close));
    if (scanX !== null && scanX !== undefined) {
      const gr = g.createLinearGradient(scanX - 50, 0, scanX, 0); gr.addColorStop(0, 'rgba(34,211,238,0)'); gr.addColorStop(1, 'rgba(34,211,238,.35)');
      g.fillStyle = gr; g.fillRect(scanX - 50, 0, 50, H); g.fillStyle = '#22d3ee'; g.fillRect(scanX, 0, 1.5, H);
    }
  }

  // ---------- สถานะถาด ----------
  let snap = null, result = null, busy = false, anim = 0, showPlan = true;
  const bd = () => $('paBd');
  function paintIdle() {
    $('paSub').textContent = `${(O.cfg && O.cfg.name) || ''} · ${TFN[O.tf] || O.tf}`;
    bd().innerHTML = `<button class="go" id="paGo">⚡ วิเคราะห์จังหวะเข้าตอนนี้</button>
      <div class="info">AI จะอ่านแท่งเทียน ${TFN[O.tf] || O.tf} ล่าสุด 40 แท่ง + Price Action ที่ระบบตรวจเจอ + แนว OI / EM / gmf / VWAP ณ ตอนกด แล้วบอกว่าควร BUY / SELL หรือรอ<br>เปลี่ยน TF ที่กราฟก่อนกด เพื่อให้วิเคราะห์ TF นั้น</div>` + (result ? resultHTML(result, true) : '');
    $('paGo').onclick = run;
    if (result) bindResult();
  }
  function resultHTML(r, old) {
    const conf = r.confidence || 0;
    return `${old ? '<div class="muted">ผลล่าสุด</div>' : ''}<div class="act"><span class="badge ${r.action}">${r.action === 'WAIT' ? 'รอ' : r.action}</span>
      <div class="conf"><small>ความมั่นใจ ${conf}% · ${esc(r.tf)} · ${esc((r.time_th || '').slice(11))} น. · ราคา ${f2(r.price)}</small><div class="bar"><i style="width:${old ? conf : 0}%"></i></div></div></div>
      <div class="pat">${esc(r.pattern)}</div><p>${esc(r.pa)}</p><p style="color:#a9b4d6">${esc(r.context)}</p>
      ${r.entry || r.sl || r.tp1 ? `<div class="plan"><div><small>${r.action === 'WAIT' ? 'รอเข้า' : 'Entry'}</small>${f2(r.entry)}</div><div><small>SL</small><span style="color:#ff6b82">${f2(r.sl)}</span></div><div><small>TP1</small><span style="color:#2fe3a6">${f2(r.tp1)}</span></div><div><small>TP2${r.rr ? ' · R:R 1:' + r.rr : ''}</small><span style="color:#2fe3a6">${f2(r.tp2)}</span></div></div>` : ''}
      ${r.reasons && r.reasons.length ? `<ul>${r.reasons.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${r.wait_for && r.action === 'WAIT' ? `<p>⏳ ${esc(r.wait_for)}</p>` : ''}${r.invalid ? `<p class="warn">⚠️ ${esc(r.invalid)}</p>` : ''}${r.checked ? `<p class="warn">${esc(r.checked)}</p>` : ''}
      <div class="row2"><button id="paPlan">${showPlan ? '🧹 ซ่อนแผนบนกราฟ' : '📍 แสดงแผนบนกราฟ'}</button><button id="paAgain">🔄 วิเคราะห์ใหม่</button></div>
      <div class="muted">วิเคราะห์โดย DeepSeek จากกราฟ ณ เวลาที่กด · ใช้ประกอบการตัดสินใจ ไม่ใช่คำแนะนำการลงทุน</div>`;
  }
  function bindResult() {
    const p = $('paPlan'), a = $('paAgain');
    if (p) p.onclick = () => { showPlan = !showPlan; O.markDirty(); p.textContent = showPlan ? '🧹 ซ่อนแผนบนกราฟ' : '📍 แสดงแผนบนกราฟ'; };
    if (a) a.onclick = run;
  }

  async function run() {
    if (busy) return;
    if (!news.length) loadNews();
    snap = snapshot();
    if (!snap) { O.showToast && O.showToast('ข้อมูลกราฟยังไม่พอ รอกราฟโหลดก่อน'); return; }
    busy = true;
    const draw = snap._draw, pats = snap.patterns;
    const patTxt = pats.length ? pats.slice(0, 2).map(p => p.name.split(' (')[0]).join(' + ') : 'ไม่พบรูปแบบชัด';
    const steps = [`▸ อ่านแท่งเทียน ${snap.tf} 40 แท่ง · ATR ${f2(snap.atr)}`, `▸ Price Action: ${patTxt}`, `▸ เทียบแนว ${snap.levels.length} ระดับ (OI / EM / gmf / VWAP)`, '▸ DeepSeek กำลังตัดสินใจ…'];
    bd().innerHTML = `<canvas id="paCv"></canvas><div class="think">AI กำลังวิเคราะห์<i></i><i></i><i></i></div><div class="steps">${steps.map(s => `<div>${esc(s)}</div>`).join('')}</div>`;
    const cv = $('paCv'), st = [...bd().querySelectorAll('.steps div')];
    // กราฟวิ่งไวๆ: เลื่อนจากแท่งเก่าไปล่าสุด แล้วสแกนซ้ำ จนกว่าผลจะมา
    const all = (O.series.data() || []).slice(-160), t0 = performance.now(), lv = snap.levels;
    cancelAnimationFrame(anim);
    const loop = now => {
      const el = now - t0, cyc = el % 2600;
      const upto = cyc < 1500 ? Math.max(1, Math.round(40 + (all.length - 40) * (cyc / 1500))) : all.length;
      const W = cv.clientWidth - 46, scan = cyc >= 1500 ? (cyc - 1500) / 1100 * W : null;
      drawMini(cv, all, Math.min(all.length, upto), scan, null, cyc >= 1500 ? lv : null);
      const k = Math.min(3, Math.floor(el / 900));
      st.forEach((d, i) => { d.className = i < k ? 'ok' : i === k ? 'on' : ''; });
      anim = requestAnimationFrame(loop);
    };
    anim = requestAnimationFrame(loop);
    const payload = Object.assign({}, snap); delete payload._draw;
    const [res] = await Promise.all([O.aiCall('ai_pa', payload, 90000), new Promise(r => setTimeout(r, 2800))]);
    cancelAnimationFrame(anim); busy = false;
    if (!res || !res.ok) {
      bd().innerHTML = `<div class="err">วิเคราะห์ไม่สำเร็จ: ${esc(res && res.error === 'auth' ? 'รหัสเข้าแอปหมดอายุ' : (res && res.error) || 'ไม่ทราบสาเหตุ')}</div><button class="go" id="paGo">ลองใหม่</button>`;
      $('paGo').onclick = run; return;
    }
    result = res.pa; result.at = Date.now(); showPlan = result.action !== 'WAIT' || !!result.entry;
    bd().innerHTML = `<canvas id="paCv"></canvas>` + resultHTML(result, false);
    drawMini($('paCv'), draw, draw.length, null, result, null);
    requestAnimationFrame(() => { const i = bd().querySelector('.conf .bar i'); if (i) i.style.width = (result.confidence || 0) + '%'; });
    bindResult(); O.markDirty();
    if (O.beep && result.action !== 'WAIT') O.beep();
  }

  // ---------- แผนบนกราฟหลัก (30 นาที) ----------
  O.hooks.push((ctx, w, h) => {
    const r = result; if (!r || !showPlan || Date.now() - r.at > 30 * 60e3) return;
    const ts = O.chart.timeScale(), sr = O.series, plotW = ts.width(), plotH = h - ts.height();
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace';
    ctx.save();
    const row = (v, c, lab, dash) => { if (!v) return; const yy = sr.priceToCoordinate(v); if (yy === null || yy < 0 || yy > plotH) return; ctx.globalAlpha = .95; ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(plotW * 0.45, Math.round(yy) + .5); ctx.lineTo(plotW, Math.round(yy) + .5); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = c; ctx.font = `bold 9px ${mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(`🤖 ${lab} ${v.toFixed(2)}`, plotW * 0.45 - 4, yy + 4); };
    const tag = r.action === 'WAIT' ? 'รอเข้า' : r.action;
    row(r.tp2, '#2fe3a6', 'TP2', [5, 3]); row(r.tp1, '#2fe3a6', 'TP1', [5, 3]); row(r.entry, '#ffd97a', tag); row(r.sl, '#ff6b82', 'SL', [2, 2]);
    ctx.restore();
  });

  // ---------- เปิด/ปิดถาด ----------
  function open() { if (tray.classList.contains('open')) return; tray.classList.add('open'); tray.setAttribute('aria-hidden', 'false'); if (!busy) paintIdle(); loadNews(); try { navigator.vibrate && navigator.vibrate(10); } catch (e) {} }
  function close() { tray.classList.remove('open'); tray.setAttribute('aria-hidden', 'true'); }
  $('paX').onclick = close;
  // ปัดขวาบนถาด = ปิด
  let tx = null;
  tray.addEventListener('touchstart', e => { if (e.touches.length === 1) tx = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }; }, { passive: true });
  tray.addEventListener('touchend', e => { if (!tx) return; const t = e.changedTouches[0], dx = t.clientX - tx.x, dy = t.clientY - tx.y; if (dx > 70 && Math.abs(dy) < Math.abs(dx) * 0.6 && Date.now() - tx.t < 600) close(); tx = null; }, { passive: true });

  // ปัดซ้ายที่ข้อความ "OI · Powered by … · V…" บนหัวแอป = เปิดถาด (ใช้ได้ทั้งนิ้วและเมาส์)
  const src = $('src');
  if (src) {
    const st2 = document.createElement('style');
    st2.textContent = '#src { touch-action: pan-y; padding: 10px 0; margin: -10px 0; cursor: grab; -webkit-user-select: none; user-select: none; }';
    document.head.appendChild(st2);
    let g = null;
    src.addEventListener('pointerdown', e => { g = { x: e.clientX, y: e.clientY, t: Date.now() }; }, { passive: true });
    const end = e => {
      if (!g) return; const dx = e.clientX - g.x, dy = e.clientY - g.y, dt = Date.now() - g.t; g = null;
      if (dx < -40 && Math.abs(dy) < Math.abs(dx) * 0.7 && dt < 800) open();
    };
    src.addEventListener('pointerup', end, { passive: true });
    src.addEventListener('pointercancel', end, { passive: true });
    src.addEventListener('pointerleave', e => { if (g && e.pointerType === 'mouse') end(e); }, { passive: true });
  }

  window.OI_aitray = { open, close, get result() { return result; }, snapshot };
})();
