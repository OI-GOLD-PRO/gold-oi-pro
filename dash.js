// แดชบอร์ดวิเคราะห์ตลาด (ทองคำ / น้ำมัน)
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
    oil: { label: 'น้ำมัน', ico: '🛢️', dec: 2, pdec: 2, near: 0.5, unit: '$' },
  };
  let cur = SY[O.sym] ? O.sym : 'gold';
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
  box.innerHTML = `<div class="dtop"><h2>📊 วิเคราะห์ตลาด</h2><div class="dtabs" id="dTabs"></div>
    <button class="icon" id="dReload" aria-label="โหลดใหม่">⟳</button><button class="icon" id="dClose" aria-label="ปิด">✕</button></div>
    <div class="dbody" id="dBody"></div>`;
  document.body.appendChild(box);
  const tabs = () => { $('dTabs').innerHTML = Object.keys(SY).map(k => `<button data-s="${k}" class="${k === cur ? 'on' : ''}">${SY[k].ico} ${SY[k].label}</button>`).join(''); };
  $('dTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cur = b.dataset.s; tabs(); show(); });
  $('dClose').addEventListener('click', () => { box.hidden = true; });
  $('dReload').addEventListener('click', () => load(true));
  btn.addEventListener('click', () => { box.hidden = false; tabs(); load(true); });

  async function load(force) {
    $('dBody').innerHTML = '<div class="msg">กำลังโหลดข้อมูลล่าสุดจากชีต…</div>';
    await Promise.all(Object.keys(SY).map(async s => {
      if (!force && cache[s]) return;
      try { cache[s] = { d: await O.fetchData(s), at: new Date() }; } catch (e) { cache[s] = { err: e.message || String(e) }; }
    }));
    show();
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
    const live = (O.sym === cur && O.lastClose !== null && isFinite(O.lastClose)) ? O.lastClose : null;
    const price = live !== null ? live : (A && isFinite(A.price) ? A.price : (isFinite(d.gc) ? d.gc : null));
    const priceSrc = live !== null ? 'ราคาสดบนกราฟ' : 'ราคาตอนวิเคราะห์';
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
    if (A && ((A.news && A.news.length) || (A.events && A.events.length))) {
      const im = v => v > 0 ? '<span class="im pos">หนุนขึ้น</span>' : v < 0 ? '<span class="im neg">กดดันลง</span>' : '<span class="im neu">กลาง</span>';
      parts.push(`<div class="card"><h3>📰 ข่าวที่มีผล</h3><div class="news">${(A.news || []).map(n => `<div class="nw">${im(n.imp)}<div>${esc(n.t)}<br><a href="${esc(n.url || '#')}" target="_blank" rel="noopener">${esc(n.src || '')} · ${esc(n.time || '')}</a></div></div>`).join('')}</div>
        ${A.events && A.events.length ? `<h3 style="margin-top:12px">ปฏิทินที่ต้องจับตา</h3><ul>${A.events.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`);
    }

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
})();
