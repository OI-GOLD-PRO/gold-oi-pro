// ===== OI Gold Pro: ซิงก์ข้อมูลสดจาก Cloudflare Worker ลงชีตอัตโนมัติ =====
// วางไฟล์นี้เพิ่มในโปรเจกต์ Apps Script ของชีต (ไฟล์ใหม่ ไม่ต้องแก้ Code.gs เดิม)
// แล้วกดรันฟังก์ชัน installSyncTrigger ครั้งเดียว (อนุญาตสิทธิ์) → ระบบจะรัน syncLive ทุก 5 นาทีเอง
// ไม่ต้อง Deploy เว็บแอปใหม่
//
// เขียนลงแท็บ webapp:
//   B2:B6  offset, gc_price, ref_price, ref_symbol, offset_time   (Gold.F + offset จากจุดตัด 00/25/50/75 ล่าสุด)
//   B7     contract                                                (สัญญาที่หมดอายุวันนั้น)
//   B8:B10 volume, volume_time, volume_contract                    (volume ราย strike ของสัญญาวันนั้น)
//   B18    gmf                                                     (gmf itd + gmf M)
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
  try {
    const px = get('/px');
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

  let g = {};
  try { g = JSON.parse(sh.getRange('B18').getValue() || '{}'); } catch (e) { g = {}; }
  if (o.itd !== null && o.itd !== undefined) { g.itd = o.itd; g.itd_c = o.root; g.gex_itd = o.gexItd; }
  if (o.gmfM && o.gmfM.M !== null && o.gmfM.M !== undefined) { g.M = o.gmfM.M; g.gex_M = o.gmfM.gexM; g.M_c = o.gmfM.roots + ' contracts exp <=30d (TradingView OI+IV)'; }
  g.F = o.F; g.src = 'Worker auto (TradingView)'; g.time = now;
  sh.getRange('A18:B18').setValues([['gmf', JSON.stringify(g)]]);

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
