import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

const month=30*86400, cookie='__Host-breakout';
const digest=value=>createHash('sha256').update(value).digest();
const attrs='; Path=/; HttpOnly; Secure; SameSite=Lax';
const loginPage=error=>`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>เข้าระบบ Breakout</title>
<style>*{box-sizing:border-box}body{font:17px system-ui;background:#171e22;color:#fff;margin:0}main{max-width:400px;margin:8vh auto;padding:24px}h1{font-size:24px}input:not([type=checkbox]),button{width:100%;padding:12px;border-radius:8px;border:1px solid #92918e;font:inherit;margin:4px 0 16px}button{background:#ebc484;margin-top:20px}p{color:#f8cb9e}</style><main><h1>OI Gold Breakout 1.13</h1><p role="alert">${error?"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง":""}</p><form data-login="/mobile/login" method="post"><label>ชื่อผู้ใช้ (owner หรือ viewer)<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label><label>รหัสผ่าน<input name="password" type="password" autocomplete="current-password" required></label><label><input name="remember" type="checkbox" value="yes"> จดจำการเข้าสู่ระบบบนเครื่องนี้ 30 วัน</label><button type="submit" disabled>เข้าสู่ระบบ</button></form><script src="/mobile-signin.js" defer></script></main></html>`;

function landing(res, cookieValue) {
  if(cookieValue) res.setHeader('Set-Cookie',cookieValue);
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/"><title>เปิดแดชบอร์ด</title><p><a href="/">เปิดหน้าแดชบอร์ด</a></p></html>');
}
function originError(res) {
  res.writeHead(403,{'Content-Type':'text/html; charset=utf-8'});
  res.end('<!doctype html><meta charset="utf-8"><p>กรุณาเปิดลิงก์มือถือปัจจุบันใน Safari แล้วเข้าสู่ระบบใหม่</p><a href="/">กลับหน้าเข้าสู่ระบบ</a>');
}
export function mobileAuth(password,ownerPass){
 const roles=new Map([['viewer',digest(password)]]);
 if(ownerPass?.length>=8 && ownerPass!==password)roles.set('owner',digest(ownerPass));
 const sessions=new Map(), failures=new Map();
 function sweep(map,now){for(const [k,v] of map)if(v.until<=now)map.delete(k)}
 function page(res,status,error=false){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(loginPage(error))}
 return async function authenticate(req,res){
   const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookie+'='))?.slice(cookie.length+1)||'';
   const key=digest(token).toString('hex'), now=Date.now();
   const session=sessions.get(key);
   if(req.method==='GET' && ['/mobile/login','/mobile/logout'].includes(req.url.split('?')[0])){landing(res);return}
   if(req.method==='POST' && ['/mobile/login','/mobile/logout'].includes(req.url)){
     if(!/^[a-z0-9-]+\.trycloudflare\.com$/i.test(req.headers.host||'') || req.headers.origin!=='https://'+req.headers.host){originError(res);return}
     if(req.url==='/mobile/logout'){
       sessions.delete(key);landing(res,cookie+'='+attrs+'; Max-Age=0');return
     }
     const ip=req.headers['cf-connecting-ip']||req.socket.remoteAddress;
     sweep(failures,now);
     if((failures.get(ip)?.count||0)>=12 || failures.size>=4096){res.writeHead(429);res.end('Please try again later');return}
     if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(415);res.end();return}
     let bytes=0;const chunks=[];
     try{for await(const chunk of req){bytes+=chunk.length;if(bytes>32768){res.writeHead(413);res.end();return}chunks.push(chunk)}}catch{return}
     const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8')),role=form.get('username'), hash=roles.get(role);
     if(!timingSafeEqual(digest(form.get('password')||''),hash||digest('')) || !hash){
       const fail=failures.get(ip)||{count:0,until:now+600000};fail.count++;failures.set(ip,fail);page(res,401,true);return
     }
     failures.delete(ip);sweep(sessions,now);sessions.delete(key);
     if(sessions.size>=4096)sessions.delete(sessions.keys().next().value);
     const fresh=randomBytes(32).toString('hex'),remember=form.get('remember')==='yes';
     sessions.set(digest(fresh).toString('hex'),{role,until:now+1000*(remember?month:86400)});
     res.setHeader('X-OI-Login','ok');
     landing(res,cookie+'='+fresh+attrs+(remember?'; Max-Age='+month:''));return
   }
   if(session && session.until>now)return session.role;
   if(req.method==='GET' && req.url?.split('?')[0]==='/'){page(res,200);return}
   res.writeHead(401);res.end();
 }
}
