const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(__dirname+'/../bigtrade.js','utf8');
const now=Date.now(); let bars=[], finishHistory, finishReference, referenceCalls=0;
const timers=[], sockets=[];
const later=()=>new Promise(r=>setImmediate(r));
const O={sym:'gold',tf:'1m',hooks:[],series:{data:()=>bars},markDirty(){},showToast(){}};
const window={OI:O,OI_volumeProfile:{cfg:{on:true,win:8},needFull:()=>true},OIVolumeSink(){}};
const context=vm.createContext({window,OI_volumeProfile:window.OI_volumeProfile,document:{visibilityState:'visible',getElementById:()=>null,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},setInterval:(f,ms)=>timers.push({f,ms}),clearInterval(){},setTimeout(){},clearTimeout(){},AbortController,console,
WebSocket:class{constructor(u){sockets.push(u);}close(){}send(){}},fetch:async u=>{
 if(u.includes('/aggTrades?'))throw Error('primary feed unavailable');
 if(u.includes('/fills-history?'))return new Promise(r=>{finishHistory=()=>r({ok:true,json:async()=>({data:[{tradeId:'9000',ts:String(now-9*3600000),price:'4000',size:'1',side:'buy'}]})});});
 if(u.includes('/candles?')){referenceCalls++;return new Promise(r=>{finishReference=()=>r({ok:true,json:async()=>({data:bars.map(b=>[(b.time-25200)*1000,4000,4000,4000,4000])})});});}
 throw Error('unexpected endpoint');
}});
(async()=>{
 vm.runInContext(code,context);const bt=window.OI_bigtr, loading=bt.reload();await later();
 assert.equal(bt.busy,true);assert.equal(bt.pxOff.size,0);assert.equal(bt.src,'bitget');
 bars=Array.from({length:5},(_,i)=>({time:Math.floor(now/60000)*60+25200-(4-i)*60,close:3990}));
 const retry=timers.find(x=>x.ms===1500);retry.f();retry.f();await later();
 assert.equal(referenceCalls,1,'retry must load fallback reference while history remains busy, without duplicate requests');
 finishReference();await later();assert.equal(bt.pxOff.size,5);assert.equal(bt.offAt(bars.at(-1).time),10);
 finishHistory();await loading;assert.equal(bt.busy,false);assert(sockets[0].includes('bitget'));
 console.log('PASS: mobile cold start with no bars + fallback exchange + slow backfill recovers price reference; concurrent retries deduplicate.');
})().catch(e=>{console.error(e);process.exit(1);});
