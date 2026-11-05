const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(__dirname+'/../dealerbox.js','utf8');
let clock=Date.UTC(2026,10,5,12), values=new Map(), handlers={}, nodes=new Map(), primitive, updates=0;
const current=Math.floor((clock/1000+25200)/300)*300;
const start=current-50*300;
function candles(touches,side=-1,forming=false){return Array.from({length:50},(_,i)=>{
 const p=side<0?90:110,b={time:(forming?start+300:start)+i*300,open:p,close:p,high:p+1,low:p-1,volume:1};
 if(touches.includes(i)){if(side<0)b.high=100;else b.low=100;}return b;
});}
let fetched=candles([10,20,30]);
function runtime(){
 const menu={hidden:false,addEventListener:(k,f)=>handlers[k]=f,querySelector:()=>null,prepend:d=>nodes.set(d.id,d)};
 const O={sym:'gold',hooks:[],lastClose:100,oi:{rows:[{strike:100,price:100}]},tf:'5m',markDirty(){},fetchTF:async()=>fetched,
 chartEl:{addEventListener(){},getBoundingClientRect:()=>({left:0,top:0})},
 chart:{timeScale:()=>({width:()=>320,height:()=>20,options:()=>({barSpacing:6}),timeToCoordinate:t=>(t-start)/300*6})},
 series:{data:()=>fetched,priceToCoordinate:p=>(120-p)*5,attachPrimitive:p=>{primitive=p;p.attached({requestUpdate:()=>updates++});}}};
 const window={OI:O,OILive:{calc:{strikes:[{k:100,gex:100}]}}};
 vm.runInNewContext(code,{window,document:{getElementById:id=>id==='indMenu'?menu:nodes.get(id),addEventListener(){},createElement:()=>({remove(){nodes.delete(this.id);}})},
 localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},Date:class extends Date{static now(){return clock;}},MutationObserver:class{observe(){}},setInterval(){},setTimeout(){},console});
 return window.OI_dbox;
}
function change(value){const input={value,dataset:{}};handlers.change({target:{closest:()=>input}});return input.value;}
(async()=>{
 let d=runtime(); const L=[{k:100,p:100,gex:100}];
 assert.equal(d.cfg.minTests,3);
 assert.equal(d.scan(candles([10,20]),L).length,0);
 let b=d.scan(candles([10,20,30]),L);assert.equal(b.length,1);assert.equal(b[0].tests.length,3);
 assert.equal(d.scan(candles([10,20,30],1),L)[0].side,1);
 assert.equal(d.scan(candles([10,11,12,13]),L).length,0,'adjacent bars cannot count as three tests');
 assert.equal(d.scan(candles([10,11,12,13,16]),L).length,1);
 assert.equal(d.scan(candles([10,20,49],-1,true),L).length,0,'forming M5 candle must not confirm');
 clock+=300000;assert.equal(d.scan(candles([10,20,49],-1,true),L).length,1);clock-=300000;
 fetched=candles([10,20,30]);await d.run(true);assert.equal(d.boxes.length,1);
 assert.equal(primitive.paneViews()[0].zOrder(),'bottom');
 let strokes=[],fills=[];const ctx=new Proxy({strokeRect:(...a)=>strokes.push({width:ctx.lineWidth,a}),fillRect:(...a)=>fills.push({color:ctx.fillStyle,a})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 const draw=()=>primitive.paneViews()[0].renderer().draw({useMediaCoordinateSpace:f=>f({context:ctx,mediaSize:{width:320,height:480}})});
 draw();assert.equal(strokes[0].width,1);assert.equal(fills[0].color,'rgba(255,255,255,.1)');
 const end=strokes[0].a[0]+strokes[0].a[2];assert(Math.abs(end-312.5)<1,'live endpoint stays at latest +3 bars');
 assert.equal(change('4'),4);assert.equal(d.boxes.length,0,'filter change rescans cached bars immediately');
 assert.equal(change('2'),2);assert.equal(d.boxes.length,1);
 d=runtime();assert.equal(d.cfg.minTests,2,'custom filter persists');
 assert.equal(change(''),2);assert.equal(change('-1'),2);assert.equal(change('2.8'),3);assert.equal(change('999'),20);change('3');
 await new Promise(setImmediate);
 fetched=candles([10,20,30]);fetched[40]={...fetched[40],close:103,high:104};await d.run(true);
 assert.equal(d.boxes[0].broke,40);strokes=[];fills=[];draw();assert.equal(strokes[0].width,0.75);assert.equal(fills.length,0,'broken frames retain no fill');
 assert(updates>0);
 console.log('PASS: default/custom rejection threshold, support/resistance, gap spacing, closed candles, immediate rescan, persistence, thin outlines, bottom layer, 10% live-only fill and latest +3 endpoint.');
})().catch(e=>{console.error(e);process.exit(1);});
