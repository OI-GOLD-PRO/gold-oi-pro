import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function startViewer(dashboard, password, port=4174) {
  if (!password || password.length<24) throw Error('Invalid viewer password');
  const expected=Buffer.from('Basic '+Buffer.from('viewer:'+password).toString('base64'));
  const ownerPass=process.env.OI_PHONE_OWNER_PASSWORD;
  const owner=ownerPass?.length>=24 && ownerPass!==password
    ? Buffer.from('Basic '+Buffer.from('owner:'+ownerPass).toString('base64')) : null;
  const routes=new Set(['/api/demo/status','/api/oi-snapshot','/api/journal','/style.css']);
  return createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    const auth=Buffer.from(req.headers.authorization||'');
    let isOwner=owner && auth.length===owner.length && timingSafeEqual(auth,owner);
    let isViewer=auth.length===expected.length && timingSafeEqual(auth,expected);
    const host=req.headers.host;
    const privateHost=process.env.OI_PRIVATE_HOST;
    if(privateHost && host===privateHost){
      const sign=(value,secret)=>createHmac('sha256',secret).update(host+'|'+value).digest('hex');
      const remember=()=>{
        const role=isOwner?'owner':'viewer';
        const value=role+'.'+(Math.floor(Date.now()/1000)+365*86400);
        const mac=sign(value,isOwner?ownerPass:password);
        res.setHeader('Set-Cookie','__Host-oi='+value+'.'+mac+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=31536000');
      };
      if(isOwner || isViewer){ remember(); }else{
        const match=/(?:^|; )__Host-oi=(owner|viewer)\.(\d{10})\.([0-9a-f]{64})(?:;|$)/.exec(req.headers.cookie||'');
        if(match && Number(match[2])>Date.now()/1000){
          const secret=match[1]==='owner'?(owner && ownerPass):password;
          if(secret && timingSafeEqual(Buffer.from(match[3]),Buffer.from(sign(match[1]+'.'+match[2],secret)))){
            isOwner=match[1]==='owner'; isViewer=!isOwner;
            if(Number(match[2])-Date.now()/1000<180*86400) remember();
          }
        }
      }
    }
    if(!isOwner && !isViewer){
      res.writeHead(401,{'WWW-Authenticate':'Basic realm="AI Trader Viewer"'});return res.end();
    }
    if(isOwner && req.method==='POST' && req.url==='/api/demo/policy'){
      if((!(privateHost && host===privateHost) && !/^[a-z0-9-]+\.trycloudflare\.com$/i.test(req.headers.host||'')) ||
         req.headers.origin!=='https://'+req.headers.host || req.headers['x-oi-dashboard']!=='1'){
        res.writeHead(403);return res.end();
      }
      req.dashboardOrigin=req.headers.origin;
      return dashboard(req,res);
    }
    if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});return res.end();}
    const path=req.url.split('?')[0];
    if(isOwner && path==='/phone-settings.js') {
      const script=await readFile(new URL('phone-settings.js',import.meta.url));res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});return res.end(script);
    }
    if(routes.has(path))return dashboard(req,res);
    if(path!=='/'&&path!=='/viewer.js'){res.writeHead(404);return res.end();}
    try{
      const file=path==='/'?(isOwner?'owner.html':'viewer.html'):'viewer.js';
      const data=await readFile(new URL(file,import.meta.url));
      res.writeHead(200,{'Content-Type':path==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8'});res.end(data);
    }catch{res.writeHead(500);res.end();}
  }).listen(port,'127.0.0.1');
}
