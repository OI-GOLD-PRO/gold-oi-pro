// ===== OI Gold Pro: การ์ดวิเคราะห์แดชบอร์ดด้วย DeepSeek (อัตโนมัติ) =====
// วางเป็นไฟล์ใหม่ในโปรเจกต์ Apps Script เดียวกับ sync_live
// 1) ใส่คีย์: Project Settings (รูปเฟือง) → Script properties → Add: DEEPSEEK_API_KEY = <คีย์ของคุณ>
// 2) รัน installAITrigger ครั้งเดียว → ระบบเช็กทุก 5 นาที และวิเคราะห์เมื่อ:
//    - เวลาไทย 07:00 (เอเชีย) · 13:30 และ 15:00 (ยุโรป) · 19:00 และ 21:30 (อเมริกา)
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
  // เวลาไทย: เอเชีย 07:00 · ยุโรป 13:30 และ 15:00 · อเมริกา 19:00 และ 21:30
  const slots = [['asia', at(7, 0), 'ตลาดเอเชียเปิด'], ['eu1', at(13, 30), 'ตลาดยุโรป (ก่อนเปิด)'], ['eu2', at(15, 0), 'ตลาดยุโรปเปิด'], ['us1', at(19, 0), 'ตลาดอเมริกา (ก่อนเปิด)'], ['us2', at(21, 30), 'ตลาดอเมริกาเปิด']];
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
  // OI เฉพาะ strike ใกล้ราคา (±50) และกำแพง OI สูงสุด — ใช้เทียบข้ามวัน (สัญญารายวันเปลี่ยนทุกวัน)
  const band = ks.filter(s => Math.abs(s.k - price) <= 50);
  const nearOI = band.reduce((a, s) => [a[0] + s.oiC, a[1] + s.oiP], [0, 0]);
  const wallC = ks.filter(s => s.oiC > 0).sort((a, b) => b.oiC - a.oiC)[0], wallP = ks.filter(s => s.oiP > 0).sort((a, b) => b.oiP - a.oiP)[0];
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
  try { cal = (aiFetchJson_(AI_NEWS).events || []).filter(e => e.c === 'USD').map(e => ({ ms: Date.parse(e.date), time_th: aiFmt_(new Date(e.date), 'dd/MM HH:mm'), impact: (e.i || 'H') === 'H' ? 'high' : 'medium', title: e.title, forecast: e.forecast, previous: e.previous, actual: e.actual || null, better_than_forecast: e.better === undefined ? null : e.better })); } catch (e) {}
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
    total_oi_call: totOI[0], total_oi_put: totOI[1], near_oi_call: nearOI[0], near_oi_put: nearOI[1], wall_call: wallC ? [wallC.k, wallC.oiC] : null, wall_put: wallP ? [wallP.k, wallP.oiP] : null, total_vol_call: totV[0], total_vol_put: totV[1],
    facts, strikes: tbl, cot, calendar: cal, headlines: aiNews_().slice(0, 10),
  };
}

