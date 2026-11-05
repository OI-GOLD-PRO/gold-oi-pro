const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const code = fs.readFileSync(__dirname + '/../bigtrade.js', 'utf8');
async function run(fallback) {
  const now = Date.now(), calls = [], raw = [], sockets = [], rows = [1,2,3].map((_,i)=>({time:Math.floor(now/1000/60)*60+25200-(2-i)*60,close:4000}));
  const O = { sym:'gold',tf:'1m',hooks:[],series:{data:()=>rows},markDirty(){},chart:{},showToast(){throw Error('Whale alert while disabled');} };
  const window = { OI:O, OI_volumeProfile:{cfg:{on:true,win:8},needFull:()=>true}, OIVolumeSink:(...a)=>raw.push(a) };
  const context = vm.createContext({window, OI_volumeProfile:window.OI_volumeProfile, document:{getElementById:()=>null,addEventListener(){},visibilityState:'visible'},localStorage:{getItem(){return null;},setItem(){}},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},AbortController,console,
    WebSocket:class{constructor(url){this.url=url;sockets.push(this);}close(){}send(){}},
    fetch:async u=>{calls.push(u);let data;
      if(u.includes('/klines?')) data=rows.map(r=>[(r.time-25200)*1000,4000,4000,4000,4000,10,0,0,0,5]);
      else if(u.includes('/candles?')) data={data:rows.map(r=>[(r.time-25200)*1000,4000,4000,4000,4000])};
      else if(u.includes('/fills-history?')) data={data:[{tradeId:'12345678901234567890',ts:String(now-9*3600000),price:'4000',size:'0.01',side:'buy'}]};
      else if(fallback) throw Error('Binance unreachable');
      else if(u.includes('startTime=')) data=[{a:100}];
      else data=[{a:100,T:now,p:'4000',q:'0.01',m:false},{a:101,T:now,p:'4000',q:'100',m:true}];
      return{ok:true,json:async()=>data};
    }});
  vm.runInContext(code,context);const bt=window.OI_bigtr;
  assert.equal(bt.cfg.on,false);await bt.reload();assert(calls.length>0);assert(sockets.length===1);
  assert.equal(raw[0][0],fallback?'bitget':'binance');
  if(!fallback){assert(raw.some(a=>a[4]===0.01));assert(raw.some(a=>a[4]===100));}
  else {assert.equal(raw[0][1],'12345678901234567890');sockets[0].onmessage({data:JSON.stringify({data:[{tradeId:'12345678901234567891',ts:now,price:'4000',size:'0.02',side:'sell'}]})});assert(raw.some(a=>a[1]==='12345678901234567891'&&a[5]===-1));}
}
(async()=>{await run(false);await run(true);console.log('PASS: whale visuals off / VP on still ingests all sizes; raw Binance and Bitget history/live paths; large Bitget IDs preserved; whale alerts suppressed.');})().catch(e=>{console.error(e);process.exit(1);});
