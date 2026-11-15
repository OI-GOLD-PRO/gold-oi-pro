// CHOP + Wilder ADX on closed M5 candles. Display only; no order routing.
(function (root) {
  'use strict';
  function classify(chop, adx) {
    if (!Number.isFinite(chop) || !Number.isFinite(adx)) return 'unknown';
    return chop > 61.8 && adx < 20 ? 'range' : chop < 38.2 && adx > 25 ? 'trend' : 'mixed';
  }
  function calculate(input, now, n = 14) {
    const B = input.filter(b => Number.isFinite(b.time) && b.time + 300 <= now);
    if (B.length < 2 * n || B.some((b,i) => ![b.high,b.low,b.close].every(Number.isFinite) || b.high < b.low || (i && b.time <= B[i-1].time))) return null;
    const tr = [], plus = [], minus = [];
    for (let i=1;i<B.length;i++) {
      const b=B[i],p=B[i-1],up=b.high-p.high,down=p.low-b.low;
      tr.push(Math.max(b.high-b.low,Math.abs(b.high-p.close),Math.abs(b.low-p.close)));
      plus.push(up>down && up>0 ? up : 0); minus.push(down>up && down>0 ? down : 0);
    }
    let st=0,sp=0,sm=0,adx=null,dxSum=0,dxCount=0;
    for(let i=0;i<tr.length;i++) {
      if(i<n){st+=tr[i];sp+=plus[i];sm+=minus[i];}
      else {st=st-st/n+tr[i];sp=sp-sp/n+plus[i];sm=sm-sm/n+minus[i];}
      if(i<n-1)continue;
      const dx=sp+sm>0?100*Math.abs(sp-sm)/(sp+sm):0;
      if(adx===null){dxSum+=dx;if(++dxCount===n)adx=dxSum/n;}
      else adx=(adx*(n-1)+dx)/n;
    }
    const recent=B.slice(-n),range=Math.max(...recent.map(b=>b.high))-Math.min(...recent.map(b=>b.low));
    const total=tr.slice(-n).reduce((a,b)=>a+b,0);
    const chop=range>0 && total>0?Math.max(0,Math.min(100,100*Math.log10(total/range)/Math.log10(n))):null;
    return {chop,adx,state:classify(chop,adx),time:B[B.length-1].time};
  }
  const core={calculate,classify};
  if(typeof module==='object' && module.exports)module.exports=core;
  root.OISidewaysCore=core;
  const O=root.OI;
  if(!O || !O.fetchTF)return;
  const $=id=>document.getElementById(id),KEY='oi_sideways'+(O.sfx||'')+(O.psfx||'');
  let on=true,R=null,error=false,busy=false;
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
      const b=await O.fetchTF('5m',300);
      if(!Array.isArray(b)||!b.length)throw Error('no data');
      R=calculate(b,now());error=false;
    }catch(e){error=true;}finally{busy=false;O.markDirty();}
  }
  (root.OIBadgeExtra=root.OIBadgeExtra||[]).push(()=>{
    if(!on)return null;
    const state=R?.state||'unknown',old=error||stale();
    return [`M5 ${old?'ข้อมูลเก่า · ':''}${error&&!R?'โหลดไม่สำเร็จ':names[state]} · CHOP ${number(R?.chop)} / ADX ${number(R?.adx)}`,old?'#aab7ca':colors[state],'sideways','rgba(100,140,170,.10)','first'];
  });
  function explain(){
    O.showToast?.(`<b>ตัวกรองไซด์เวย์ · M5 · คาบ 14</b><br>CHOP ${number(R?.chop)} · ADX ${number(R?.adx)}<br>สถานะ: ${names[R?.state||'unknown']}${error?' · โหลดข้อมูลไม่สำเร็จ':stale()?' · ข้อมูลเก่า/ตลาดปิด':''}<br>แท่งปิดล่าสุด: ${stamp()} (เวลาไทย)<br>ไซด์เวย์: CHOP &gt; 61.8 และ ADX &lt; 20<br>มีเทรนด์: CHOP &lt; 38.2 และ ADX &gt; 25<br>นอกนั้น: ยังไม่ชัด · ไม่มีช่วงราคา: ข้อมูลไม่พอ<br>ใช้แท่ง M5 ที่ปิดแล้ว แม้เปิดกราฟ M1 · แสดงสภาวะตลาด ไม่ใช่สัญญาณซื้อขาย`,16000);
  }
  function mount(){
    const m=$('indMenu');if(!m||m.hidden||$('sidewaysBox'))return;
    const d=document.createElement('div');d.id='sidewaysBox';d.className='gsbox';
    d.innerHTML=`<div class="row"><button data-sideways="toggle" class="gsb${on?' on':''}">ตัวกรองไซด์เวย์ M5 · CHOP + ADX</button><button data-sideways="info" class="gsb">เกณฑ์</button></div><div class="gsinfo">CHOP(14) + ADX(14) · ใช้แท่งปิด M5 · ป้ายบนกราฟ</div>`;
    m.querySelector('.t')?.after(d);
  }
  const menu=$('indMenu');
  if(menu){
    new MutationObserver(mount).observe(menu,{childList:true});
    menu.addEventListener('click',e=>{
      const b=e.target.closest('[data-sideways]');if(!b)return;
      if(b.dataset.sideways==='info'){explain();return;}
      on=!on;try{localStorage.setItem(KEY,JSON.stringify(on));}catch(e){}
      $('sidewaysBox')?.remove();mount();O.markDirty();if(on)run();
    });
    mount();
  }
  let down=null;
  document.addEventListener('pointerdown',e=>{down=e.target.closest?.('#badges [data-k="sideways"]')?{x:e.clientX,y:e.clientY}:null;},true);
  document.addEventListener('pointerup',e=>{
    const d=down;down=null;
    if(d&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<10&&e.target.closest?.('#badges [data-k="sideways"]'))setTimeout(explain,120);
  },true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)run();});
  setInterval(run,20000);setTimeout(run,1500);
  root.OI_sideways={run,get result(){return R;},get enabled(){return on;}};
})(typeof window==='undefined'?globalThis:window);
