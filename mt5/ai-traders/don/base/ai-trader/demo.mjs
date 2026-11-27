import { mkdir, readFile, writeFile, rename, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { orderFlow } from './flow.mjs';

const dir = process.env.OI_STATE_DIR || join(homedir(), '.oi-gold-ai-trader');
const policyPath = join(dir, 'risk.json');
const logPath = join(dir, 'decisions.jsonl');
const defaults = { enabled:false, hedging:false, perTrade:0.5, total:1, daily:2, positions:3 };
async function read(path, fallback) {
  try { return await readFile(path,'utf8'); } catch(e) { if(e.code==='ENOENT') return fallback; throw e; }
}
export async function policy() { return JSON.parse(await read(policyPath, JSON.stringify(defaults))); }
async function body(req) {
  let bytes=0;
  const chunks=[];
  for await(const chunk of req) {
    const buffer=Buffer.from(chunk);
    bytes+=buffer.length;
    if(bytes>100000) throw Error('Request too large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function validate(p) {
  if (!p || typeof p.enabled!=='boolean' || typeof p.hedging!=='boolean' ||
      !Number.isInteger(p.positions) || p.positions<1 || p.positions>50 ||
      ![p.perTrade,p.total,p.daily].every(x=>Number.isFinite(x)&&x>=0.01) ||
      p.perTrade>5 || p.total<p.perTrade || p.total>20 || p.daily>20) throw Error('Invalid risk limits');
  return Object.fromEntries(Object.keys(defaults).map(k=>[k,p[k]]));
}
export async function decisions() {
  return (await read(logPath,'')).split('\n').filter(Boolean).map(line=>JSON.parse(line));
}
let busy=false;
let lastContact=null;
export async function demoRoute(req,res,path,readOptions) {
  const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
  try {
    if(path==='/api/demo/status' && req.method==='GET') {
      return send(200,{policy:await policy(),recent:(await decisions()).slice(-20).reverse(),lastContact});
    }
    if(req.method!=='POST') return send(405,{error:'POST required'});
    await mkdir(dir,{recursive:true,mode:0o700});
    if(path==='/api/demo/policy') {
      if(!req.dashboardOrigin || req.headers.origin!==req.dashboardOrigin || req.headers['x-oi-dashboard']!=='1') return send(403,{error:'Local dashboard required'});
      const p=validate(await body(req)), tmp=policyPath+'.'+randomUUID();
      await writeFile(tmp,JSON.stringify(p),{mode:0o600}); await rename(tmp,policyPath); return send(200,p);
    }
    const token=process.env.OI_BRIDGE_TOKEN;
    if(path!=='/api/demo/decision'||!token||token.length<24||req.headers.authorization!=='Bearer '+token) return send(403,{error:'Bridge credentials required'});
    const m=await body(req);
    if(!process.env.OI_MT5_LOGIN || !process.env.OI_MT5_SERVER || m.login!==process.env.OI_MT5_LOGIN || m.server!==process.env.OI_MT5_SERVER || m.symbol!==(process.env.OI_MT5_SYMBOL||'XAUUSD') || m.tf!=='M5' || !Array.isArray(m.candles)||!m.candles.length) return send(403,{error:'Account or symbol mismatch'});
    lastContact={at:new Date().toISOString(),symbol:m.symbol,count:m.count,loginSuffix:m.login.slice(-4),candles:m.candles.slice(-80).filter(row=>Array.isArray(row) && row.length>=5 && row.slice(0,5).every(Number.isFinite)).map(row=>row.slice(0,5))};
    const p=await policy(), wait={action:'WAIT',reason:'No active decision'};
    if(!p.enabled || busy || !process.env.DEEPSEEK_API_KEY) return send(200,wait);
    busy=true;
    try {
      const bar=m.candles.at(-1)[0], key=JSON.stringify([m.server,m.login,m.symbol,bar]);
      if(!Number.isSafeInteger(bar)||(await decisions()).some(d=>d.key===key)) return send(200,wait);
      const [oi,flow]=await Promise.all([readOptions(),orderFlow().catch(()=>null)]);
      if(oi.status!=='fresh'||!oi.oi_coverage.reported) return send(200,wait);
      const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.DEEPSEEK_API_KEY},signal:AbortSignal.timeout(35000),body:JSON.stringify({model:process.env.DEEPSEEK_MODEL||'deepseek-flash',response_format:{type:'json_object'},messages:[{role:'system',content:'Evaluate broker M5 closed candles and GC options. Return JSON action BUY SELL WAIT CLOSE REDUCE or HOLD, numeric risk_pct sl_atr rr reduce_pct, reason in Thai. CLOSE/REDUCE/HOLD manages only the provided position. Open within risk limits only. Use WAIT when uncertain. GC strikes are not broker order prices.'},{role:'user',content:JSON.stringify({market:m,options:oi,order_flow:flow,policy:p})}]})});
      if(!response.ok) throw Error('DeepSeek HTTP '+response.status);
      const choice=(await response.json()).choices?.[0];
      if(choice?.finish_reason!=='stop') return send(200,wait);
      const d=JSON.parse(choice.message.content);
      if(!['BUY','SELL','WAIT','CLOSE','REDUCE','HOLD'].includes(d.action)||typeof d.reason!=='string'||!d.reason.trim()||d.reason.length>1500) return send(200,wait);
      if(['BUY','SELL'].includes(d.action)&&(![d.risk_pct,d.sl_atr,d.rr].every(Number.isFinite)||d.risk_pct<=0||d.risk_pct>p.perTrade||d.sl_atr<0.7||d.sl_atr>3||d.rr<1.2||d.rr>4)) return send(200,wait);
      if(JSON.stringify(await policy())!==JSON.stringify(p)||Date.now()-Date.parse(oi.quotes_as_of_utc)>=900000||Date.now()>=Date.parse(oi.expires_at_utc)) return send(200,wait);
      const id=randomUUID().replaceAll('-','').slice(0,20);
      const result={action:d.action,reason:d.reason,risk_pct:d.risk_pct,sl_atr:d.sl_atr,rr:d.rr,reduce_pct:d.reduce_pct,id,limitTotal:p.total,limitDaily:p.daily,limitCount:p.positions,hedge:p.hedging?1:0};
      await appendFile(logPath,JSON.stringify({key,id,at:new Date().toISOString(),action:d.action,reason:d.reason})+'\n',{mode:0o600});
      return send(200,result);
    } finally { busy=false; }
  } catch(error) { return send(400,{error:error.message}); }
}
