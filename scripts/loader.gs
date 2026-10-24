// ===== OI Gold Pro: ตัวโหลดสคริปต์จาก GitHub =====
// วางไฟล์นี้ไฟล์เดียวใน Apps Script แล้วลบไฟล์ sync_live และ ai_dash เดิมออก (ชื่อฟังก์ชันซ้ำกัน)
// ทุกครั้งที่รัน จะดึงโค้ดล่าสุดจาก GitHub (เก็บแคช 5 นาที) แล้วรัน → แก้โค้ดฝั่ง GitHub ได้โดยไม่ต้องวางใหม่
// ตัวตั้งเวลาเดิม (syncLive ทุก 5 นาที, aiTick ทุก 5 นาที) ใช้ต่อได้เลย เพราะชื่อฟังก์ชันเหมือนเดิม
// คีย์ DEEPSEEK_API_KEY ยังอยู่ใน Script properties ที่เดิม (ไม่ได้อยู่ใน GitHub)
//
// ⚠️ โค้ดใน https://github.com/OI-GOLD-PRO/gold-oi-pro/tree/main/scripts จะรันในบัญชี Google นี้ทันทีที่มีการแก้
//    ถ้าต้องการหยุดใช้ตัวโหลด ให้กลับไปวางไฟล์ sync_live.gs / ai_dash.gs แบบเดิมแทน

const LOADER_BASE = 'https://raw.githubusercontent.com/OI-GOLD-PRO/gold-oi-pro/main/scripts/';

function loadRemote_(file) {
  const cache = CacheService.getScriptCache(), key = 'src_' + file;
  let src = cache.get(key);
  if (!src) {
    const r = UrlFetchApp.fetch(LOADER_BASE + file + '?t=' + Math.floor(Date.now() / 300000), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('โหลด ' + file + ' ไม่ได้ HTTP ' + r.getResponseCode());
    src = r.getContentText();
    try { cache.put(key, src, 300); } catch (e) {}
  }
  return src;
}
function runRemote_(file, fn) {
  const f = new Function(loadRemote_(file) + '\nreturn ' + fn + ';')();
  return f();
}

// ฟังก์ชันที่ตัวตั้งเวลาและปุ่มรันเรียกใช้
function syncLive() { return runRemote_('sync_live.gs', 'syncLive'); }
function aiTick() { return runRemote_('ai_dash.gs', 'aiTick'); }
function runAINow() { return runRemote_('ai_dash.gs', 'runAINow'); }

// ล้างแคชเพื่อดึงโค้ดใหม่ทันที (ปกติรอไม่เกิน 5 นาที)
function reloadNow() { CacheService.getScriptCache().removeAll(['src_sync_live.gs', 'src_ai_dash.gs']); }

// ตั้ง/ลบตัวตั้งเวลา (ใช้เมื่อยังไม่มี หรืออยากเริ่มใหม่)
function installAllTriggers() {
  ScriptApp.getProjectTriggers().filter(t => ['syncLive', 'aiTick'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncLive').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('aiTick').timeBased().everyMinutes(5).create();
}
function removeAllTriggers() {
  ScriptApp.getProjectTriggers().filter(t => ['syncLive', 'aiTick'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
}
