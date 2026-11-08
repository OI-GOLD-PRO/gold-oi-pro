// 📒 บันทึกสัญญาณเข้าออเดอร์ของอินดี้ลงชีต (แท็บ signal_log) ไว้วิเคราะห์ย้อนหลัง — V4.9.0
//  อินดี้ที่บันทึก: 🎯 สูตร 3 ขั้น (oistep.js) · 💀 กับดักคนส่วนน้อย (trap.js)
//  1 แถว / 1 สัญญาณ (id ไม่ซ้ำ) · ส่งตอนเข้า (status open) แล้วอัปเดตแถวเดิมเมื่อจบ (TP / SL / หมดเวลา)
//  เปิดแอปครั้งแรกจะเติมย้อนหลังที่อินดี้คำนวณได้ (🎯 ~8 ชม. · 💀 ~2 วัน) · หลายเครื่องส่งซ้ำได้ ชีตรวมตาม id
(() => {
  'use strict';
  const O = window.OI;
  if (!O || !O.aiCall || !(O.sym === 'gold' || O.sym === 'gcy')) return;
  const KEY = 'oi_siglog_sent';
  let sent = {}; try { sent = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  const save = () => { try { const ks = Object.keys(sent); if (ks.length > 600) ks.slice(0, ks.length - 600).forEach(k => delete sent[k]); localStorage.setItem(KEY, JSON.stringify(sent)); } catch (e) {} };
  const th = t => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' '); // เวลาแท่งเป็นเวลาไทยอยู่แล้ว
  const r2 = v => v === null || v === undefined || !isFinite(v) ? null : Math.round(v * 100) / 100;
  const ST = { 3: 'open', 4: 'TP', 5: 'SL', 6: 'timeout' };
  const contract = () => { try { return (window.OILive && window.OILive.d && window.OILive.d.root) || ''; } catch (e) { return ''; } };

  function collect() {
    const out = [];
    // 🎯 สูตร 3 ขั้น
    try {
      const S = window.OI_step3, B = S && S.bars, tf = S && S.cfg ? S.cfg.tf : '';
      if (S && B && B.length) S.setups.filter(s => s.ei !== undefined && s.st >= 3).forEach(s => {
        const R = Math.abs(s.entry - s.sl), endC = s.end !== undefined ? B[s.end].close : null;
        const ty = s.type || 'rev'; // V4.9.59 แยกท่า
        out.push({ id: `S3|${tf}|${B[s.ci].time}|${s.z.k}` + (ty !== 'rev' ? '|' + ty : ''), ind: ty === 'rev' ? '🎯 สูตร 3 ขั้น' : '🎯 ' + ((S.TYPE_LAB || {})[ty] || ty), side: s.dir > 0 ? 'BUY' : 'SELL', tf: tf === '1m' ? 'M1' : 'M5',
          sig_th: th(B[s.ei].time), entry: r2(s.entry), sl: r2(s.sl), tp1: r2(s.tp), tp2: null, risk: r2(R), score: null,
          reason: ty === 'rev' ? `โซน ${s.z.lab} · CHoCH ${s.lvl ? s.lvl.toFixed(1) : ''} · เข้า ${s.fvg ? 'FVG' : 'OB'}` : `${s.z.lab} · ยอดแรก ${s.lvl ? s.lvl.toFixed(1) : ''} · เข้า ${ty === 'rng1' ? 'ทดสอบขอบกรอบ' : s.fvg ? 'FVG' : 'OB'}`, evidence: '', status: ST[s.st] || 'open',
          exit_th: s.end !== undefined ? th(B[s.end].time) : '', result_r: s.st === 4 ? r2(Math.abs(s.tp - s.entry) / R) : s.st === 5 ? -1 : s.st === 6 && endC !== null ? r2((endC - s.entry) * (s.dir > 0 ? 1 : -1) / R) : null });
      });
    } catch (e) {}
    // 💀 กับดักคนส่วนน้อย
    try {
      const T = window.OI_trap, B = T && T.bars;
      if (T && B && B.length) T.setups.filter(s => s.ri !== undefined && s.st >= 3).forEach(s => {
        const endC = s.end !== undefined ? B[s.end].close : null, live = B.length - 1 - s.ri <= 1;
        const f = live && T.filters ? T.filters(s) : null;
        out.push({ id: `TR|5m|${B[s.ri].time}|${s.P.p.toFixed(1)}`, ind: '💀 กับดักคนส่วนน้อย', side: s.side > 0 ? 'BUY' : 'SELL', tf: 'M5',
          sig_th: th(B[s.ri].time), entry: r2(s.entry), sl: r2(s.sl), tp1: r2(s.tp1), tp2: r2(s.tp2), risk: r2(s.R), score: s.score,
          reason: `กวาด SL ${s.side > 0 ? 'ใต้' : 'เหนือ'} ${s.P.p.toFixed(1)} (${s.P.why.join(' + ')}) · ไส้ ${s.ext.toFixed(1)}`, evidence: (s.ev || []).join(' · ') + (f && f.w.length ? ' | ห้ามสวน: ' + f.w.join(', ') : ''),
          status: ST[s.st] || 'open', exit_th: s.end !== undefined ? th(B[s.end].time) : '',
          result_r: s.st === 4 ? r2(Math.abs(s.tp1 - s.entry) / s.R) : s.st === 5 ? -1 : s.st === 6 && endC !== null ? r2((endC - s.entry) * s.side / s.R) : null });
      });
    } catch (e) {}
    // 🌏 OI Session Fade (V4.9.72) — ไม้จริง + ไม้บันทึก (forward test) · evidence บอกว่าเป็นไม้ไหน
    try {
      const F = window.OI_sfade, B = F && F.bars;
      if (F && F.isOn() && B && B.length) (F.today || []).forEach(s => { // เฉพาะวันนี้ (M1 สด) · แบ็กเทสย้อนหลังไม่ส่ง
        // v0.6: 1 ไม้ = 3 แถว (TP RR 1 / 1.6 / 5 ถือจน SL/TP) แยก id ด้วย |R1 |R1.6 |R5
        const SS = { 3: 'open', 4: 'TP', 5: 'SL' };
        (F.RRS || [1]).forEach(rr => {
          const v = s.v && s.v[rr]; if (!v) return;
          out.push({ id: `SF|1m|${B[s.ei].time}|${s.z.k}|${s.S.id}${s.k}|R${rr}`, ind: `🌏 OI Session Fade RR${rr}` + (s.real ? '' : ' (บันทึก)'), side: s.dir > 0 ? 'BUY' : 'SELL', tf: 'M1',
            sig_th: th(B[s.ei].time), entry: r2(s.entry), sl: r2(s.sl), tp1: r2(v.tp), tp2: null, risk: r2(s.R), score: null,
            reason: `${s.S.lab} · แตะครั้งที่ ${s.k} · ${s.z.side}${s.z.k} เกรด ${s.z.grade} · โซน ±${s.S.half} · พุ่ง ${s.mv === null ? '-' : s.mv}×ATR · TP RR${rr}`,
            evidence: s.real ? 'ไม้จริง v0.6' : s.fast ? 'ไม้บันทึก v0.6 (กรองพุ่ง)' : 'ไม้บันทึก v0.6',
            status: SS[v.st] || 'open', exit_th: v.end !== undefined ? th(B[v.end].time) : '', result_r: v.res !== undefined ? v.res : null });
        });
        // V4.9.84: ชุดแยก "🌏 OSF+Δ5" (ไม้จริงเท่านั้น) — ฟุตปริ้นท์ Δ5 จาก Binance taker ก่อนแตะ · id ขึ้นต้น SFD| ไม่ปนชุด v0.6 · evidence = ผ่าน/ไม่ผ่าน Δ5
        const f = s.real && F.fpOf ? F.fpOf(s) : null;
        if (f && !f.err) (F.RRS || [1]).forEach(rr => {
          const v = s.v && s.v[rr]; if (!v) return;
          out.push({ id: `SFD|1m|${B[s.ei].time}|${s.z.k}|${s.S.id}${s.k}|R${rr}`, ind: `🌏 OSF+Δ5 RR${rr}`, side: s.dir > 0 ? 'BUY' : 'SELL', tf: 'M1',
            sig_th: th(B[s.ei].time), entry: r2(s.entry), sl: r2(s.sl), tp1: r2(v.tp), tp2: null, risk: r2(s.R), score: f.push,
            reason: `Δ5 ${f.push === null ? '-' : (f.push > 0 ? '+' : '') + f.push} · ซื้อ ${f.buy} / ขาย ${f.sell} oz (${f.n} ไม้ Binance) · ${s.S.lab} · แตะครั้งที่ ${s.k} · ${s.z.side}${s.z.k} · พุ่ง ${s.mv === null ? '-' : s.mv}×ATR`,
            evidence: f.pass ? `ผ่าน Δ5 (≤${F.FP_MAX})` : `ไม่ผ่าน Δ5 (>${F.FP_MAX})`,
            status: SS[v.st] || 'open', exit_th: v.end !== undefined ? th(B[v.end].time) : '', result_r: v.res !== undefined ? v.res : null });
        });
        // V4.9.85: ชุดแยก "🌏 OSF+IV" (ไม้จริงเท่านั้น) — ATM IV ตอนเข้าไม้ + เปลี่ยนใน 1/3 ชม. · id ขึ้นต้น SFI| · evidence = IV ขึ้นเร็ว / IV ปกติ
        const iv = s.real && F.ivOf ? F.ivOf(s) : null;
        if (iv) (F.RRS || [1]).forEach(rr => {
          const v = s.v && s.v[rr]; if (!v) return;
          const fast = iv.d3 !== null && iv.d3 > F.IV_D3_MAX, sg = x => x === null ? '-' : (x > 0 ? '+' : '') + x;
          out.push({ id: `SFI|1m|${B[s.ei].time}|${s.z.k}|${s.S.id}${s.k}|R${rr}`, ind: `🌏 OSF+IV RR${rr}`, side: s.dir > 0 ? 'BUY' : 'SELL', tf: 'M1',
            sig_th: th(B[s.ei].time), entry: r2(s.entry), sl: r2(s.sl), tp1: r2(v.tp), tp2: null, risk: r2(s.R), score: iv.iv,
            reason: `IV ${iv.iv}% · 1ชม. ${sg(iv.d1)} · 3ชม. ${sg(iv.d3)} · ${s.S.lab} · แตะครั้งที่ ${s.k} · ${s.z.side}${s.z.k} · พุ่ง ${s.mv === null ? '-' : s.mv}×ATR`,
            evidence: iv.d3 === null ? 'IV ไม่มีค่า 3ชม.' : fast ? `IV ขึ้นเร็ว (>+${F.IV_D3_MAX}/3ชม.)` : 'IV ปกติ',
            status: SS[v.st] || 'open', exit_th: v.end !== undefined ? th(B[v.end].time) : '', result_r: v.res !== undefined ? v.res : null });
        });
      });
    } catch (e) {}
    return out;
  }
  let busy = false;
  async function flush() {
    if (busy) return;
    const rows = collect().filter(r => sent[r.id] !== r.status).map(r => Object.assign(r, { contract: contract() }));
    if (!rows.length) return;
    busy = true;
    try {
      const res = await O.aiCall('siglog', { rows: rows.slice(0, 80) }, 30000);
      if (res && res.ok) { rows.slice(0, 80).forEach(r => { sent[r.id] = r.status; }); save(); }
    } catch (e) {} finally { busy = false; }
  }
  setTimeout(flush, 20000); setInterval(flush, 60000);
  window.OISigLog = { collect, flush, get sent() { return sent; } };
})();
