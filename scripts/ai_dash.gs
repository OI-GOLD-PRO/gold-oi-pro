// ===== OI Gold Pro: การ์ดวิเคราะห์แดชบอร์ดด้วย DeepSeek (อัตโนมัติ) =====
// วางเป็นไฟล์ใหม่ในโปรเจกต์ Apps Script เดียวกับ sync_live
// 1) ใส่คีย์: Project Settings (รูปเฟือง) → Script properties → Add: DEEPSEEK_API_KEY = <คีย์ของคุณ>
// 2) รัน installAITrigger ครั้งเดียว → ระบบเช็กทุก 5 นาที และวิเคราะห์เมื่อ:
//    - ตลาดเอเชียเปิด 07:00 น. (โตเกียว 09:00) · ยุโรปเปิด (ลอนดอน 08:00 = 14:00/15:00 น. ไทยตามฤดู) · อเมริกา 19:00 น.
//    - หลังข่าวแดง USD ออก 10 นาที
//    (เฉพาะวันตลาดเปิด จ.–ศ.) · รันเองได้ด้วย runAINow
// ผลลัพธ์เขียนลงแท็บ webapp key "dash" ซึ่งแอปแสดงในการ์ดบนสุดของแดชบอร์ด
// ตัวเลขทุกตัวมาจากข้อมูลจริง (Worker / CFTC / ปฏิทินข่าว) · AI เขียนคำอธิบาย และแนวต้องเป็นราคาที่อยู่ในข้อมูลเท่านั้น

const AI_SHEET_ID = '1-0tiRE91vvRM3xOiJPXBqlwGQbTmvmGaHv804DX4liU';
const AI_WORKER = 'https://gc-yahoo.oigoldpro.workers.dev';
const AI_NEWS = 'https://raw.githubusercontent.com/OI-GOLD-PRO/gold-oi-pro/main/news.json';
const AI_MODEL = 'deepseek-chat';

function aiFetchJson_(url, opt) {
  const r = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true }, opt || {}));
  if (r.getResponseCode() !== 200) throw new Error(url.split('?')[0] + ' HTTP ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
  return JSON.parse(r.getContentText());
}
const aiFmt_ = (d, f) => Utilities.formatDate(d, 'Asia/Bangkok', f);

// ---------- ตัวตั้งเวลา ----------
function aiTick() {
  const now = new Date(), props = PropertiesService.getScriptProperties();
  const dow = Number(aiFmt_(now, 'u')); // 1=จ. … 7=อา.
  if (dow >= 6) return; // ส.–อา. ตลาดปิด
  const ymd = aiFmt_(now, 'yyyyMMdd');
  const at = (hh, mm) => new Date(aiFmt_(now, 'yyyy-MM-dd') + 'T' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':00+07:00');
  // ลอนดอน 08:00 → เวลาไทย (14:00 ช่วง BST, 15:00 ช่วง GMT)
  const lonOff = Utilities.formatDate(now, 'Europe/London', 'Z'); // +0100 / +0000
  const europe = lonOff === '+0100' ? at(14, 0) : at(15, 0);
  const slots = [['asia', at(7, 0), 'ตลาดเอเชียเปิด'], ['europe', europe, 'ตลาดยุโรปเปิด'], ['us', at(19, 0), 'ตลาดอเมริกา']];
  for (const [k, t, label] of slots) {
    const key = 'ai_' + ymd + '_' + k;
    if (now >= t && now - t < 60 * 60e3 && !props.getProperty(key)) { props.setProperty(key, '1'); runAI_(label); return; }
  }
  // หลังข่าวแดง USD 10 นาที
  try {
    const ev = (aiFetchJson_(AI_NEWS + '?t=' + Math.floor(Date.now() / 300000)).events || []).filter(e => e.c === 'USD' && (e.i || 'H') === 'H');
    for (const e of ev) {
      const ms = Date.parse(e.date); if (!isFinite(ms)) continue;
      const key = 'ai_news_' + ms;
      if (Date.now() >= ms + 10 * 60e3 && Date.now() < ms + 60 * 60e3 && !props.getProperty(key)) { props.setProperty(key, '1'); runAI_('หลังข่าว ' + e.title); return; }
    }
  } catch (e) { console.warn('news: ' + e); }
}
function runAINow() { runAI_('สั่งรันเอง'); }
function installAITrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'aiTick').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('aiTick').timeBased().everyMinutes(5).create();
}
function removeAITrigger() { ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'aiTick').forEach(t => ScriptApp.deleteTrigger(t)); }

