// ถาดลับ AI Price Action: ปัดซ้ายที่ข้อความ "OI · Powered by … · V…" บนหัวแอป → ถาดสไลด์ออกมาครึ่งจอบน
// กดปุ่ม → แอนิเมชัน AI + กราฟวิ่ง → DeepSeek อ่านกราฟสด ณ ตอนนั้น (แท่งเทียน + Price Action ที่ระบบตรวจไว้ + แนว OI/EM/gmf/GEX) → ควรเข้าออเดอร์ไหม
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
  #paTray .sideQ { margin: 12px 0 4px; padding: 10px; border: 1px solid #2a3358; border-radius: 12px; background: #0f1533; }
  #paTray .sideQ > b { display: block; font-size: 13px; margin-bottom: 8px; text-align: center; color: #c9d1ea; }
  #paTray .sides { display: flex; gap: 10px; }
  #paTray .sb { flex: 1; padding: 12px 6px; border-radius: 12px; font: 800 19px var(--mono, monospace); letter-spacing: .05em; display: flex; flex-direction: column; align-items: center; gap: 1px; transition: transform .15s, box-shadow .2s; }
  #paTray .sb small { font: 600 11px var(--sans, sans-serif); letter-spacing: 0; opacity: .85; }
  #paTray .sb:active { transform: scale(.96); }
  #paTray .sb.buy { background: rgba(47,191,143,.14); color: #2fe3a6; border: 1px solid #2fbf8f; }
  #paTray .sb.sell { background: rgba(229,87,107,.14); color: #ff6b82; border: 1px solid #e5576b; }
  #paTray .sb.buy.on { background: rgba(47,191,143,.3); box-shadow: 0 0 18px rgba(47,191,143,.45); }
  #paTray .sb.sell.on { background: rgba(229,87,107,.3); box-shadow: 0 0 18px rgba(229,87,107,.45); }
  #paTray .sides.busy .sb { opacity: .5; }
  #paTray .sres { margin-top: 10px; }
  #paTray .spk { display: flex; gap: 6px; margin: 6px 0; }
  #paTray .spk button { padding: 7px 12px; border-radius: 10px; border: 1px solid #2a3358; background: #141b3a; color: #e8ecf6; font-size: 13px; }
  #paTray .spk button[data-spk] { flex: 1; border-color: #22d3ee; color: #7fe9fb; }
  #paTray .spk button.on { background: rgba(34,211,238,.18); box-shadow: 0 0 14px rgba(34,211,238,.35); animation: paSpk 1.2s ease-in-out infinite; }
  @keyframes paSpk { 50% { box-shadow: 0 0 4px rgba(34,211,238,.2); } }
  #paTray .sw .swv { position: relative; border-radius: 12px; overflow: hidden; }
  #paTray .sw canvas { height: 140px; }
  #paTray .sw.b canvas { border-color: #2fbf8f; box-shadow: inset 0 0 30px rgba(47,191,143,.25), 0 0 16px rgba(47,191,143,.25); }
  #paTray .sw.s canvas { border-color: #e5576b; box-shadow: inset 0 0 30px rgba(229,87,107,.25), 0 0 16px rgba(229,87,107,.25); }
  #paTray .arw { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 14px; pointer-events: none; }
  #paTray .arw span { font: 900 46px var(--mono, monospace); opacity: 0; }
  #paTray .sw.b .arw span { color: #2fe3a6; text-shadow: 0 0 18px #2fe3a6, 0 0 36px rgba(47,227,166,.6); animation: paUp 1.5s ease-in-out infinite; }
  #paTray .sw.s .arw span { color: #ff6b82; text-shadow: 0 0 18px #ff6b82, 0 0 36px rgba(255,107,130,.6); animation: paDn 1.5s ease-in-out infinite; }
  #paTray .arw span:nth-child(2) { animation-delay: .25s !important; } #paTray .arw span:nth-child(3) { animation-delay: .5s !important; }
  @keyframes paUp { 0% { opacity: 0; transform: translateY(40px) scale(.7); } 40% { opacity: .95; } 100% { opacity: 0; transform: translateY(-46px) scale(1.15); } }
  @keyframes paDn { 0% { opacity: 0; transform: translateY(-40px) scale(.7); } 40% { opacity: .95; } 100% { opacity: 0; transform: translateY(46px) scale(1.15); } }
  #paTray .ring { position: absolute; left: 50%; top: 50%; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%; pointer-events: none; animation: paRing 1.8s linear infinite; }
  #paTray .sw.b .ring { border: 2px solid transparent; border-top-color: #2fe3a6; border-right-color: rgba(47,227,166,.3); }
  #paTray .sw.s .ring { border: 2px solid transparent; border-top-color: #ff6b82; border-right-color: rgba(255,107,130,.3); }
  @keyframes paRing { to { transform: rotate(360deg); } }
  #paTray .sw .think { color: inherit; } #paTray .sw.b .think { color: #2fe3a6; } #paTray .sw.s .think { color: #ff6b82; }
  #paTray .sw.b .think i { background: #2fe3a6; } #paTray .sw.s .think i { background: #ff6b82; }
  #paTray .sw .ctr { text-align: center; font-size: 12px; color: #8a93ad; margin-top: 2px; } #paTray .sw .ctr b { font: 800 22px var(--mono, monospace); color: #ffd97a; }
  #paTray .vd { display: flex; align-items: center; gap: 10px; }
  #paTray .vd .v { font: 800 15px var(--sans, sans-serif); padding: 6px 12px; border-radius: 10px; white-space: nowrap; animation: paPop .5s cubic-bezier(.2,1.5,.4,1) both; }
  #paTray .v.GO { background: rgba(47,191,143,.18); color: #2fe3a6; border: 1px solid #2fbf8f; }
  #paTray .v.WAIT { background: rgba(240,163,91,.16); color: #f0b46b; border: 1px solid #c98a45; }
  #paTray .v.NO { background: rgba(229,87,107,.18); color: #ff6b82; border: 1px solid #e5576b; }
  #paTray .prob { flex: 1; } #paTray .prob small { font-size: 11px; color: #8a93ad; } #paTray .prob small b { font: 700 15px var(--mono, monospace); color: #ffd97a; }
  #paTray .prob .bar { height: 7px; border-radius: 7px; background: #1b2240; overflow: hidden; margin-top: 4px; } #paTray .prob .bar i { display: block; height: 100%; width: 0; border-radius: 7px; transition: width .9s ease; }
  #paTray .pc { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
  #paTray .pc > div { background: #11183a; border: 1px solid #1f2850; border-radius: 9px; padding: 6px 8px; font-size: 12px; line-height: 1.5; }
  #paTray .pc ul { margin: 2px 0 0; padding-left: 15px; font-size: 12px; }
  @media (max-width: 360px) { #paTray .pc { grid-template-columns: 1fr; } }
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

  // Absorption (แอบซอร์บชัน): Volume สูงแต่ราคาไปไม่ไกล = มีออเดอร์ใหญ่รอรับ (ความพยายามมาก ผลลัพธ์น้อย แบบ Wyckoff)
  // เกณฑ์: Volume ≥ 1.5 เท่าค่าเฉลี่ย 20 แท่งก่อนหน้า + (เนื้อเทียน ≤ 35% ของแท่ง หรือ ทั้งแท่งแคบ ≤ 0.8 ATR)
  // ฝั่ง: ไส้ล่างยาวกว่า = ฝั่งซื้อรับแรงขาย (หนุนขึ้น) · ไส้บนยาวกว่า = ฝั่งขายรับแรงซื้อ (กดลง)
  function absorption(B, vol, atr, levels) {
    const n = B.length - 1, V = B.map(b => vol.get(b.time) || 0); // แท่งสุดท้ายยังไม่ปิด ไม่นับ
    if (V.slice(-41, -1).filter(v => v > 0).length < 20) return { note: 'ไม่มีข้อมูล Volume พอ' };
    const list = [];
    for (let i = Math.max(21, n - 40); i < n; i++) {
      const b = B[i], rng = b.high - b.low; if (rng <= 0 || !V[i]) continue;
      const avg = V.slice(i - 20, i).reduce((a, x) => a + x, 0) / 20; if (!avg) continue;
      const rv = V[i] / avg, body = Math.abs(b.close - b.open), up = b.high - Math.max(b.open, b.close), dn = Math.min(b.open, b.close) - b.low;
      if (rv < 1.5 || !(body <= 0.35 * rng || rng <= 0.8 * atr)) continue;
      const side = dn > up * 1.2 ? 'buy' : up > dn * 1.2 ? 'sell' : 'both';
      const score = Math.min(100, Math.round(Math.min(rv, 4) / 4 * 55 + (1 - body / rng) * 30 + (rng <= 0.8 * atr ? 15 : 0)));
      const tol = Math.max(2, atr * 0.5), at = levels.filter(l => l.p >= b.low - tol && l.p <= b.high + tol).map(l => l.name).slice(0, 2).join(', ') || null;
      list.push({ time: hhmm(b.time), ago: n - i, rvol: Math.round(rv * 10) / 10, side, score, price: Math.round((side === 'buy' ? b.low : side === 'sell' ? b.high : (b.high + b.low) / 2) * 100) / 100, at });
    }
    const last10 = list.filter(x => x.ago <= 10), buy = list.filter(x => x.side === 'buy').length, sell = list.filter(x => x.side === 'sell').length;
    return {
      rate_40_pct: Math.round(list.length / 40 * 100), count_40: list.length, count_last10: last10.length, buy_side: buy, sell_side: sell,
      bias: buy > sell * 1.5 ? 'ฝั่งซื้อรับ (หนุนขึ้น)' : sell > buy * 1.5 ? 'ฝั่งขายรับ (กดลง)' : list.length ? 'ทั้งสองฝั่ง' : 'ไม่พบ',
      latest: list.slice(-4).reverse(),
      note: 'คำนวณจาก Volume ของ perp (ไม่ใช่ Volume CME) และไม่มีข้อมูลฝั่ง bid/ask จึงเป็นการประมาณจากรูปแท่ง + Volume',
    };
  }

  function snapshot() {
    const B = (O.series.data() || []).filter(b => isFinite(b.close));
    if (B.length < 30) return null;
    const vol = new Map((O.rawBars || []).map(k => [Math.floor(k[0] / 1000) + TZ, k[5] || 0]));
    const px = B[B.length - 1].close;
    const closed = B.slice(0, -1);
    let atr = 0; { const s = closed.slice(-15); for (let i = 1; i < s.length; i++) atr += Math.max(s[i].high - s[i].low, Math.abs(s[i].high - s[i - 1].close), Math.abs(s[i].low - s[i - 1].close)); atr = atr / Math.max(1, s.length - 1); }
    const levels = levelsNow(px); // ไม่ใช้ VWAP
    levels.sort((a, b) => b.p - a.p);
    const last = B.slice(-40);
    const sw = closed.slice(-30), hi = sw.reduce((a, b) => b.high > a.high ? b : a), lo = sw.reduce((a, b) => b.low < a.low ? b : a);
    const nowMs = Date.now(), nx = news.filter(e => e.ms > nowMs - 30 * 60e3 && e.ms < nowMs + 3 * 3600e3).sort((a, b) => a.ms - b.ms)[0];
    const lastBarAgeMin = Math.round((nowMs / 1000 + TZ - B[B.length - 1].time) / 60);
    return {
      sym: (O.cfg && O.cfg.name) || 'XAUUSD', tf: TFN[O.tf] || O.tf, time_th: new Date(nowMs + TZ * 1000).toISOString().slice(0, 16).replace('T', ' '),
      price: Math.round(px * 100) / 100, atr: Math.round(atr * 100) / 100,
      swing_30: { high: hi.high, high_time: hhmm(hi.time), low: lo.low, low_time: hhmm(lo.time) },
      patterns: patterns(B, atr, levels),
      absorption: absorption(B, vol, atr, levels),
      levels, nearest_above: levels.filter(l => l.p > px).slice(-1)[0] || null, nearest_below: levels.filter(l => l.p < px)[0] || null,
      market: lastBarAgeMin > 30 ? `ตลาดปิดอยู่ ข้อมูลล่าสุดเมื่อ ${lastBarAgeMin} นาทีก่อน (วิเคราะห์เพื่อเตรียมแผนตอนตลาดเปิด)` : 'ตลาดเปิด ข้อมูลสด',
      red_news: nx ? { title: nx.t, minutes_from_now: Math.round((nx.ms - nowMs) / 60e3), forecast: nx.f || null } : null,
      bars_note: 'bars: [เวลาไทย, open, high, low, close, volume] เก่า→ใหม่ แท่งสุดท้ายยังไม่ปิด',
      bars: last.map(b => [hhmm(b.time), +b.open.toFixed(2), +b.high.toFixed(2), +b.low.toFixed(2), +b.close.toFixed(2), vol.get(b.time) || 0]),
      _draw: last, // ใช้วาดในถาด (ไม่ส่งไปเซิร์ฟเวอร์)
    };
  }

  // ---------- หลายไทม์เฟรม (เน้นเทรดในวัน): H4 = ทิศใหญ่, H1 = โครงสร้าง, M15 = จุดตั้งเทรด, M5 = จังหวะเข้า ----------
  const atrOf = (cl, n) => { const s = cl.slice(-(n + 1)); let a = 0; for (let i = 1; i < s.length; i++) a += Math.max(s[i].high - s[i].low, Math.abs(s[i].high - s[i - 1].close), Math.abs(s[i].low - s[i - 1].close)); return a / Math.max(1, s.length - 1); };
  function structure(cl) {
    // จุดกลับตัวแบบ fractal 2 แท่งซ้าย-ขวา → เทียบ 2 จุดล่าสุด
    const H = [], L = [];
    for (let i = 2; i < cl.length - 2; i++) {
      const b = cl[i]; if (b.high > cl[i - 1].high && b.high > cl[i - 2].high && b.high >= cl[i + 1].high && b.high >= cl[i + 2].high) H.push(b.high);
      if (b.low < cl[i - 1].low && b.low < cl[i - 2].low && b.low <= cl[i + 1].low && b.low <= cl[i + 2].low) L.push(b.low);
    }
    if (H.length < 2 || L.length < 2) return 'ยังไม่ชัด';
    const hh = H[H.length - 1] > H[H.length - 2], hl = L[L.length - 1] > L[L.length - 2];
    return hh && hl ? 'HH-HL (ขาขึ้น)' : !hh && !hl ? 'LH-LL (ขาลง)' : hh ? 'HH-LL (ขยายกรอบ)' : 'LH-HL (บีบตัว)';
  }
  // ---------- SMC (Smart Money Concepts) แบบตายตัว: Swing, BOS/CHoCH, Order Block, FVG, Premium/Discount, Liquidity ----------
  function smc(cl, atr) {
    const n = cl.length, r2 = v => Math.round(v * 100) / 100;
    if (n < 30) return null;
    // จุด swing แบบ fractal 2 แท่งซ้าย-ขวา
    const sw = [];
    for (let i = 2; i < n - 2; i++) {
      const b = cl[i];
      if (b.high > cl[i - 1].high && b.high > cl[i - 2].high && b.high >= cl[i + 1].high && b.high >= cl[i + 2].high) sw.push({ k: 'H', p: b.high, i });
      if (b.low < cl[i - 1].low && b.low < cl[i - 2].low && b.low <= cl[i + 1].low && b.low <= cl[i + 2].low) sw.push({ k: 'L', p: b.low, i });
    }
    // เดินแท่งทีละแท่ง: ปิดเหนือ swing high ล่าสุดที่ยังไม่ถูกทำลาย = เบรกขึ้น (ทิศเดิมลง → CHoCH, ทิศเดิมขึ้น → BOS)
    let trend = 0, lastH = null, lastL = null; const ev = [], obs = [];
    const swAt = new Map(); sw.forEach(x => { const a = swAt.get(x.i + 2) || []; a.push(x); swAt.set(x.i + 2, a); }); // swing ยืนยันได้หลังผ่านไป 2 แท่ง
    for (let i = 0; i < n; i++) {
      (swAt.get(i) || []).forEach(x => { if (x.k === 'H') lastH = { ...x, broken: false }; else lastL = { ...x, broken: false }; });
      const b = cl[i];
      if (lastH && !lastH.broken && b.close > lastH.p) {
        lastH.broken = true; const kind = trend < 0 ? 'CHoCH' : 'BOS'; trend = 1; ev.push({ kind, dir: 'ขึ้น', level: r2(lastH.p), i });
        // Order Block ขาขึ้น = แท่งแดงสุดท้ายก่อนแรงส่งที่ทำให้เบรก
        for (let j = i - 1; j >= Math.max(0, (lastL ? lastL.i : i - 15)); j--) if (cl[j].close < cl[j].open) { obs.push({ dir: 'bull', top: cl[j].high, bot: cl[j].low, i: j }); break; }
      }
      if (lastL && !lastL.broken && b.close < lastL.p) {
        lastL.broken = true; const kind = trend > 0 ? 'CHoCH' : 'BOS'; trend = -1; ev.push({ kind, dir: 'ลง', level: r2(lastL.p), i });
        for (let j = i - 1; j >= Math.max(0, (lastH ? lastH.i : i - 15)); j--) if (cl[j].close > cl[j].open) { obs.push({ dir: 'bear', top: cl[j].high, bot: cl[j].low, i: j }); break; }
      }
    }
    const ago = i => n - 1 - i, px = cl[n - 1].close;
    // OB ที่ยังไม่ถูกราคากลับมาแตะ (unmitigated)
    const freshOB = d => obs.filter(o => o.dir === d).filter(o => !cl.slice(o.i + 3).some(b => d === 'bull' ? b.low <= o.top : b.high >= o.bot)).slice(-1)[0] || null;
    const ob = d => { const o = freshOB(d); return o ? { top: r2(o.top), bottom: r2(o.bot), bars_ago: ago(o.i) } : null; };
    // FVG (ช่องว่างราคา 3 แท่ง) ที่ยังเติมไม่เต็ม ขนาด ≥ 0.3 ATR
    const fvg = [];
    for (let i = 2; i < n; i++) {
      const a = cl[i - 2], c = cl[i];
      if (c.low > a.high && c.low - a.high >= 0.3 * atr) fvg.push({ dir: 'bull', top: c.low, bot: a.high, i });
      if (c.high < a.low && a.low - c.high >= 0.3 * atr) fvg.push({ dir: 'bear', top: a.low, bot: c.high, i });
    }
    const openFvg = d => fvg.filter(f => f.dir === d && !cl.slice(f.i + 1).some(b => d === 'bull' ? b.low <= f.bot : b.high >= f.top)).slice(-2).map(f => ({ top: r2(f.top), bottom: r2(f.bot), bars_ago: ago(f.i) }));
    // กรอบดีล (dealing range) = swing high/low ล่าสุด → Premium (เหนือ 50%) / Discount (ใต้ 50%)
    const hs = sw.filter(x => x.k === 'H'), ls = sw.filter(x => x.k === 'L');
    const rh = hs.length ? hs[hs.length - 1].p : null, rl = ls.length ? ls[ls.length - 1].p : null;
    const hiR = rh !== null && rl !== null ? Math.max(rh, rl, ...cl.slice(-5).map(b => b.high)) : null, loR = rh !== null && rl !== null ? Math.min(rh, rl, ...cl.slice(-5).map(b => b.low)) : null;
    const pos = hiR !== null && hiR > loR ? Math.round((px - loR) / (hiR - loR) * 100) : null;
    // สภาพคล่อง: Equal Highs/Lows (2 swing ห่างกันไม่เกิน 0.15 ATR) ที่ยังไม่ถูกกวาด
    const eq = (arr, k) => { for (let a = arr.length - 1; a > 0; a--) for (let b2 = a - 1; b2 >= Math.max(0, a - 4); b2--) if (Math.abs(arr[a].p - arr[b2].p) <= 0.15 * atr) { const lv = k === 'H' ? Math.max(arr[a].p, arr[b2].p) : Math.min(arr[a].p, arr[b2].p); const swept = cl.slice(arr[a].i + 1).some(b => k === 'H' ? b.high > lv : b.low < lv); if (!swept) return r2(lv); } return null; };
    const last = ev[ev.length - 1] || null;
    return {
      bias: trend > 0 ? 'ขาขึ้น' : trend < 0 ? 'ขาลง' : 'ยังไม่ชัด',
      last_event: last ? { type: last.kind, dir: last.dir, level: last.level, bars_ago: ago(last.i) } : null,
      events: ev.slice(-4).map(e => `${e.kind} ${e.dir} @${e.level} (${ago(e.i)} แท่งก่อน)`),
      swing_high: rh !== null ? r2(rh) : null, swing_low: rl !== null ? r2(rl) : null,
      zone: pos === null ? null : pos >= 55 ? `Premium ${pos}%` : pos <= 45 ? `Discount ${pos}%` : `Equilibrium ${pos}%`,
      bull_ob: ob('bull'), bear_ob: ob('bear'), bull_fvg: openFvg('bull'), bear_fvg: openFvg('bear'),
      eq_highs: eq(hs, 'H'), eq_lows: eq(ls, 'L'),
    };
  }
  // ---------- ข้อมูล Options ของเรา: GEX / gamma regime / gmf / Skew / ซื้อขายราย strike ----------
  function optionsNow(px) {
    const c = window.OILive && window.OILive.calc, oi = O.oi; if (!c || !c.strikes) return null;
    const rowOf = new Map(((oi && oi.rows) || []).map(r => [r.strike, r])), kp = k => { const r = rowOf.get(k); return Math.round((r ? r.price : k) * 100) / 100; };
    const near = c.strikes.filter(s => Math.abs(kp(s.k) - px) <= px * 0.03);
    const gx = near.filter(s => s.gex).sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex)).slice(0, 6)
      .map(s => ({ strike: s.k, price: kp(s.k), gex_musd: Math.round(s.gex / 1e6 * 10) / 10, type: s.gex > 0 ? 'Call GEX บวก (แม่เหล็ก/แนวต้าน ราคามักถูกดึงเข้าหาแล้วชะลอ)' : 'Put GEX ลบ (ทะลุแล้วเร่ง)' }));
    const flows = near.map(s => ({ strike: s.k, price: kp(s.k), call_net_buy: Math.round((s.bc || 0) - (s.sc || 0)), put_net_buy: Math.round((s.bp || 0) - (s.sp || 0)), vol: (s.vc || 0) + (s.vp || 0) }))
      .filter(f => Math.abs(f.call_net_buy) >= 10 || Math.abs(f.put_net_buy) >= 10).sort((a, b) => b.vol - a.vol).slice(0, 6);
    const gm = oi && oi.gmf ? oi.gmf.find(g => g.lab === 'gmf M') : null;
    const g = c.gexAtF;
    return {
      gamma_regime: g === null || g === undefined ? null : g > 0 ? 'บวก (Positive gamma: MM ซื้อตอนลง ขายตอนขึ้น → ราคามักแกว่งกรอบ ถูกดึงกลับ เหมาะเล่นกลับตัวที่แนว)' : 'ลบ (Negative gamma: MM ไล่ตามราคา → วิ่งแรงตามทาง เบรกแล้วไปต่อ ระวังสวน)',
      net_gex_at_price_musd: g === null || g === undefined ? null : Math.round(g / 1e6 * 10) / 10,
      gmf_itd: c.gmf, gmf_itd_adj_by_flow: c.gmfAdj, gmf_M: gm ? gm.p : null,
      price_vs_gmf_M: gm ? (px >= gm.p ? 'เหนือ gmf M (gamma บวก แกว่งกรอบ)' : 'ใต้ gmf M (gamma ลบ วิ่งแรง)') : null,
      skew_put_minus_call: c.skew === null ? null : Math.round(c.skew * 10) / 10,
      top_gex_strikes: gx, flows_today: flows,
    };
  }
  // จุดซ้อน: โซน SMC (OB / FVG / EQH-EQL / Swing) ที่ตรงกับแนว OI / Wall / EM / gmf / Max Pain / Volume / GEX
  function confluence(tfs, levels, opt, tol) {
    const lv = levels.slice(); (opt && opt.top_gex_strikes || []).forEach(g => lv.push({ name: `GEX ${g.gex_musd > 0 ? '+' : ''}${g.gex_musd}M @${g.strike}`, p: g.price }));
    const out = [], hit = (lo, hi) => lv.filter(l => l.p >= lo - tol && l.p <= hi + tol).map(l => l.name);
    ['H1', 'M15', 'M5'].forEach(tf => {
      const S = tfs[tf] && tfs[tf].smc; if (!S) return;
      const z = [];
      if (S.bull_ob) z.push(['OB ซื้อ', S.bull_ob.bottom, S.bull_ob.top]);
      if (S.bear_ob) z.push(['OB ขาย', S.bear_ob.bottom, S.bear_ob.top]);
      (S.bull_fvg || []).forEach(f => z.push(['FVG ขึ้น', f.bottom, f.top]));
      (S.bear_fvg || []).forEach(f => z.push(['FVG ลง', f.bottom, f.top]));
      if (S.eq_highs) z.push(['EQH (สภาพคล่องบน)', S.eq_highs, S.eq_highs]);
      if (S.eq_lows) z.push(['EQL (สภาพคล่องล่าง)', S.eq_lows, S.eq_lows]);
      if (S.swing_high) z.push(['Swing High', S.swing_high, S.swing_high]);
      if (S.swing_low) z.push(['Swing Low', S.swing_low, S.swing_low]);
      z.forEach(([nm, lo, hi]) => { const h = [...new Set(hit(lo, hi))]; if (h.length) out.push({ tf, smc: nm, zone: lo === hi ? f2(lo) : `${f2(lo)}–${f2(hi)}`, mid: (lo + hi) / 2, with: h.slice(0, 3) }); });
    });
    return out.sort((a, b) => (a.tf === 'H1' ? 0 : a.tf === 'M15' ? 1 : 2) - (b.tf === 'H1' ? 0 : b.tf === 'M15' ? 1 : 2)).slice(0, 8);
  }
  function tfSummary(name, B, levels, nBars) {
    if (!B || B.length < 60) return null;
    const cl = B.slice(0, -1), last = cl[cl.length - 1], atr = atrOf(cl, 14), c = cl.map(b => b.close);
    // ทิศจากโครงสร้างราคาล้วน (ไม่ใช้ EMA): HH-HL = ขึ้น, LH-LL = ลง · โครงสร้างไม่ชัด → ดูราคาเทียบ 20 แท่งก่อน (เกิน 1.5 ATR)
    const struct = structure(cl.slice(-60)), mv = last.close - c[c.length - 21];
    const trend = /ขาขึ้น/.test(struct) ? 'ขึ้น' : /ขาลง/.test(struct) ? 'ลง' : mv > 1.5 * atr ? 'ขึ้น' : mv < -1.5 * atr ? 'ลง' : 'ไซด์เวย์';
    const sw = cl.slice(-30), hi = Math.max(...sw.map(b => b.high)), lo = Math.min(...sw.map(b => b.low));
    const vol = new Map(B.map(b => [b.time, b.volume || 0]));
    return {
      tf: name, trend, structure: struct, atr: Math.round(atr * 100) / 100,
      smc: smc(cl.slice(name === 'H1' ? -150 : -120), atr),
      range_30: { high: Math.round(hi * 100) / 100, low: Math.round(lo * 100) / 100, price_pos_pct: Math.round((B[B.length - 1].close - lo) / Math.max(0.01, hi - lo) * 100) },
      patterns: patterns(B, atr, levels).filter(p => p.bar === 'แท่งล่าสุดที่ปิด' || p.bar === 'ย้อนหลัง 2 แท่ง'),
      absorption: (({ rate_40_pct, count_40, count_last10, bias }) => ({ rate_40_pct, count_40, count_last10, bias }))(absorption(B, vol, atr, levels)),
      bars: B.slice(-nBars).map(b => [hhmm(b.time), +b.open.toFixed(2), +b.high.toFixed(2), +b.low.toFixed(2), +b.close.toFixed(2), b.volume || 0]),
    };
  }
  // เทรดสั้น: H1 = ทิศ/แนวใหญ่, M15 = โครงสร้าง, M5 = จุดตั้งเทรด, M1 = จังหวะเข้า
  const STYLE = 'เทรดสั้น (Short-term / Scalp ในวัน) ถือไม่กี่นาทีถึงราว 1-2 ชม. ไม่ถือข้ามคืน: H1 ดูทิศ/แนวใหญ่, M15 ดูโครงสร้าง, M5 หาจุดตั้งเทรด, M1 หาจังหวะเข้า · SL แคบหลังไส้ TP เป็นแนวใกล้ที่ไปถึงได้เร็ว';
  const MTF = [['H1', '1h', 200, 16], ['M15', '15m', 200, 20], ['M5', '5m', 200, 24], ['M1', '1m', 300, 30]];
  async function multiTF(snap) {
    const cur = O.tf, vol = new Map((O.rawBars || []).map(k => [Math.floor(k[0] / 1000) + TZ, k[5] || 0]));
    const res = await Promise.all(MTF.map(async ([nm, t, n, nb]) => {
      let B = null;
      if (t === cur) B = (O.series.data() || []).map(b => Object.assign({}, b, { volume: vol.get(b.time) || 0 }));
      else {
        try { B = await O.fetchTF(t, n); } catch (e) { B = null; }
        // ช่วงตลาด CME ปิด แท่ง perp ถูกกรองทิ้ง → ขอย้อนหลังเพิ่ม
        if (!B || B.length < 60) { try { B = await O.fetchTF(t, 1000); } catch (e) {} }
      }
      return tfSummary(nm, B, snap.levels, nb);
    }));
    const out = {}; res.forEach(r => { if (r) out[r.tf] = r; });
    return out;
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
  let snap = null, result = null, busy = false, anim = 0, showPlan = true, sideRes = null, sideBusy = false, sidePick = null;
  const bd = () => $('paBd');
  function paintIdle() {
    $('paSub').textContent = `${(O.cfg && O.cfg.name) || ''} · ${TFN[O.tf] || O.tf}`;
    bd().innerHTML = `<button class="go" id="paGo">⚡ วิเคราะห์จังหวะเข้าตอนนี้</button>
      <div class="info">AI จะอ่านแท่งเทียน ${TFN[O.tf] || O.tf} ล่าสุด 40 แท่ง + Price Action ที่ระบบตรวจเจอ + โมเดล Quant จากข้อมูล OI / GEX / Flow / EM / gmf ณ ตอนกด แล้วบอกว่าควร BUY / SELL หรือรอ<br>เปลี่ยน TF ที่กราฟก่อนกด เพื่อให้วิเคราะห์ TF นั้น</div>` + sideBlock(true) + (result ? resultHTML(result, true) : '');
    $('paGo').onclick = run; bindSides();
    window.OIColorize && OIColorize(bd());
    if (result) bindResult();
  }
  function newsHTML(r) {
    if (!r.news_summary && !(r.news && r.news.length)) return r.headlines_n === 0 ? '<div class="muted">📰 ดึงข่าวล่าสุดไม่ได้รอบนี้</div>' : '';
    const bc = /หนุน/.test(r.news_bias) ? '#2fe3a6' : /กด/.test(r.news_bias) ? '#ff6b82' : '#c9d1ea';
    const ago = m => m < 60 ? m + ' นาที' : Math.round(m / 60) + ' ชม.';
    const items = (r.news || []).map(n => `<div style="display:flex;gap:6px;padding:4px 0;border-top:1px solid #1a2246;font-size:12px;line-height:1.45"><span style="width:16px;text-align:center;font-weight:700;color:${n.impact === '+' ? '#2fe3a6' : n.impact === '-' ? '#ff6b82' : '#8a93ad'}">${n.impact === '+' ? '▲' : n.impact === '-' ? '▼' : '•'}</span><span>${esc(n.th)}<br><small style="color:#6f7896">${esc(n.src)} · ${ago(n.ago_min)}ที่แล้ว</small></span></div>`).join('');
    return `<div style="margin:8px 0;padding:6px 10px;border:1px solid #1f2850;border-radius:10px;background:#0f1533"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:13px">📰 ข่าวล่าสุด</b>${r.news_bias ? `<span style="font-size:12px;font-weight:700;color:${bc}">${esc(r.news_bias)}</span>` : ''}</div>${r.news_summary ? `<p style="margin:4px 0 2px;font-size:12px;color:#c9d1ea">${esc(r.news_summary)}</p>` : ''}${items}</div>`;
  }
  function quantHTML(r) {
    const Q = r.quant; if (!Q) return '';
    const sc = Q.score, scol = sc > 15 ? '#2fe3a6' : sc < -15 ? '#ff6b82' : '#c9d1ea';
    const bar = f => { const w = Math.min(50, Math.abs(f.contrib) * 1.6); return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;line-height:1.7"><span style="width:118px;color:#a9b4d6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</span><span style="position:relative;flex:1;height:8px;background:#141b3a;border-radius:4px"><i style="position:absolute;top:0;bottom:0;${f.contrib >= 0 ? 'left:50%' : 'right:50%'};width:${w}%;border-radius:4px;background:${f.contrib >= 0 ? '#2fbf8f' : '#e5576b'}"></i><i style="position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:#3a4570"></i></span><span style="width:34px;text-align:right;font-family:var(--mono,monospace);color:${f.contrib >= 0 ? '#2fe3a6' : '#ff6b82'}">${f.contrib > 0 ? '+' : ''}${f.contrib}</span></div>`; };
    const pl = (p, nm) => p ? `<div style="flex:1;background:#11183a;border:1px solid #1f2850;border-radius:9px;padding:5px 7px;font:11px var(--mono,monospace);line-height:1.6"><b style="color:${nm === 'BUY' ? '#2fe3a6' : '#ff6b82'}">${nm}</b> ชนะ <b>${p.p_win}%</b> · EV <b style="color:${p.ev_r >= 0.15 ? '#2fe3a6' : p.ev_r < 0 ? '#ff6b82' : '#c9d1ea'}">${p.ev_r > 0 ? '+' : ''}${p.ev_r}R</b><br>SL ${f2(p.sl)} · TP1 ${f2(p.tp1)}<br><small style="color:#6f7896">R:R 1:${p.rr} · TP1 ${esc(p.tp1_at)}</small></div>` : `<div style="flex:1;font-size:11px;color:#6f7896;padding:5px">${nm}: ไม่มีเป้าใกล้พอ</div>`;
    const tc = (Q.touch || []).slice(0, 6).map(t => `<span style="display:inline-block;margin:2px 4px 0 0;padding:1px 6px;border-radius:6px;background:#141b3a;font:10px var(--mono,monospace);color:${t.dist > 0 ? '#9fe8c9' : '#ffb3bf'}">${esc(t.name.split(' (')[0])} ${f2(t.p)} · ${t.prob}%</span>`).join('');
    return `<div style="margin:8px 0;padding:8px 10px;border:1px solid #2a3358;border-radius:10px;background:linear-gradient(180deg,#121a40,#0f1533)">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:13px">📐 Quant Model</b><span style="font:800 18px var(--mono,monospace);color:${scol}">${sc > 0 ? '+' : ''}${sc}</span></div>
      <div style="font-size:11px;color:#a9b4d6;margin:2px 0 6px">${esc(Q.regime)}<br>IV ${Q.iv_pct ?? '–'}% · RV ${Q.rv_pct ?? '–'}%${Q.rv_iv ? ' · RV/IV ' + Q.rv_iv : ''} · 1σ (2 ชม.) ±${f2(Q.sigma_2h)}${Q.hours_to_expiry !== null ? ' · หมดอายุอีก ' + Q.hours_to_expiry + ' ชม.' : ''}</div>
      ${Q.factors.map(bar).join('')}
      <div style="display:flex;gap:6px;margin-top:7px">${pl(Q.plans.long, 'BUY')}${pl(Q.plans.short, 'SELL')}</div>
      <div style="font-size:11px;margin-top:6px;color:#ffd97a">โมเดลตัดสิน: <b>${Q.decision.action === 'WAIT' ? 'รอ' : Q.decision.action}</b> · ${esc(Q.decision.why)}</div>
      ${tc ? `<div style="margin-top:5px;font-size:11px;color:#8a93ad">โอกาสแตะแนวใน ~2 ชม.<br>${tc}</div>` : ''}
      ${r.veto ? `<p class="warn" style="margin-top:6px">⛔ ds สั่งรอ: ${esc(r.veto)}</p>` : ''}${r.quant_view ? `<p style="margin-top:6px">${esc(r.quant_view)}</p>` : ''}</div>`;
  }
  function smcHTML(r) {
    const S = r.smcH1; if (!S && !r.smc) return '';
    const z = (o, c) => o ? `<span style="color:${c}">${f2(o.bottom)}–${f2(o.top)}</span>` : '–';
    const fv = a => a && a.length ? a.map(f => `${f2(f.bottom)}–${f2(f.top)}`).join(', ') : '–';
    const ev = S && S.last_event ? `<b style="color:${S.last_event.dir === 'ขึ้น' ? '#2fe3a6' : '#ff6b82'}">${S.last_event.type} ${S.last_event.dir}</b> @${f2(S.last_event.level)} · ${S.last_event.bars_ago} แท่งก่อน` : 'ยังไม่มี BOS/CHoCH';
    const facts = S ? `<div style="font:11px var(--mono,monospace);color:#a9b4d6;line-height:1.6;margin-top:3px">โครงสร้าง: ${esc(S.bias)} · ${ev}<br>Swing H/L: ${f2(S.swing_high)} / ${f2(S.swing_low)} · ${esc(S.zone || '–')}<br>OB ซื้อ ${z(S.bull_ob, '#2fe3a6')} · OB ขาย ${z(S.bear_ob, '#ff6b82')}<br>FVG ขึ้น ${fv(S.bull_fvg)} · FVG ลง ${fv(S.bear_fvg)}${S.eq_highs || S.eq_lows ? `<br>Liquidity: ${S.eq_highs ? 'EQH ' + f2(S.eq_highs) : ''}${S.eq_highs && S.eq_lows ? ' · ' : ''}${S.eq_lows ? 'EQL ' + f2(S.eq_lows) : ''}` : ''}</div>` : '';
    const gm = r.opt && r.opt.gamma_regime ? `<div style="font-size:11px;margin-top:4px;color:${/^บวก/.test(r.opt.gamma_regime) ? '#2fe3a6' : '#ff6b82'}">γ ${esc(r.opt.gamma_regime.split(' (')[0])}${r.opt.net_gex_at_price_musd !== null ? ' · Net GEX ' + r.opt.net_gex_at_price_musd + 'M' : ''}${r.opt.price_vs_gmf_M ? ' · ' + esc(r.opt.price_vs_gmf_M.split(' (')[0]) : ''}</div>` : '';
    const cf = (r.conf || []).slice(0, 5).map(c => `<div style="font-size:11px;line-height:1.5;padding-top:2px">🎯 <b>${c.tf}</b> ${esc(c.smc)} ${esc(c.zone)} ↔ ${esc(c.with.join(', '))}</div>`).join('');
    return `<div style="margin:8px 0;padding:6px 10px;border:1px solid #1f2850;border-radius:10px;background:#0f1533"><b style="font-size:13px">🏗️ โครงสร้างตลาด SMC (H1) × OI / GEX</b>${facts}${gm}${cf ? `<div style="margin-top:5px;border-top:1px solid #1a2246;padding-top:3px"><b style="font-size:12px;color:#ffd97a">จุดซ้อน SMC × OI/GEX</b>${cf}</div>` : ''}${r.smc ? `<p style="margin-top:5px">${esc(r.smc)}</p>` : ''}</div>`;
  }
  function mtfHTML(r) {
    const v = r.tf_view; if (!v || typeof v !== 'object') return '';
    const rows = ['H4', 'H1', 'M15', 'M5', 'M1'].filter(k => v[k]).map(k => { const t = r.mtf && r.mtf[k]; const tr = t ? t.trend : ''; const ic = tr === 'ขึ้น' ? '🟢' : tr === 'ลง' ? '🔴' : '⚪';
      return `<div style="display:flex;gap:8px;padding:3px 0;border-top:1px solid #1a2246"><b style="width:34px;font:700 12px var(--mono,monospace);color:#e0b44c">${k}</b><span style="font-size:12px;line-height:1.45">${ic} ${esc(v[k])}</span></div>`; }).join('');
    return `<div style="margin:8px 0;padding:6px 10px;border:1px solid #1f2850;border-radius:10px;background:#0f1533"><b style="font-size:13px">🧭 หลายไทม์เฟรม</b>${r.align ? ` <span style="font-size:12px;color:${/สอดคล้อง/.test(r.align) ? '#2fe3a6' : '#f0a35b'}">· ${esc(r.align)}</span>` : ''}${rows}</div>`;
  }
  function absHTML(r) {
    const a = r.abs; if (!a || a.count_40 === undefined) return '';
    const col = a.rate_40_pct >= 20 ? '#ffd97a' : a.rate_40_pct >= 10 ? '#c9d1ea' : '#8a93ad';
    const lt = (a.latest || []).slice(0, 3).map(x => `${x.time} ${x.side === 'buy' ? '🟢 ซื้อรับ' : x.side === 'sell' ? '🔴 ขายรับ' : '⚪ สองฝั่ง'} ${f2(x.price)} · Vol ${x.rvol}x${x.at ? ' · ' + esc(x.at) : ''}`).join('<br>');
    return `<div style="margin:8px 0;padding:8px 10px;border:1px solid #1f2850;border-radius:10px;background:#0f1533">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:13px">🧲 Absorption</b><span style="font:700 15px var(--mono,monospace);color:${col}">${a.rate_40_pct}% <small style="font:11px var(--sans,sans-serif);color:#8a93ad">(${a.count_40}/40 แท่ง · 10 แท่งล่าสุด ${a.count_last10})</small></span></div>
      <div style="font-size:12px;color:#a9b4d6;margin-top:3px">เอนไป: <b>${esc(a.bias)}</b> · ซื้อรับ ${a.buy_side} / ขายรับ ${a.sell_side}</div>
      ${lt ? `<div style="font:11px var(--mono,monospace);color:#8fa0d0;margin-top:4px;line-height:1.5">${lt}</div>` : ''}
      ${r.absorption ? `<p style="margin-top:5px">${esc(r.absorption)}</p>` : ''}</div>`;
  }
  function resultHTML(r, old) {
    const conf = r.confidence || 0;
    return `${old ? '<div class="muted">ผลล่าสุด</div>' : ''}<div class="act"><span class="badge ${r.action}">${r.action === 'WAIT' ? 'รอ' : r.action}</span>
      <div class="conf"><small>ความมั่นใจ ${conf}% · ${esc(r.tf)} · ${esc((r.time_th || '').slice(11))} น. · ราคา ${f2(r.price)}</small><div class="bar"><i style="width:${old ? conf : 0}%"></i></div></div></div>
      ${spkHTML('main')}
      <div class="pat">${esc(r.pattern)}</div><p>${esc(r.pa)}</p><p style="color:#a9b4d6">${esc(r.context)}</p>
      ${newsHTML(r)}
      ${quantHTML(r)}
      ${smcHTML(r)}
      ${mtfHTML(r)}
      ${absHTML(r)}
      ${r.entry || r.sl || r.tp1 ? `<div class="plan"><div><small>${r.action === 'WAIT' ? 'รอเข้า' : 'Entry'}</small>${f2(r.entry)}</div><div><small>SL</small><span style="color:#ff6b82">${f2(r.sl)}</span></div><div><small>TP1</small><span style="color:#2fe3a6">${f2(r.tp1)}</span></div><div><small>TP2${r.rr ? ' · R:R 1:' + r.rr : ''}</small><span style="color:#2fe3a6">${f2(r.tp2)}</span></div></div>` : ''}
      ${r.reasons && r.reasons.length ? `<ul>${r.reasons.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${r.wait_for && r.action === 'WAIT' ? `<p>⏳ ${esc(r.wait_for)}</p>` : ''}${r.invalid ? `<p class="warn">⚠️ ${esc(r.invalid)}</p>` : ''}${r.checked ? `<p class="warn">${esc(r.checked)}</p>` : ''}
      ${old ? '' : sideBlock()}
      <div class="row2"><button id="paPlan">${showPlan ? '🧹 ซ่อนแผนบนกราฟ' : '📍 แสดงแผนบนกราฟ'}</button><button id="paAgain">🔄 วิเคราะห์ใหม่</button></div>
      <div class="muted">วิเคราะห์โดย DeepSeek จากกราฟ ณ เวลาที่กด · ใช้ประกอบการตัดสินใจ ไม่ใช่คำแนะนำการลงทุน</div>`;
  }
  function bindResult() {
    const p = $('paPlan'), a = $('paAgain');
    if (p) p.onclick = () => { showPlan = !showPlan; O.markDirty(); p.textContent = showPlan ? '🧹 ซ่อนแผนบนกราฟ' : '📍 แสดงแผนบนกราฟ'; };
    if (a) a.onclick = run;
  }

  // ---------- อ่านผลเป็นเสียง (เสียงไทยในเครื่อง · กดเอง · อ่านทุกอย่างในผลนั้น) ----------
  const SS = window.speechSynthesis;
  const RATES = [['ช้า', 0.8], ['ปกติ', 1], ['เร็ว', 1.25]];
  let rateI = 1; try { const v = Number(localStorage.getItem('oi_tts_rate')); if (v >= 0 && v < 3) rateI = v; } catch (e) {}
  let spkOn = null;
  function spkHTML(k) {
    if (!SS) return '';
    return `<div class="spk"><button data-spk="${k}" class="${spkOn === k ? 'on' : ''}">${spkOn === k ? '⏹ หยุดอ่าน' : '🔊 ฟังผลวิเคราะห์'}</button><button data-rate="1">ความเร็ว: ${RATES[rateI][0]}</button></div>`;
  }
  const n2 = v => (v === null || v === undefined || !isFinite(v)) ? '' : Number(v).toFixed(2).replace(/\.00$/, '');
  const clean = t => String(t || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}▲▼▸•⏳⚠️🔊]/gu, ' ')
    .replace(/R:R\s*1:([\d.]+)/g, 'กำไรต่อความเสี่ยง 1 ต่อ $1').replace(/±\s*/g, 'บวกลบ ').replace(/%/g, ' เปอร์เซ็นต์')
    .replace(/Put\/Call/gi, 'พุทต่อคอล').replace(/(\d)\s*[-–]\s*(\d)/g, '$1 ถึง $2').replace(/\s*\/\s*/g, ' ต่อ ').replace(/[→←↔]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  function mainSpeech(r) {
    const L = [];
    const act = r.action === 'WAIT' ? 'รอก่อน ยังไม่เข้า' : r.action === 'BUY' ? 'ซื้อ BUY' : 'ขาย SELL';
    L.push(`ผลวิเคราะห์ไทม์เฟรม ${r.tf || ''} เวลา ${(r.time_th || '').slice(11)} ราคา ${n2(r.price)}`);
    L.push(`คำแนะนำ ${act} ความมั่นใจ ${r.confidence || 0} เปอร์เซ็นต์`);
    if (r.pattern) L.push(`รูปแบบราคา ${r.pattern}`);
    if (r.pa) L.push(r.pa); if (r.context) L.push(r.context);
    if (r.news_summary || (r.news && r.news.length)) {
      L.push(`ข่าวล่าสุด ${r.news_bias || ''}`); if (r.news_summary) L.push(r.news_summary);
      (r.news || []).forEach((n, i) => L.push(`ข่าวที่ ${i + 1} ${n.impact === '+' ? 'หนุนทอง' : n.impact === '-' ? 'กดทอง' : 'ผลกลาง'} ${n.th}`));
    }
    const v = r.tf_view || {};
    if (Object.keys(v).length) { L.push('มุมมองหลายไทม์เฟรม'); ['H4', 'H1', 'M15', 'M5', 'M1'].forEach(k => { if (v[k]) L.push(`${k} ${v[k]}`); }); if (r.align) L.push(`สรุป ${r.align}`); }
    const a = r.abs;
    if (a && a.count_40 !== undefined) L.push(`แอบซอร์ปชัน ${a.rate_40_pct} เปอร์เซ็นต์ เกิด ${a.count_40} จาก 40 แท่ง เอนไป ${a.bias} ซื้อรับ ${a.buy_side} ขายรับ ${a.sell_side}`);
    if (r.absorption) L.push(r.absorption);
    if (r.entry || r.sl || r.tp1) L.push(`แผน ${r.action === 'WAIT' ? 'ราคาที่รอเข้า' : 'จุดเข้า'} ${n2(r.entry)}${r.sl ? ' สต็อปลอส ' + n2(r.sl) : ''}${r.tp1 ? ' เป้าแรก ' + n2(r.tp1) : ''}${r.tp2 ? ' เป้าสอง ' + n2(r.tp2) : ''}${r.rr ? ' กำไรต่อความเสี่ยง 1 ต่อ ' + r.rr : ''}`);
    (r.reasons || []).forEach((t, i) => L.push(`เหตุผลข้อ ${i + 1} ${t}`));
    if (r.wait_for && r.action === 'WAIT') L.push(`สิ่งที่ต้องรอ ${r.wait_for}`);
    if (r.invalid) L.push(`ข้อควรระวัง ${r.invalid}`);
    if (r.checked) L.push(r.checked);
    return L;
  }
  function sideSpeech(r) {
    const L = [], vt = { GO: `ควรเข้า ${r.side}`, WAIT: `รอก่อน ยังไม่ควรเข้า ${r.side} ตอนนี้`, NO: `ไม่ควรเข้า ${r.side}` }[r.verdict] || '';
    L.push(`ผลวิเคราะห์ฝั่ง ${r.side === 'BUY' ? 'ซื้อ BUY' : 'ขาย SELL'} เวลา ${(r.time_th || '').slice(11)} ราคา ${n2(r.price)}`);
    L.push(`${vt} โอกาสถึงเป้าแรกก่อนโดนสต็อปลอส ${r.prob} เปอร์เซ็นต์`);
    if (r.summary) L.push(r.summary);
    if (r.entry || r.sl || r.tp1) L.push(`แผน ${r.verdict === 'GO' ? 'จุดเข้า' : 'ราคาที่รอเข้า'} ${n2(r.entry)}${r.sl ? ' สต็อปลอส ' + n2(r.sl) : ''}${r.tp1 ? ' เป้าแรก ' + n2(r.tp1) : ''}${r.tp2 ? ' เป้าสอง ' + n2(r.tp2) : ''}${r.rr ? ' กำไรต่อความเสี่ยง 1 ต่อ ' + r.rr : ''}`);
    if (r.pros && r.pros.length) { L.push('ที่หนุน'); r.pros.forEach((t, i) => L.push(`ข้อ ${i + 1} ${t}`)); }
    if (r.cons && r.cons.length) { L.push('ที่สวนทาง'); r.cons.forEach((t, i) => L.push(`ข้อ ${i + 1} ${t}`)); }
    if (r.wait_for && r.verdict !== 'GO') L.push(`สิ่งที่ต้องรอ ${r.wait_for}`);
    if (r.invalid) L.push(`ข้อควรระวัง ${r.invalid}`);
    if (r.checked) L.push(r.checked);
    return L;
  }
  function thVoice() { const vs = SS.getVoices() || []; return vs.find(v => /^th/i.test(v.lang) && /premium|enhanced/i.test(v.name)) || vs.find(v => /^th/i.test(v.lang)) || null; }
  function spkUI() { bd().querySelectorAll('[data-spk]').forEach(b => { const on = b.dataset.spk === spkOn; b.classList.toggle('on', on); b.textContent = on ? '⏹ หยุดอ่าน' : '🔊 ฟังผลวิเคราะห์'; }); }
  function stopSpeak() { spkOn = null; try { SS && SS.cancel(); } catch (e) {} spkUI(); }
  function speak(k) {
    if (!SS) return;
    if (spkOn === k) { stopSpeak(); return; }
    const r = k === 'side' ? sideRes : result; if (!r) return;
    try { SS.cancel(); } catch (e) {}
    const lines = (k === 'side' ? sideSpeech(r) : mainSpeech(r)).map(clean).filter(Boolean);
    // แบ่งเป็นท่อนสั้นๆ (iPhone ตัดเสียงถ้ายาวเกิน)
    const chunks = []; lines.forEach(t => { while (t.length > 180) { let c = t.lastIndexOf(' ', 180); if (c < 60) c = 180; chunks.push(t.slice(0, c)); t = t.slice(c).trim(); } if (t) chunks.push(t); });
    const voice = thVoice(); spkOn = k; spkUI();
    chunks.forEach((t, i) => {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'th-TH'; if (voice) u.voice = voice; u.rate = RATES[rateI][1];
      if (i === chunks.length - 1) u.onend = () => { if (spkOn === k) { spkOn = null; spkUI(); } };
      u.onerror = () => { if (i === chunks.length - 1 && spkOn === k) { spkOn = null; spkUI(); } };
      SS.speak(u);
    });
  }
  if (SS) { try { SS.getVoices(); SS.onvoiceschanged = () => SS.getVoices(); } catch (e) {} }
  tray.addEventListener('click', e => {
    const b = e.target.closest('[data-spk]'); if (b) { speak(b.dataset.spk); return; }
    const rt = e.target.closest('[data-rate]');
    if (rt) { rateI = (rateI + 1) % 3; try { localStorage.setItem('oi_tts_rate', String(rateI)); } catch (er) {} bd().querySelectorAll('[data-rate]').forEach(x => { x.textContent = 'ความเร็ว: ' + RATES[rateI][0]; }); if (spkOn) { const k = spkOn; spkOn = null; speak(k); } }
  });

  // ---------- ผู้ใช้เลือกฝั่ง → AI ประเมินต่อ (ใช้กราฟ ณ ตอนกด) ----------
  function sideBlock(first) {
    return `<div class="sideQ"><b>${first ? 'หรือเลือกฝั่งที่อยากเข้า ให้ AI วิเคราะห์ฝั่งนั้นเลย' : 'คุณอยากเข้าฝั่งไหนตอนนี้? ให้ AI ประเมินต่อ'}</b><div class="sides${sideBusy ? ' busy' : ''}" id="paSides"><button class="sb buy${sidePick === 'BUY' ? ' on' : ''}" data-side="BUY">▲ BUY<small>วิเคราะห์ฝั่งซื้อ</small></button><button class="sb sell${sidePick === 'SELL' ? ' on' : ''}" data-side="SELL">▼ SELL<small>วิเคราะห์ฝั่งขาย</small></button></div><div class="sres" id="paSide">${sideRes ? sideHTML(sideRes, true) : sideBusy ? sideWaitHTML(sidePick) : ''}</div></div>`;
  }
  function bindSides() { bd().querySelectorAll('#paSides .sb').forEach(btn => { btn.onclick = () => askSide(btn.dataset.side); }); if (sideBusy) startSideAnim(sidePick); }
  function sideHTML(r, old) {
    const vt = { GO: `✅ ควรเข้า ${r.side}`, WAIT: `⏳ รอก่อน`, NO: `⛔ ไม่ควร ${r.side}` }[r.verdict] || r.verdict;
    const pc = r.prob >= 60 ? '#2fe3a6' : r.prob >= 45 ? '#ffd97a' : '#ff6b82';
    const li = a => a && a.length ? `<ul>${a.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<div style="color:#6f7896">–</div>';
    return `<div class="vd"><span class="v ${r.verdict}">${vt}</span><div class="prob"><small>โอกาสถึง TP1 ก่อน SL <b>${r.prob}%</b> · ${esc((r.time_th || '').slice(11))} น. · ราคา ${f2(r.price)}</small><div class="bar"><i data-w="${r.prob}" style="background:${pc};${old ? 'width:' + r.prob + '%' : ''}"></i></div></div></div>
      ${spkHTML('side')}
      ${r.summary ? `<p style="margin-top:8px">${esc(r.summary)}</p>` : ''}
      ${r.entry || r.sl || r.tp1 ? `<div class="plan"><div><small>${r.verdict === 'GO' ? 'Entry ' + r.side : 'รอเข้า ' + r.side}</small>${f2(r.entry)}</div><div><small>SL</small><span style="color:#ff6b82">${f2(r.sl)}</span></div><div><small>TP1</small><span style="color:#2fe3a6">${f2(r.tp1)}</span></div><div><small>TP2${r.rr ? ' · R:R 1:' + r.rr : ''}</small><span style="color:#2fe3a6">${f2(r.tp2)}</span></div></div>` : ''}
      <div class="pc"><div><b style="color:#2fe3a6">👍 ที่หนุน</b>${li(r.pros)}</div><div><b style="color:#ff6b82">⚠️ ที่สวนทาง</b>${li(r.cons)}</div></div>
      ${r.wait_for && r.verdict !== 'GO' ? `<p>⏳ ${esc(r.wait_for)}</p>` : ''}${r.invalid ? `<p class="warn">⚠️ ${esc(r.invalid)}</p>` : ''}${r.checked ? `<p class="warn">${esc(r.checked)}</p>` : ''}`;
  }
  function sideWaitHTML(side) {
    const b = side === 'BUY';
    const steps = ['▸ อ่านกราฟสด ณ ตอนนี้', '▸ อ่านหลาย TF: H4 / H1 / M15 / M5', `▸ เช็คแนว OI / gmf / EM ฝั่ง ${b ? 'ซื้อ' : 'ขาย'}`, '▸ หาจุด Entry / SL / TP', '▸ ชั่งน้ำหนัก ที่หนุน vs ที่สวนทาง', '▸ คำนวณโอกาสสำเร็จ %'];
    return `<div class="sw ${b ? 'b' : 's'}"><div class="swv"><canvas id="paSCv"></canvas><div class="arw"><span>${b ? '▲' : '▼'}</span><span>${b ? '▲' : '▼'}</span><span>${b ? '▲' : '▼'}</span></div><div class="ring"></div></div>
      <div class="think">AI กำลังวิเคราะห์ฝั่ง ${side}<i></i><i></i><i></i></div><div class="steps" id="paSSt">${steps.map(t => `<div>${t}</div>`).join('')}</div>
      <div class="ctr">โอกาส <b id="paSPct">--</b>%</div></div>`;
  }
  let sAnim = 0;
  function startSideAnim(side) {
    cancelAnimationFrame(sAnim);
    const cv = $('paSCv'); if (!cv) return;
    let lastTk = -1; const all = (O.series.data() || []).slice(-120), t0 = performance.now(), st = [...document.querySelectorAll('#paSSt div')], pct = $('paSPct');
    const loop = now => {
      if (!cv.isConnected) return;
      const el = now - t0, cyc = el % 2200;
      const upto = cyc < 1300 ? Math.max(1, Math.round(30 + (all.length - 30) * (cyc / 1300))) : all.length;
      const W = cv.clientWidth - 46;
      if (all.length > 5) drawMini(cv, all, Math.min(all.length, upto), cyc >= 1300 ? (cyc - 1300) / 900 * W : null, null, null);
      const k = Math.min(st.length - 1, Math.floor(el / 900));
      st.forEach((d, i) => { d.className = i < k ? 'ok' : i === k ? 'on' : ''; });
      const tk = Math.floor(el / 90); if (pct && tk !== lastTk) { lastTk = tk; pct.textContent = String(Math.floor(Math.random() * 90 + 5)).padStart(2, '0'); }
      sAnim = requestAnimationFrame(loop);
    };
    sAnim = requestAnimationFrame(loop);
  }
  async function askSide(side) {
    if (sideBusy || busy) return;
    const s2 = snapshot();
    if (!s2) { O.showToast && O.showToast('ข้อมูลกราฟยังไม่พอ รอกราฟโหลดก่อน'); return; }
    if (spkOn === 'side') stopSpeak();
    sideBusy = true; sidePick = side; sideRes = null;
    const box = $('paSide'), sides = $('paSides');
    if (sides) { sides.classList.add('busy'); sides.querySelectorAll('.sb').forEach(b => b.classList.toggle('on', b.dataset.side === side)); }
    if (box) { box.innerHTML = sideWaitHTML(side); startSideAnim(side); box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    try { navigator.vibrate && navigator.vibrate(10); } catch (e) {}
    const payload = Object.assign({}, s2); delete payload._draw;
    try { payload.tfs = await multiTF(s2); } catch (e) { payload.tfs = {}; }
    if (payload.tfs.M15) payload.atr_m15 = payload.tfs.M15.atr;
    if (payload.tfs.M5) payload.atr_m5 = payload.tfs.M5.atr;
    payload.style = STYLE;
    try { payload.options = optionsNow(payload.price); } catch (e) { payload.options = null; }
    try { payload.confluence = confluence(payload.tfs || {}, payload.levels || [], payload.options, Math.max(2, (payload.atr_m5 || 2) * 0.5)).map(({ mid, ...x }) => x); } catch (e) { payload.confluence = []; }
    try { payload.quant = window.OIQuant ? window.OIQuant.model(payload) : null; } catch (e) { payload.quant = null; }
    payload.side = side;
    if (result) payload.prev = { action: result.action, confidence: result.confidence, pattern: result.pattern, entry: result.entry, sl: result.sl, tp1: result.tp1, tp2: result.tp2, reasons: result.reasons, price: result.price, time_th: result.time_th };
    const [res] = await Promise.all([O.aiCall('ai_pa', payload, 90000), new Promise(r => setTimeout(r, 2500))]);
    sideBusy = false; cancelAnimationFrame(sAnim);
    const box2 = $('paSide'), sides2 = $('paSides');
    if (sides2) sides2.classList.remove('busy');
    if (!res || !res.ok || !res.side) {
      if (box2) box2.innerHTML = `<div class="err">ประเมินไม่สำเร็จ: ${esc(res && res.error === 'auth' ? 'รหัสเข้าแอปหมดอายุ' : (res && res.error) || 'ไม่ทราบสาเหตุ')}</div>`;
      return;
    }
    sideRes = res.side;
    if (!box2) return;
    box2.innerHTML = sideHTML(sideRes, false);
    window.OIColorize && OIColorize(box2);
    requestAnimationFrame(() => requestAnimationFrame(() => { const i = box2.querySelector('.prob .bar i'); if (i) i.style.width = i.dataset.w + '%'; }));
    box2.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (O.beep && sideRes.verdict === 'GO') O.beep();
  }

  async function run() {
    if (busy || sideBusy) return;
    stopSpeak();
    if (!news.length) loadNews();
    snap = snapshot();
    if (!snap) { O.showToast && O.showToast('ข้อมูลกราฟยังไม่พอ รอกราฟโหลดก่อน'); return; }
    busy = true;
    const draw = snap._draw, pats = snap.patterns;
    const patTxt = pats.length ? pats.slice(0, 2).map(p => p.name.split(' (')[0]).join(' + ') : 'ไม่พบรูปแบบชัด';
    const steps = [`▸ อ่านแท่งเทียน ${snap.tf} 40 แท่ง · ATR ${f2(snap.atr)}`, '▸ อ่านหลาย TF: H1 / M15 / M5 / M1…', '▸ อ่านข่าวล่าสุด…', `▸ Price Action ${snap.tf}: ${patTxt}`, `▸ Absorption ${snap.absorption.count_40 !== undefined ? snap.absorption.rate_40_pct + '% · ' + snap.absorption.bias : '–'}`, `▸ โมเดล Quant: OI / GEX / Flow / EM / gmf · ${snap.levels.length} แนว`, '▸ DeepSeek กำลังตัดสินใจ…'];
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
      const k = Math.min(6, Math.floor(el / 650));
      st.forEach((d, i) => { d.className = i < k ? 'ok' : i === k ? 'on' : ''; });
      anim = requestAnimationFrame(loop);
    };
    anim = requestAnimationFrame(loop);
    const payload = Object.assign({}, snap); delete payload._draw;
    try { payload.tfs = await multiTF(snap); } catch (e) { payload.tfs = {}; }
    if (payload.tfs.M15) payload.atr_m15 = payload.tfs.M15.atr;
    if (payload.tfs.M5) payload.atr_m5 = payload.tfs.M5.atr;
    payload.style = STYLE;
    try { payload.options = optionsNow(payload.price); } catch (e) { payload.options = null; }
    try { payload.confluence = confluence(payload.tfs || {}, payload.levels || [], payload.options, Math.max(2, (payload.atr_m5 || 2) * 0.5)).map(({ mid, ...x }) => x); } catch (e) { payload.confluence = []; }
    try { payload.quant = window.OIQuant ? window.OIQuant.model(payload) : null; } catch (e) { payload.quant = null; }
    const mtfTxt = Object.values(payload.tfs).map(t => `${t.tf} ${t.trend}`).join(' · ');
    const stEl = bd().querySelectorAll('.steps div')[1]; if (stEl && mtfTxt) stEl.textContent = '▸ หลาย TF: ' + mtfTxt;
    const [res] = await Promise.all([O.aiCall('ai_pa', payload, 90000), new Promise(r => setTimeout(r, 2000))]);
    cancelAnimationFrame(anim); busy = false;
    if (!res || !res.ok) {
      bd().innerHTML = `<div class="err">วิเคราะห์ไม่สำเร็จ: ${esc(res && res.error === 'auth' ? 'รหัสเข้าแอปหมดอายุ' : (res && res.error) || 'ไม่ทราบสาเหตุ')}</div><button class="go" id="paGo">ลองใหม่</button>`;
      $('paGo').onclick = run; return;
    }
    result = res.pa; result.at = Date.now(); result.abs = snap.absorption; sideRes = null; sidePick = null;
    result.mtf = {}; Object.values(payload.tfs || {}).forEach(t => { result.mtf[t.tf] = { trend: t.trend }; }); result.smcH1 = payload.tfs && payload.tfs.H1 ? payload.tfs.H1.smc : null; result.conf = payload.confluence || []; result.opt = payload.options; result.quant = payload.quant; showPlan = result.action !== 'WAIT' || !!result.entry;
    bd().innerHTML = `<canvas id="paCv"></canvas>` + resultHTML(result, false);
    drawMini($('paCv'), draw, draw.length, null, result, null);
    requestAnimationFrame(() => { const i = bd().querySelector('.conf .bar i'); if (i) i.style.width = (result.confidence || 0) + '%'; });
    window.OIColorize && OIColorize(bd());
    bindResult(); bindSides(); O.markDirty();
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
  function close() { stopSpeak(); tray.classList.remove('open'); tray.setAttribute('aria-hidden', 'true'); }
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
