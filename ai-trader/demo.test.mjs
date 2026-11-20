import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {dailyJournal} from './journal.mjs';
import {orderFlow} from './flow.mjs';

test('demo policy, exact account, one decision per bar, and broker deal rationale', async t=>{
  const dir=await mkdtemp(join(tmpdir(),'oi-demo-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  Object.assign(process.env,{OI_STATE_DIR:dir,OI_MT5_LOGIN:'123',OI_MT5_SERVER:'test',OI_BRIDGE_TOKEN:'x'.repeat(24),DEEPSEEK_API_KEY:'fixture'});
  const {demoRoute,decisions}=await import('./demo.mjs');
  const market={login:'123',server:'test',symbol:'XAUUSD',tf:'M5',candles:[[123]],count:0};
  async function post(path,data){
    const req=Readable.from([JSON.stringify(data)]);
    req.dashboardOrigin='http://127.0.0.1:4173';req.method='POST';req.headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173','x-oi-dashboard':'1',authorization:'Bearer '+process.env.OI_BRIDGE_TOKEN};
    const res={writeHead(code){this.status=code},end(json){this.body=JSON.parse(json)}};
    await demoRoute(req,res,path,async()=>({status:'fresh',oi_coverage:{reported:1},quotes_as_of_utc:new Date().toISOString(),expires_at_utc:new Date(Date.now()+100000).toISOString()}));
    return res;
  }
  assert.equal((await post('/api/demo/decision',market)).body.action,'WAIT');
  const p={enabled:true,hedging:true,perTrade:0.5,total:1,daily:2,positions:3};
  assert.equal((await post('/api/demo/policy',{...p,positions:0})).status,400);
  assert.equal((await post('/api/demo/policy',p)).status,200);
  assert.equal((await post('/api/demo/decision',{...market,login:'other'})).status,403);
  const original=global.fetch;t.after(()=>global.fetch=original);
  global.fetch=async url=>String(url).includes('binance')?Response.json([]):Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({action:'BUY',risk_pct:.25,rr:2,sl_atr:1,reason:'demo rationale'})}}]});
  const first=(await post('/api/demo/decision',market)).body;
  assert.equal(first.action,'BUY');
  assert.equal((await post('/api/demo/decision',market)).body.action,'WAIT');
  const path=join(dir,'journal.tsv');
  await writeFile(path,'OIJournal2\tUSD\t2026.11.01\t2026.11.20 12:00:00\n2026.11.19 10:00:00\t91\tGC\tBUY\tDEAL_ENTRY_IN\t1\t0\t-1\t0\t0\t77\t'+first.id+'\n2026.11.20 10:00:00\t92\tGC\tSELL\tDEAL_ENTRY_OUT\t1\t15\t-1\t0\t0\t77\t-','utf16le');
  const j=await dailyJournal(path,'2026-11-20',await decisions());
  assert.equal(j.net,14);assert.equal(j.rows[0].reason,'demo rationale');
});
test('closed M5 trade flow conserves quantities and sides',async()=>{
  const flow=await orderFlow(600100,async()=>Response.json([{T:300001,a:1,q:'7',p:'3000.14',m:false},{T:300002,a:2,q:'2',p:'3000.15',m:true}]));
  assert.equal(flow.delta,5);assert.equal(flow.big_trades.length,1);
  assert.deepEqual(flow.footprint_volume_profile,[{price:3000.1,buy:7,sell:2}]);
});
