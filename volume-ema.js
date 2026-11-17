// Trial: closed M1 volume spike + candle body crossing EMA50. No trade execution or alerts.
(function(root){
  'use strict';
  function scan(B,now){
    const hits=[],alpha=2/51;let ema=null;
    for(let i=0;i<B.length;i++){
      const b=B[i];
      if(![b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)||b.high<b.low)return [];
      ema=ema===null?b.close:alpha*b.close+(1-alpha)*ema;
      const previous=B.slice(Math.max(0,i-20),i);
      if(i>=49 && b.time+60<=now && previous.length===20 &&
         previous.every(x=>Number.isFinite(x.volume)&&x.volume>=0) &&
         Number.isFinite(b.volume)&&b.volume>0){
        const avg=previous.reduce((s,x)=>s+x.volume,0)/20;
        const dir=b.open<ema&&b.close>ema?1:b.open>ema&&b.close<ema?-1:0;
        if(avg>0&&b.volume>=avg*2&&dir)hits.push({...b,ema,ratio:b.volume/avg,dir});
      }
    }
    return hits;
  }
  if(typeof module==='object'&&module.exports)module.exports={scan};
  const O=root.OI;if(!O?.chartM1||!O.series)return;
  const $=id=>document.getElementById(id),KEY='oi_vol_ema_box'+(O.sfx||'')+(O.psfx||'');
  let on=true,requestUpdate=()=>{},hits=[];
  try{const v=JSON.parse(localStorage.getItem(KEY));if(typeof v==='boolean')on=v;}catch(e){}
  const invalidate=()=>{O.markDirty();requestUpdate();};
  function draw(ctx,w,h){
    hits=[];
    if(!on||O.tf!=='1m')return;
    // Use displayed candles and their own source volume; never substitute delta or another feed.
    const volumes=new Map((O.rawBars||[]).map(k=>[Math.floor(k[0]/1000)+(O.tzShift??25200),k[5]]));
    const bars=O.chartM1().map(b=>({...b,volume:volumes.get(b.time)}));
    hits=scan(bars,Date.now()/1000+(O.tzShift??25200));
    const ts=O.chart.timeScale(),width=ts.width(),step=ts.options().barSpacing||6;
    ctx.save();ctx.beginPath();ctx.rect(0,0,width,h);ctx.clip();
    ctx.strokeStyle='#ffdf35';ctx.fillStyle='rgba(255,223,53,.045)';ctx.lineWidth=1.5;ctx.setLineDash([]);
    for(const b of hits){
      const x=ts.timeToCoordinate(b.time),top=O.series.priceToCoordinate(b.high),bottom=O.series.priceToCoordinate(b.low);
      if([x,top,bottom].some(v=>v===null||!Number.isFinite(v)))continue;
      const left=x-step*.55,y=Math.min(top,bottom)-2,height=Math.abs(bottom-top)+4;
      if(left>width||left+step*1.1<0)continue;
      ctx.fillRect(left,y,step*1.1,height);ctx.strokeRect(left,y,step*1.1,height);
    }
    ctx.restore();
  }
  if(O.series.attachPrimitive){
    const renderer={draw:target=>target.useMediaCoordinateSpace(s=>draw(s.context,s.mediaSize.width,s.mediaSize.height))};
    O.series.attachPrimitive({attached(p){requestUpdate=p.requestUpdate;requestUpdate();},detached(){requestUpdate=()=>{};},paneViews:()=>[{zOrder:()=> 'top',renderer:()=>renderer}]});
  }else O.hooks?.push((ctx,w,h)=>draw(ctx,w,h-O.chart.timeScale().height()));
  function mount(){
    const m=$('indMenu');if(!m||m.hidden||$('volEmaBox'))return;
    const el=document.createElement('div');el.id='volEmaBox';el.className='gsbox';
    el.innerHTML=`<div class="row"><button data-vebox class="gsb${on?' on':''}"><i style="background:#ffdf35"></i>Volume × EMA50 · กรอบเหลือง M1</button></div><div class="gsinfo">แท่งปิด M1 · ตัวแท่งคร่อม EMA50 · Volume ≥ 2× ค่าเฉลี่ย 20 แท่งก่อนหน้า<br>กรอบเฉพาะแท่งที่ผ่าน รวมไส้ · ดูบน M1 · ใช้วอลลุ่มแหล่งเดียวกับกราฟ · ยังไม่แจ้งเตือน</div>`;
    m.querySelector('.t')?.after(el);
  }
  const menu=$('indMenu');
  if(menu){
    new MutationObserver(mount).observe(menu,{childList:true});
    menu.addEventListener('click',e=>{
      if(!e.target.closest('[data-vebox]'))return;
      on=!on;try{localStorage.setItem(KEY,JSON.stringify(on));}catch(e){}
      $('volEmaBox')?.remove();mount();invalidate();
    });mount();
  }
  setInterval(()=>{if(on&&!document.hidden&&O.tf==='1m')invalidate();},1000);
  root.OIVolEmaBox={scan,get hits(){return hits;},get enabled(){return on;}};
})(typeof window==='undefined'?globalThis:window);
