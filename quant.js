// OI Gold Pro · Quant model (ถาด AI วิเคราะห์สด)
// คำนวณแบบตัวเลขล้วนจากข้อมูลของเรา: Options flow, OI, GEX/gamma regime, gmf, Max Pain, Skew, EM, โครงสร้าง SMC, โมเมนตัม, Absorption, COT
// → คะแนนรวม (−100..+100), ระบอบตลาด, ความน่าจะเป็นแตะแนว (จาก IV), แผน Long/Short พร้อมโอกาสชนะและ EV แล้วเลือกฝั่งที่ EV ดีที่สุด
// ds (DeepSeek) ใช้ผลนี้อธิบายเป็นภาษาคน และสั่งรอได้เฉพาะเมื่อมีเหตุผลนอกโมเดล (เช่นข่าวแรง)
(() => {
  'use strict';
  const O = window.OI;
  const r2 = v => Math.round(v * 100) / 100;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const tanh = Math.tanh;
  const Phi = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
  const HORIZON_H = 2; // เทรดสั้น: มองไปข้างหน้า ~2 ชม.

  function model(P) {
    const c = window.OILive && window.OILive.calc, oi = O.oi, px = Number(P.price);
    if (!isFinite(px)) return null;
    const tfs = P.tfs || {}, opt = P.options || {};
    const atr5 = (tfs.M5 && tfs.M5.atr) || P.atr || 2, atr1h = (tfs.H1 && tfs.H1.atr) || atr5 * 3;
    const rowOf = new Map(((oi && oi.rows) || []).map(r => [r.strike, r])), kp = k => { const r = rowOf.get(k); return r ? r.price : k; };
    const strikes = (c && c.strikes) || [];

    // ---- ความผันผวน: IV ATM (จาก Options) vs RV (จากแท่ง M5) ----
    let iv = null;
    { const nr = strikes.filter(s => s.ivC || s.ivP).sort((a, b) => Math.abs(kp(a.k) - px) - Math.abs(kp(b.k) - px)).slice(0, 2); const v = []; nr.forEach(s => { if (s.ivC) v.push(s.ivC); if (s.ivP) v.push(s.ivP); }); if (v.length) iv = v.reduce((a, b) => a + b, 0) / v.length; }
    let rv = null;
    { const b = tfs.M5 && tfs.M5.bars; if (b && b.length > 12) { const r = []; for (let i = 1; i < b.length; i++) r.push(Math.log(b[i][4] / b[i - 1][4])); const m = r.reduce((a, x) => a + x, 0) / r.length, sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)); rv = sd * Math.sqrt(276 * 252); } }
    // ระยะสั้นใช้ค่ากลางของ IV (ตลาดคาด) กับ RV (ที่วิ่งจริง) กันประเมินระยะวิ่งเกินจริงตอนตลาดเงียบ
    const volA = iv && rv ? (iv + rv) / 2 : iv || rv || 0.18;
    const sigH = px * volA * Math.sqrt(HORIZON_H / (252 * 23)); // ระยะ 1σ ภายใน ~2 ชม. (หน่วยดอลลาร์)
    const hoursLeft = c && c.expTs ? Math.max(0, (c.expTs * 1000 - Date.now()) / 36e5) : null;

    // ---- ปัจจัย (+ = หนุนขึ้น, − = กดลง) ----
    const F = [];
    const add = (key, name, s, w, note) => { if (s === null || s === undefined || !isFinite(s)) return; F.push({ key, name, s: r2(clamp(s, -1, 1)), w, note }); };
    const near = strikes.filter(s => Math.abs(kp(s.k) - px) <= px * 0.02);
    // 1) Options flow ถ่วงด้วย delta: ซื้อ Call / ขาย Put = หนุนขึ้น
    { let num = 0, den = 0; near.forEach(s => { const dC = Math.abs(s.dC || 0.5), dP = Math.abs(s.dP || 0.5); num += ((s.bc || 0) - (s.sc || 0)) * dC - ((s.bp || 0) - (s.sp || 0)) * dP; den += ((s.bc || 0) + (s.sc || 0)) * dC + ((s.bp || 0) + (s.sp || 0)) * dP; });
      if (den >= 20) add('flow', 'Options flow (delta)', tanh(num / den * 2.5), 0.18, `สุทธิ ${r2(num)} delta-contract จาก ${Math.round(den)}`); }
    // 2) แรงดึง OI: จุดศูนย์ถ่วง OI รอบราคา
    { let sw = 0, sp = 0; near.forEach(s => { const w = (s.c || 0) + (s.p || 0); sw += w; sp += w * kp(s.k); }); if (sw > 0) { const ctr = sp / sw; add('oi_gravity', 'แรงดึง OI', tanh((ctr - px) / sigH), 0.08, `ศูนย์ถ่วง OI ${r2(ctr)}`); } }
    // 3) ที่ว่างถึงกำแพง: ระยะถึง Call Wall vs Put Wall
    { const cw = (P.levels || []).find(l => l.name === 'Call Wall'), pw = (P.levels || []).find(l => l.name === 'Put Wall');
      if (cw && pw && cw.p > px && pw.p < px) { const u = cw.p - px, d = px - pw.p; add('room', 'ระยะถึงกำแพง', (u - d) / (u + d), 0.08, `ถึง Call Wall ${r2(u)} / Put Wall ${r2(d)}`); } }
    // 4) Max Pain (มีน้ำหนักขึ้นเมื่อใกล้หมดอายุ)
    if (oi && oi.maxPain) { const w = hoursLeft !== null && hoursLeft < 12 ? 0.1 : 0.04; add('maxpain', 'Max Pain', tanh((kp(oi.maxPain) - px) / (sigH * 2)), w, `Max Pain ${oi.maxPain}${hoursLeft !== null ? ` · หมดอายุอีก ${r2(hoursLeft)} ชม.` : ''}`); }
    // 5) ตำแหน่งเทียบ gmf M: ใต้เส้น = dealer short gamma → ขาลงมักเร่ง
    if (opt.gmf_M) add('gmf', 'ตำแหน่งเทียบ gmf M', tanh((px - opt.gmf_M) / sigH) * 0.7, 0.08, `gmf M ${r2(opt.gmf_M)}`);
    // 6) Skew: Put แพง = ตลาดกลัวขาลง
    if (opt.skew_put_minus_call !== null && opt.skew_put_minus_call !== undefined) add('skew', 'Skew', -tanh(opt.skew_put_minus_call / 4), 0.05, `${opt.skew_put_minus_call} จุด`);
    // 7) ตำแหน่งในกรอบ EM: gamma บวก = ขอบกรอบมักถูกดึงกลับ, gamma ลบ = หลุดกรอบแล้ววิ่งต่อ
    const gpos = opt.net_gex_at_price_musd === null || opt.net_gex_at_price_musd === undefined ? null : opt.net_gex_at_price_musd > 0;
    if (c && c.openEM) { const z = (px - c.openF) / c.openEM; add('em', 'ตำแหน่งในกรอบ EM', gpos === false ? tanh(z) * 0.6 : -tanh(z * 1.3), 0.1, `z = ${r2(z)} (${r2(c.openF - c.openEM)}–${r2(c.openF + c.openEM)})`); }
    // 8) โมเมนตัม: ผลตอบแทน 12 แท่ง / (ATR·√12) ของ H1 และ M15
    { const m = []; [['H1', 0.6], ['M15', 0.4]].forEach(([k, w]) => { const t = tfs[k]; if (t && t.bars && t.bars.length > 12) { const b = t.bars, ret = b[b.length - 1][4] - b[b.length - 13][4]; m.push([tanh(ret / (t.atr * Math.sqrt(12))), w]); } });
      if (m.length) add('momentum', 'โมเมนตัม H1/M15', m.reduce((a, [v, w]) => a + v * w, 0) / m.reduce((a, [, w]) => a + w, 0), 0.14, ''); }
    // 9) โครงสร้าง SMC: H1 0.6 + M15 0.4
    { const sg = t => t && t.smc ? (t.smc.bias === 'ขาขึ้น' ? 1 : t.smc.bias === 'ขาลง' ? -1 : 0) : 0; add('structure', 'โครงสร้าง SMC H1/M15', sg(tfs.H1) * 0.6 + sg(tfs.M15) * 0.4, 0.14, `H1 ${tfs.H1 && tfs.H1.smc ? tfs.H1.smc.bias : '–'} · M15 ${tfs.M15 && tfs.M15.smc ? tfs.M15.smc.bias : '–'}`); }
    // 10) Absorption M5
    { const a = P.absorption; if (a && (a.buy_side + a.sell_side) > 0) add('absorption', 'Absorption', (a.buy_side - a.sell_side) / (a.buy_side + a.sell_side), 0.05, `ซื้อรับ ${a.buy_side} / ขายรับ ${a.sell_side}`); }
    // 11) COT รายสัปดาห์
    if (window.OICot && window.OICot.bias !== undefined) add('cot', 'COT', clamp(window.OICot.bias, -1, 1), 0.04, '');
    const W = F.reduce((a, f) => a + f.w, 0) || 1, S = F.reduce((a, f) => a + f.s * f.w, 0) / W;
    F.forEach(f => { f.contrib = r2(f.s * f.w / W * 100); });

    // ---- ระบอบตลาด ----
    const rvIv = iv && rv ? rv / iv : null;
    const regime = gpos === null ? 'ไม่ทราบ gamma' : gpos ? (rvIv !== null && rvIv > 1.2 ? 'gamma บวก แต่ RV สูงกว่า IV (เริ่มแกว่งแรง)' : 'Mean-revert (gamma บวก: แกว่งกรอบ เล่นกลับตัวที่แนว)') : 'Trend / Breakout (gamma ลบ: วิ่งแรงตามทาง)';

    // ---- แนวสำหรับวางแผน (ไม่มี VWAP) ----
    // ความแข็งของแนว (0..1): ใช้ปรับโอกาส — SL อยู่หลังแนวแข็ง = โดนยากขึ้น, TP อยู่ที่แม่เหล็ก (GEX บวก/Max Pain) = ถึงง่ายขึ้น
    const strengthOf = nm => /Wall/.test(nm) ? 0.8 : /โซน OI/.test(nm) ? 0.65 : /GEX \+/.test(nm) ? 0.6 : /OB/.test(nm) ? 0.55 : /EM/.test(nm) ? 0.5 : /Volume/.test(nm) ? 0.4 : /EQ[HL]/.test(nm) ? 0.15 : /gmf/.test(nm) ? 0.3 : 0.3;
    const magnetOf = nm => /GEX \+/.test(nm) || /Max Pain/.test(nm) ? 0.6 : /EQ[HL]/.test(nm) ? 0.4 : /Wall|โซน OI/.test(nm) ? 0.3 : 0.15;
    const L = [];
    (P.levels || []).forEach(l => { if (!/VWAP/i.test(l.name)) L.push({ name: l.name, p: l.p }); });
    (opt.top_gex_strikes || []).forEach(g => L.push({ name: `GEX ${g.gex_musd > 0 ? '+' : ''}${g.gex_musd}M`, p: g.price }));
    ['H1', 'M15'].forEach(k => { const s = tfs[k] && tfs[k].smc; if (!s) return; if (s.bull_ob) L.push({ name: `${k} OB ซื้อ`, p: s.bull_ob.top, side: 'S' }); if (s.bear_ob) L.push({ name: `${k} OB ขาย`, p: s.bear_ob.bottom, side: 'R' }); if (s.eq_highs) L.push({ name: `${k} EQH`, p: s.eq_highs }); if (s.eq_lows) L.push({ name: `${k} EQL`, p: s.eq_lows }); });
    L.forEach(l => { l.str = strengthOf(l.name); l.mag = magnetOf(l.name); });
    const revert = gpos === true ? 1 : gpos === false ? 0.4 : 0.7; // แนวยันได้ดีในระบอบ gamma บวก
    const minD = 0.8 * atr5, buf = 0.3 * atr5;
    const above = L.filter(l => l.p > px + minD).sort((a, b) => a.p - b.p), below = L.filter(l => l.p < px - minD).sort((a, b) => b.p - a.p);
    const mu = S * 0.35 * sigH; // ทิศคาดหวังภายในกรอบเวลา จากคะแนนรวม
    const pWin = (a, b, d) => { // Brownian มี drift: โอกาสถึง +a ก่อน −b
      const s2 = sigH * sigH; if (Math.abs(d) < 1e-6) return b / (a + b);
      const k = 2 * d / s2; return (1 - Math.exp(-k * b)) / (1 - Math.exp(-k * (a + b)));
    };
    function plan(dir) {
      const tpL = dir > 0 ? above : below, slL = dir > 0 ? below : above;
      // SL: หลังแนวแข็งที่ใกล้ที่สุด (ภายใน 3 ATR M5) ไม่งั้น 1.5 ATR M5
      const slRef = slL.filter(l => Math.abs(l.p - px) <= 3 * atr5).sort((x, y) => Math.abs(x.p - px) - Math.abs(y.p - px)).find(l => l.str >= 0.4) || null;
      let sl = slRef ? slRef.p - dir * buf : px - dir * 1.5 * atr5;
      if (Math.abs(px - sl) < 0.8 * atr5) sl = px - dir * 0.8 * atr5;
      const b = Math.abs(px - sl);
      // TP1: แนวแรกที่ระยะไม่น้อยกว่า 0.8 เท่าของ SL (กัน R:R เล็กเกิน) · TP2 = แนวถัดไป
      const t1 = tpL.find(l => Math.abs(l.p - px) >= Math.max(minD, 0.8 * b)); if (!t1) return null;
      const t2 = tpL.find(l => (l.p - t1.p) * dir >= 0.8 * atr5) || null;
      let tp1 = t1.p; if (Math.abs(tp1 - px) > 2.5 * sigH) tp1 = px + dir * 2.5 * sigH;
      const a = Math.abs(tp1 - px);
      // ระยะ "ที่ใช้คิดโอกาส": SL หลังแนวแข็ง = เหมือนไกลขึ้น, TP ที่แม่เหล็ก = เหมือนใกล้ขึ้น
      const bEff = b * (1 + 0.6 * (slRef ? slRef.str : 0) * revert), aEff = a * (1 - 0.3 * t1.mag * revert);
      const p = clamp(pWin(aEff, bEff, dir * mu), 0.02, 0.98);
      const rr = a / b, ev = p * rr - (1 - p);
      const touch = 2 * (1 - Phi(a / sigH));
      return { side: dir > 0 ? 'BUY' : 'SELL', entry: r2(px), sl: r2(sl), tp1: r2(tp1), tp2: t2 ? r2(t2.p) : null, tp1_at: t1.name, sl_at: slRef ? slRef.name : '1.5 ATR M5', rr: r2(rr), p_win: Math.round(p * 100), ev_r: r2(ev), p_touch_tp1_2h: Math.round(clamp(touch, 0, 1) * 100) };
    }
    const long = plan(1), short = plan(-1);

    // ---- ตัดสิน ----
    let action = 'WAIT', why = '';
    const best = [long, short].filter(Boolean).sort((a, b) => b.ev_r - a.ev_r)[0];
    const newsSoon = P.red_news && P.red_news.minutes_from_now > -15 && P.red_news.minutes_from_now < 20;
    if (/ตลาดปิด/.test(P.market || '')) why = 'ตลาดปิด';
    else if (newsSoon) why = 'ใกล้ข่าวแดง';
    else if (!best) why = 'ไม่มีแนวเป้าหมายใกล้พอ';
    else if (best.ev_r < 0.15) why = `EV ต่ำ (${best.ev_r}R)`;
    else if (best.p_win < 45) why = `โอกาสชนะต่ำ (${best.p_win}%)`;
    else if ((best.side === 'BUY' ? S : -S) < -0.1) why = 'คะแนนรวมสวนทาง';
    else action = best.side;
    // แนวที่มีโอกาสถูกแตะใน ~2 ชม.
    const touch = L.filter(l => Math.abs(l.p - px) <= 3 * sigH).map(l => ({ name: l.name, p: r2(l.p), dist: r2(l.p - px), prob: Math.round(clamp(2 * (1 - Phi(Math.abs(l.p - px) / sigH)), 0, 1) * 100) }))
      .sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist)).filter((x, i, a) => a.findIndex(y => Math.abs(y.p - x.p) < 0.5) === i).slice(0, 8);
    return {
      score: Math.round(S * 100), bias: S > 0.15 ? 'ขึ้น' : S < -0.15 ? 'ลง' : 'กลาง', regime,
      iv_pct: iv ? r2(iv * 100) : null, rv_pct: rv ? r2(rv * 100) : null, rv_iv: rvIv ? r2(rvIv) : null, sigma_2h: r2(sigH),
      hours_to_expiry: hoursLeft !== null ? r2(hoursLeft) : null,
      factors: F.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib)),
      plans: { long, short }, decision: { action, plan: action === 'WAIT' ? null : best, why: why || `EV ${best.ev_r}R · ชนะ ${best.p_win}%` },
      touch,
      note: 'p_win = โอกาสถึง TP1 ก่อน SL (Brownian + drift จากคะแนนรวม, σ จาก IV) · EV หน่วย R · p_touch จาก IV ภายใน ~2 ชม.',
    };
  }
  window.OIQuant = { model };
})();