// ---------- ข่าวล่าสุด (พาดหัว) จาก RSS: Google News + FXStreet · แคช 10 นาที ----------
function aiNews_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('ai_news');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const feeds = [
    ['https://news.google.com/rss/search?q=gold+price+when:1d&hl=en-US&gl=US&ceid=US:en', 'g'],
    ['https://news.google.com/rss/search?q=(Fed+OR+dollar+OR+treasury+yields)+gold+when:1d&hl=en-US&gl=US&ceid=US:en', 'g'],
    ['https://www.fxstreet.com/rss/news', 'fx'],
  ];
  const now = Date.now(), seen = {}, out = [];
  const reqs = feeds.map(f => ({ url: f[0], muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0' } }));
  let res = []; try { res = UrlFetchApp.fetchAll(reqs); } catch (e) { return []; }
  res.forEach((r, i) => {
    if (r.getResponseCode() !== 200) return;
    let items = [];
    try { items = XmlService.parse(r.getContentText()).getRootElement().getChild('channel').getChildren('item'); } catch (e) { return; }
    items.forEach(it => {
      let t = (it.getChildText('title') || '').trim(), src = '';
      const ms = Date.parse(it.getChildText('pubDate') || ''); if (!t || !isFinite(ms) || now - ms > 36 * 36e5) return;
      if (feeds[i][1] === 'g') { const m = t.match(/^(.*) - ([^-]+)$/); if (m) { t = m[1].trim(); src = m[2].trim(); } const se = it.getChild('source'); if (se) src = se.getText() || src; }
      else { src = 'FXStreet'; if (!/gold|xau|fed|dollar|usd|yield|inflation|cpi|pce|nfp|payroll|powell|tariff|geopolit/i.test(t)) return; }
      const k = t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60); if (seen[k]) return; seen[k] = 1;
      out.push({ t: t.slice(0, 160), src, ms, url: (it.getChildText('link') || '').trim(), ago_min: Math.round((now - ms) / 60e3), time_th: aiFmt_(new Date(ms), 'dd/MM HH:mm') });
    });
  });
  out.sort((a, b) => b.ms - a.ms);
  const top = out.slice(0, 15);
  try { cache.put('ai_news', JSON.stringify(top), 600); } catch (e) {}
  return top;
}

// อ่าน JSON จากคำตอบ AI แบบทนทาน: ตัด ```json ออก และเอาเฉพาะ object แรกที่วงเล็บครบ (กันกรณีมีข้อความหรือ JSON ต่อท้าย)
function aiParseJson_(txt) {
  txt = String(txt || '').replace(/```(?:json)?/g, '').trim();
  try { return JSON.parse(txt); } catch (e) {}
  const i = txt.indexOf('{'); if (i < 0) throw new Error('AI ไม่ได้ตอบเป็น JSON');
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < txt.length; j++) {
    const ch = txt[j];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) return JSON.parse(txt.slice(i, j + 1));
  }
  throw new Error('JSON จาก AI ไม่ครบ (อาจถูกตัดเพราะยาวเกิน)');
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
    'headlines คือพาดหัวข่าวล่าสุด (ภาษาอังกฤษ, ago_min = กี่นาทีที่แล้ว) ใช้ประกอบภาพรวม: ข่าวที่หนุนทอง (ดอลลาร์อ่อน, ผลตอบแทนพันธบัตรลง, Fed ผ่อนคลาย, ความเสี่ยงภูมิรัฐศาสตร์) หรือกดทอง · อ้างข่าวได้เฉพาะที่มีใน headlines ห้ามแต่งข่าว',
    'mm ต้องเป็น array ของ string 3-4 ข้อ ข้อละ 1 ประโยค เช่น ["MM ขาย Call 4250 ตั้งเพดาน ...", "..."] ห้ามเป็น object · events ไม่ต้องส่ง (ระบบสร้างเอง)',
    'ข้อความ t ของแต่ละแนวต้องสอดคล้องกับ k: แนวเหนือราคาปัจจุบันคือแนวต้าน แนวใต้ราคาคือแนวรับ',
    'ตอบเป็น JSON เท่านั้น ภาษาไทย กระชับ มีฟิลด์: trend ("up"|"down"|"side"), trend_label (ไม่เกิน 30 ตัวอักษร), score (จำนวนเต็ม -100..100 = ทิศแนวโน้ม), gauge (0..100 แรงกดดัน 0=ขายเต็ม 100=ซื้อเต็ม), headline (ไม่เกิน 140 ตัวอักษร), summary (3-5 ประโยค), levels (4-7 รายการ {p, k:"R"|"S"|"P", t: เหตุผลสั้นพร้อมตัวเลข, s: 1-3 ความแข็ง}), mm (3-4 ข้อ ความคิด/ตำแหน่ง MM), events (ปฏิทินที่ต้องจับตา พร้อมผลถ้าออกแล้ว), news (ข่าวจาก headlines ที่มีผลกับทอง สูงสุด 5 ข้อ เรียงสำคัญก่อน: {i: ลำดับใน headlines เริ่ม 0, th: สรุปพาดหัวเป็นไทยสั้นๆ, imp: 1 หนุนทอง | -1 กดทอง | 0 กลาง}), watch (สถานการณ์ ถ้า…แล้ว… คั่นด้วย " / "), warn (ข้อควรระวัง 1 ประโยค)',
  ].join('\n');
  const body = { model: AI_MODEL, temperature: 0.3, response_format: { type: 'json_object' }, max_tokens: 2500,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: 'เหตุผลที่วิเคราะห์รอบนี้: ' + reason + '\nเวลาไทย: ' + aiFmt_(new Date(), 'yyyy-MM-dd HH:mm') + '\nข้อมูล:\n' + JSON.stringify(data) }] };
  const res = aiFetchJson_('https://api.deepseek.com/chat/completions', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + key }, payload: JSON.stringify(body) });
  let A = aiParseJson_(res.choices[0].message.content);
  // ตรวจตัวเลข: แนวต้องอยู่ในชุดราคาที่มีจริง
  const allowed = new Set(data.strikes.map(s => s.k));
  [data.gamma_flip_today, data.gamma_flip_30d, data.max_pain].concat(data.expected_move_range_today || []).forEach(v => { if (v !== null && v !== undefined) allowed.add(Number(v)); });
  // ทำความสะอาดข้อความ: object → string, ชื่อฟิลด์ → ชื่อไทย
  const NAMES = [[/gamma_flip_today/g, 'gmf itd'], [/gamma_flip_30d/g, 'gmf M'], [/max_pain/g, 'Max Pain'], [/net_gex_(today|30d)(_musd)?/g, 'Net GEX'], [/expected_move_range_today|expected_move/g, 'กรอบ EM'], [/retail_long_pct/g, 'รายย่อยถือ Long %'], [/managed_money_net/g, 'กองทุนสุทธิ'], [/mm_change_1w/g, 'กองทุนเปลี่ยน 1 สัปดาห์'], [/mm_change_8w/g, 'กองทุนเปลี่ยน 8 สัปดาห์'], [/cot_index_3y_pct/g, 'COT Index 3 ปี'], [/skew_put25_minus_call25_volpts/g, 'Skew'], [/oi_call/g, 'OI Call'], [/oi_put/g, 'OI Put'], [/vol_call/g, 'Volume Call'], [/vol_put/g, 'Volume Put'], [/call_net_buy/g, 'Call ซื้อสุทธิ'], [/put_net_buy/g, 'Put ซื้อสุทธิ'], [/futures_price/g, 'ราคาฟิวเจอร์'], [/dxy_spec_(net|change_1w)/g, 'DXY นักเก็งกำไร']];
  // object → เลือกข้อความที่ยาวที่สุด (ตัด label สั้นๆ เช่น "P", "2" ทิ้ง)
  const clean = v => { let t = v === null || v === undefined ? '' : typeof v === 'object' ? (Object.values(v).filter(x => typeof x === 'string').sort((a, b) => b.length - a.length)[0] || '') : String(v); NAMES.forEach(([re, to]) => { t = t.replace(re, to); }); return t.trim(); };
  ['trend_label', 'headline', 'summary', 'watch', 'warn'].forEach(k => { A[k] = clean(A[k]); });
  A.mm = (Array.isArray(A.mm) ? A.mm : A.mm && typeof A.mm === 'object' ? Object.values(A.mm) : [A.mm]).map(clean).map(t => t.replace(/^\d+\s*[—\-.)]\s*/, '')).filter(t => t.length >= 8);
  // ปฏิทิน: สร้างจากข้อมูลจริง (ไม่ให้ AI ตีความตัวเลขข่าวเอง)
  // ข่าวที่ยังไม่ออก (ใกล้สุดก่อน) + ข่าวที่เพิ่งออกใน 24 ชม.
  const calSort = data.calendar.filter(e => e.ms > Date.now()).slice(0, 6).concat(data.calendar.filter(e => e.ms <= Date.now() && Date.now() - e.ms < 24 * 36e5).reverse().slice(0, 2));
  // ข่าว: ผูกกับพาดหัวจริงด้วยลำดับ (กัน AI แต่งข่าว)
  A.news = (Array.isArray(A.news) ? A.news : []).map(n => { const h = data.headlines[Number(n && n.i)]; return h ? { t: clean(n.th) || h.t, src: h.src, time: h.time_th + ' น.', url: h.url, imp: Number(n.imp) > 0 ? 1 : Number(n.imp) < 0 ? -1 : 0 } : null; }).filter(Boolean).slice(0, 5);
  A.events = calSort.map(e => e.time_th + ' ' + (e.impact === 'high' ? '🔴 ' : '🟠 ') + e.title + (e.actual ? ` ออก ${e.actual} (คาด ${e.forecast || '–'})${e.better_than_forecast === true ? ' ดีกว่าคาด → หนุนดอลลาร์' : e.better_than_forecast === false ? ' แย่กว่าคาด → หนุนทอง' : ''}` : ` ยังไม่ออก · คาด ${e.forecast || '–'} ก่อนหน้า ${e.previous || '–'}`));
  (A.levels || []).forEach(l => { l.t = clean(l.t); });
  // แนวเหนือราคา = แนวต้าน, ใต้ราคา = แนวรับ (ยกเว้น P = จุดดึงดูด)
  const sideOf = (p, k) => k === 'P' ? 'P' : p > data.futures_price ? 'R' : 'S';
  const levels = (A.levels || []).map(l => ({ p: Number(l.p), k: sideOf(Number(l.p), l.k), t: String(l.t || '').slice(0, 120), s: Math.max(1, Math.min(3, Number(l.s) || 1)) })).filter(l => allowed.has(l.p));
  const keys = sh.getRange('A1:A40').getValues().map(r => r[0]);
  const row = keys.indexOf('dash') + 1 || 13;
  let old = {}; try { old = JSON.parse(sh.getRange(row, 2).getValue() || '{}'); } catch (e) {}
  const stamp = aiFmt_(new Date(), 'yyyy-MM-dd HH:mm'), lab = aiFmt_(new Date(), 'MM-dd HH:mm');
  // รันซ้ำภายใน 30 นาที: แทนจุดล่าสุดแทนการต่อท้าย
  const lastLab = (old.px || []).slice(-1)[0];
  if (lastLab && Math.abs(new Date('2026-' + lastLab[0].replace(' ', 'T') + ':00+07:00').getTime() - Date.now()) < 30 * 60e3) { old.px = old.px.slice(0, -1); old.hist = (old.hist || []).slice(0, -1); }
  const hist = (old.hist || []).concat([[lab, data.contract, data.total_oi_call, data.total_oi_put, data.futures_price, data.near_oi_call, data.near_oi_put, data.wall_call, data.wall_put]]).slice(-20);
  const pxh = (old.px || []).concat([[lab, data.futures_price]]).slice(-30);
  // ตัดจุดที่ห่างจากจุดถัดไปไม่ถึง 30 นาที (รันซ้ำติดกัน) เก็บจุดหลัง
  const tOf = l => new Date(new Date().getFullYear() + '-' + String(l).replace(' ', 'T') + ':00+07:00').getTime();
  const dedupe = a => a.filter((x, i) => i === a.length - 1 || !(Math.abs(tOf(a[i + 1][0]) - tOf(x[0])) < 30 * 60e3));
  hist.splice(0, hist.length, ...dedupe(hist)); pxh.splice(0, pxh.length, ...dedupe(pxh));
  const dash = { v: 1, updated: stamp, sym: 'gold', contract: data.contract, price: data.futures_price, price_note: 'Gold.F ' + (data.gold_f_time || '') + ' · AI: ' + reason,
    trend: ['up', 'down', 'side'].indexOf(A.trend) >= 0 ? A.trend : 'side', trend_label: String(A.trend_label || '').slice(0, 40), score: Math.max(-100, Math.min(100, Math.round(Number(A.score) || 0))), gauge: Math.max(0, Math.min(100, Math.round(Number(A.gauge) || 50))),
    headline: String(A.headline || '').slice(0, 200), summary: String(A.summary || '').slice(0, 1200), levels, mm: (A.mm || []).slice(0, 5).map(String), news: A.news || [],
    events: (A.events || []).slice(0, 6).map(String), watch: String(A.watch || '').slice(0, 400), warn: String(A.warn || '').slice(0, 300) + ' (วิเคราะห์โดย DeepSeek จากข้อมูลจริง ไม่ใช่คำแนะนำการลงทุน)', hist, px: pxh };
  sh.getRange(row, 1, 1, 2).setValues([['dash', JSON.stringify(dash)]]);
  console.log('AI dash updated: ' + reason + ' · ' + dash.trend_label);
  return dash;
}

// ---------- ปุ่ม "วิเคราะห์" ในแอป (เรียกผ่าน doPost ของ loader) ----------
// ตรวจรหัสผู้ใช้ด้วย api=login ของ Code.gs เดิม · กันกดถี่: ภายใน 60 วินาทีคืนผลล่าสุด
function aiWeb_(e) {
  const p = (e && e.parameter) || {};
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  if (p.api !== 'ai' && p.api !== 'ai_pa') return out({ error: 'bad api' });
  let ok = false;
  try { const r = JSON.parse(doGet({ parameter: { api: 'login', code: p.code || '' } }).getContent()); ok = !!(r && (r.ok || r.legacy)); } catch (err) { ok = false; }
  if (!ok) return out({ error: 'auth' });
  if (p.api === 'ai_pa') {
    let snap = null; try { snap = JSON.parse((e.postData && e.postData.contents) || 'null'); } catch (err) {}
    if (!snap || !Array.isArray(snap.bars) || snap.bars.length < 10) return out({ error: 'ข้อมูลกราฟไม่พอ' });
    const side = snap.side === 'BUY' || snap.side === 'SELL' ? snap.side : null;
    const cache = CacheService.getScriptCache(), ck = (side ? 'ps_' : 'pa_') + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(p.code))).slice(0, 16);
    if (cache.get(ck)) return out({ error: side ? 'กดถี่เกินไป รอ 10 วินาทีแล้วลองใหม่' : 'กดถี่เกินไป รอ 20 วินาทีแล้วลองใหม่' });
    cache.put(ck, '1', side ? 10 : 20);
    if (side) { try { return out({ ok: true, side: aiSide_(snap) }); } catch (err) { return out({ error: String(err.message || err).slice(0, 300) }); } }
    try { return out({ ok: true, pa: aiPA_(snap) }); } catch (err) { return out({ error: String(err.message || err).slice(0, 300) }); }
  }
  const cache = CacheService.getScriptCache();
  const last = cache.get('ai_web_last');
  if (last) return out({ ok: true, cached: true, dash: JSON.parse(last) });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) return out({ error: 'busy' });
  try {
    const again = cache.get('ai_web_last');
    if (again) return out({ ok: true, cached: true, dash: JSON.parse(again) });
    const dash = runAI_('กดปุ่มวิเคราะห์ในแอป');
    try { cache.put('ai_web_last', JSON.stringify(dash), 60); } catch (err) {}
    return out({ ok: true, dash });
  } catch (err) {
    return out({ error: String(err.message || err).slice(0, 300) });
  } finally { lock.releaseLock(); }
}


// ---------- ถาดลับ: AI อ่าน Price Action ของกราฟสด ณ ตอนกด แล้วตัดสินว่าควรเข้าออเดอร์ไหม ----------
// snap มาจากแอป: { sym, tf, time_th, price, atr, bars: [[t,o,h,l,c,v]...] (เก่า→ใหม่, แท่งสุดท้าย = กำลังวิ่ง), patterns, levels, vwap, swing }
const PA_RULES_ = [
    'tfs คือข้อมูลหลายไทม์เฟรมที่ระบบสรุปแล้ว (trend จากโครงสร้างราคา, structure, ATR, patterns, absorption, bars): ใช้ H4 ดูทิศใหญ่, H1 ดูโครงสร้างและแนว, M15 หาจุดตั้งเทรด, M5 หาจังหวะเข้า · เทรดตามทิศ H1/H4 ได้น้ำหนักมากกว่า สวนทิศต้องมีเหตุผลแข็ง (แนวใหญ่ + Price Action + Absorption) และลดความมั่นใจ · bars/patterns ระดับบนสุดคือ TF ที่ผู้ใช้เปิดอยู่',
    'ใช้เฉพาะตัวเลขในข้อมูล ห้ามแต่งราคาใหม่ · patterns คือรูปแบบแท่งเทียนที่ระบบตรวจไว้แล้ว (เชื่อถือได้) ให้ใช้เป็นหลัก ห้ามอ้างรูปแบบที่ไม่มีใน patterns',
    'bars เรียงเก่า→ใหม่ แท่งสุดท้ายยังไม่ปิด (forming) อย่าตัดสินจากแท่งที่ยังไม่ปิดอย่างเดียว',
    'levels คือแนวจาก Options (Call Wall = แนวต้าน, Put Wall = แนวรับ, กรอบ EM, gmf, Max Pain, โซน OI, เส้น Volume) ราคาเหนือ gmf M มักแกว่งกรอบ ใต้ gmf M มักวิ่งแรงตามทาง',
    'หลักตัดสิน: เข้าเฉพาะเมื่อมี Price Action ชัดที่แนวสำคัญ และ R:R ถึง TP2 อย่างน้อย 1:1.5 · ถ้าไม่ชัด อยู่กลางกรอบ หรือใกล้ข่าวแดง ให้ WAIT',
    'absorption คือแท่งที่ Volume สูงแต่ราคาไปไม่ไกล (มีออเดอร์ใหญ่รอรับ) ระบบคำนวณไว้แล้ว: rate_40_pct = อัตราการเกิดใน 40 แท่ง, side buy = ซื้อรับแรงขาย (หนุนขึ้น), sell = ขายรับแรงซื้อ (กดลง) · Absorption ที่แนวสำคัญ + Pin Bar/ปฏิเสธราคา = สัญญาณกลับตัวที่แข็งแรงขึ้น · Absorption ถี่แต่ราคาไม่ไปไหน = สะสม/แจกจ่ายของ รอเบรก',
    'headlines = พาดหัวข่าวล่าสุดภาษาอังกฤษ (ago_min = กี่นาทีที่แล้ว) ใช้ประกอบ: ข่าวหนุนทอง = ดอลลาร์อ่อน/ยีลด์ลง/Fed ผ่อนคลาย/ความเสี่ยงภูมิรัฐศาสตร์ · ข่าวกดทอง = ดอลลาร์แข็ง/ยีลด์ขึ้น/Fed เข้มงวด/risk-on · ห้ามแต่งข่าวที่ไม่มีใน headlines · ข่าวแรงสวนทางกับแผน = ลดความมั่นใจ',
    'ไม่มีข้อมูล EMA และห้ามอ้างถึง EMA/เส้นค่าเฉลี่ย ใช้โครงสร้างราคา แนว OI/EM/gmf/VWAP และ Price Action เท่านั้น',
    'SL ต้องอยู่หลังไส้/โครงสร้าง ห่างจาก entry 0.5-2.5 เท่า ATR ของ M15 (atr_m15) · TP เป็นเป้าในวัน · TP1/TP2 ใช้แนวที่มีในข้อมูลหรือ VWAP',
];
function aiPA_(snap) {
  const key = PropertiesService.getScriptProperties().getProperty('DEEPSEEK_API_KEY');
  if (!key) throw new Error('ยังไม่ได้ใส่ DEEPSEEK_API_KEY');
  const price = Number(snap.price), atr = Math.max(0.5, Number(snap.atr_m15) || Number(snap.atr) || 3);
  const sys = [
    'คุณคือเทรดเดอร์ Price Action ทองคำมืออาชีพสายเทรดในวัน (Intraday ไม่ถือข้ามคืน) วิเคราะห์จากกราฟสดที่ส่งมา ณ ตอนนี้ แล้วตัดสินว่าควรเข้าออเดอร์ตอนนี้ไหม',
    ...PA_RULES_,
    'ตอบ JSON เท่านั้น ภาษาไทย กระชับ ฟิลด์: action ("BUY"|"SELL"|"WAIT"), confidence (0-100), pattern (ชื่อ Price Action ที่เห็นสั้นๆ หรือ "ไม่มีสัญญาณชัด"), pa (อธิบาย Price Action แท่งล่าสุด 1-2 ประโยค), context (ราคาอยู่ตรงไหนเทียบแนวสำคัญ 1 ประโยค), entry, sl, tp1, tp2 (ตัวเลข; ถ้า WAIT ให้ใส่ราคาที่ควรรอเข้าแทน หรือ null), reasons (array 2-4 ข้อ ข้อละ 1 ประโยค), invalid (ถ้า... แผนนี้ใช้ไม่ได้ 1 ประโยค), tf_view (object {H4, H1, M15, M5} แต่ละค่า 1 ประโยคสั้น: ทิศ + สิ่งที่เห็น), align (สรุปว่าไทม์เฟรมสอดคล้องหรือขัดกัน ไม่เกิน 40 ตัวอักษร), news_bias ("หนุนทอง"|"กดทอง"|"กลาง"), news_summary (สรุปข่าวล่าสุดที่มีผลกับทองเป็นภาษาไทย 1-2 ประโยค), news_items (array สูงสุด 4 ข้อ {i: ลำดับข่าวใน headlines เริ่ม 0, th: แปล/สรุปพาดหัวเป็นไทยสั้นๆ, impact: "+"|"-"|"0" ผลต่อทอง}), absorption (ตีความ Absorption จากข้อมูล 1-2 ประโยค: ถี่ไหม ฝั่งไหนรับ เกิดที่แนวไหน มีผลกับการเข้าออเดอร์อย่างไร), wait_for (ถ้า WAIT: ต้องเห็นอะไรก่อนเข้า 1 ประโยค)',
  ].join('\n');
  let heads = []; try { heads = aiNews_().slice(0, 10); } catch (e) {}
  snap.headlines = heads.map(h => ({ t: h.t, src: h.src, ago_min: h.ago_min }));
  const body = { model: AI_MODEL, temperature: 0.2, response_format: { type: 'json_object' }, max_tokens: 2200,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(snap) }] };
  const res = aiFetchJson_('https://api.deepseek.com/chat/completions', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + key }, payload: JSON.stringify(body) });
  const A = aiParseJson_(res.choices[0].message.content);
  const num = v => { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
  const out = { action: String(A.action || 'WAIT').toUpperCase(), confidence: Math.max(0, Math.min(100, Math.round(Number(A.confidence) || 0))),
    pattern: String(A.pattern || ''), pa: String(A.pa || ''), context: String(A.context || ''), entry: num(A.entry), sl: num(A.sl), tp1: num(A.tp1), tp2: num(A.tp2),
    reasons: (Array.isArray(A.reasons) ? A.reasons : [A.reasons]).filter(Boolean).map(String).slice(0, 4), invalid: String(A.invalid || ''), absorption: String(A.absorption || ''), align: String(A.align || ''), news_bias: String(A.news_bias || ''), news_summary: String(A.news_summary || ''),
    news: (Array.isArray(A.news_items) ? A.news_items : []).map(n => { const h = heads[Number(n && n.i)]; return h ? { th: String(n.th || h.t), en: h.t, src: h.src, time_th: h.time_th, ago_min: h.ago_min, impact: ['+', '-', '0'].indexOf(String(n.impact)) >= 0 ? String(n.impact) : '0' } : null; }).filter(Boolean).slice(0, 4),
    headlines_n: heads.length, tf_view: (() => { const v = A.tf_view && typeof A.tf_view === 'object' ? A.tf_view : {}; const o = {}; ['H4', 'H1', 'M15', 'M5'].forEach(k => { if (v[k]) o[k] = String(typeof v[k] === 'object' ? Object.values(v[k]).join(' ') : v[k]); }); return o; })(), wait_for: String(A.wait_for || ''),
    price, tf: snap.tf, time_th: snap.time_th, model: AI_MODEL };
  if (['BUY', 'SELL', 'WAIT'].indexOf(out.action) < 0) out.action = 'WAIT';
  // ตรวจความสมเหตุสมผลของแผน: ทิศ SL/TP ถูก, entry ใกล้ราคา, ระยะ SL สมจริง → ไม่ผ่าน = WAIT
  if (out.action !== 'WAIT') {
    const b = out.action === 'BUY', e = out.entry, bad = [];
    if (!e || Math.abs(e - price) > 3 * atr) bad.push('entry ไกลราคาเกินไป');
    if (!out.sl || (b ? out.sl >= e : out.sl <= e)) bad.push('SL ผิดฝั่ง');
    if (!out.tp1 || (b ? out.tp1 <= e : out.tp1 >= e)) bad.push('TP ผิดฝั่ง');
    if (out.sl && e && Math.abs(e - out.sl) > 4 * atr) bad.push('SL กว้างเกิน');
    if (bad.length) { out.action = 'WAIT'; out.checked = 'ระบบปรับเป็นรอ: ' + bad.join(', '); }
    else { const tp = out.tp2 || out.tp1; out.rr = Math.round(Math.abs(tp - e) / Math.max(0.01, Math.abs(e - out.sl)) * 10) / 10; }
  }
  return out;
}


// ---------- ถาดลับ: ผู้ใช้เลือกฝั่ง BUY / SELL หลังวิเคราะห์ → ประเมินว่าควรเข้าฝั่งนั้นไหม โอกาสเท่าไหร่ ----------
// snap มาจากแอป (กราฟ ณ ตอนกด) + side + prev (ผลวิเคราะห์รอบก่อน)
function aiSide_(snap) {
  const key = PropertiesService.getScriptProperties().getProperty('DEEPSEEK_API_KEY');
  if (!key) throw new Error('ยังไม่ได้ใส่ DEEPSEEK_API_KEY');
  const side = snap.side, b = side === 'BUY', price = Number(snap.price), atr = Math.max(0.5, Number(snap.atr_m15) || Number(snap.atr) || 3);
  const sys = [
    `คุณคือเทรดเดอร์ Price Action ทองคำมืออาชีพสายเทรดในวัน ผู้ใช้ต้องการเข้า ${side} (${b ? 'ซื้อ' : 'ขาย'}) ตอนนี้ ให้ประเมินอย่างตรงไปตรงมาว่าควรเข้าฝั่งนี้ไหม และโอกาสสำเร็จเท่าไหร่ ห้ามเอนตามใจผู้ใช้ ถ้าฝั่งนี้สวนทางให้บอกตรงๆ`,
    'prev คือผลวิเคราะห์รอบก่อนของคุณ (อาจหลายนาทีที่แล้ว) ใช้อ้างอิง แต่ตัดสินจากกราฟปัจจุบันเป็นหลัก',
    ...PA_RULES_,
    `prob = โอกาส (%) ที่ราคาจะถึง TP1 ก่อนโดน SL ถ้าเข้า ${side} ตามแผนที่คุณให้ ประเมินแบบระมัดระวัง (สวนทิศ H1/H4 ไม่ควรเกิน 45, ไม่มีสัญญาณชัดไม่ควรเกิน 55, เกิน 75 ต้องมีเหตุผลแข็งมากหลายข้อ)`,
    `verdict: "GO" = เข้า ${side} ได้ตอนนี้, "WAIT" = ฝั่งนี้พอได้แต่ควรรอราคา/สัญญาณก่อน, "NO" = ไม่ควรเข้า ${side}`,
    `ตอบ JSON เท่านั้น ภาษาไทย กระชับ ฟิลด์: verdict, prob (0-100), summary (สรุปคำตอบ 1-2 ประโยค), entry, sl, tp1, tp2 (ตัวเลขแผน ${side}; ถ้า WAIT ใส่ราคาที่ควรรอเข้า; ถ้า NO ใส่ null ได้), pros (array 1-3 ข้อ เหตุผลที่หนุน ${side}), cons (array 1-3 ข้อ ความเสี่ยง/เหตุผลที่สวนทาง), wait_for (ถ้า WAIT หรือ NO: ต้องเห็นอะไรก่อนถึงจะเข้า ${side} ได้ 1 ประโยค), invalid (แผนนี้ใช้ไม่ได้ถ้า... 1 ประโยค)`,
  ].join('\n');
  let heads = []; try { heads = aiNews_().slice(0, 8); } catch (e) {}
  snap.headlines = heads.map(h => ({ t: h.t, src: h.src, ago_min: h.ago_min }));
  const body = { model: AI_MODEL, temperature: 0.2, response_format: { type: 'json_object' }, max_tokens: 1400,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(snap) }] };
  const res = aiFetchJson_('https://api.deepseek.com/chat/completions', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + key }, payload: JSON.stringify(body) });
  const A = aiParseJson_(res.choices[0].message.content);
  const num = v => { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
  const arr = v => (Array.isArray(v) ? v : [v]).filter(Boolean).map(String).slice(0, 3);
  const out = { side, verdict: ['GO', 'WAIT', 'NO'].indexOf(String(A.verdict).toUpperCase()) >= 0 ? String(A.verdict).toUpperCase() : 'WAIT',
    prob: Math.max(0, Math.min(100, Math.round(Number(A.prob) || 0))), summary: String(A.summary || ''), entry: num(A.entry), sl: num(A.sl), tp1: num(A.tp1), tp2: num(A.tp2),
    pros: arr(A.pros), cons: arr(A.cons), wait_for: String(A.wait_for || ''), invalid: String(A.invalid || ''), price, tf: snap.tf, time_th: snap.time_th, model: AI_MODEL };
  // ตรวจแผน: ทิศ SL/TP ต้องถูกฝั่ง, entry ไม่ไกลราคา (ยกเว้นราคารอเข้า), SL ไม่กว้างเกิน
  const e = out.entry, bad = [];
  if (e) {
    if (out.verdict === 'GO' && Math.abs(e - price) > 3 * atr) bad.push('entry ไกลราคาเกินไป');
    if (out.sl && (b ? out.sl >= e : out.sl <= e)) bad.push('SL ผิดฝั่ง');
    if (out.tp1 && (b ? out.tp1 <= e : out.tp1 >= e)) bad.push('TP ผิดฝั่ง');
    if (out.sl && Math.abs(e - out.sl) > 4 * atr) bad.push('SL กว้างเกิน');
  }
  if (bad.length) { out.checked = 'ระบบตรวจแผนไม่ผ่าน: ' + bad.join(', '); if (out.verdict === 'GO') out.verdict = 'WAIT'; out.sl = out.tp1 = out.tp2 = null; }
  else if (e && out.sl && (out.tp2 || out.tp1)) out.rr = Math.round(Math.abs((out.tp2 || out.tp1) - e) / Math.max(0.01, Math.abs(e - out.sl)) * 10) / 10;
  return out;
}
