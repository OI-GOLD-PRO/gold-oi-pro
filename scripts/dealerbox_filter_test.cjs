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
function runtime(tf='5m', chartBars=()=>fetched){
 const menu={hidden:false,addEventListener:(k,f)=>handlers[k]=f,querySelector:()=>null,prepend:d=>nodes.set(d.id,d)};
 const O={sym:'gold',hooks:[],lastClose:100,oi:{rows:[{strike:100,price:100}]},tf,markDirty(){},fetchTF:async()=>fetched,
 chartEl:{addEventListener(){},getBoundingClientRect:()=>({left:0,top:0})},
 chart:{timeScale:()=>({width:()=>320,height:()=>20,options:()=>({barSpacing:6}),timeToCoordinate:t=>(t-start)/300*6})},
 series:{data:chartBars,priceToCoordinate:p=>(120-p)*5,attachPrimitive:p=>{primitive=p;p.attached({requestUpdate:()=>updates++});}}};
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
 let strokes=[],fills=[];const ctx=new Proxy({setLineDash:a=>{ctx.dash=Array.from(a);},strokeRect:(...a)=>strokes.push({width:ctx.lineWidth,alpha:ctx.globalAlpha,dash:Array.from(ctx.dash||[]),a}),fillRect:(...a)=>fills.push({color:ctx.fillStyle,a})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
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
 assert.deepEqual(strokes[0].dash,[4,3]);
 // Price changes side without closing beyond the locked frame edge: old frame ends, not breaks.
 fetched=candles([10,20,30]);
 fetched[34]={...fetched[34],close:100.3,high:100.4};
 fetched[35]={...fetched[35],open:100.3,close:100.3,low:99,high:100.4};
 await d.run(true);assert.equal(d.boxes.length,1);assert.equal(d.boxes[0].live,undefined);assert.equal(d.boxes[0].broke,undefined);
 d.boxes[0].est=false;strokes=[];fills=[];draw();assert.deepEqual(strokes[0].dash,[4,3],'ended frame must use dashes even without a breakout');
 assert.equal(strokes[0].alpha,0.45);assert.equal(strokes[0].width,0.75);assert.equal(fills.length,0,'ended frame must not retain white fill');
 assert(strokes[0].a[0]+strokes[0].a[2]<200,'ended frame must stop at its own endpoint');
 fetched=candles([10,20,30],1);fetched[40]={...fetched[40],close:97,low:96};
 await d.run(true);assert.equal(d.boxes[0].broke,40);strokes=[];fills=[];draw();assert.deepEqual(strokes[0].dash,[4,3]);assert.equal(fills.length,0);
 fetched=candles([10,20,30]);await d.run(true);
 d.boxes[0].est=false;strokes=[];fills=[];draw();assert.deepEqual(strokes[0].dash,[],'confirmed active frame keeps solid thin line');assert.equal(strokes[0].width,1);assert.equal(fills.length,1);
 d.boxes[0].est=true;strokes=[];draw();assert.deepEqual(strokes[0].dash,[6,2],'estimated active history keeps distinct long dashes');
 // Lock at third rejection. Later wicks must not enlarge an already-confirmed frame.
 fetched=candles([10,20,30,34]);fetched[34].high=101.5;
 b=d.scan(fetched,L);assert.equal(b[0].top,100.6);assert.equal(b[0].confirmed,30);assert.equal(b[0].ext,100);
 const initialTop=b[0].top, initialBot=b[0].bot;
 fetched[40]={...fetched[40],close:100.8,high:101};
 b=d.scan(fetched,L);assert.equal(b[0].broke,40,'close above old top breaks even below strike + $2');
 assert.equal(b[0].top,initialTop);assert.equal(b[0].bot,initialBot);
 fetched.push(...Array.from({length:5},(_,i)=>({...fetched[49],time:fetched[49].time+(i+1)*300,high:110,close:100})));
 b=d.scan(fetched,L);assert.equal(b[0].top,initialTop);assert.equal(b[0].end,40);
 fetched=candles([10,20,30,34],1);fetched[34].low=98.5;
 b=d.scan(fetched,L);assert.equal(b[0].bot,99.4);assert.equal(b[0].ext,100);
 fetched[40]={...fetched[40],close:99.2,low:99};
 b=d.scan(fetched,L);assert.equal(b[0].broke,40,'close below original bottom breaks even above strike - $2');assert.equal(b[0].bot,99.4);
 console.log('PASS: frozen confirmation bounds, later wick does not widen, original-edge breakout both directions, no extension after break.');
 assert(updates>0);
 values.set('oi_dbox', JSON.stringify({on:false,line:true,minTests:3}));
 d=runtime();fetched=candles([10,20,30]);await d.run(true);
 strokes=[];fills=[];draw();
 assert.equal(strokes.length,3,'each rejected M5 candle has its own frame');
 assert.equal(fills.length,3);
 assert(fills.every(f=>f.color==='rgba(255,255,255,.15)'));
 assert.deepEqual(strokes.map(b=>Math.round(b.a[0]+b.a[2]/2)),[60,120,180]);
 assert(strokes.every(b=>b.a[2]<6),'frames fit within individual candles');
 assert(strokes.every(b=>b.a[1]===100 && b.a[3]===5),'resistance markers run toward candles below the line by $1');
 fetched[40]={...fetched[40],close:103,high:104};await d.run(true);
 strokes=[];fills=[];draw();assert.equal(strokes.length,3);assert.equal(fills.length,0);
 assert(strokes.every(b=>b.dash.join(',')==='4,3'));
 fetched=candles([10,20,30,34],1);
 fetched[40]={...fetched[40],close:97,low:96};
 await d.run(true);strokes=[];fills=[];draw();
 assert.equal(d.boxes[0].tests.length,4);
 assert.deepEqual(strokes.map(b=>Math.round(b.a[0]+b.a[2]/2)),[60,120,180,204]);
 assert(strokes.every(b=>b.a[1]===95 && b.a[3]===5),'support markers run toward candles above the line by $1');
 fetched=candles([10,20]);await d.run(true);
 strokes=[];fills=[];draw();assert.equal(strokes.length,0);assert.equal(fills.length,0);
 for (const side of [-1,1]) {
   fetched=candles([10,20,30],side);
   const m1=fetched.flatMap((bar,i)=>Array.from({length:5},(_,j)=>({
     ...bar,time:bar.time+j*60,
     high:side<0 && j!==3 ? Math.min(bar.high,92) : bar.high,
     low:side>0 && j!==3 ? Math.max(bar.low,108) : bar.low
   }))).filter(bar=>bar.time<start+30*300 || bar.time>=start+31*300);
   d=runtime('1m',()=>m1);await d.run(true);
   strokes=[];fills=[];draw();
   assert.equal(d.boxes[0].tests.length,3);
   assert.deepEqual(strokes.map(b=>Math.round((b.a[0]+b.a[2]/2)*10)/10),[63.6,123.6],
     'M1 markers select the extreme inside each counted M5 window and skip missing windows');
 }
 console.log('PASS: M1 support and resistance rejection alignment.');
 console.log('PASS: ended and broken frames dashed with no fill, active/estimated styles preserved, default/custom rejection threshold, support/resistance, gap spacing, closed candles, immediate rescan, persistence, thin outlines, bottom layer, 10% live-only fill and latest +3 endpoint.');
})().catch(e=>{console.error(e);process.exit(1);});
