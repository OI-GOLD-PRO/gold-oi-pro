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
  // แยกรอบ (ตัวตั้งเวลาเรียกทุก 5 นาที): ราคา/offset ทุกรอบ · volume + IV ทุก 10 นาที · gmf ทุก 15 นาที
  // OI และ contract เขียนเฉพาะตอนเปลี่ยน (เช็กพร้อม volume) · vol_log ชั่วโมงละครั้ง
  const P = PropertiesService.getScriptProperties();
  const due = (key, min) => { const last = Number(P.getProperty(key) || 0); return Date.now() - last >= min * 60e3 - 60e3; };
  const mark = key => P.setProperty(key, String(Date.now()));
  const hourKey = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH');
  const dueVol = due('sync_vol', 10), dueGmf = due('sync_gmf', 15), dueLog = P.getProperty('vol_log_hour') !== hourKey;

  // 1) ราคา Gold.F + offset
  let px = null;
  try {
    px = get('/px');
    if (px && px.offset !== null && px.gc_price) {
      sh.getRange('B2:B6').setValues([[px.offset], [px.gc_price], [px.ref_price], [px.ref_symbol], [px.offset_time]]);
    }
  } catch (e) { console.warn('px: ' + e); }

  // 2) ออปชันสัญญาวันนี้: OI, volume, gmf (ข้ามถ้ายังไม่ถึงรอบ)
  const dueBackup = P.getProperty('oi_backup_hour_v1') !== hourKey;
  if (!dueVol && !dueGmf && !dueLog && !dueBackup) return;
  let o = null;
  try { o = get('/opt'); } catch (e) { console.warn('opt: ' + e); }
  if (!o || !o.root || !o.rows || !o.rows.length) return;
  // Archive source rows before live-sheet updates; retry on the next trigger if write fails.
  try { backupOIHourly_(ss, o); }
  catch (e) { P.setProperty('oi_backup_last_error', String(e)); console.error('oi_backup: ' + e); }
  const vol = {}, levels = [];
  o.rows.forEach(r => {
    const k = r[0], t = r[1], v = r[8] || 0, oi = r[11] || 0;
    if (v > 0) { const a = vol[k] || [0, 0]; a[t === 'C' ? 0 : 1] = v; vol[k] = a; }
    if (oi > 0) levels.push([k, oi, t, '']);
  });
  if (String(sh.getRange('B7').getValue()) !== String(o.root)) sh.getRange('B7').setValue(o.root);
  if (dueVol) sh.getRange('B8:B10').setValues([[JSON.stringify(vol)], [now], [o.root]]);

  // ATM IV = เฉลี่ย IV Call/Put ของ strike ใกล้ราคาที่สุด (%)
  let atmIV = null;
  if (o.F) { const near = o.rows.filter(r => r[2]).sort((a, b) => Math.abs(a[0] - o.F) - Math.abs(b[0] - o.F)).slice(0, 2); if (near.length) atmIV = Math.round(near.reduce((a, r) => a + r[2], 0) / near.length * 1000) / 10; }
  if (atmIV !== null && dueVol) {
    const expTxt = o.expTs ? Utilities.formatDate(new Date(o.expTs * 1000), 'Asia/Bangkok', 'yyyy-MM-dd H:mm') : '';
    sh.getRange('A14:B17').setValues([['atm_iv', atmIV], ['iv_expiry', expTxt], ['iv_time', now], ['iv_contract', o.root]]);
  }

  if (dueVol) mark('sync_vol');
  let g = {};
  try { g = JSON.parse(sh.getRange('B18').getValue() || '{}'); } catch (e) { g = {}; }
  if (dueGmf) {
  if (o.itd !== null && o.itd !== undefined) { g.itd = o.itd; g.itd_c = o.root; g.gex_itd = o.gexItd; }
  if (o.gmfM && o.gmfM.M !== null && o.gmfM.M !== undefined) { g.M = o.gmfM.M; g.gex_M = o.gmfM.gexM; g.M_c = o.gmfM.roots + ' contracts exp <=30d (TradingView OI+IV)'; }
  g.F = o.F; g.src = 'Worker auto (TradingView)'; g.time = now;
  sh.getRange('A18:B18').setValues([['gmf', JSON.stringify(g)]]);
  mark('sync_gmf');
  }

  // vol_log: ชั่วโมงละ 1 แถว เมื่อ Worker เพิ่งอัปเดต (ตลาดเปิด) — ใช้ backtest แนว OI + volume
  try {
    const props0 = P;
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

// ===== Hourly immutable OI archive v1 (all rows returned by /opt, including nulls) =====
// Reassemble raw_json_chunk in part order for each snapshot_id, then JSON.parse.
// Raw /opt row schema: [strike,side,iv_decimal,delta,gamma,bid,ask,last,volume,buy,sell,oi].
// Source endpoint currently covers strikes within +/-10% of Worker F; borrowed OI remains in oiFb.
// Missing source values stay null/blank. EM is the Worker's ATM straddle, not IV-derived EM.
const OI_BACKUP_HEADERS = ["snapshot_id","captured_th","hour_th","contract","expiry_ymd","expiry_th","source_updated_th","oi_asof_th","status","futures_price","oi_call","oi_put","volume_call","volume_put","atm_strike","atm_iv_pct","em","em_method","gamma_flip_itd","gamma_flip_30d","gex_itd","gex_30d","rows_count","oi_missing_rows","source","part","parts","payload_sha256","raw_json_chunk"];

function oiBackupAtm_(o) {
  const rows = o.rows || [], by = {};
  rows.forEach(r => {
    if (typeof r[0] !== 'number' || !isFinite(r[0])) return;
    const q = by[r[0]] || (by[r[0]] = {});
    q[r[1]] = r[2];
  });
  if (!(o.F > 0)) return { k: null, iv: null };
  const ks = Object.keys(by).map(Number).filter(k =>
    ['C','P'].some(t => typeof by[k][t] === 'number' && isFinite(by[k][t]) && by[k][t] > 0)
  ).sort((a,b) => Math.abs(a-o.F)-Math.abs(b-o.F) || a-b);
  if (!ks.length) return { k: null, iv: null };
  const k = ks[0], vals = ['C','P'].map(t => by[k][t]).filter(v => typeof v === 'number' && isFinite(v) && v > 0);
  return { k: k, iv: vals.reduce((a,b)=>a+b,0) / vals.length * 100 };
}

function backupOIHourly_(ss, o, clock) {
  const now = clock || new Date();
  const fmt = d => Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  const stamp = sec => typeof sec === 'number' && isFinite(sec) && sec > 0 ? fmt(new Date(sec*1000)) : '';
  const hour = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd HH');
  const id = 'oi-v1|' + hour;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return false;
  try {
    const p = PropertiesService.getScriptProperties();
    if (p.getProperty('oi_backup_hour_v1') === hour) return true;
    let sh = ss.getSheetByName('oi_backup');
    if (!sh) {
      sh = ss.insertSheet('oi_backup');
      if (sh.getMaxColumns() < OI_BACKUP_HEADERS.length) sh.insertColumnsAfter(sh.getMaxColumns(), OI_BACKUP_HEADERS.length-sh.getMaxColumns());
      sh.getRange(1,1,1,OI_BACKUP_HEADERS.length).setValues([OI_BACKUP_HEADERS]);
      sh.setFrozenRows(1);
      sh.getRange(1,1,1,OI_BACKUP_HEADERS.length).setFontWeight('bold').setBackground('#14283f').setFontColor('#ffffff');
    }
    const headers = sh.getRange(1,1,1,OI_BACKUP_HEADERS.length).getValues()[0];
    if (headers.join('|') !== OI_BACKUP_HEADERS.join('|')) throw new Error('oi_backup header mismatch');
    const last = sh.getLastRow();
    // A successful write followed by a property failure must not create duplicate snapshots.
    if (last > 1) {
      const start = Math.max(2,last-99);
      const tail = sh.getRange(start,1,last-start+1,OI_BACKUP_HEADERS.length).getValues();
      const own = tail.filter(r => r[0] === id);
      if (own.length && own.length === Number(own[0][26]) &&
          new Set(own.map(r=>r[25])).size === own.length) {
        p.setProperty('oi_backup_hour_v1',hour); return true;
      }
      if (own.length) throw new Error('incomplete existing oi_backup snapshot: '+id);
    }
    const rows = o.rows || [], atm = oiBackupAtm_(o);
    const num = v => typeof v === 'number' && isFinite(v) ? v : '';
    const total = (side,index) => {
      const a = rows.filter(r=>r[1]===side && typeof r[index]==='number' && isFinite(r[index]));
      return a.length ? a.reduce((s,r)=>s+r[index],0) : '';
    };
    const missing = rows.filter(r=>typeof r[11]!=='number' || !isFinite(r[11])).length;
    const age = o.updated ? now.getTime()/1000-o.updated : Infinity;
    const status = (age >= -120 && age < 900 ? 'FRESH' : 'STALE') +
      (missing ? '|OI_PARTIAL' : '') + (o.oiFb ? '|BORROWED_OI_AVAILABLE' : '');
    const raw = JSON.stringify({ schema: 1, captured_th:fmt(now), coverage:'Worker /opt: strikes +/-10% F; oiFb separate', payload:o });
    const chunks = [];
    for (let i=0;i<raw.length;i+=40000) chunks.push(raw.slice(i,i+40000));
    const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw,Utilities.Charset.UTF_8)
      .map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
    const m = o.gmfM || {}, prefix = [
      id,fmt(now),hour,o.root || '',o.exp || '',stamp(o.expTs),stamp(o.updated),stamp(o.oiT),
      status,num(o.F),total('C',11),total('P',11),total('C',8),total('P',8),
      num(atm.k),num(atm.iv),num(o.em),'Worker ATM straddle (call mid + put mid)',
      num(o.itd),num(m.M),num(o.gexItd),num(m.gexM),rows.length,missing,'TradingView via Worker /opt'
    ];
    const out = chunks.map((chunk,i)=>prefix.concat([i+1,chunks.length,hash,chunk]));
    const end = last + out.length;
    if (end > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(),Math.max(100,end-sh.getMaxRows()));
    sh.getRange(last+1,1,out.length,OI_BACKUP_HEADERS.length).setValues(out);
    SpreadsheetApp.flush();
    p.setProperty('oi_backup_hour_v1',hour);
    p.setProperty('oi_backup_last_success_th',fmt(now));
    p.deleteProperty('oi_backup_last_error');
    return true;
  } finally { lock.releaseLock(); }
}
