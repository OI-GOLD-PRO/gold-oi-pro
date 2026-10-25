// แดชบอร์ดวิเคราะห์ตลาดทองคำ
// ข้อมูลมาจาก Apps Script (?api=data) ทุกครั้งที่เปิดหน้า:
//   - levels + cfg.volume  → คำนวณ PCR, Max Pain, ความแข็งของแนว, Volume × OI ในหน้าเว็บ
//   - cfg.dash (JSON)      → ผลวิเคราะห์ที่เขียนจากแชททุกครั้งที่ "อัพเดท": แนวโน้ม คะแนน เข็มวัด แนวสำคัญ ความคิด MM ข่าว ประวัติ
(() => {
  'use strict';
  const O = window.OI;
  if (!O || !O.fetchData) return;
  const $ = id => document.getElementById(id);
  const SY = {
    gold: { label: 'ทองคำ', ico: '🥇', dec: 0, pdec: 2, near: 6, unit: '$' },
  };
  let cur = 'gold'; // แดชบอร์ดเหลือทองคำอย่างเดียว (ตัดน้ำมันออก)
  const cache = {};

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const fmt = (v, d) => (v === null || v === undefined || !isFinite(v)) ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sgn = v => (v > 0 ? '+' : '') + v;

  // ---------- สไตล์ ----------
  const st = document.createElement('style');
  st.textContent = `
  #dash { position: fixed; inset: 0; z-index: 45; background: var(--bg); display: flex; flex-direction: column; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
  #dash .dtop { display: flex; align-items: center; gap: 8px; padding: 10px 14px 8px; border-bottom: 1px solid var(--line); }
  #dash .dtop h2 { margin: 0; font: 600 15px var(--sans); color: var(--gold); flex: 1; min-width: 0; }
  #dash .dtabs { display: flex; gap: 4px; }
  #dash .dtabs button { background: transparent; border: 1px solid var(--line); color: var(--muted); border-radius: 8px; padding: 5px 10px; font: 600 12px var(--sans); }
  #dash .dtabs button.on { background: var(--gold); border-color: var(--gold); color: #1a1405; }
  #dash .dbody { flex: 1; overflow: auto; -webkit-overflow-scrolling: touch; }
  #dash .dwrap { max-width: 760px; margin: 0 auto; padding: 12px 14px 28px; display: grid; gap: 10px; }
  #dash .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; min-width: 0; }
  #dash .card h3 { margin: 0 0 8px; font: 600 12px var(--sans); color: var(--muted); letter-spacing: .02em; }
  #dash .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  @media (max-width: 560px) { #dash .grid2 { grid-template-columns: 1fr; } }
  #dash .hero { display: flex; gap: 14px; align-items: center; }
  #dash .arrow { width: 64px; height: 64px; flex: none; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 700; }
  #dash .arrow.up { background: rgba(47,191,143,.14); color: var(--call); }
  #dash .arrow.down { background: rgba(229,87,107,.14); color: var(--put); }
  #dash .arrow.side { background: rgba(224,180,76,.14); color: var(--gold); }
  #dash .arrow span { display: inline-block; transition: transform .4s; }
  #dash .tl { font: 600 18px var(--sans); }
  #dash .hl { font-size: 13px; color: var(--fg); margin-top: 2px; line-height: 1.5; }
  #dash .meta { font: 10.5px var(--mono); color: var(--muted); margin-top: 6px; line-height: 1.6; }
  #dash .score { margin-top: 10px; }
  #dash .sbar { position: relative; height: 8px; border-radius: 4px; background: linear-gradient(90deg, var(--put), #39405a 50%, var(--call)); }
  #dash .sbar i { position: absolute; top: -4px; width: 4px; height: 16px; border-radius: 2px; background: var(--fg); box-shadow: 0 0 0 2px var(--bg); transform: translateX(-2px); }
  #dash .slab { display: flex; justify-content: space-between; font: 10px var(--mono); color: var(--muted); margin-top: 4px; }
  #dash .slab b { color: var(--fg); font-size: 12px; }
  #dash .tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  #dash .tile { background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; min-width: 0; }
  #dash .tile small { display: block; font: 10.5px var(--sans); color: var(--muted); }
  #dash .tile b { display: block; font: 600 17px var(--mono); font-variant-numeric: tabular-nums; margin-top: 2px; }
  #dash .tile em { display: block; font: normal 10px var(--sans); color: var(--muted); margin-top: 1px; }
  #dash .gauge { display: flex; flex-direction: column; align-items: center; }
  #dash .gauge svg { width: 100%; max-width: 260px; height: auto; }
  #dash .alert { border-radius: 12px; padding: 10px 12px; font-size: 13px; line-height: 1.5; background: #2a2208; border: 1px solid var(--gold); }
  #dash .alert b { color: var(--gold); font-family: var(--mono); }
  #dash .warn { font-size: 12px; color: var(--gold); line-height: 1.5; }
  #dash .ladder { display: grid; gap: 4px; }
  #dash .lv { display: grid; grid-template-columns: 70px 1fr 64px; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: var(--bg); border-left: 3px solid var(--line); }
  #dash .lv.R { border-left-color: var(--call); } #dash .lv.S { border-left-color: var(--put); } #dash .lv.P { border-left-color: var(--mp); }
  #dash .lv .p { font: 600 13px var(--mono); }
  #dash .lv.R .p { color: var(--call); } #dash .lv.S .p { color: var(--put); } #dash .lv.P .p { color: var(--mp); }
  #dash .lv .t { font-size: 11.5px; color: var(--fg); min-width: 0; }
  #dash .lv .t small { display: block; color: var(--muted); font-size: 10px; }
  #dash .lv .str { display: flex; gap: 2px; justify-content: flex-end; }
  #dash .lv .str i { width: 9px; height: 9px; border-radius: 2px; background: var(--line); }
  #dash .lv.R .str i.on { background: var(--call); } #dash .lv.S .str i.on { background: var(--put); } #dash .lv.P .str i.on { background: var(--mp); }
  #dash .now { display: flex; align-items: center; gap: 8px; font: 600 12px var(--mono); color: var(--gold); padding: 2px 8px; }
  #dash .now::before, #dash .now::after { content: ''; flex: 1; height: 1px; background: var(--gold); opacity: .6; }
  #dash table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  #dash th { text-align: left; font: 600 10.5px var(--sans); color: var(--muted); padding: 4px 4px; border-bottom: 1px solid var(--line); }
  #dash td { padding: 5px 4px; border-bottom: 1px solid var(--line); font-family: var(--mono); font-variant-numeric: tabular-nums; }
  #dash td.tag { font-family: var(--sans); }
  #dash .tg { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 10.5px; border: 1px solid var(--line); white-space: nowrap; }
  #dash .tg.new { color: var(--call); border-color: rgba(47,191,143,.5); }
  #dash .tg.close { color: var(--put); border-color: rgba(229,87,107,.5); }
  #dash .tg.hold { color: var(--gold); border-color: rgba(224,180,76,.5); }
  #dash .tg.turn { color: var(--muted); }
  #dash ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 13px; line-height: 1.55; }
  #dash .news { display: grid; gap: 8px; }
  #dash .nw { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: start; font-size: 12.5px; line-height: 1.5; }
  #dash .nw .im { font: 600 10px var(--sans); padding: 2px 7px; border-radius: 999px; white-space: nowrap; margin-top: 1px; }
  #dash .im.pos { background: rgba(47,191,143,.15); color: var(--call); }
  #dash .im.neg { background: rgba(229,87,107,.15); color: var(--put); }
  #dash .im.neu { background: rgba(138,147,171,.15); color: var(--muted); }
  #dash .nw a { color: var(--muted); font-size: 10.5px; text-decoration: none; }
  #dash .chart svg { width: 100%; height: auto; display: block; }
  #dash .cleg { display: flex; gap: 12px; flex-wrap: wrap; font-size: 10.5px; color: var(--muted); margin-top: 4px; }
  #dash .cleg i { display: inline-block; width: 10px; height: 4px; border-radius: 2px; vertical-align: middle; margin-right: 4px; }
  #dash .msg { padding: 40px 16px; text-align: center; color: var(--muted); font-size: 13px; }
  #dash .note { font-size: 10.5px; color: var(--muted); line-height: 1.5; }
  @supports (-webkit-touch-callout: none) { #dash { padding-top: calc(env(safe-area-inset-top, 0px) + 6px) !important; } #aiwrap { padding-top: env(safe-area-inset-top, 0px); } }
  @media (max-width: 440px) { #dash .dtop h2 { font-size: 14px; } #dash .dtop { gap: 6px; padding: 10px 10px 8px; } #dash .dtabs button { padding: 5px 8px; } }
  #dash .aibtn { background: linear-gradient(135deg, #1b2a4a, #2a1b4a); border: 1px solid #5b7cff; color: #cfe0ff; border-radius: 10px; padding: 6px 10px; font: 600 12px var(--sans); white-space: nowrap; box-shadow: 0 0 10px rgba(91,124,255,.35); }
  #dash .aibtn:active { transform: scale(.96); }
  #aiwrap { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; background: rgba(4,8,20,.88); animation: aifade .25s ease-out; }
  @keyframes aifade { from { opacity: 0 } to { opacity: 1 } }
  #aiwrap .box { position: relative; width: min(340px, 88vw); padding: 22px 18px 18px; border-radius: 20px; background-color: #080d1e; background-image: radial-gradient(120% 90% at 50% 0%, #142048 0%, #080d1e 70%); border: 1px solid rgba(91,124,255,.45); box-shadow: 0 0 40px rgba(60,120,255,.25), inset 0 0 30px rgba(60,120,255,.08); overflow: hidden; text-align: center; color: #dbe6ff; }
  #aiwrap .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(91,124,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(91,124,255,.08) 1px, transparent 1px); background-size: 18px 18px; animation: aigrid 6s linear infinite; pointer-events: none; }
  @keyframes aigrid { to { background-position: 0 180px, 180px 0; } }
  #aiwrap .scan { position: absolute; left: 0; right: 0; height: 60px; top: -60px; background: linear-gradient(180deg, transparent, rgba(0,229,255,.18), transparent); animation: aiscan 2.2s ease-in-out infinite; pointer-events: none; }
  @keyframes aiscan { to { top: 100%; } }
  #aiwrap svg { width: 168px; height: 168px; display: block; margin: 0 auto; position: relative; }
  #aiwrap .r1 { transform-origin: 84px 84px; animation: airot 6s linear infinite; }
  #aiwrap .r2 { transform-origin: 84px 84px; animation: airot 3.5s linear infinite reverse; }
  #aiwrap .r3 { transform-origin: 84px 84px; animation: airot 9s linear infinite; }
  @keyframes airot { to { transform: rotate(360deg); } }
  #aiwrap .core { transform-origin: 84px 84px; animation: aipulse 1.4s ease-in-out infinite; }
  @keyframes aipulse { 50% { transform: scale(1.12); opacity: .75; } }
  #aiwrap h4 { margin: 8px 0 2px; font: 700 16px var(--sans); letter-spacing: .04em; background: linear-gradient(90deg, #7ad7ff, #b18cff, #ffd36b, #7ad7ff); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: aihue 3s linear infinite; position: relative; }
  @keyframes aihue { to { background-position: 300% 0; } }
  #aiwrap .hex { font: 10px var(--mono); color: rgba(122,215,255,.55); height: 14px; overflow: hidden; white-space: nowrap; position: relative; }
  #aiwrap ol { list-style: none; margin: 12px 0 6px; padding: 0; text-align: left; display: grid; gap: 6px; position: relative; }
  #aiwrap li { font-size: 12.5px; color: #6f7ea8; display: flex; gap: 8px; align-items: center; transition: color .3s; }
  #aiwrap li i { width: 16px; height: 16px; flex: none; border-radius: 50%; border: 1.5px solid #3a4770; display: inline-flex; align-items: center; justify-content: center; font-style: normal; font-size: 10px; }
  #aiwrap li.on { color: #dbe6ff; } #aiwrap li.on i { border-color: #00e5ff; border-top-color: transparent; animation: airot .8s linear infinite; }
  #aiwrap li.done { color: #8fe3b3; } #aiwrap li.done i { border-color: #2fbf8f; background: #2fbf8f; color: #04140d; animation: none; }
  #aiwrap .bar { height: 4px; border-radius: 2px; background: #1a2442; overflow: hidden; margin-top: 8px; position: relative; }
  #aiwrap .bar b { position: absolute; inset: 0 auto 0 0; width: 0; background: linear-gradient(90deg, #00e5ff, #b18cff); box-shadow: 0 0 10px #00e5ff; transition: width .6s ease; }
  #aiwrap .tm { font: 10.5px var(--mono); color: #6f7ea8; margin-top: 6px; position: relative; }
  #aiwrap .err { color: #ff8a9a; font-size: 12.5px; margin-top: 10px; line-height: 1.5; position: relative; }
  #aiwrap button { margin-top: 12px; background: #1b2a4a; border: 1px solid #5b7cff; color: #cfe0ff; border-radius: 10px; padding: 7px 16px; font: 600 12px var(--sans); position: relative; }
  #dash .cal { display: grid; gap: 10px; }
  #dash .cal .day { font: 600 12px var(--sans); color: var(--gold); margin-bottom: 4px; }
  #dash .cal .ev { display: grid; grid-template-columns: 42px 12px 1fr; gap: 6px; align-items: start; font-size: 12px; line-height: 1.45; padding: 3px 0; border-bottom: 1px dashed var(--line); }
  #dash .cal .ev.past { opacity: .6; }
  #dash .cal .ev .t { font: 11px var(--mono); color: var(--muted); padding-top: 1px; }
  #dash .cal .ev .d { width: 9px; height: 9px; border-radius: 50%; margin-top: 4px; }
  #dash .cal .ev small { display: block; color: var(--muted); font: 10.5px var(--mono); }
  #dash .cal .ev b.g { color: var(--put); } #dash .cal .ev b.b { color: var(--call); }
  #dash .cf { border-radius: 12px; padding: 10px 12px; display: flex; gap: 10px; align-items: center; }
  #dash .cf.bull { background: rgba(47,191,143,.12); border: 1px solid rgba(47,191,143,.5); }
  #dash .cf.bear { background: rgba(229,87,107,.12); border: 1px solid rgba(229,87,107,.5); }
  #dash .cf.mix { background: rgba(224,180,76,.10); border: 1px solid rgba(224,180,76,.5); }
  #dash .cf .ic { font-size: 26px; }
  #dash .cf b { display: block; font: 600 15px var(--sans); }
  #dash .cf span { display: block; font-size: 12px; color: var(--fg); line-height: 1.5; margin-top: 2px; }
  #dash .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
  #dash .half { background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; min-width: 0; }
  #dash .half small { display: block; font: 10.5px var(--sans); color: var(--muted); }
  #dash .half b { display: block; font: 600 14px var(--sans); margin-top: 2px; }
  #dash .half em { display: block; font: normal 10.5px var(--mono); color: var(--muted); margin-top: 2px; line-height: 1.5; }
  #dash .up { color: var(--call); } #dash .dn { color: var(--put); } #dash .md { color: var(--gold); }
  #dash .ph { margin-top: 10px; font-size: 12.5px; line-height: 1.55; }
  #dash .ph .tg { margin-right: 6px; }
  #dash details { margin-top: 8px; } #dash summary { font-size: 11.5px; color: var(--muted); cursor: pointer; }
  #dash .fx { display: grid; grid-template-columns: 1fr 44px 56px; gap: 2px 8px; font: 11px var(--mono); margin-top: 6px; }
  #dash .fx span:nth-child(3n+1) { font-family: var(--sans); color: var(--muted); }
  #dash .oc-now { font-size: 12.5px; line-height: 1.7; margin: 4px 0 8px; } #dash .oc-t { font-size: 11.5px; color: var(--muted); }
  #dash .oc-tb { display: grid; gap: 4px; } #dash .oc-r { display: grid; grid-template-columns: 78px 76px 1fr; gap: 6px; font-size: 11px; line-height: 1.45; padding: 5px 7px; border-radius: 7px; background: rgba(138,147,173,.07); color: var(--muted); }
  #dash .oc-r.oc3 { grid-template-columns: 78px 72px 1fr; } #dash .oc-r.on { background: rgba(224,180,76,.16); color: var(--text, #e8ecf8); outline: 1px solid rgba(224,180,76,.55); }
  #dash .fx span:nth-child(3n+2), #dash .fx span:nth-child(3n) { text-align: right; }
  `;
  document.head.appendChild(st);

  // ---------- ปุ่มในแถบหัว + หน้าต่าง ----------
  const btn = document.createElement('button');
  btn.className = 'icon'; btn.id = 'dashBtn'; btn.textContent = '📊';
  btn.setAttribute('aria-label', 'แดชบอร์ดวิเคราะห์ตลาด');
  const hdr = document.querySelector('header');
  if (hdr) hdr.insertBefore(btn, $('bell'));
  if (document.documentElement.classList.contains('embed')) btn.hidden = true;

  const box = document.createElement('div');
  box.id = 'dash'; box.hidden = true;
  box.innerHTML = `<div class="dtop"><h2>📊 <span class="dtt">วิเคราะห์ทองคำ</span></h2><div class="dtabs" id="dTabs"></div>
    <button class="aibtn" id="dAI" aria-label="ให้ AI วิเคราะห์ตอนนี้">🤖 วิเคราะห์</button>
    <button class="icon" id="dReload" aria-label="โหลดใหม่">⟳</button><button class="icon" id="dClose" aria-label="ปิด">✕</button></div>
    <div class="dbody" id="dBody"></div>`;
  document.body.appendChild(box);
  const tabs = () => { if (Object.keys(SY).length < 2) { $('dTabs').innerHTML = ''; return; } $('dTabs').innerHTML = Object.keys(SY).map(k => `<button data-s="${k}" class="${k === cur ? 'on' : ''}">${SY[k].ico} ${SY[k].label}</button>`).join(''); };
  $('dTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cur = b.dataset.s; tabs(); show(); });
  $('dClose').addEventListener('click', () => { box.hidden = true; });
  // ปัดไปทางขวาเพื่อกลับไปหน้ากราฟ (เหมือนปุ่มย้อนกลับ) · ต้องลากแนวนอนชัดเจน ≥ 80px และไม่ใช่การเลื่อนขึ้นลง
  { let sx = null, sy = null, t0 = 0, horiz = null;
    box.addEventListener('touchstart', e => { if (e.touches.length !== 1) { sx = null; return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = Date.now(); horiz = null; box.style.transition = 'none'; }, { passive: true });
    box.addEventListener('touchmove', e => {
      if (sx === null) return;
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (horiz === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) horiz = Math.abs(dx) > Math.abs(dy) * 1.5 && dx > 0;
      if (horiz) box.style.transform = `translateX(${Math.max(0, dx)}px)`;
    }, { passive: true });
    box.addEventListener('touchend', e => {
      if (sx === null) return;
      const dx = (e.changedTouches[0] || {}).clientX - sx;
      const go = horiz && (dx > 80 || (dx > 40 && Date.now() - t0 < 250));
      box.style.transition = 'transform .18s ease-out';
      if (go) { box.style.transform = 'translateX(100%)'; setTimeout(() => { box.hidden = true; box.style.transform = ''; box.style.transition = ''; }, 180); }
      else box.style.transform = '';
      sx = null; horiz = null;
    });
  }
  $('dReload').addEventListener('click', () => load(true));
  // ---------- ปุ่ม "วิเคราะห์": ป๊อปอัพแอนิเมชันระหว่าง AI ทำงาน ----------
  $('dAI').addEventListener('click', runAI);
  async function runAI() {
    if (!O.aiAnalyze || document.getElementById('aiwrap')) return;
    const steps = ['ดึง OI · Volume · IV สดจาก TradingView', 'คำนวณ Gamma Flip · Max Pain · Expected Move', 'อ่าน COT กองทุน + DXY และปฏิทินข่าว', 'ส่งข้อมูลให้ AI (DeepSeek) วิเคราะห์', 'ตรวจตัวเลขแนวรับ-ต้าน และบันทึกผล'];
    const w = document.createElement('div'); w.id = 'aiwrap';
    w.innerHTML = `<div class="box"><div class="grid"></div><div class="scan"></div>
      <svg viewBox="0 0 168 168" aria-hidden="true"><defs><linearGradient id="aig" x1="0" x2="1"><stop offset="0" stop-color="#00e5ff"/><stop offset="1" stop-color="#b18cff"/></linearGradient>
        <radialGradient id="aic"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#7ad7ff"/><stop offset="1" stop-color="#1b3a8a" stop-opacity="0"/></radialGradient></defs>
        <g class="r3"><circle cx="84" cy="84" r="78" fill="none" stroke="rgba(91,124,255,.35)" stroke-width="1" stroke-dasharray="2 6"/></g>
        <g class="r1"><circle cx="84" cy="84" r="66" fill="none" stroke="url(#aig)" stroke-width="3" stroke-dasharray="70 34 18 34" stroke-linecap="round"/><circle cx="150" cy="84" r="4" fill="#00e5ff"/></g>
        <g class="r2"><circle cx="84" cy="84" r="50" fill="none" stroke="#ffd36b" stroke-width="2" stroke-dasharray="10 14" opacity=".8"/><circle cx="34" cy="84" r="3" fill="#ffd36b"/></g>
        <g class="core"><circle cx="84" cy="84" r="30" fill="url(#aic)" opacity=".9"/><text x="84" y="90" text-anchor="middle" font-size="18" font-weight="700" fill="#06102a" font-family="JetBrains Mono">AI</text></g>
      </svg>
      <h4>AI กำลังวิเคราะห์ตลาดทองคำ</h4><div class="hex" id="aiHex"></div>
      <ol>${steps.map(t => `<li><i></i><span>${t}</span></li>`).join('')}</ol>
      <div class="bar"><b id="aiBar"></b></div><div class="tm" id="aiTm">0 วินาที</div><div id="aiErr"></div></div>`;
    document.body.appendChild(w);
    const lis = [...w.querySelectorAll('li')], t0 = Date.now();
    let cur = 0; const setStep = i => { lis.forEach((li, j) => { li.className = j < i ? 'done' : j === i ? 'on' : ''; if (j < i) li.querySelector('i').textContent = '✓'; }); $('aiBar').style.width = Math.min(96, (i + .5) / steps.length * 100) + '%'; };
    setStep(0);
    const hexChars = '0123456789ABCDEF';
    const iv = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      $('aiTm').textContent = `${Math.floor(s)} วินาที`;
      $('aiHex').textContent = Array.from({ length: 34 }, () => hexChars[Math.floor(Math.random() * 16)]).join('').replace(/(.{4})/g, '$1 ');
      const want = s < 2 ? 0 : s < 4 ? 1 : s < 6 ? 2 : 3; // ขั้น 4 (AI) ค้างจนได้ผล
      if (want > cur) { cur = want; setStep(cur); }
    }, 120);
    const res = await O.aiAnalyze();
    if (res && res.ok) {
      cur = 4; setStep(4);
      await new Promise(r => setTimeout(r, 500));
      setStep(5); $('aiBar').style.width = '100%';
      await new Promise(r => setTimeout(r, 600));
      clearInterval(iv); w.remove();
      await load(true);
      const b = $('dBody'); if (b) b.scrollTop = 0;
      if (O.showToast) O.showToast(res.cached ? 'เพิ่งวิเคราะห์ไปไม่ถึง 1 นาที แสดงผลล่าสุด' : '✅ AI วิเคราะห์เสร็จแล้ว');
    } else {
      clearInterval(iv);
      const msg = !res ? 'ไม่ได้รับคำตอบ' : res.error === 'auth' ? 'รหัสผ่านใช้ไม่ได้' : res.error === 'busy' ? 'AI กำลังวิเคราะห์อยู่จากอีกเครื่อง ลองใหม่อีกครู่' : res.error;
      $('aiErr').innerHTML = `<div class="err">วิเคราะห์ไม่สำเร็จ: ${esc(msg)}</div><button id="aiClose">ปิด</button>`;
      $('aiClose').addEventListener('click', () => w.remove());
    }
  }
  btn.addEventListener('click', () => { box.hidden = false; tabs(); load(true); });

  async function load(force) {
    $('dBody').innerHTML = '<div class="msg">กำลังโหลดข้อมูลล่าสุดจากชีต…</div>';
    loadCOT(force).then(() => { pubCot(); if (!box.hidden && cur === 'gold') show(); });
    if (window.OICotGroups) OICotGroups.load(force).then(() => { if (!box.hidden && cur === 'gold') show(); });
    loadCal().then(() => { if (!box.hidden) show(); });
    await Promise.all(Object.keys(SY).map(async s => {
      if (!force && cache[s]) return;
      try { cache[s] = { d: await O.fetchData(s), at: new Date() }; } catch (e) { cache[s] = { err: e.message || String(e) }; }
    }));
    show();
  }

  // ---------- COT (CFTC) + Gamma Flip ----------
  // COT ทองคำ COMEX (088691) รายงาน Disaggregated ของ CFTC: ข้อมูล ณ วันอังคาร ประกาศคืนวันศุกร์ (ไทย ~02:30 เสาร์)
  // ราคาทองรายวันจาก Worker (Yahoo GC=F) ใช้คิดราคาเปลี่ยนแปลงรายสัปดาห์ (วันอังคารถึงวันอังคาร)
  const CFTC = 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json';
  const GCW = 'https://gc-yahoo.oigoldpro.workers.dev/?tf=1d';
  let cot = null; // { rows:[...ใหม่→เก่า], px:[[sec,close]], at, err }
  async function loadCOT(force) {
    if (!force && cot && !cot.err && Date.now() - cot.at < 3 * 3600e3) return;
    try {
      if (!force) { const c = JSON.parse(localStorage.getItem('cot_cache2') || 'null'); if (c && Date.now() - c.at < 3 * 3600e3) { cot = c; return; } }
    } catch (e) {}
    try {
      const sel = ['report_date_as_yyyy_mm_dd', 'open_interest_all', 'm_money_positions_long_all', 'm_money_positions_short_all', 'prod_merc_positions_long', 'prod_merc_positions_short', 'swap_positions_long_all', 'swap__positions_short_all', 'nonrept_positions_long_all', 'nonrept_positions_short_all'].join(',');
      const u = `${CFTC}?cftc_contract_market_code=088691&$select=${sel}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=170`;
      // DXY (ICE US Dollar Index 098662) รายงาน Legacy: นักเก็งกำไร (Non-commercial) สุทธิ
      const ud = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?cftc_contract_market_code=098662&$select=report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all,open_interest_all&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=2`;
      const [r1, r2, r3] = await Promise.all([fetch(u), fetch(GCW).catch(() => null), fetch(ud).catch(() => null)]);
      if (!r1.ok) throw new Error('CFTC HTTP ' + r1.status);
      const raw = await r1.json();
      const n = v => Number(v) || 0;
      const rows = raw.map(x => ({ d: String(x.report_date_as_yyyy_mm_dd).slice(0, 10), oi: n(x.open_interest_all),
        mm: n(x.m_money_positions_long_all) - n(x.m_money_positions_short_all), mmL: n(x.m_money_positions_long_all), mmS: n(x.m_money_positions_short_all),
        cm: n(x.prod_merc_positions_long) + n(x.swap_positions_long_all) - n(x.prod_merc_positions_short) - n(x.swap__positions_short_all),
        nrL: n(x.nonrept_positions_long_all), nrS: n(x.nonrept_positions_short_all) }));
      let px = [];
      try { if (r2 && r2.ok) px = (((await r2.json()).bars || {})['1d'] || []).map(b => [b[0], b[4]]); } catch (e) {}
      let dxy = null;
      try { if (r3 && r3.ok) { const a = await r3.json(); if (a.length >= 2) { const nt = x => n(x.noncomm_positions_long_all) - n(x.noncomm_positions_short_all); dxy = { d: String(a[0].report_date_as_yyyy_mm_dd).slice(0, 10), net: nt(a[0]), chg: nt(a[0]) - nt(a[1]), oi: n(a[0].open_interest_all) }; } } } catch (e) {}
      cot = { rows, px, dxy, at: Date.now() };
      try { localStorage.setItem('cot_cache2', JSON.stringify(cot)); } catch (e) {}
    } catch (e) { cot = { err: e.message || String(e), at: Date.now() }; }
  }
  // ราคาปิดของวันที่ (หรือวันทำการก่อนหน้า) จากแท่งรายวัน
  const pxOn = (px, d) => { const t = Date.parse(d + 'T23:59:59Z') / 1000; let v = null; for (const b of px) { if (b[0] <= t) v = b[1]; else break; } return v; };
  const clamp = v => Math.max(-100, Math.min(100, v));
  function cotCalc() {
    if (!cot || !cot.rows || cot.rows.length < 10) return null;
    const R = cot.rows, H = R.slice(0, 157); // ย้อนหลัง 3 ปี
    const maxAbs = a => Math.max(1, ...a.map(Math.abs));
    const d1 = i => R[i + 1] ? R[i].mm - R[i + 1].mm : 0, d8 = i => R[i + 8] ? R[i].mm - R[i + 8].mm : 0, o4 = i => R[i + 4] ? R[i].oi - R[i + 4].oi : 0;
    const idx = [...Array(Math.max(1, H.length - 8)).keys()];
    const L = R[0], P = R[1];
    const mmMin = Math.min(...H.map(r => r.mm)), mmMax = Math.max(...H.map(r => r.mm));
    const cmMin = Math.min(...H.map(r => r.cm)), cmMax = Math.max(...H.map(r => r.cm));
    const pct = (v, lo, hi) => hi > lo ? (v - lo) / (hi - lo) : 0.5;
    // ราคาวันอังคาร
    const p0 = cot.px.length ? pxOn(cot.px, L.d) : null, p1 = cot.px.length ? pxOn(cot.px, P.d) : null;
    const dP = p0 !== null && p1 !== null ? p0 - p1 : null;
    const wk = []; for (let i = 0; i + 1 < R.length && i < 52; i++) { const a = pxOn(cot.px, R[i].d), b = pxOn(cot.px, R[i + 1].d); if (a !== null && b !== null) wk.push(a - b); }
    const nrNet = L.nrL - L.nrS, nrTot = L.nrL + L.nrS;
    const S = [
      ['กองทุน (MM) เปลี่ยน 1 สัปดาห์', .30, clamp(d1(0) / maxAbs(idx.map(d1)) * 100)],
      ['กองทุน (MM) เปลี่ยน 8 สัปดาห์', .25, clamp(d8(0) / maxAbs(idx.map(d8)) * 100)],
      ['ราคาทองเปลี่ยน 1 สัปดาห์', .20, dP === null ? 0 : clamp(dP / maxAbs(wk) * 100)],
      ['OI รวมเปลี่ยน 4 สัปดาห์', .10, clamp(o4(0) / maxAbs(idx.map(o4)) * 100)],
      ['สวนทางรายย่อย', .05, clamp(-(nrTot ? nrNet / nrTot * 100 : 0))],
      ['Commercial เทียบ 3 ปี', .05, clamp(pct(L.cm, cmMin, cmMax) * 200 - 100)],
      ['กองทุนสุทธิ เทียบ 3 ปี', .05, clamp(pct(L.mm, mmMin, mmMax) * 200 - 100)],
    ];
    const raw = S.reduce((a, x) => a + x[1] * x[2], 0);
    // ปรับด้วย DXY: นักเก็งกำไรเปลี่ยนสถานะเกิน 2% ของ OI ของ DXY จึงนับ · ซื้อดอลลาร์ = กดทอง −5 · ขายดอลลาร์ = หนุนทอง +5
    const X = cot.dxy; let dxyAdj = 0, dxyTxt = 'ไม่มีข้อมูล DXY';
    if (X && X.oi) {
      const th = X.oi * 0.02;
      if (X.chg > th) { dxyAdj = -5; dxyTxt = raw >= 0 ? 'ดอลลาร์ถูกซื้อสวนทอง (Divergence)' : 'ดอลลาร์ถูกซื้อ ยืนยันทองขาลง'; }
      else if (X.chg < -th) { dxyAdj = 5; dxyTxt = raw <= 0 ? 'ดอลลาร์ถูกขายสวนทอง (Divergence)' : 'ดอลลาร์ถูกขาย ยืนยันทองขาขึ้น'; }
      else dxyTxt = 'ดอลลาร์ทรงตัว (เปลี่ยนไม่ถึง 2% ของ OI)';
    }
    const score = Math.round(clamp(raw + dxyAdj) * 10) / 10;
    const bias = score >= 20 ? 1 : score <= -20 ? -1 : 0;
    // ช่วงตลาด: ราคา × OI × กองทุน (สัปดาห์ล่าสุด)
    const dOI = L.oi - P.oi, dMM = L.mm - P.mm;
    let phase = null;
    if (dP !== null) {
      if (dP >= 0 && dOI >= 0) phase = ['bull', 'เงินใหม่เข้าฝั่งซื้อ', 'ราคาขึ้นพร้อม OI เพิ่ม' + (dMM >= 0 ? ' และกองทุนเพิ่ม Long' : ' แต่กองทุนลดสถานะ (ระวังแรงซื้อไม่ใช่กองทุน)')];
      else if (dP >= 0) phase = ['mix', 'ปิด Short (Short covering)', 'ราคาขึ้นแต่ OI ลด แรงขึ้นมาจากการปิด Short อาจไม่ยั่งยืน'];
      else if (dOI >= 0) phase = ['bear', 'เปิด Short ใหม่ / ขาลงมีแรงหนุน', 'ราคาลงพร้อม OI เพิ่ม' + (dMM <= 0 ? ' และกองทุนลดสถานะสุทธิ' : ' แต่กองทุนกลับเพิ่ม Long')];
      else phase = ['mix', 'ขายทิ้ง Long (Liquidation)', 'ราคาลงพร้อม OI ลด เป็นการปิดสถานะ ขาลงอาจใกล้หมดแรง'];
    }
    return { L, P, S, score, raw: Math.round(raw * 10) / 10, dxyAdj, dxyTxt, dxy: X, bias, phase, dP, p0, dOI, dMM, mmIdx: pct(L.mm, mmMin, mmMax) * 100, cmIdx: pct(L.cm, cmMin, cmMax) * 100,
      nrLongPct: nrTot ? L.nrL / nrTot * 100 : null, nrRank: (() => { // เปอร์เซ็นไทล์ของสัดส่วน Long รายย่อย เทียบประวัติ 3 ปีของตัวเอง
        const hs = H.map(r => r.nrL + r.nrS ? r.nrL / (r.nrL + r.nrS) : null).filter(v => v !== null), v = nrTot ? L.nrL / nrTot : null;
        return v === null || !hs.length ? null : hs.filter(x => x <= v).length / hs.length * 100; })(), d8: d8(0), oi4: o4(0), spark: R.slice(0, 52).map(r => r.mm).reverse() };
  }
  function cotCard(price, cfg) {
    if (!cot) return `<div class="card"><h3>🏦 COT + Gamma</h3><div class="note">กำลังโหลด COT จาก CFTC…</div></div>`;
    if (cot.err) return `<div class="card"><h3>🏦 COT + Gamma</h3><div class="note">โหลด COT ไม่สำเร็จ: ${esc(cot.err)} (กด ⟳)</div></div>`;
    const k = cotCalc(); if (!k) return '';
    let g = null; try { g = cfg.gmf ? JSON.parse(cfg.gmf) : null; } catch (e) {}
    const px = price !== null ? price : (g && isFinite(g.F) ? g.F : null);
    const LC = window.OILive && window.OILive.calc;
    const GM = window.OILive && window.OILive.d && window.OILive.d.gmfM;
    const flipM = GM && GM.M != null ? GM.M : (g && isFinite(+g.M) && g.M !== null ? +g.M : null);
    const flipI = LC && LC.match && LC.gmf !== null ? LC.gmf : (g && isFinite(+g.itd) && g.itd !== null ? +g.itd : null);
    const gam = (px !== null && flipM !== null) ? (px >= flipM ? 1 : -1) : 0;
    const bTxt = ['ขาลง', 'กลาง', 'ขาขึ้น'][k.bias + 1], bCls = ['dn', 'md', 'up'][k.bias + 1];
    // Confluence
    let cf;
    if (!gam) cf = ['mix', '❔', 'ยังไม่มี gmf', 'สั่ง "อัพเดท" เพื่อคำนวณ Gamma Flip'];
    else if (k.bias === -1 && gam === -1) cf = ['bear', '🔻', 'ไปทางเดียวกัน: ขาลง', 'COT ภาพใหญ่ลง และราคาอยู่ใต้ gmf M (Gamma ลบ วิ่งแรงตามทาง) ไม่ควรสวน Long เด้งขึ้นใช้เป็นจุดดูขาย'];
    else if (k.bias === 1 && gam === 1) cf = ['bull', '🔺', 'ไปทางเดียวกัน: ขาขึ้น', 'COT ภาพใหญ่ขึ้น และราคาอยู่เหนือ gmf M (Gamma บวก ตลาดนิ่ง) ย่อลงใช้เป็นจุดดูซื้อ'];
    else if (k.bias === 1 && gam === -1) cf = ['mix', '⚠️', 'ขัดกัน: ภาพใหญ่ขึ้น แต่ระยะสั้นผันผวน', 'กองทุนยังเอียงซื้อ แต่ราคาอยู่ใต้ gmf M ระวังไส้ลงแรง รอยืนกลับเหนือ gmf ก่อน'];
    else if (k.bias === -1 && gam === 1) cf = ['mix', '⚠️', 'ขัดกัน: ภาพใหญ่ลง แต่ระยะสั้นถูกตรึงในกรอบ', 'กองทุนเอียงขาย แต่ราคาอยู่เหนือ gmf M ตลาดมักแกว่งกรอบ หลุด gmf เมื่อไรขาลงจะเร่ง'];
    else cf = ['mix', '➖', 'ไม่ชัด', `COT เป็นกลาง ราคาอยู่${gam > 0 ? 'เหนือ' : 'ใต้'} gmf M ให้ใช้แนว OI เป็นหลัก`];
    const f0 = v => v === null || !isFinite(v) ? '–' : Math.round(v).toLocaleString('en-US');
    const sg = v => v === null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('en-US');
    const cl = v => v > 0 ? 'up' : v < 0 ? 'dn' : '';
    const ext = k.mmIdx >= 90 ? 'กองทุน Long สุดโต่ง (ระวังกลับตัวลง)' : k.mmIdx <= 10 ? 'กองทุนสุทธิต่ำสุดในรอบ 3 ปี (ระวังกลับตัวขึ้น)' : null;
    const sp = k.spark, sMin = Math.min(...sp), sMax = Math.max(...sp), W = 300, Hh = 40;
    const spark = sp.length > 1 ? `<svg viewBox="0 0 ${W} ${Hh}" style="width:100%;height:40px;display:block;margin-top:6px" aria-label="กองทุนสุทธิ 52 สัปดาห์"><polyline fill="none" stroke="var(--gold)" stroke-width="1.6" points="${sp.map((v, i) => `${i * W / (sp.length - 1)},${3 + (1 - (v - sMin) / ((sMax - sMin) || 1)) * (Hh - 6)}`).join(' ')}"/></svg><div class="note">กองทุน (MM) สุทธิ 52 สัปดาห์: ${f0(sMin)} ถึง ${f0(sMax)}</div>` : '';
    const dt = new Date(k.L.d + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    return `<div class="card"><h3>🏦 COT + Gamma (ภาพใหญ่รายสัปดาห์ × จังหวะจาก Gamma Flip)</h3>
      <div class="cf ${cf[0]}"><div class="ic">${cf[1]}</div><div><b>${cf[2]}</b><span>${cf[3]}</span></div></div>
      <div class="two">
        <div class="half"><small>ทิศ COT (คะแนน 7 ปัจจัย)</small><b class="${bCls}">${bTxt} ${k.score > 0 ? '+' : ''}${k.score}</b>
          <div class="sbar" style="margin-top:6px"><i style="left:${(k.score + 100) / 2}%"></i></div><em>ข้อมูล ณ ${dt} (อังคาร)</em></div>
        <div class="half"><small>Gamma (ราคา vs gmf)</small><b class="${gam > 0 ? 'up' : gam < 0 ? 'dn' : ''}">${gam > 0 ? 'เหนือ Flip · แกว่งกรอบ' : gam < 0 ? 'ใต้ Flip · วิ่งแรง' : '–'}</b>
          <em>gmf M ${flipM === null ? '–' : flipM.toFixed(1)}${px !== null && flipM !== null ? ` (${px >= flipM ? '+' : '−'}${Math.abs(px - flipM).toFixed(1)})` : ''}<br>gmf itd ${flipI === null ? '–' : flipI.toFixed(1)}${px !== null && flipI !== null ? ` (${px >= flipI ? '+' : '−'}${Math.abs(px - flipI).toFixed(1)})` : ''}</em></div>
      </div>
      ${k.phase ? `<div class="ph"><span class="tg ${k.phase[0] === 'bull' ? 'new' : k.phase[0] === 'bear' ? 'close' : 'hold'}">${esc(k.phase[1])}</span>${esc(k.phase[2])}</div>` : ''}
      ${ext ? `<div class="warn" style="margin-top:6px">⚠️ ${ext}</div>` : ''}
      <div class="tiles" style="margin-top:10px">
        <div class="tile"><small>กองทุน (Managed Money) สุทธิ</small><b>${sg(k.L.mm)}</b><em><span class="${cl(k.dMM)}">${sg(k.dMM)}</span> 1 สัปดาห์ · <span class="${cl(k.d8)}">${sg(k.d8)}</span> 8 สัปดาห์</em></div>
        <div class="tile"><small>COT Index 3 ปี (กองทุน)</small><b>${k.mmIdx.toFixed(0)}%</b><em>0% = ต่ำสุด 3 ปี · 100% = สูงสุด</em></div>
        <div class="tile"><small>Commercial (ผู้ผลิต+Swap) สุทธิ</small><b>${sg(k.L.cm)}</b><em>เทียบ 3 ปี ${k.cmIdx.toFixed(0)}% · <span class="${cl(k.L.cm - k.P.cm)}">${sg(k.L.cm - k.P.cm)}</span></em></div>
        <div class="tile"><small>รายย่อย ถือ Long</small><b class="${k.nrRank >= 80 ? 'dn' : k.nrRank <= 20 ? 'up' : ''}">${k.nrLongPct === null ? '–' : k.nrLongPct.toFixed(1) + '%'}</b><em>${k.nrRank === null ? '' : `สูงกว่า ${k.nrRank.toFixed(0)}% ของช่วง 3 ปี<br>`}${k.nrRank >= 80 ? 'Long แน่นผิดปกติ (เตือนใกล้ยอด)' : k.nrRank <= 20 ? 'Long น้อยผิดปกติ (มักใกล้ก้น)' : 'ปกติของทอง · สุทธิ ' + sg(k.L.nrL - k.L.nrS)}</em></div>
        <div class="tile"><small>OI รวม GC</small><b>${f0(k.L.oi)}</b><em><span class="${cl(k.dOI)}">${sg(k.dOI)}</span> 1 สัปดาห์ · <span class="${cl(k.oi4)}">${sg(k.oi4)}</span> 4 สัปดาห์</em></div>
        <div class="tile"><small>DXY นักเก็งกำไร สุทธิ</small><b>${k.dxy ? sg(k.dxy.net) : '–'}</b><em>${k.dxy ? `<span class="${cl(k.dxy.chg)}">${sg(k.dxy.chg)}</span> 1 สัปดาห์ · ` : ''}<span class="${cl(k.dxyAdj)}">${k.dxyAdj > 0 ? '+' : ''}${k.dxyAdj} คะแนน</span><br>${esc(k.dxyTxt)}</em></div>
        <div class="tile"><small>ราคา GC วันอังคาร</small><b>${k.p0 === null ? '–' : fmt(k.p0, 1)}</b><em><span class="${cl(k.dP)}">${k.dP === null ? '–' : (k.dP >= 0 ? '+' : '−') + Math.abs(k.dP).toFixed(1)}</span> จากสัปดาห์ก่อน</em></div>
      </div>
      ${spark}
      <details><summary>ดูที่มาของคะแนน COT (7 ปัจจัย + DXY)</summary><div class="fx"><span>ปัจจัย</span><span>น้ำหนัก</span><span>ค่า</span>
        ${k.S.map(x => `<span>${x[0]}</span><span>${Math.round(x[1] * 100)}%</span><span class="${cl(x[2])}">${x[2] > 0 ? '+' : ''}${x[2].toFixed(0)}</span>`).join('')}
        <span>รวม 7 ปัจจัย</span><span></span><span class="${cl(k.raw)}">${k.raw > 0 ? '+' : ''}${k.raw}</span>
        <span>ปรับ DXY</span><span></span><span class="${cl(k.dxyAdj)}">${k.dxyAdj > 0 ? '+' : ''}${k.dxyAdj}</span>
        <span>คะแนนสุดท้าย</span><span></span><span class="${cl(k.score)}">${k.score > 0 ? '+' : ''}${k.score}</span></div>
        <div class="note" style="margin-top:6px">ปัจจัย 1–4 หารด้วยค่าเปลี่ยนแปลงสูงสุดในอดีต (COT 3 ปี, ราคา 1 ปี) · ปัจจัย 6–7 เทียบช่วงต่ำสุด–สูงสุด 3 ปี · DXY: นักเก็งกำไรดอลลาร์ (Legacy, ICE DXY) เปลี่ยนเกิน 2% ของ OI → ซื้อดอลลาร์ −5 / ขายดอลลาร์ +5 · คะแนน ≥ +20 = ขาขึ้น, ≤ −20 = ขาลง</div></details>
      <div class="note" style="margin-top:6px">COT ช้า 3 วัน (ข้อมูลวันอังคาร ประกาศคืนวันศุกร์) ใช้ดูภาพใหญ่ ส่วน gmf ใช้ดูจังหวะ · ที่มา CFTC Disaggregated COMEX Gold</div></div>`;
  }

  // COT แยกรายกลุ่ม: กองทุน / Commercial / Non-commercial / รายย่อย (cotgroups.js)
  function cotGroupsCard() {
    if (!window.OICotGroups) return '';
    return `<div class="card"><h3>🏦 COT แยกกลุ่ม · กองทุน · Commercial · Non-commercial · รายย่อย</h3>${window.OICotGroups.html()}</div>`;
  }

  // ---------- กราฟแท่ง OI ราย strike ของสัญญาที่อัพเดทในชีต (Call ซ้าย / Put ขวา) ----------
  function oiBarsCard(ref, cfg) {
    const o = O.oi; if (!o || !o.rows || !o.rows.length) return '';
    const px = ref !== null && isFinite(ref) ? ref : null;
    const rows = o.rows.filter(r => r.c + r.p > 0);
    if (!rows.length) return '';
    const near = (px === null ? rows.slice().sort((a, b) => (b.c + b.p) - (a.c + a.p)) : rows.slice().sort((a, b) => Math.abs(a.strike - px) - Math.abs(b.strike - px))).slice(0, 17).sort((a, b) => b.strike - a.strike);
    const mx = Math.max(1, ...near.map(r => Math.max(r.c, r.p)));
    const topC = Math.max(...near.map(r => r.c)), topP = Math.max(...near.map(r => r.p));
    const f = n => Math.round(n).toLocaleString('en-US');
    const tC = rows.reduce((a, r) => a + r.c, 0), tP = rows.reduce((a, r) => a + r.p, 0);
    const bars = near.map(r => {
      const wc = Math.round(r.c / mx * 100), wp = Math.round(r.p / mx * 100);
      const isPx = px !== null && Math.abs(r.strike - px) < 2.5;
      return `<div style="display:grid;grid-template-columns:1fr 50px 1fr;align-items:center;gap:4px;font:10.5px var(--mono)${isPx ? ';background:rgba(224,180,76,.12);border-radius:4px' : ''}">
        <div style="display:flex;justify-content:flex-end;align-items:center;gap:4px">${r.c ? `<span style="color:var(--muted)${r.c === topC ? ';color:var(--call);font-weight:700' : ''}">${f(r.c)}</span><i style="display:block;height:8px;width:${wc}%;background:var(--call);border-radius:2px"></i>` : ''}</div>
        <span style="text-align:center">${r.strike}</span>
        <div style="display:flex;align-items:center;gap:4px">${r.p ? `<i style="display:block;height:8px;width:${wp}%;background:var(--put);border-radius:2px"></i><span style="color:var(--muted)${r.p === topP ? ';color:var(--put);font-weight:700' : ''}">${f(r.p)}</span>` : ''}</div></div>`;
    }).join('');
    return `<div class="card"><h3>📊 OI ราย strike · สัญญา ${esc(cfg.contract || '–')} (อัพเดท ${esc(cfg.offset_time || '–')})</h3>
      <div style="display:flex;justify-content:space-between;font:600 11px var(--sans);margin:2px 0 6px"><span style="color:var(--call)">◀ Call OI รวม ${f(tC)}</span><span style="color:var(--put)">Put OI รวม ${f(tP)} ▶</span></div>
      <div style="display:grid;gap:3px">${bars}</div>
      <div class="note">แท่งยาว = OI มาก · ตัวหนาคือ strike ที่ OI สูงสุดในช่วงที่แสดง · แถบทองคือ strike ใกล้ราคา</div></div>`;
  }

  // ---------- วิเคราะห์เปรียบเทียบ OI ตามตารางในบทความ (ราคา × OI × Volume / Option OI) ----------
  const FUT_T = [
    { p: 1, o: 1, t: 'เงินใหม่ไหลเข้า รายใหญ่กำลังไล่ซื้อและถือยาว', m: '🟢 ขาขึ้นแข็งแรง' },
    { p: 1, o: -1, t: 'ราคาขึ้นเพราะคนแห่ปิดสถานะ Short ไม่ใช่คนอยากซื้อเพิ่ม ระวังราคาจะร่วง', m: '🟠 ขึ้นเพราะ Short Covering' },
    { p: -1, o: 1, t: 'เงินใหม่ไหลเข้าฝั่งขาย รายใหญ่กำลังลงขายและมองว่าราคาจะลงได้อีก', m: '🔴 ขาลงแข็งแรง' },
    { p: -1, o: -1, t: 'คนที่ซื้อไว้ทนขาดทุนไม่ไหว เลยยอมคัทลอส แต่ไม่มีแรงขายใหม่เพิ่ม', m: '🟡 ลงเพราะคัทลอส ใกล้หมดแรงลง' },
  ];
  const OPT_T = [
    { p: 1, o: 1, y: 'C', t: 'เงินใหม่ไหลเข้า เงินเก็งกำไรเยอะขึ้น', m: '🟢' },
    { p: 1, o: -1, y: 'C', t: 'แรงเก็งกำไรลดลง คนไม่กล้าตาม', m: '🟠' },
    { p: -1, o: 1, y: 'C', t: 'ดูจะมีแรงรับซื้อ ถ้า Futures เข้าก็แปลว่าเก็บของ พร้อมวิ่ง', m: '🟡' },
    { p: -1, o: -1, y: 'C', t: 'ตลาดบอกตัวใครตัวมัน Dip ก่อนค่อยว่ากัน', m: '🔴' },
    { p: 1, o: 1, y: 'P', t: 'มีคนตั้งใจจะขายเยอะ ราคามักจะโดนกดลงหลังจากนั้น', m: '🔴' },
    { p: 1, o: -1, y: 'P', t: 'โดนลาก ตัวเบา', m: '🟢' },
    { p: -1, o: 1, y: 'P', t: 'คนเก็งกำไรขาลงเพิ่ม หรือคนป้องกันความเสี่ยงเพิ่ม เคสนี้ตอบยาก', m: '🟠' },
    { p: -1, o: -1, y: 'P', t: 'คนไม่กล้า Short ตาม หรือราคาลงเร็วไป ออกได้สองหน้า', m: '🟡' },
  ];
  // บันทึกยอด OI รวมของสัญญาที่อัพเดทไว้ในเครื่อง เพื่อเทียบกับการอัพเดทครั้งก่อน (ต้องมี ≥ 2 ครั้ง)
  function oiSnap(d, cfg, m, ref) {
    const KEY = 'oi_snap_v1', stamp = String(d.stamp || cfg.offset_time || ''), contract = String(cfg.contract || '');
    if (!stamp || !contract) return null;
    let st = null;
    try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    const now = { stamp, c: m.C, p: m.P, px: ref };
    if (!st || st.contract !== contract) st = { contract, cur: now, prev: null };
    else if (st.cur && st.cur.stamp !== stamp) st = { contract, cur: now, prev: st.cur };
    else if (st.cur) st.cur = Object.assign({}, st.cur, { px: ref !== null ? ref : st.cur.px });
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
    return st;
  }
  function oiCompareCard(d, cfg, m, ref) {
    const dir = (v, th) => v === null || !isFinite(v) ? 0 : v > th ? 1 : v < -th ? -1 : 0;
    const arrow = x => x > 0 ? '▲' : x < 0 ? '▼' : '▬';
    const pct = (a, b) => b ? (a - b) / b * 100 : null;
    const sgp = v => v === null ? '–' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    // ---- Futures: ราคา × OI รายสัปดาห์ (CFTC) ----
    let fut = '';
    const R = cot && cot.rows, hasPx = cot && cot.px && cot.px.length;
    if (R && R.length > 1 && hasPx) {
      const p0 = pxOn(cot.px, R[0].d), p1 = pxOn(cot.px, R[1].d);
      const dP = p0 !== null && p1 !== null ? pct(p0, p1) : null, dO = pct(R[0].oi, R[1].oi);
      const pd = dir(dP, 0.15), od = dir(dO, 0.3);
      const hit = pd && od ? FUT_T.find(r => r.p === pd && r.o === od) : null;
      fut = `<h3 style="margin-top:4px">① Futures: ราคา × Open Interest <span style="font-weight:400;color:var(--muted)">(สัปดาห์ถึง ${esc(R[0].d)})</span></h3>
        <div class="oc-now">ราคา <b class="${pd > 0 ? 'up' : pd < 0 ? 'dn' : ''}">${arrow(pd)} ${sgp(dP)}</b> · OI ทั้งตลาด <b class="${od > 0 ? 'up' : od < 0 ? 'dn' : ''}">${arrow(od)} ${sgp(dO)}</b> (${Math.round(R[0].oi).toLocaleString('en-US')} สัญญา)${hit ? ` → <b>${hit.m}</b><br><span class="oc-t">${esc(hit.t)}</span>` : '<br><span class="oc-t">ราคาหรือ OI แทบไม่เปลี่ยน ยังไม่เข้าเงื่อนไขในตาราง</span>'}</div>
        <div class="oc-tb">${FUT_T.map(r => `<div class="oc-r${r === hit ? ' on' : ''}"><span>${r.p > 0 ? 'ราคาพุ่ง ▲' : 'ราคาดิ่ง ▼'}</span><span>OI ${r.o > 0 ? 'เพิ่ม ▲' : 'ลด ▼'}</span><span>${esc(r.t)}</span></div>`).join('')}</div>
        <div class="note">ตารางต้นฉบับกำหนด Volume "สูง" ทุกแถว (OI Futures ใช้รายงาน CFTC รายสัปดาห์ จึงเป็นภาพรวมสัปดาห์ ไม่ใช่รายวัน)</div>`;
    }
    // ---- Options: ราคา × OI ของ Call / Put เทียบการอัพเดทครั้งก่อน ----
    const st = oiSnap(d, cfg, m, ref);
    let opt = '';
    if (st && st.prev && st.cur.px !== null && st.prev.px !== null && ref !== null) {
      const dP = pct(st.cur.px, st.prev.px), dC = pct(st.cur.c, st.prev.c), dPu = pct(st.cur.p, st.prev.p);
      const pd = dir(dP, 0.1), cd = dir(dC, 0.5), ud = dir(dPu, 0.5);
      const hc = pd && cd ? OPT_T.find(r => r.y === 'C' && r.p === pd && r.o === cd) : null;
      const hp = pd && ud ? OPT_T.find(r => r.y === 'P' && r.p === pd && r.o === ud) : null;
      opt = `<h3 style="margin-top:12px">② Options: ราคา × OI Call/Put <span style="font-weight:400;color:var(--muted)">(เทียบอัพเดทก่อน ${esc(st.prev.stamp)} → ${esc(st.cur.stamp)})</span></h3>
        <div class="oc-now">ราคา <b class="${pd > 0 ? 'up' : pd < 0 ? 'dn' : ''}">${arrow(pd)} ${sgp(dP)}</b><br>
          Call OI <b class="${cd > 0 ? 'up' : cd < 0 ? 'dn' : ''}">${arrow(cd)} ${sgp(dC)}</b>${hc ? ` → ${hc.m} ${esc(hc.t)}` : ' → ยังไม่เข้าเงื่อนไข'}<br>
          Put OI <b class="${ud > 0 ? 'dn' : ud < 0 ? 'up' : ''}">${arrow(ud)} ${sgp(dPu)}</b>${hp ? ` → ${hp.m} ${esc(hp.t)}` : ' → ยังไม่เข้าเงื่อนไข'}</div>
        <div class="oc-tb">${OPT_T.map(r => `<div class="oc-r oc3${r === hc || r === hp ? ' on' : ''}"><span>${r.p > 0 ? 'ราคาพุ่ง ▲' : 'ราคาดิ่ง ▼'}</span><span>${r.y === 'C' ? 'Call' : 'Put'} OI ${r.o > 0 ? '▲' : '▼'}</span><span>${esc(r.t)}</span></div>`).join('')}</div>
        <div class="note">เทียบ OI รวมทุก strike ของสัญญา ${esc(cfg.contract || '–')} ระหว่างการอัพเดทล่าสุดกับครั้งก่อนที่เปิดดูบนเครื่องนี้ · ถ้าสัญญาเปลี่ยนจะเริ่มเทียบใหม่</div>`;
    } else {
      opt = `<h3 style="margin-top:12px">② Options: ราคา × OI Call/Put</h3><div class="note">เก็บยอด OI ของการอัพเดทนี้ไว้แล้ว (${esc(cfg.contract || '–')} · ${esc(d.stamp || cfg.offset_time || '–')}) จะเปรียบเทียบได้เมื่อมีการอัพเดท OI ครั้งถัดไป (ต้องเปิดแอปบนเครื่องนี้ทั้งสองรอบ)</div>`;
    }
    if (!fut && !opt) return '';
    return `<div class="card"><h3>🔎 เปรียบเทียบ OI ตามบทความ</h3>${fut}${opt}</div>`;
  }

  // ---------- ออปชันสัญญาวันนี้แบบสด (จาก live.js / Worker) ----------
  function liveCard(price) {
    const L = window.OILive, c = L && L.calc;
    if (!L) return '';
    if (!c) return `<div class="card"><h3>⚡ ออปชันวันนี้ (สด · ช้า 10 นาที)</h3><div class="note">${L.err ? 'ดึงข้อมูลสดไม่ได้: ' + esc(L.err) : 'กำลังโหลด…'}</div></div>`;
    const px = price !== null ? price : c.S0;
    const f1 = v => v === null || v === undefined || !isFinite(v) ? '–' : Number(v).toFixed(1);
    const rel = v => v === null || px === null ? '' : ` <span class="${px >= v ? 'up' : 'dn'}">(${px >= v ? 'ราคาเหนือ' : 'ราคาใต้'} ${Math.abs(px - v).toFixed(1)})</span>`;
    const left = Math.max(0, c.expTs * 1000 - Date.now()), hh = Math.floor(left / 3600e3), mm = Math.floor(left % 3600e3 / 60e3);
    const upd = c.updated ? new Date(c.updated * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : '–';
    const skTxt = c.skew === null ? '–' : c.skew > 1.5 ? 'ตลาดกลัวขาลง (Put แพงกว่า)' : c.skew < -1.5 ? 'ตลาดไล่ซื้อขาขึ้น (Call แพงกว่า)' : 'สมดุล';
    const parts = [];
    parts.push(`<div class="tiles">
      <div class="tile"><small>gmf itd สด (${esc(c.root)})</small><b style="color:var(--gmfi)">${f1(c.gmf)}</b><em>${c.match ? rel(c.gmf) : 'OI ในชีตเป็นสัญญา ' + esc(c.cfgC || '–')}</em></div>
      <div class="tile"><small>gmf itd ปรับตามซื้อ/ขายวันนี้</small><b style="color:var(--gmfi)">${f1(c.gmfAdj)}</b><em>${c.gmfAdj !== null ? rel(c.gmfAdj) : 'volume ยังน้อย'}</em></div>
      <div class="tile"><small>Expected Move ถึงหมดอายุ</small><b style="color:#9aa7ff">±${f1(c.em)}</b><em>${c.openEM ? `กรอบวันนี้ ${f1(c.openF - c.openEM)} – ${f1(c.openF + c.openEM)}` : ''}</em></div>
      <div class="tile"><small>Skew (IV Put25Δ − Call25Δ)</small><b class="${c.skew > 1.5 ? 'dn' : c.skew < -1.5 ? 'up' : ''}">${c.skew === null ? '–' : (c.skew > 0 ? '+' : '') + c.skew.toFixed(1) + ' จุด'}</b><em>${skTxt}</em></div>
    </div>`);
    // ความกลัวของตลาด: จาก OI Put/Call ที่มากที่สุด + สัดส่วน Put/Call OI รวม
    if (c.match) {
      const sk = c.strikes.filter(s => s.c + s.p > 0);
      const mP = sk.reduce((m, s) => s.p > (m ? m.p : 0) ? s : m, null), mC = sk.reduce((m, s) => s.c > (m ? m.c : 0) ? s : m, null);
      const tP = sk.reduce((a, s) => a + s.p, 0), tC = sk.reduce((a, s) => a + s.c, 0);
      if (mP && mC && tC > 0) {
        const pcr = tP / tC, ratio = mP.p / mC.c;
        const lvl = ratio >= 1.15 || pcr >= 1.2 ? 'fear' : ratio <= 0.87 || pcr <= 0.8 ? 'greed' : 'neutral';
        const txt = { fear: '😨 กลัวขาลง · นักลงทุนซื้อประกันฝั่ง Put หนา', greed: '🚀 ไล่ซื้อขาขึ้น · Call OI หนากว่า', neutral: '⚖️ สมดุล · Put/Call ใกล้กัน' }[lvl];
        const col = lvl === 'fear' ? 'dn' : lvl === 'greed' ? 'up' : '';
        const dist = k => px === null ? '' : ` (${k >= px ? 'เหนือราคา +' : 'ใต้ราคา −'}${Math.abs(k - px).toFixed(1)})`;
        parts.push(`<h3 style="margin-top:12px">😨 ความกลัวของตลาด (จาก OI ที่มากที่สุด)</h3><div class="tiles">
          <div class="tile"><small>Put OI สูงสุด (กลัวลง)</small><b class="dn">${mP.k}</b><em>${Math.round(mP.p).toLocaleString('en-US')} สัญญา${dist(mP.k)}</em></div>
          <div class="tile"><small>Call OI สูงสุด (หวังขึ้น)</small><b class="up">${mC.k}</b><em>${Math.round(mC.c).toLocaleString('en-US')} สัญญา${dist(mC.k)}</em></div>
          <div class="tile"><small>Put/Call OI รวม</small><b class="${pcr >= 1.2 ? 'dn' : pcr <= 0.8 ? 'up' : ''}">${pcr.toFixed(2)}</b><em>Put ${Math.round(tP).toLocaleString('en-US')} / Call ${Math.round(tC).toLocaleString('en-US')}</em></div>
          <div class="tile"><small>สรุปอารมณ์ตลาด</small><b class="${col}" style="font-size:13px">${txt}</b><em>Put สูงสุด ÷ Call สูงสุด = ${ratio.toFixed(2)}×</em></div></div>
          <div class="note">&gt;1.2 = ตลาดกลัว/ป้องกันความเสี่ยง · &lt;0.8 = ตลาดมั่นใจขาขึ้น · Put OI สูงสุดมักเป็นแนวรับ แต่ถ้าราคาหลุดจะเร่งลงแรง</div>`);
      }
    }
    // GEX ราย strike: แยก Put (แดง ซ้าย) และ Call (เขียว ขวา) ให้เห็นทั้งสองฝั่ง
    const near = c.strikes.filter(s => s.c + s.p > 0).sort((a, b) => Math.abs(a.k - px) - Math.abs(b.k - px)).slice(0, 15).sort((a, b) => b.k - a.k);
    if (c.match && near.length) {
      const F2 = c.S0 * c.S0 * 0.01 * 100;
      const cg = s => (s.gC || 0) * s.c * F2, pg = s => (s.gP || 0) * s.p * F2;
      const mx = Math.max(1, ...near.map(s => Math.max(cg(s), pg(s))));
      parts.push(`<h3 style="margin-top:12px">GEX ราย strike (เขียว = Call ดึงราคาให้นิ่ง / แดง = Put เร่งให้วิ่ง)</h3><div style="display:grid;gap:3px">${near.map(s => {
        const wc = Math.round(cg(s) / mx * 100), wp = Math.round(pg(s) / mx * 100);
        const isPx = Math.abs(s.k - px) < 2.5;
        return `<div style="display:grid;grid-template-columns:46px 1fr 1fr;align-items:center;gap:4px;font:10.5px var(--mono)${isPx ? ';background:rgba(224,180,76,.12);border-radius:4px' : ''}"><span>${s.k}</span>
          <div style="display:flex;justify-content:flex-end">${wc ? `<i style="display:block;height:8px;width:${wc}%;background:var(--call);border-radius:2px"></i>` : ''}</div>
          <div>${wp ? `<i style="display:block;height:8px;width:${wp}%;background:var(--put);border-radius:2px"></i>` : ''}</div></div>`; }).join('')}</div>
        <div class="note">แต่ละ strike แสดงแรง Gamma ของ Call (ซ้าย) และ Put (ขวา) แยกกัน · ถ้าฝั่ง Call (ซ้าย) ว่างทุกแถว แปลว่า Call OI/Gamma ช่วงนี้น้อยมาก</div>`);
    }
    // ซื้อ/ขายสุทธิ + เงินใหม่
    const act = c.strikes.filter(s => s.vc + s.vp > 0).sort((a, b) => (b.vc + b.vp) - (a.vc + a.vp)).slice(0, 8).sort((a, b) => b.k - a.k);
    const vTop = Math.max(1, ...c.strikes.filter(s => Math.abs(s.k - px) <= 30).map(s => s.vc + s.vp));
    if (act.length) {
      const nt = (b, sl) => { const v = b + sl, n = b - sl; if (v < 10 || Math.abs(n) < Math.max(5, v * 0.2)) return '<span class="tg turn">ก้ำกึ่ง</span>'; return n > 0 ? `<span class="tg new">ซื้อ +${Math.round(n)}</span>` : `<span class="tg close">ขาย ${Math.round(n)}</span>`; };
      const mean = (s) => {
        const out = []; const cb = s.bc - s.sc, pb = s.bp - s.sp;
        if (s.vc >= 10 && cb > 0) out.push('เก็งขึ้น'); if (s.vc >= 10 && cb < 0) out.push('ตั้งเพดาน');
        if (s.vp >= 10 && pb > 0) out.push('ป้องกัน/เก็งลง'); if (s.vp >= 10 && pb < 0) out.push('รับซื้อแถวนี้');
        if (L.hot && L.hot(s, vTop)) out.push('🔥 เงินใหม่');
        return out.join(' · ');
      };
      parts.push(`<h3 style="margin-top:12px">ซื้อ/ขายสุทธิวันนี้ (8 strike ที่เทรดมากสุด · ประมาณจากราคาเทียบ bid/ask)</h3><table><thead><tr><th>Strike</th><th>Call</th><th>Put</th><th>Vol/OI</th></tr></thead><tbody>
        ${act.map(s => `<tr><td>${s.k}</td><td class="tag">${nt(s.bc, s.sc)}</td><td class="tag">${nt(s.bp, s.sp)}</td><td>${(s.c + s.p) ? ((s.vc + s.vp) / (s.c + s.p)).toFixed(1) : '∞'}</td></tr>${mean(s) ? `<tr><td></td><td colspan="3" style="font-family:var(--sans);font-size:10.5px;color:var(--muted);padding-top:0">${mean(s)}</td></tr>` : ''}`).join('')}</tbody></table>`);
    }
    return `<div class="card"><h3>⚡ ออปชันวันนี้ ${esc(c.root)} (สด · ช้า 10 นาที · อัปเดต ${upd} · เหลือ ${hh} ชม. ${mm} นาที)</h3>${parts.join('')}
      <div class="note" style="margin-top:8px">gmf itd สด = OI ของวัน + IV สด + เวลาที่เหลือ คำนวณทุก 1 นาที · แบบ "ปรับตามซื้อ/ขาย" ใช้ยอดซื้อ/ขายวันนี้แทนสมมติฐาน Call+/Put− (เป็นค่าประมาณ) · ป้ายบนกราฟ C▲ = Call ถูกซื้อ, C▼ = Call ถูกขาย, P▲/P▼ เช่นกัน, 🔥 = เงินใหม่ (volume ≥ OI และเทรดหนา)</div></div>`;
  }

  // ---------- ปฏิทินข่าว USD ทั้งสัปดาห์ (news.json จาก GitHub Actions: Forex Factory + FXStreet) ----------
  let cal = null;
  async function loadCal() {
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : 'OI-GOLD-PRO'}/gold-oi-pro/main/news.json?t=${Math.floor(Date.now() / 120000)}`, { cache: 'no-store' });
      const j = await r.json();
      cal = (j.events || []).filter(e => e.c === 'USD').map(e => ({ ...e, ms: Date.parse(e.date) })).filter(e => isFinite(e.ms)).sort((a, b) => a.ms - b.ms);
    } catch (e) { cal = cal || null; }
  }
  function calCard() {
    if (!cal || !cal.length) return '';
    // ตั้งแต่วันจันทร์ของสัปดาห์นี้ (เวลาไทย) ถึง 7 วันข้างหน้า
    const now = Date.now(), th = ms => new Date(ms + 7 * 3600e3);
    const d0 = th(now); const dow = (d0.getUTCDay() + 6) % 7;
    const monTH = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() - dow) - 7 * 3600e3;
    // ส.–อา.: แสดงสัปดาห์หน้า (ผลย้อนหลังแค่ 24 ชม.) · จ.–ศ.: ตั้งแต่วันจันทร์ของสัปดาห์นี้
    const start = dow >= 5 ? now - 24 * 3600e3 : monTH;
    const list = cal.filter(e => e.ms >= start && e.ms <= now + 8 * 864e5);
    if (!list.length) return '';
    const days = new Map();
    list.forEach(e => { const k = th(e.ms).toISOString().slice(0, 10); if (!days.has(k)) days.set(k, []); days.get(k).push(e); });
    const dn = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const html = [...days.entries()].map(([k, evs]) => {
      const d = new Date(k + 'T00:00:00Z');
      const isToday = k === th(now).toISOString().slice(0, 10);
      return `<div><div class="day">${isToday ? '▶ วันนี้ · ' : ''}${dn[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}</div>${evs.map(e => {
        const t = th(e.ms).toISOString().slice(11, 16), past = e.ms <= now;
        const res = e.actual ? `ออก <b class="${e.better === true ? 'g' : e.better === false ? 'b' : ''}">${esc(e.actual)}</b> (คาด ${esc(e.forecast || '–')})${e.better === true ? ' · ดีกว่าคาด → หนุนดอลลาร์ กดทอง' : e.better === false ? ' · แย่กว่าคาด → หนุนทอง' : ''}`
          : `${past ? 'รอผล' : 'คาด'} ${esc(e.forecast || '–')} · ก่อนหน้า ${esc(e.previous || '–')}`;
        return `<div class="ev${past ? ' past' : ''}"><span class="t">${t}</span><span class="d" style="background:${e.i === 'H' ? '#ef4444' : '#f59e0b'}"></span><div>${esc(e.title)}<small>${res}</small></div></div>`;
      }).join('')}</div>`;
    }).join('');
    return `<div class="card"><h3>📅 ปฏิทินข่าว USD สัปดาห์นี้ (เวลาไทย · 🔴 แรง 🟠 กลาง)</h3><div class="cal">${html}</div><div class="note" style="margin-top:6px">ที่มา Forex Factory + FXStreet · อัปเดตอัตโนมัติ · ผลจริงขึ้นหลังข่าวออกไม่กี่นาที</div></div>`;
  }

  // ---------- คำนวณจากข้อมูล OI + Volume ----------
  function calc(d) {
    const map = new Map();
    (d.levels || []).forEach(l => {
      const r = map.get(l.strike) || { k: l.strike, c: 0, p: 0, vc: 0, vp: 0 };
      if (l.type === 'P') r.p += l.oi; else r.c += l.oi;
      map.set(l.strike, r);
    });
    let vol = {};
    try { vol = d.cfg && d.cfg.volume ? JSON.parse(d.cfg.volume) : {}; } catch (e) {}
    Object.keys(vol).forEach(s => {
      const k = Number(s), v = vol[s];
      const r = map.get(k) || { k, c: 0, p: 0, vc: 0, vp: 0 };
      r.vc = Number(v[0]) || 0; r.vp = Number(v[1]) || 0; map.set(k, r);
    });
    const rows = [...map.values()].sort((a, b) => a.k - b.k);
    const sum = f => rows.reduce((a, r) => a + (f(r) || 0), 0);
    const C = sum(r => r.c), P = sum(r => r.p), VC = sum(r => r.vc), VP = sum(r => r.vp);
    let mp = null, best = Infinity;
    rows.forEach(s => {
      if (!s.c && !s.p) return;
      const pay = rows.reduce((a, r) => a + r.c * Math.max(0, s.k - r.k) + r.p * Math.max(0, r.k - s.k), 0);
      if (pay < best) { best = pay; mp = s.k; }
    });
    const maxOI = Math.max(1, ...rows.map(r => r.c + r.p)), maxV = Math.max(1, ...rows.map(r => r.vc + r.vp));
    rows.forEach(r => { r.str = Math.max(1, Math.min(5, Math.round(((r.c + r.p) / maxOI * .7 + (r.vc + r.vp) / maxV * .3) * 5 + .3))); });
    return { rows, C, P, VC, VP, mp, maxOI, maxV, pcr: C ? P / C : null, vpcr: VC ? VP / VC : null };
  }

  // Volume × OI: ตีความแต่ละ strike (ใช้สัดส่วน Volume ต่อ Volume สูงสุดของวัน)
  function classify(r, maxV) {
    const v = r.vc + r.vp;
    return v >= maxV * .3 ? ['turn', 'เทรดหมุนเวียน'] : null;
  }

  // ---------- วาดหน้าจอ ----------
  function show() {
    const S = SY[cur], c = cache[cur];
    const body = $('dBody');
    if (!c) { body.innerHTML = '<div class="msg">กำลังโหลด…</div>'; return; }
    if (c.err) { body.innerHTML = `<div class="msg">โหลดข้อมูลไม่สำเร็จ: ${esc(c.err)}<br>กด ⟳ เพื่อลองใหม่</div>`; return; }
    const d = c.d, cfg = d.cfg || {};
    let A = null;
    try { A = cfg.dash ? JSON.parse(cfg.dash) : null; } catch (e) { A = null; }
    const m = calc(d);
    // ราคาสด: กราฟ XAUUSD และ GC·Y ใช้ข้อมูลทองชุดเดียวกัน · ถ้าไม่มี ใช้ราคาฟิวเจอร์ล่าสุดในชีต (gc_price) ก่อนราคาตอนวิเคราะห์
    const live = ((O.sym === cur || (cur === 'gold' && O.sym === 'gcy')) && O.lastClose !== null && isFinite(O.lastClose)) ? O.lastClose : null;
    const gcSheet = Number(cfg.gc_price !== undefined ? cfg.gc_price : d.gc);
    const price = live !== null ? live : (isFinite(gcSheet) && gcSheet > 0 ? gcSheet : (A && isFinite(A.price) ? A.price : null));
    const priceSrc = live !== null ? 'ราคาสดบนกราฟ' : (isFinite(gcSheet) && gcSheet > 0 ? `ราคาฟิวเจอร์ตอนอัพเดท ${esc(cfg.offset_time || '')}` : 'ราคาตอนวิเคราะห์');
    const parts = [];

    if (!A) parts.push(`<div class="card warn">ยังไม่มีผลวิเคราะห์ของ${S.label}ในชีต (key "dash") พิมพ์ "อัพเดท" ในแชทเพื่อสร้าง ส่วนตัวเลขด้านล่างคำนวณจากข้อมูล OI ล่าสุด</div>`);

    // 1) ลูกศร + คะแนน
    if (A) {
      const sc = Math.max(-100, Math.min(100, Number(A.score) || 0));
      const cls = A.trend === 'up' ? 'up' : A.trend === 'down' ? 'down' : 'side';
      const rot = -sc * 0.9; // +100 = ชี้ขึ้น 90°, -100 = ชี้ลง
      parts.push(`<div class="card"><div class="hero"><div class="arrow ${cls}"><span style="transform:rotate(${rot}deg)">➜</span></div>
        <div style="min-width:0"><div class="tl">${esc(A.trend_label || '')}</div><div class="hl">${esc(A.headline || '')}</div></div></div>
        <div class="score"><div class="sbar"><i style="left:${(sc + 100) / 2}%"></i></div>
        <div class="slab"><span>ขาลง −100</span><span>คะแนนแนวโน้ม <b>${sgn(sc)}</b></span><span>+100 ขาขึ้น</span></div></div>
        <div class="meta">วิเคราะห์ ${esc(A.updated || '–')} · OI ${esc(d.stamp || '–')} · Volume ${esc(cfg.volume_time || '–')} · สัญญา ${esc(cfg.contract || A.contract || '–')}<br>โหลดหน้า ${c.at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div></div>`);
    }

    // 1.5) COT + Gamma (เฉพาะทองคำ)
    if (cur === 'gold') { parts.push(cotCard(price, cfg)); parts.push(cotGroupsCard()); { const gref = isFinite(gcSheet) && gcSheet > 0 ? gcSheet : price; parts.push(oiBarsCard(gref, cfg)); parts.push(oiCompareCard(d, cfg, m, gref)); } parts.push(liveCard(price)); }

    // 2) ป้ายเตือนราคาใกล้แนว
    if (price !== null) {
      const cands = [];
      (A && A.levels || []).forEach(l => cands.push({ p: l.p, t: l.t }));
      if (m.mp !== null) cands.push({ p: m.mp, t: 'Max Pain' });
      const near = cands.map(l => ({ ...l, dd: Math.abs(l.p - price) })).filter(l => l.dd <= S.near).sort((a, b) => a.dd - b.dd)[0];
      if (near) parts.push(`<div class="alert">⚠️ ราคา <b>${fmt(price, S.pdec)}</b> อยู่ห่างแนว <b>${fmt(near.p, S.dec)}</b> เพียง <b>${fmt(near.dd, S.pdec)}${S.unit}</b> · ${esc(near.t)}</div>`);
    }

    // 3) เข็มวัด + ตัวเลข
    const g = A && isFinite(A.gauge) ? Math.max(0, Math.min(100, A.gauge)) : null;
    const gaugeSvg = g === null ? '<div class="note">ยังไม่มีค่าเข็มวัด</div>' : (() => {
      const ang = Math.PI * (1 - g / 100), cx = 120, cy = 112, R = 92;
      const nx = cx + Math.cos(ang) * (R - 14), ny = cy - Math.sin(ang) * (R - 14);
      const arc = (a0, a1, col) => { const x0 = cx + Math.cos(Math.PI * (1 - a0)) * R, y0 = cy - Math.sin(Math.PI * (1 - a0)) * R, x1 = cx + Math.cos(Math.PI * (1 - a1)) * R, y1 = cy - Math.sin(Math.PI * (1 - a1)) * R; return `<path d="M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}" stroke="${col}" stroke-width="14" fill="none"/>`; };
      const lab = g < 40 ? 'ฝั่งขายได้เปรียบ' : g > 60 ? 'ฝั่งซื้อได้เปรียบ' : 'สมดุล';
      return `<svg viewBox="0 0 240 140" role="img" aria-label="เข็มวัดแรงกดดัน ${g}">
        ${arc(0, .33, 'var(--put)')}${arc(.335, .665, '#5a6280')}${arc(.67, 1, 'var(--call)')}
        <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="var(--fg)" stroke-width="4" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="7" fill="var(--gold)"/>
        <text x="22" y="134" fill="var(--muted)" font-size="11" font-family="IBM Plex Sans Thai">ขาย</text>
        <text x="218" y="134" fill="var(--muted)" font-size="11" text-anchor="end" font-family="IBM Plex Sans Thai">ซื้อ</text>
        <text x="${cx}" y="88" fill="var(--fg)" font-size="20" font-weight="600" text-anchor="middle" font-family="JetBrains Mono">${g}</text>
      </svg><div style="font-size:12.5px;margin-top:2px">${lab}</div>`;
    })();
    const pcrNote = v => v === null ? '' : v > 1.1 ? 'Put มากกว่า (ระวังขาลง/ป้องกันความเสี่ยง)' : v < 0.9 ? 'Call มากกว่า' : 'ใกล้เคียงกัน';
    const dist = (price !== null && m.mp !== null) ? price - m.mp : null;
    parts.push(`<div class="grid2"><div class="card gauge"><h3 style="align-self:flex-start">เข็มวัดแรงกดดัน ฝั่งขาย ↔ ฝั่งซื้อ</h3>${gaugeSvg}</div>
      <div class="card"><h3>ตัวเลขสำคัญ</h3><div class="tiles">
        <div class="tile"><small>${priceSrc}</small><b style="color:var(--gold)">${fmt(price, S.pdec)}</b><em>${A && live === null ? esc(A.price_note || '') : 'เทียบสเกล futures'}</em></div>
        <div class="tile"><small>Max Pain</small><b style="color:var(--mp)">${fmt(m.mp, S.dec)}</b><em>${dist === null ? '' : `ราคาอยู่${dist >= 0 ? 'เหนือ' : 'ใต้'} ${fmt(Math.abs(dist), S.pdec)}${S.unit}`}</em></div>
        <div class="tile"><small>Put/Call จาก OI</small><b>${fmt(m.pcr, 2)}</b><em>${pcrNote(m.pcr)}</em></div>
        <div class="tile"><small>Put/Call จาก Volume</small><b>${fmt(m.vpcr, 2)}</b><em>${pcrNote(m.vpcr)}</em></div>
      </div></div></div>`);

    // 4) แนวรับแนวต้าน (ความแข็ง)
    if (A && A.levels && A.levels.length) {
      const strOf = p => { const r = m.rows.reduce((b, r) => Math.abs(r.k - p) < Math.abs(b.k - p) ? r : b, m.rows[0] || { k: p, str: 0 }); return r && Math.abs(r.k - p) < 1e-6 ? r.str : 0; };
      const lv = [...A.levels].sort((a, b) => b.p - a.p);
      let placed = false; const out = [];
      lv.forEach(l => {
        if (!placed && price !== null && l.p < price) { out.push(`<div class="now">ราคา ${fmt(price, S.pdec)}</div>`); placed = true; }
        const s = strOf(l.p) || (l.s || 1) + 1;
        const kind = l.k === 'R' ? 'แนวต้าน' : l.k === 'S' ? 'แนวรับ' : 'จุดดึงดูด';
        out.push(`<div class="lv ${l.k}"><div class="p">${fmt(l.p, S.dec)}</div><div class="t">${esc(l.t)}<small>${kind}</small></div><div class="str" title="ความแข็ง ${s}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= s ? 'on' : ''}"></i>`).join('')}</div></div>`);
      });
      if (!placed && price !== null) out.push(`<div class="now">ราคา ${fmt(price, S.pdec)}</div>`);
      parts.push(`<div class="card"><h3>แนวรับ แนวต้าน และความแข็ง (คิดจาก OI 70% + Volume 30%)</h3><div class="ladder">${out.join('')}</div></div>`);
    }

    // 6) Volume × OI
    const act = m.rows.filter(r => r.vc + r.vp > 0).sort((a, b) => (b.vc + b.vp) - (a.vc + a.vp)).slice(0, 8).sort((a, b) => b.k - a.k);
    if (act.length) {
      parts.push(`<div class="card"><h3>Volume × OI วันนี้ (8 strike ที่เทรดมากสุด)</h3><table><thead><tr><th>Strike</th><th>Vol C/P</th><th>ตีความ</th></tr></thead><tbody>
        ${act.map(r => { const t = classify(r, m.maxV); return `<tr><td>${fmt(r.k, S.dec)}</td><td>${r.vc}/${r.vp}</td><td class="tag">${t ? `<span class="tg ${t[0]}">${t[1]}</span>` : '<span class="tg turn">ปกติ</span>'}</td></tr>`; }).join('')}
        </tbody></table></div>`);
    }

    // 7) ความคิด Market Maker
    if (A && A.mm && A.mm.length) parts.push(`<div class="card"><h3>🧠 ความคิดของ Market Maker (ตีความจาก OI / Volume)</h3><ul>${A.mm.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`);

    // 8) สรุป + จุดที่ต้องดู
    if (A && (A.summary || A.watch)) parts.push(`<div class="card"><h3>สรุปแนวโน้ม</h3><div style="font-size:13px;line-height:1.6">${esc(A.summary || '')}</div>${A.watch ? `<div class="alert" style="margin-top:10px">🎯 ${esc(A.watch)}</div>` : ''}</div>`);

    // 9) ข่าว
    if (A && ((A.news && A.news.length) || (A.events && A.events.length && !(cal && cal.length)))) {
      const im = v => v > 0 ? '<span class="im pos">หนุนขึ้น</span>' : v < 0 ? '<span class="im neg">กดดันลง</span>' : '<span class="im neu">กลาง</span>';
      parts.push(`<div class="card"><h3>📰 ข่าวที่มีผล</h3><div class="news">${(A.news || []).map(n => `<div class="nw">${im(n.imp)}<div>${esc(n.t)}<br><a href="${esc(n.url || '#')}" target="_blank" rel="noopener">${esc(n.src || '')} · ${esc(n.time || '')}</a></div></div>`).join('')}</div>
        ${A.events && A.events.length && !(cal && cal.length) ? `<h3 style="margin-top:12px">ปฏิทินที่ต้องจับตา</h3><ul>${A.events.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`);
    }
    parts.push(calCard());

    // 10) กราฟย้อนหลัง
    if (A && ((A.px && A.px.length > 1) || (A.hist && A.hist.length))) parts.push(`<div class="card chart"><h3>ประวัติราคา futures และ OI รวม (จาก log)</h3>${histSvg(A, S)}</div>`);

    if (A && A.warn) parts.push(`<div class="card warn">⚠️ ${esc(A.warn)}</div>`);
    parts.push(`<div class="note" style="text-align:center">ผลวิเคราะห์เป็นการอ่านข้อมูล OI / Volume / ข่าว ไม่ใช่สัญญาณเทรดที่รับประกันผล</div>`);
    body.innerHTML = `<div class="dwrap">${parts.join('')}</div>`;
  }

  // กราฟเส้นราคา + แท่ง OI Call/Put ต่อรอบบันทึก
  function histSvg(A, S) {
    const W = 680, H1 = 150, H2 = 110, pad = 34, out = [];
    const px = (A.px || []).filter(p => isFinite(p[1]));
    out.push(`<svg viewBox="0 0 ${W} ${H1 + H2 + 40}" role="img" aria-label="กราฟประวัติ">`);
    if (px.length > 1) {
      const lo = Math.min(...px.map(p => p[1])), hi = Math.max(...px.map(p => p[1])), rg = (hi - lo) || 1;
      const X = i => pad + i * (W - pad - 10) / (px.length - 1), Y = v => 14 + (1 - (v - lo) / rg) * (H1 - 30);
      [lo, (lo + hi) / 2, hi].forEach(v => out.push(`<line x1="${pad}" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pad - 4}" y="${Y(v) + 3}" fill="var(--muted)" font-size="10" text-anchor="end" font-family="JetBrains Mono">${fmt(v, S.dec)}</text>`));
      out.push(`<polyline fill="none" stroke="var(--gold)" stroke-width="2" points="${px.map((p, i) => `${X(i)},${Y(p[1])}`).join(' ')}"/>`);
      const l = px[px.length - 1]; out.push(`<circle cx="${X(px.length - 1)}" cy="${Y(l[1])}" r="4" fill="var(--gold)"/>`);
      [0, Math.floor((px.length - 1) / 2), px.length - 1].forEach(i => out.push(`<text x="${X(i)}" y="${H1 - 2}" fill="var(--muted)" font-size="10" text-anchor="${i === 0 ? 'start' : i === px.length - 1 ? 'end' : 'middle'}" font-family="JetBrains Mono">${esc(px[i][0])}</text>`));
    }
    const hs = A.hist || [];
    if (hs.length) {
      const top = H1 + 16, mx = Math.max(1, ...hs.map(h => Math.max(h[2] || 0, h[3] || 0)));
      const slot = (W - pad - 10) / hs.length, bw = Math.min(22, slot / 3);
      hs.forEach((h, i) => {
        const x = pad + i * slot + slot / 2, hc = (h[2] || 0) / mx * (H2 - 24), hp = (h[3] || 0) / mx * (H2 - 24), base = top + H2 - 20;
        out.push(`<rect x="${x - bw - 1}" y="${base - hc}" width="${bw}" height="${hc}" rx="2" fill="var(--call)"/><rect x="${x + 1}" y="${base - hp}" width="${bw}" height="${hp}" rx="2" fill="var(--put)"/>`);
        const pcr = h[2] ? (h[3] / h[2]).toFixed(2) : '–';
        out.push(`<text x="${x}" y="${base - Math.max(hc, hp) - 4}" fill="var(--fg)" font-size="10" text-anchor="middle" font-family="JetBrains Mono">${pcr}</text>`);
        out.push(`<text x="${x}" y="${base + 12}" fill="var(--muted)" font-size="9.5" text-anchor="middle" font-family="JetBrains Mono">${esc(h[0])}</text><text x="${x}" y="${base + 23}" fill="var(--muted)" font-size="9" text-anchor="middle" font-family="JetBrains Mono">${esc(h[1])}</text>`);
      });
    }
    out.push('</svg>');
    out.push(`<div class="cleg"><span><i style="background:var(--gold)"></i>ราคา futures ตอนอัพเดท</span><span><i style="background:var(--call)"></i>OI Call รวม</span><span><i style="background:var(--put)"></i>OI Put รวม</span><span>ตัวเลขบนแท่ง = Put/Call</span></div>`);
    out.push(`<div class="note">สัญญาเปลี่ยนตามรอบหมดอายุ จึงเทียบ OI รวมข้ามสัญญาได้แค่คร่าวๆ</div>`);
    return out.join('');
  }
  document.addEventListener('oilive', () => { if (!box.hidden && cur === 'gold' && !box.querySelector('details[open]')) { const b = $('dBody'), y = b.scrollTop; show(); b.scrollTop = y; } });
  // ทิศ COT ให้ป้ายบนกราฟ (live.js) ใช้ โหลดตั้งแต่เปิดแอป
  const pubCot = () => { if (cur !== 'gold' && O.sym !== 'gold' && O.sym !== 'gcy') return; const k = cotCalc(); if (k) { window.OICot = { bias: k.bias, score: k.score }; O.markDirty && O.markDirty(); } };
  if (O.sym === 'gold' || O.sym === 'gcy') setTimeout(() => loadCOT(false).then(pubCot), 3000);
})();
