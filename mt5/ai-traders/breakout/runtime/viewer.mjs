import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mobileAuth } from './mobile-auth.mjs';

export function startViewer(dashboard, password, port=4194) {
  if (!password || password.length<8) throw Error('Invalid viewer password');
  const authenticate=mobileAuth(password,process.env.OI_PHONE_OWNER_PASSWORD);
  const routes=new Set(['/api/demo/status','/api/oi-snapshot','/api/journal','/dashboard.js']);
  return createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if (req.method === 'GET' && req.url === '/mobile-signin.js') {
      try {
        const script = await readFile(new URL('mobile-signin.js', import.meta.url));
        res.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8'});
        return res.end(script);
      } catch { res.writeHead(500); return res.end(); }
    }
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    const role=await authenticate(req,res);
    if(!role)return;
    const isOwner=role==='owner';
    if(isOwner && req.method==='POST' && req.url==='/api/demo/policy'){
      if(!/^[a-z0-9-]+\.trycloudflare\.com$/i.test(req.headers.host||'') ||
         req.headers.origin!=='https://'+req.headers.host || req.headers['x-oi-dashboard']!=='1'){
        res.writeHead(403);return res.end();
      }
      req.dashboardOrigin=req.headers.origin;
      return dashboard(req,res);
    }
    if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});return res.end();}
    const path=req.url.split('?')[0];
    if(routes.has(path))return dashboard(req,res);
    if(path!=='/'){res.writeHead(404);return res.end();}
    try{
      const file=isOwner?'owner.html':'viewer.html';
      res.setHeader('X-OI-Dashboard','1');
      const data=await readFile(new URL(file,import.meta.url));
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(data.toString('utf8').replace('</main>', '<form method="post" action="/mobile/logout"><button type="submit">ออกจากระบบบนเครื่องนี้</button></form></main>'));
    }catch{res.writeHead(500);res.end();}
  }).listen(port,'127.0.0.1');
}
