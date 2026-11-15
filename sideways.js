// CHOP + Wilder ADX on closed M5 candles. Display only; no order routing.
(function (root) {
  'use strict';
  function classify(chop, adx) {
    if (!Number.isFinite(chop) || !Number.isFinite(adx)) return 'unknown';
    return chop > 61.8 && adx < 20 ? 'range' : chop < 38.2 && adx > 25 ? 'trend' : 'mixed';
  }
  // Each point uses only candles closed by that time; never backdate a zone to the lookback.
  function history(input, now, n = 14) {
    const B = input.filter(b => Number.isFinite(b.time) && b.time + 300 <= now);
    if (!Number.isInteger(n) || n < 2 || B.some((b,i) => ![b.high,b.low,b.close].every(Number.isFinite) || b.high < b.low || (i && b.time <= B[i-1].time))) return [];
    const out=[],tr=[];
    let st=0,sp=0,sm=0,adx=null,dxSum=0,dxCount=0;
    for(let i=1;i<B.length;i++){
      const b=B[i],p=B[i-1],up=b.high-p.high,down=p.low-b.low;
      const t=Math.max(b.high-b.low,Math.abs(b.high-p.close),Math.abs(b.low-p.close));
      const plus=up>down&&up>0?up:0,minus=down>up&&down>0?down:0;
      tr.push(t);
      if(i<=n){st+=t;sp+=plus;sm+=minus;}
      else{st=st-st/n+t;sp=sp-sp/n+plus;sm=sm-sm/n+minus;}
      if(i<n)continue;
      const dx=sp+sm>0?100*Math.abs(sp-sm)/(sp+sm):0;
      if(adx===null){dxSum+=dx;if(++dxCount===n)adx=dxSum/n;}
      else adx=(adx*(n-1)+dx)/n;
      if(adx===null)continue;
      const recent=B.slice(i-n+1,i+1),range=Math.max(...recent.map(x=>x.high))-Math.min(...recent.map(x=>x.low));
      const total=tr.slice(-n).reduce((a,x)=>a+x,0);
      const chop=range>0&&total>0?Math.max(0,Math.min(100,100*Math.log10(total/range)/Math.log10(n))):null;
      out.push({chop,adx,state:classify(chop,adx),time:b.time,high:b.high,low:b.low});
    }
    return out;
  }
  function calculate(input,now,n=14){
    const p=history(input,now,n).at(-1);
    return p?{chop:p.chop,adx:p.adx,state:p.state,time:p.time}:null;
  }
  function zonesFrom(points){
    const zones=[];let current=null;
    for(const p of points){
      if(p.state!=='range'){current=null;continue;}
      if(!current||p.time!==current.end+300){
        current={start:p.time,end:p.time,high:p.high,low:p.low,count:1};zones.push(current);
      }else{current.end=p.time;current.high=Math.max(current.high,p.high);current.low=Math.min(current.low,p.low);current.count++;}
    }
    return zones;
  }
  const core={calculate,classify,history,zonesFrom};
  if(typeof module==='object' && module.exports)module.exports=core;
  root.OISidewaysCore=core;
  const O=root.OI;
  if(!O || !O.fetchTF)return;
  const $=id=>document.getElementById(id),KEY='oi_sideways'+(O.sfx||'')+(O.psfx||'');
  let on=true,R=null,error=false,busy=false,zones=[];
  let requestUpdate=()=>{};
  const invalidate=()=>{O.markDirty();requestUpdate();};
  try {const v=JSON.parse(localStorage.getItem(KEY));if(typeof v==='boolean')on=v;}catch(e){}
  const names={range:'ไซด์เวย์',trend:'มีเทรนด์',mixed:'ยังไม่ชัด',unknown:'ข้อมูลไม่พอ'};
  const colors={range:'#ffd60a',trend:'#26d7ad',mixed:'#aab7ca',unknown:'#aab7ca'};
  const now=()=>Date.now()/1000+(O.tzShift??25200);
  const stale=()=>R && now()-(R.time+300)>900;
  const number=v=>Number.isFinite(v)?v.toFixed(1):'–';
  const stamp=()=>R?new Date((R.time+300)*1000).toISOString().slice(0,16).replace('T',' '):'–';
  async function run(){
    if(!on||busy||O.paused)return;
    busy=true;
    try {
      const b=await O.fetchTF('5m',1000);
      if(!Array.isArray(b)||!b.length)throw Error('no data');
      const points=history(b,now());
      R=points.at(-1)||null;zones=zonesFrom(points);error=false;
    }catch(e){error=true;}finally{busy=false;invalidate();}
  }
  (root.OIBadgeExtra=root.OIBadgeExtra||[]).push(()=>{
    if(!on)return null;
    const state=R?.state||'unknown',old=error||stale();
    return [`M5 ${old?'ข้อมูลเก่า · ':''}${error&&!R?'โหลดไม่สำเร็จ':names[state]} · CHOP ${number(R?.chop)} / ADX ${number(R?.adx)}`,old?'#aab7ca':colors[state],'sideways','rgba(100,140,170,.10)','first'];
  });
  function explain(){
    O.showToast?.(`<b>ตัวกรองไซด์เวย์ · M5 · คาบ 14</b><br>CHOP ${number(R?.chop)} · ADX ${number(R?.adx)}<br>สถานะ: ${names[R?.state||'unknown']}${error?' · โหลดข้อมูลไม่สำเร็จ':stale()?' · ข้อมูลเก่า/ตลาดปิด':''}<br>แท่งปิดล่าสุด: ${stamp()} (เวลาไทย)<br>ไซด์เวย์: CHOP &gt; 61.8 และ ADX &lt; 20<br>มีเทรนด์: CHOP &lt; 38.2 และ ADX &gt; 25<br>นอกนั้น: ยังไม่ชัด · ไม่มีช่วงราคา: ข้อมูลไม่พอ<br>กรอบเหลืองครอบไส้สูงสุด–ต่ำสุดของกลุ่มแท่ง M5 ที่เป็นไซด์เวย์ต่อเนื่อง · เริ่มที่แท่งแรกที่เข้าเงื่อนไข (ทราบเมื่อแท่งปิด) ไม่ย้อนครอบช่วงคำนวณ 14 แท่ง<br>แสดงย้อนหลังบน M1/M5 สูงสุด 1,000 แท่ง M5 · หยุดกรอบเมื่อไม่เข้าเงื่อนไข · แสดงสภาวะตลาด ไม่ใช่สัญญาณซื้อขาย`,16000);
  }
  function mount(){
    const m=$('indMenu');if(!m||m.hidden||$('sidewaysBox'))return;
    const d=document.createElement('div');d.id='sidewaysBox';d.className='gsbox';
    d.innerHTML=`<div class="row"><button data-sideways="toggle" class="gsb${on?' on':''}">ตัวกรองไซด์เวย์ M5 · CHOP + ADX</button><button data-sideways="info" class="gsb">เกณฑ์</button></div><div class="gsinfo">CHOP(14) + ADX(14) · กรอบเหลืองย้อนหลังบน M1/M5 · สูงสุด 1,000 แท่ง M5</div>`;
    m.querySelector('.t')?.after(d);
  }
  const menu=$('indMenu');
  if(menu){
    new MutationObserver(mount).observe(menu,{childList:true});
    menu.addEventListener('click',e=>{
      const b=e.target.closest('[data-sideways]');if(!b)return;
      if(b.dataset.sideways==='info'){explain();return;}
      on=!on;try{localStorage.setItem(KEY,JSON.stringify(on));}catch(e){}
      $('sidewaysBox')?.remove();mount();invalidate();if(on)run();
    });
    mount();
  }
  // Native bottom layer keeps the highlights behind candles and follows pan/zoom.
  function drawZones(ctx,w,h){
    if(!on||!zones.length||!['1m','5m'].includes(O.tf))return;
    const ts=O.chart.timeScale(),B=O.series.data(),plotW=ts.width();
    if(!B.length)return;
    const step=ts.options().barSpacing||6;
    const lower=t=>{let a=0,b=B.length;while(a<b){const m=(a+b)>>>1;if(B[m].time<t)a=m+1;else b=m;}return a;};
    ctx.save();ctx.beginPath();ctx.rect(0,0,plotW,h);ctx.clip();
    ctx.fillStyle='rgba(255,214,10,.10)';ctx.strokeStyle='rgba(255,214,10,.65)';ctx.lineWidth=1;ctx.setLineDash([]);
    for(const z of zones){
      const a=lower(z.start),b=lower(z.end+300)-1;
      if(a>=B.length||b<a||b<0)continue;
      const x0=ts.logicalToCoordinate(a),x1=ts.logicalToCoordinate(b);
      const y0=O.series.priceToCoordinate(z.high),y1=O.series.priceToCoordinate(z.low);
      if([x0,x1,y0,y1].some(v=>v===null||!Number.isFinite(v)))continue;
      const left=Math.max(0,x0-step/2),right=Math.min(plotW,x1+step/2);
      if(right<=left||y1<0||y0>h)continue;
      const height=Math.max(1,y1-y0);
      ctx.fillRect(left,y0,right-left,height);ctx.strokeRect(left,y0,right-left,height);
    }
    ctx.restore();
  }
  if(O.series?.attachPrimitive){
    const renderer={draw:target=>target.useMediaCoordinateSpace(s=>drawZones(s.context,s.mediaSize.width,s.mediaSize.height))};
    O.series.attachPrimitive({
      attached({requestUpdate:update}){requestUpdate=update;update();},
      detached(){requestUpdate=()=>{};},
      paneViews:()=>[{zOrder:()=> 'bottom',renderer:()=>renderer}]
    });
  }else if(O.bgHooks){
    O.bgHooks.push((ctx,w,h)=>drawZones(ctx,w,h-O.chart.timeScale().height()));
  }
  let down=null;
  document.addEventListener('pointerdown',e=>{down=e.target.closest?.('#badges [data-k="sideways"]')?{x:e.clientX,y:e.clientY}:null;},true);
  document.addEventListener('pointerup',e=>{
    const d=down;down=null;
    if(d&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<10&&e.target.closest?.('#badges [data-k="sideways"]'))setTimeout(explain,120);
  },true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)run();});
  setInterval(run,20000);setTimeout(run,1500);
  root.OI_sideways={run,get zones(){return zones;},get result(){return R;},get enabled(){return on;}};
})(typeof window==='undefined'?globalThis:window);