// ---------- รวมข้อมูล ----------
function aiGather_() {
  const o = aiFetchJson_(AI_WORKER + '/opt');
  let px = null; try { px = aiFetchJson_(AI_WORKER + '/px'); } catch (e) {}
  const price = px && px.gc_price ? px.gc_price : o.F;
  const by = {};
  o.rows.forEach(r => {
    const [k, t, iv, d, g, bid, ask, lp, vol, buy, sell, oi] = r;
    const s = by[k] || (by[k] = { k, oiC: 0, oiP: 0, vC: 0, vP: 0, buyC: 0, sellC: 0, buyP: 0, sellP: 0 });
    if (t === 'C') { s.oiC = oi || 0; s.vC = vol || 0; s.buyC = buy || 0; s.sellC = sell || 0; s.ivC = iv; s.dC = d; }
    else { s.oiP = oi || 0; s.vP = vol || 0; s.buyP = buy || 0; s.sellP = sell || 0; s.ivP = iv; s.dP = d; }
  });
  const ks = Object.values(by).sort((a, b) => a.k - b.k);
  // Max Pain
  let mp = null, best = Infinity;
  ks.forEach(s => { const pay = ks.reduce((a, r) => a + r.oiC * Math.max(0, s.k - r.k) + r.oiP * Math.max(0, r.k - s.k), 0); if (pay < best && (s.oiC || s.oiP)) { best = pay; mp = s.k; } });
  // Skew 25 delta
  const ivAt = (side, target) => { const pts = ks.map(s => side === 'C' ? [s.dC, s.ivC] : [s.dP, s.ivP]).filter(p => p[0] != null && p[1]).sort((a, b) => a[0] - b[0]); for (let i = 1; i < pts.length; i++) { const [d0, v0] = pts[i - 1], [d1, v1] = pts[i]; if ((d0 - target) * (d1 - target) <= 0 && d1 !== d0) return v0 + (v1 - v0) * (target - d0) / (d1 - d0); } return null; };
  const p25 = ivAt('P', -0.25), c25 = ivAt('C', 0.25);
  const near = ks.filter(s => Math.abs(s.k - price) <= 60 && (s.oiC + s.oiP + s.vC + s.vP) > 0);
  const topC = ks.filter(s => s.oiC > 0).sort((a, b) => b.oiC - a.oiC).slice(0, 6), topP = ks.filter(s => s.oiP > 0).sort((a, b) => b.oiP - a.oiP).slice(0, 6);
  const strikes = {}; near.concat(topC, topP).forEach(s => { strikes[s.k] = s; });
  const tbl = Object.values(strikes).sort((a, b) => b.k - a.k).map(s => ({ k: s.k, oi_call: s.oiC, oi_put: s.oiP, vol_call: s.vC, vol_put: s.vP, call_net_buy: Math.round(s.buyC - s.sellC), put_net_buy: Math.round(s.buyP - s.sellP) }));
  const totOI = ks.reduce((a, s) => [a[0] + s.oiC, a[1] + s.oiP], [0, 0]), totV = ks.reduce((a, s) => [a[0] + s.vC, a[1] + s.vP], [0, 0]);
  // COT (CFTC) ทองคำ + DXY
  let cot = null;
  try {
    const sel = 'report_date_as_yyyy_mm_dd,open_interest_all,m_money_positions_long_all,m_money_positions_short_all,prod_merc_positions_long,prod_merc_positions_short,swap_positions_long_all,swap__positions_short_all,nonrept_positions_long_all,nonrept_positions_short_all';
    const raw = aiFetchJson_('https://publicreporting.cftc.gov/resource/72hh-3qpy.json?cftc_contract_market_code=088691&$select=' + sel + '&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=157');
    const n = v => Number(v) || 0;
    const R = raw.map(x => ({ d: String(x.report_date_as_yyyy_mm_dd).slice(0, 10), oi: n(x.open_interest_all), mm: n(x.m_money_positions_long_all) - n(x.m_money_positions_short_all), nrL: n(x.nonrept_positions_long_all), nrS: n(x.nonrept_positions_short_all), cm: n(x.prod_merc_positions_long) + n(x.swap_positions_long_all) - n(x.prod_merc_positions_short) - n(x.swap__positions_short_all) }));
    const mn = Math.min.apply(null, R.map(r => r.mm)), mx = Math.max.apply(null, R.map(r => r.mm));
    const dx = aiFetchJson_('https://publicreporting.cftc.gov/resource/6dca-aqww.json?cftc_contract_market_code=098662&$select=noncomm_positions_long_all,noncomm_positions_short_all,open_interest_all&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=2');
    const dn = x => n(x.noncomm_positions_long_all) - n(x.noncomm_positions_short_all);
    cot = { report_date: R[0].d, managed_money_net: R[0].mm, mm_change_1w: R[0].mm - R[1].mm, mm_change_8w: R[0].mm - R[8].mm, cot_index_3y_pct: Math.round((R[0].mm - mn) / ((mx - mn) || 1) * 100),
      commercial_net: R[0].cm, retail_long_pct: Math.round(R[0].nrL / ((R[0].nrL + R[0].nrS) || 1) * 1000) / 10, total_oi: R[0].oi, oi_change_1w: R[0].oi - R[1].oi,
      dxy_spec_net: dn(dx[0]), dxy_spec_change_1w: dn(dx[0]) - dn(dx[1]), dxy_oi: n(dx[0].open_interest_all) };
  } catch (e) { console.warn('cot: ' + e); }
  // ปฏิทินข่าว
  let cal = [];
  try { cal = (aiFetchJson_(AI_NEWS).events || []).filter(e => e.c === 'USD').map(e => ({ time_th: aiFmt_(new Date(e.date), 'dd/MM HH:mm'), impact: (e.i || 'H') === 'H' ? 'high' : 'medium', title: e.title, forecast: e.forecast, previous: e.previous, actual: e.actual || null, better_than_forecast: e.better === undefined ? null : e.better })); } catch (e) {}
  const emLo = o.openEM ? o.openF - o.openEM : null, emHi = o.openEM ? o.openF + o.openEM : null;
  const facts = {
    price_vs_gmf_itd: o.itd == null ? null : (price >= o.itd ? 'เหนือ ' : 'ใต้ ') + Math.abs(Math.round((price - o.itd) * 10) / 10),
    price_vs_gmf_M: !(o.gmfM && o.gmfM.M != null) ? null : (price >= o.gmfM.M ? 'เหนือ ' : 'ใต้ ') + Math.abs(Math.round((price - o.gmfM.M) * 10) / 10),
    price_vs_max_pain: mp == null ? null : (price >= mp ? 'เหนือ ' : 'ใต้ ') + Math.abs(Math.round((price - mp) * 10) / 10),
    em_position_pct: emLo == null ? null : Math.round((price - emLo) / (emHi - emLo) * 100) + '% ของกรอบ EM (0 = ขอบล่าง, 100 = ขอบบน)',
    dist_to_em_top: emHi == null ? null : Math.round((emHi - price) * 10) / 10, dist_to_em_bottom: emLo == null ? null : Math.round((price - emLo) * 10) / 10,
  };
  const hrs = o.expTs ? Math.round((o.expTs * 1000 - Date.now()) / 36e5 * 10) / 10 : null;
  return {
    contract: o.root, expiry_hours_left: hrs, futures_price: price, gold_f_time: px && px.gc_time,
    gamma_flip_today: o.itd, gamma_flip_30d: o.gmfM && o.gmfM.M, net_gex_today_musd: o.gexItd, net_gex_30d_musd: o.gmfM && o.gmfM.gexM,
    max_pain: mp, expected_move: o.em, expected_move_range_today: o.openEM ? [Math.round((o.openF - o.openEM) * 10) / 10, Math.round((o.openF + o.openEM) * 10) / 10] : null,
    skew_put25_minus_call25_volpts: p25 !== null && c25 !== null ? Math.round((p25 - c25) * 1000) / 10 : null,
    total_oi_call: totOI[0], total_oi_put: totOI[1], total_vol_call: totV[0], total_vol_put: totV[1],
    facts, strikes: tbl, cot, calendar: cal,
  };
}

