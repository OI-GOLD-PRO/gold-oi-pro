(async()=>{
 'use strict';
 const BASE='https://raw.githubusercontent.com/OI-GOLD-PRO/gold-oi-pro/main/ai-roundtable-ui/';
 const CACHE='oi-roundtable-ui-cache-v1';
 const fallback=__FALLBACK_JSON__;
 const badge=document.createElement('div');badge.id='oiUpdateStatus';badge.setAttribute('role','status');
 badge.style.cssText='padding:8px 10px;font-size:12px;line-height:1.5;border:1px solid var(--border);border-radius:8px;overflow-wrap:anywhere';
 badge.textContent='กำลังตรวจรุ่นหน้าเว็บ…';document.getElementById('side').prepend(badge);
 async function get(url){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),7000);
  try{const r=await fetch(url,{cache:'no-store',signal:ac.signal,referrerPolicy:'no-referrer'});if(!r.ok)throw Error('HTTP '+r.status);const s=await r.text();if(s.length>500000)throw Error('oversize');return s}
  finally{clearTimeout(timer)}
 }
 async function verify(record){
  if(!record||record.schema!==1||!/^\d+\.\d+\.\d+$/.test(record.version)||!/^ui-[a-f0-9]{64}\.js$/.test(record.file)||!/^([a-f0-9]{64})$/.test(record.sha256)||typeof record.code!=='string'||record.code.length>500000)throw Error('bad release');
  if(record.file!=='ui-'+record.sha256+'.js')throw Error('bad filename');
  const bytes=new TextEncoder().encode(record.code);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==record.sha256)throw Error('hash mismatch');
  return record;
 }
 let release,mode;
 try{
  const manifest=JSON.parse(await get(BASE+'manifest.json?t='+Date.now()));
  if(!manifest||!/^ui-[a-f0-9]{64}\.js$/.test(manifest.file))throw Error('bad manifest');
  release=await verify({...manifest,code:await get(BASE+manifest.file)});mode='online';
 }catch{
  try{release=await verify(JSON.parse(localStorage.getItem(CACHE)));mode='cache'}
  catch{release=fallback;mode='bundled'}
 }
 // Run only once per page. Existing debates are never automatically reloaded.
 window.__oiUIReady=false;window.__oiUIError=false;
 const script=document.createElement('script');
 script.textContent='try {\n'+release.code+'\nwindow.__oiUIReady=true;\n} catch(e) {window.__oiUIError=true;}';
 document.body.append(script);
 if(window.__oiUIReady){
  if(mode==='online'){try{localStorage.setItem(CACHE,JSON.stringify(release))}catch{}}
  badge.textContent='หน้า AI v'+release.version+(mode==='online'?' · อัปเดตจากส่วนกลางแล้ว':mode==='cache'?' · ติดต่อส่วนกลางไม่ได้ ใช้รุ่นที่บันทึกไว้':' · ติดต่อส่วนกลางไม่ได้ ใช้รุ่นติดตั้ง');
 }else badge.textContent='หน้าเว็บรุ่นนี้เปิดไม่สมบูรณ์ กรุณาลองรีเฟรชอีกครั้ง';
 const link=document.createElement('a');link.href='https://github.com/OI-GOLD-PRO/gold-oi-pro/tree/main/ai-roundtable-ui';link.target='_blank';link.rel='noopener noreferrer';link.textContent='ซอร์สและเวอร์ชัน';link.style.cssText='display:block;margin-top:5px;color:var(--muted)';badge.append(link);
})();
