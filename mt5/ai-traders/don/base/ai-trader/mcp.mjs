// Local stdio MCP adapter. Only the three fixed dashboard GET routes are reachable.
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
const port = Number(process.env.OI_TRADER_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid OI_TRADER_PORT');
const names = {
  get_oi_snapshot: 'Current GC options snapshot, with contract, source timestamps, expiry and quote status.',
  get_daily_journal: 'Broker-day executions across the account, net result in account currency, and recorded AI entry reasons. Omit day for latest export day.',
  get_risk_policy: 'Current dashboard demo risk limits and enable flag. EA-side caps can be tighter.'
};
const tools = Object.entries(names).map(([name,description]) => ({
  name, description, annotations:{readOnlyHint:true},
  inputSchema:{type:'object',additionalProperties:false,properties:name==='get_daily_journal'
    ? {day:{type:'string',pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'}} : {}}
}));
async function get(path) {
  const response=await fetch('http://127.0.0.1:'+port+path,{redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw Error('Dashboard HTTP '+response.status+' on '+path.split('?')[0]);
  return response.json();
}
async function call(name,args) {
  if(!Object.hasOwn(names,name)) throw Error('Unknown tool');
  if(!args || typeof args!=='object' || Array.isArray(args) ||
    Object.keys(args).some(k=>name!=='get_daily_journal'||k!=='day')) throw Error('Unexpected arguments');
  if(name==='get_risk_policy') return (await get('/api/demo/status')).policy;
  if(name==='get_oi_snapshot'){
    const data=await get('/api/oi-snapshot');
    return {...data,snapshot_id:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
  }
  if('day' in args){
    if(typeof args.day!=='string'||!/^\d{4}-\d\d-\d\d$/.test(args.day) ||
      new Date(args.day+'T00:00:00Z').toJSON()?.slice(0,10)!==args.day) throw Error('Invalid broker date');
  }
  const data=await get('/api/journal'+(args.day?'?day='+args.day:''));
  if(data.day<data.first || data.day>data.last.slice(0,10)) throw Error('Date outside MT5 export coverage');
  return data;
}
const versions=['2025-11-25','2025-06-18','2025-03-26','2024-11-05'];
let initialized=false;
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  let req,id=null;
  const reply=fields=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,...fields})+'\n');
  try {req=JSON.parse(line);}catch{reply({error:{code:-32700,message:'Invalid JSON'}});continue;}
  if(!req||req.jsonrpc!=='2.0'||typeof req.method!=='string'){reply({error:{code:-32600,message:'Invalid request'}});continue;}
  if(req.id===undefined)continue;
  id=req.id;
  if(req.method==='initialize'){
    initialized=true;
    reply({result:{protocolVersion:versions.includes(req.params?.protocolVersion)?req.params.protocolVersion:versions[0],
      serverInfo:{name:'oi-gold-ai-trader',version:'1.0.0'},capabilities:{tools:{}}}});
  }else if(req.method==='ping')reply({result:{}});
  else if(!initialized)reply({error:{code:-32002,message:'Initialize first'}});
  else if(req.method==='tools/list')reply({result:{tools}});
  else if(req.method==='tools/call'){
    try{
      const value=await call(req.params?.name,req.params?.arguments??{});
      reply({result:{content:[{type:'text',text:JSON.stringify(value)}]}});
    }catch(error){reply({result:{isError:true,content:[{type:'text',text:error.message}]}});}
  }else reply({error:{code:-32601,message:'Method not found'}});
}