// ---------- เรียก DeepSeek ----------
function runAI_(reason) {
  const key = PropertiesService.getScriptProperties().getProperty('DEEPSEEK_API_KEY');
  if (!key) throw new Error('ยังไม่ได้ใส่ DEEPSEEK_API_KEY ใน Script properties');
  const ss = SpreadsheetApp.openById(AI_SHEET_ID), sh = ss.getSheetByName('webapp');
  const data = aiGather_();
  const sys = [
    'คุณคือนักวิเคราะห์ Options Order Flow ของทองคำฟิวเจอร์ COMEX (GC) มองแบบ Market Maker',
    'ใช้เฉพาะตัวเลขในข้อมูลที่ให้ ห้ามแต่งตัวเลขหรือราคาใหม่ ราคาแนว (levels.p) ต้องเป็นค่าที่มีอยู่ในข้อมูลเท่านั้น (strike, gamma_flip, max_pain, ขอบ expected_move)',
    'ใช้ facts สำหรับตำแหน่งราคาเทียบ gmf / Max Pain / กรอบ EM ห้ามคำนวณระยะเอง',
    'หลักตีความ: ราคาใต้ gamma_flip_30d = gamma ลบ ราคามักวิ่งแรงตามทาง / เหนือ = แกว่งกรอบ · OI Call หนา = แนวต้าน, OI Put หนา = แนวรับ · call_net_buy > 0 = มีคนซื้อ Call (เก็งขึ้น), < 0 = ขาย Call (ตั้งเพดาน) · put_net_buy > 0 = ซื้อ Put (ป้องกัน/เก็งลง), < 0 = ขาย Put (รับซื้อ) · skew บวก = Put แพง ตลาดกลัวขาลง · COT ใช้ดูภาพใหญ่รายสัปดาห์ · retail_long_pct สูงผิดปกติ = เตือนใกล้ยอด',
    'ห้ามใช้ชื่อฟิลด์ภาษาอังกฤษแบบ snake_case ในข้อความ ให้เรียกว่า: gamma_flip_today = "gmf itd", gamma_flip_30d = "gmf M", max_pain = "Max Pain", net_gex = "Net GEX", expected_move = "กรอบ EM", retail_long_pct = "รายย่อยถือ Long", managed_money_net = "กองทุนสุทธิ", skew = "Skew", oi_call/oi_put = "OI Call/Put", vol_call/vol_put = "Volume Call/Put"',
    'mm และ events ต้องเป็น array ของ string ธรรมดาเท่านั้น (ไม่ใช่ object)',
    'ตอบเป็น JSON เท่านั้น ภาษาไทย กระชับ มีฟิลด์: trend ("up"|"down"|"side"), trend_label (ไม่เกิน 30 ตัวอักษร), score (จำนวนเต็ม -100..100 = ทิศแนวโน้ม), gauge (0..100 แรงกดดัน 0=ขายเต็ม 100=ซื้อเต็ม), headline (ไม่เกิน 140 ตัวอักษร), summary (3-5 ประโยค), levels (4-7 รายการ {p, k:"R"|"S"|"P", t: เหตุผลสั้นพร้อมตัวเลข, s: 1-3 ความแข็ง}), mm (3-4 ข้อ ความคิด/ตำแหน่ง MM), events (ปฏิทินที่ต้องจับตา พร้อมผลถ้าออกแล้ว), watch (สถานการณ์ ถ้า…แล้ว… คั่นด้วย " / "), warn (ข้อควรระวัง 1 ประโยค)',
  ].join('\n');
  const body = { model: AI_MODEL, temperature: 0.3, response_format: { type: 'json_object' }, max_tokens: 1800,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: 'เหตุผลที่วิเคราะห์รอบนี้: ' + reason + '\nเวลาไทย: ' + aiFmt_(new Date(), 'yyyy-MM-dd HH:mm') + '\nข้อมูล:\n' + JSON.stringify(data) }] };
  const res = aiFetchJson_('https://api.deepseek.com/chat/completions', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + key }, payload: JSON.stringify(body) });
  let A = JSON.parse(res.choices[0].message.content);
  // ตรวจตัวเลข: แนวต้องอยู่ในชุดราคาที่มีจริง
  const allowed = new Set(data.strikes.map(s => s.k));
  [data.gamma_flip_today, data.gamma_flip_30d, data.max_pain].concat(data.expected_move_range_today || []).forEach(v => { if (v !== null && v !== undefined) allowed.add(Number(v)); });
  // ทำความสะอาดข้อความ: object → string, ชื่อฟิลด์ → ชื่อไทย
  const NAMES = [[/gamma_flip_today/g, 'gmf itd'], [/gamma_flip_30d/g, 'gmf M'], [/max_pain/g, 'Max Pain'], [/net_gex_(today|30d)(_musd)?/g, 'Net GEX'], [/expected_move_range_today|expected_move/g, 'กรอบ EM'], [/retail_long_pct/g, 'รายย่อยถือ Long %'], [/managed_money_net/g, 'กองทุนสุทธิ'], [/mm_change_1w/g, 'กองทุนเปลี่ยน 1 สัปดาห์'], [/mm_change_8w/g, 'กองทุนเปลี่ยน 8 สัปดาห์'], [/cot_index_3y_pct/g, 'COT Index 3 ปี'], [/skew_put25_minus_call25_volpts/g, 'Skew'], [/oi_call/g, 'OI Call'], [/oi_put/g, 'OI Put'], [/vol_call/g, 'Volume Call'], [/vol_put/g, 'Volume Put'], [/call_net_buy/g, 'Call ซื้อสุทธิ'], [/put_net_buy/g, 'Put ซื้อสุทธิ'], [/futures_price/g, 'ราคาฟิวเจอร์'], [/dxy_spec_(net|change_1w)/g, 'DXY นักเก็งกำไร']];
  const clean = v => { let t = v === null || v === undefined ? '' : typeof v === 'object' ? Object.values(v).filter(x => x !== null && typeof x !== 'object').join(' — ') : String(v); NAMES.forEach(([re, to]) => { t = t.replace(re, to); }); return t.trim(); };
  ['trend_label', 'headline', 'summary', 'watch', 'warn'].forEach(k => { A[k] = clean(A[k]); });
  A.mm = (Array.isArray(A.mm) ? A.mm : [A.mm]).map(clean).map(t => t.replace(/^\d+\s*[—\-.)]\s*/, '')).filter(Boolean);
  // ปฏิทิน: สร้างจากข้อมูลจริง (ไม่ให้ AI ตีความตัวเลขข่าวเอง)
  A.events = data.calendar.slice(-6).map(e => e.time_th + ' ' + (e.impact === 'high' ? '🔴 ' : '🟠 ') + e.title + (e.actual ? ` ออก ${e.actual} (คาด ${e.forecast || '–'})${e.better_than_forecast === true ? ' ดีกว่าคาด → หนุนดอลลาร์' : e.better_than_forecast === false ? ' แย่กว่าคาด → หนุนทอง' : ''}` : ` (คาด ${e.forecast || '–'}, ก่อนหน้า ${e.previous || '–'})`));
  (A.levels || []).forEach(l => { l.t = clean(l.t); });
  const levels = (A.levels || []).map(l => ({ p: Number(l.p), k: ['R', 'S', 'P'].indexOf(l.k) >= 0 ? l.k : 'P', t: String(l.t || '').slice(0, 120), s: Math.max(1, Math.min(3, Number(l.s) || 1)) })).filter(l => allowed.has(l.p));
  const keys = sh.getRange('A1:A40').getValues().map(r => r[0]);
  const row = keys.indexOf('dash') + 1 || 13;
  let old = {}; try { old = JSON.parse(sh.getRange(row, 2).getValue() || '{}'); } catch (e) {}
  const stamp = aiFmt_(new Date(), 'yyyy-MM-dd HH:mm'), lab = aiFmt_(new Date(), 'MM-dd HH:mm');
  const hist = (old.hist || []).concat([[lab, data.contract, data.total_oi_call, data.total_oi_put, data.futures_price]]).slice(-20);
  const pxh = (old.px || []).concat([[lab, data.futures_price]]).slice(-30);
  const dash = { v: 1, updated: stamp, sym: 'gold', contract: data.contract, price: data.futures_price, price_note: 'Gold.F ' + (data.gold_f_time || '') + ' · AI: ' + reason,
    trend: ['up', 'down', 'side'].indexOf(A.trend) >= 0 ? A.trend : 'side', trend_label: String(A.trend_label || '').slice(0, 40), score: Math.max(-100, Math.min(100, Math.round(Number(A.score) || 0))), gauge: Math.max(0, Math.min(100, Math.round(Number(A.gauge) || 50))),
    headline: String(A.headline || '').slice(0, 200), summary: String(A.summary || '').slice(0, 1200), levels, mm: (A.mm || []).slice(0, 5).map(String), news: [],
    events: (A.events || []).slice(0, 6).map(String), watch: String(A.watch || '').slice(0, 400), warn: String(A.warn || '').slice(0, 300) + ' (วิเคราะห์โดย DeepSeek จากข้อมูลจริง ไม่ใช่คำแนะนำการลงทุน)', hist, px: pxh };
  sh.getRange(row, 1, 1, 2).setValues([['dash', JSON.stringify(dash)]]);
  console.log('AI dash updated: ' + reason + ' · ' + dash.trend_label);
}
