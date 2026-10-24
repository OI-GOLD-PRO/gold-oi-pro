// ===== OI Gold Pro: ซิงก์ข้อมูลสดจาก Cloudflare Worker ลงชีตอัตโนมัติ =====
// วางไฟล์นี้เพิ่มในโปรเจกต์ Apps Script ของชีต (ไฟล์ใหม่ ไม่ต้องแก้ Code.gs เดิม)
// แล้วกดรันฟังก์ชัน installSyncTrigger ครั้งเดียว (อนุญาตสิทธิ์) → ระบบจะรัน syncLive ทุก 5 นาทีเอง
// ไม่ต้อง Deploy เว็บแอปใหม่
//
// เขียนลงแท็บ webapp:
//   B2:B6  offset, gc_price, ref_price, ref_symbol, offset_time   (Gold.F + offset จากจุดตัด 00/25/50/75 ล่าสุด)
//   B7     contract                                                (สัญญาที่หมดอายุวันนั้น)
//   B8:B10 volume, volume_time, volume_contract                    (volume ราย strike ของสัญญาวันนั้น)
//   B14:B17 atm_iv, iv_expiry, iv_time, iv_contract               (ATM IV สัญญาวันนั้น)
//   B18    gmf                                                     (gmf itd + gmf M)
// แท็บ vol_log: ต่อท้าย 1 แถวทุกชั่วโมงเฉพาะตอนตลาดเปิด (เวลา, gold, สัญญา, ราคา, offset, JSON สรุป + volume ราย strike, หมายเหตุ)
// และแท็บ ชีต1: OI ราย strike ของสัญญาวันนั้น (แถว 2 = ราคา F, แถว 3 = เวลา V)

const SYNC_SHEET_ID = '1-0tiRE91vvRM3xOiJPXBqlwGQbTmvmGaHv804DX4liU';
const SYNC_WORKER = 'https://gc-yahoo.oigoldpro.workers.dev';

function syncLive() {
  const ss = SpreadsheetApp.openById(SYNC_SHEET_ID);
  const sh = ss.getSheetByName('webapp');
  const get = path => {
    const r = UrlFetchApp.fetch(SYNC_WORKER + path, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error(path + ' HTTP ' + r.getResponseCode());
    return JSON.parse(r.getContentText());
  };
  const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');

  // 1) ราคา Gold.F + offset
  let px = null;
  try {
    px = get('/px');
    if (px && px.offset !== null && px.gc_price) {
      sh.getRange('B2:B6').setValues([[px.offset], [px.gc_price], [px.ref_price], [px.ref_symbol], [px.offset_time]]);
    }
  } catch (e) { console.warn('px: ' + e); }

  // 2) ออปชันสัญญาวันนี้: OI, volume, gmf
  let o = null;
  try { o = get('/opt'); } catch (e) { console.warn('opt: ' + e); }
  if (!o || !o.root || !o.rows || !o.rows.length) return;
  const vol = {}, levels = [];
  o.rows.forEach(r => {
    const k = r[0], t = r[1], v = r[8] || 0, oi = r[11] || 0;
    if (v > 0) { const a = vol[k] || [0, 0]; a[t === 'C' ? 0 : 1] = v; vol[k] = a; }
    if (oi > 0) levels.push([k, oi, t, '']);
  });
  sh.getRange('B7').setValue(o.root);
  sh.getRange('B8:B10').setValues([[JSON.stringify(vol)], [now], [o.root]]);

  // ATM IV = เฉลี่ย IV Call/Put ของ strike ใกล้ราคาที่สุด (%)
  let atmIV = null;
  if (o.F) { const near = o.rows.filter(r => r[2]).sort((a, b) => Math.abs(a[0] - o.F) - Math.abs(b[0] - o.F)).slice(0, 2); if (near.length) atmIV = Math.round(near.reduce((a, r) => a + r[2], 0) / near.length * 1000) / 10; }
  if (atmIV !== null) {
    const expTxt = o.expTs ? Utilities.formatDate(new Date(o.expTs * 1000), 'Asia/Bangkok', 'yyyy-MM-dd H:mm') : '';
    sh.getRange('A14:B17').setValues([['atm_iv', atmIV], ['iv_expiry', expTxt], ['iv_time', now], ['iv_contract', o.root]]);
  }

  let g = {};
  try { g = JSON.parse(sh.getRange('B18').getValue() || '{}'); } catch (e) { g = {}; }
  if (o.itd !== null && o.itd !== undefined) { g.itd = o.itd; g.itd_c = o.root; g.gex_itd = o.gexItd; }
  if (o.gmfM && o.gmfM.M !== null && o.gmfM.M !== undefined) { g.M = o.gmfM.M; g.gex_M = o.gmfM.gexM; g.M_c = o.gmfM.roots + ' contracts exp <=30d (TradingView OI+IV)'; }
  g.F = o.F; g.src = 'Worker auto (TradingView)'; g.time = now;
  sh.getRange('A18:B18').setValues([['gmf', JSON.stringify(g)]]);

  // vol_log: ชั่วโมงละ 1 แถว เมื่อ Worker เพิ่งอัปเดต (ตลาดเปิด) — ใช้ backtest แนว OI + volume
  try {
    const props0 = PropertiesService.getScriptProperties();
    const hourKey = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH');
    const fresh = o.updated && (Date.now() / 1000 - o.updated) < 15 * 60;
    if (fresh && props0.getProperty('vol_log_hour') !== hourKey) {
      let vC = 0, vP = 0, oC = 0, oP = 0;
      o.rows.forEach(r => { if (r[1] === 'C') { vC += r[8] || 0; oC += r[11] || 0; } else { vP += r[8] || 0; oP += r[11] || 0; } });
      // ATM IV = เฉลี่ย IV Call/Put ของ strike ใกล้ราคาที่สุด
      const atm = atmIV;
      const sum = { vol_C: vC, vol_P: vP, oi_C: oC, oi_P: oP, atm_iv: atm, gmf_itd: g.itd, gmf_M: g.M, em: o.em, v: vol };
      ss.getSheetByName('vol_log').appendRow([now, 'gold', o.root, px && px.gc_price ? px.gc_price : (o.F || ''), px && px.offset !== null ? px.offset : '', JSON.stringify(sum), 'auto (Worker/TradingView) ทุกชั่วโมง']);
      props0.setProperty('vol_log_hour', hourKey);
    }
  } catch (e) { console.warn('vol_log: ' + e); }

  // OI ลง ชีต1 เฉพาะเมื่อมีข้อมูลและเปลี่ยนจากเดิม
  if (levels.length) {
    const oiSh = ss.getSheetByName('ชีต1');
    levels.sort((a, b) => a[0] - b[0] || (a[2] < b[2] ? -1 : 1));
    const sig = o.root + '|' + levels.map(l => l[0] + l[2] + l[1]).join(',');
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('oi_sig') !== sig) {
      const stamp = o.oiT ? Utilities.formatDate(new Date(o.oiT * 1000), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm') : now;
      const rows = [[o.F || '', '', 'F', ''], [stamp + ' TV ' + o.root, '', 'V', '']].concat(levels);
      oiSh.getRange('A2:D' + Math.max(oiSh.getLastRow(), 2)).clearContent();
      oiSh.getRange(2, 1, rows.length, 4).setValues(rows);
      props.setProperty('oi_sig', sig);
    }
  }
}

// รันครั้งเดียว: ตั้งเวลาให้ syncLive ทำงานทุก 5 นาที (ลบตัวเก่าที่ซ้ำก่อน)
function installSyncTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncLive').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncLive').timeBased().everyMinutes(5).create();
  syncLive();
}

// ถ้าอยากหยุดซิงก์อัตโนมัติ
function removeSyncTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncLive').forEach(t => ScriptApp.deleteTrigger(t));
}
