/* Historical OI Zones v1.0 — data is historical, never backfilled from live OI. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const state={on:false,top:10,days:[],status:'ยังไม่โหลดข้อมูล',loading:false};
window.OIHistoryZones=state;
const panel=document.createElement('div');panel.id='oiHistPanel';panel.hidden=true;
panel.innerHTML='<div class="oih-head"><strong>Historical OI Zones</strong><button id="oihClose" type="button">✕</button></div><label><input type="checkbox" id="oihOn"> แสดงโซน OI ย้อนหลัง</label><label>จำนวนอันดับ <input id="oihTop" type="number" min="1" max="50" value="10"></label><button id="oihLoad" type="button">โหลดข้อมูลย้อนหลัง</button><button id="oihWide" type="button">ดูหลายวันบนกราฟ H1</button><div id="oihStatus" role="status"></div><small>จัดอันดับตาม max(P,C) ต่อ Strike · แยกวัน · ไม่เติมข้อมูลที่หาย · เวลาไทย</small>';
function init(){
 const wrap=$('wrap');if(!wrap)return;
 wrap.appendChild(panel);
 window.OIHistoryZonesOpen=()=>{panel.hidden=false;if(!state.days.length)load();};
 $('oihClose').onclick=()=>panel.hidden=true;
 $('oihOn').onchange=e=>{state.on=e.target.checked;if(state.on&&!state.days.length)load();save();window.OIHistoryZonesRedraw?.();};
 $('oihTop').onchange=e=>{state.top=Math.min(50,Math.max(1,Math.floor(+e.target.value||10)));e.target.value=state.top;save();window.OIHistoryZonesRedraw?.();};
 $('oihLoad').onclick=load;
 $('oihWide').onclick=()=>window.OIHistoryZonesWide?.();
 try{const v=JSON.parse(localStorage.getItem('oih-settings')||'{}');state.on=!!v.on;state.top=Math.min(50,Math.max(1,+v.top||10));}catch(e){}
 $('oihOn').checked=state.on;$('oihTop').value=state.top;
 $('oihStatus').textContent=state.status;
}
function save(){try{localStorage.setItem('oih-settings',JSON.stringify({on:state.on,top:state.top}));}catch(e){}}
function rank(rows,n){
 const m=new Map();
 for(const r of rows||[]){const k=Number(r.strike),p=Number(r.p),c=Number(r.c);if(!Number.isFinite(k))continue;
 const a=m.get(k)||{strike:k,p:null,c:null};
 if(Number.isFinite(p)&&r.p!==null&&r.p!=='')a.p=p;
 if(Number.isFinite(c)&&r.c!==null&&r.c!=='')a.c=c;
 m.set(k,a);}
 return [...m.values()].filter(r=>(r.p??0)>0||(r.c??0)>0).sort((a,b)=>Math.max(b.p??0,b.c??0)-Math.max(a.p??0,a.c??0)||a.strike-b.strike).slice(0,n);
}
window.OIHistoryRank=rank;
function status(s){state.status=s;if($('oihStatus'))$('oihStatus').textContent=s;}
async function load(){
 if(state.loading)return;state.loading=true;status('กำลังโหลดข้อมูลจริง…');
 try{
  const api=window.OIHistoryZonesAPI;if(!api)throw Error('ยังไม่ได้เปิด API อ่านข้อมูลย้อนหลังจาก Apps Script');
  const data=await api();if(!data||!Array.isArray(data.days))throw Error('รูปแบบข้อมูลไม่ถูกต้อง');
  state.days=data.days.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&Array.isArray(d.rows)).sort((a,b)=>a.date.localeCompare(b.date));
  status('พบข้อมูล '+state.days.length+' วัน'+(data.warning?' · '+data.warning:''));window.OIHistoryZonesRedraw?.();
 }catch(e){status('โหลดไม่สำเร็จ: '+e.message);}finally{state.loading=false;}
}
window.OIHistoryZonesLoad=load;
window.OIHistoryZonesDraw=function(ctx,w,h,chart,series,rawBars,tzShift,oscFrac){
 if(!state.on||!state.days.length||!rawBars.length)return;
 const ts=chart.timeScale(),pw=ts.width(),ph=h-ts.height(),ymax=ph*(1-(oscFrac||0));
 const fmt=v=>v===null||v===undefined?'—':Number(v).toLocaleString('en-US');
 const bars=rawBars.map((b,i)=>({i,date:new Date(b[0]+7*3600000).toISOString().slice(0,10)}));
 for(const d of state.days){
  const matches=bars.filter(b=>b.date===d.date);if(!matches.length)continue;
  const x0=ts.logicalToCoordinate(matches[0].i),x1=ts.logicalToCoordinate(matches[matches.length-1].i);
  if(x0===null||x1===null||x1<0||x0>pw)continue;
  const width=Math.max(3,x1-x0+Math.max(2,Math.abs(ts.logicalToCoordinate(matches[0].i+1)-x0)||4));
  ctx.save();ctx.setLineDash([4,5]);ctx.strokeStyle='rgba(255,255,255,.25)';ctx.beginPath();ctx.moveTo(x0,0);ctx.lineTo(x0,ymax);ctx.stroke();ctx.setLineDash([]);ctx.font='11px sans-serif';ctx.fillStyle='#ddd';ctx.fillText(d.date.slice(8)+'/'+d.date.slice(5,7),Math.max(3,x0+5),ymax-8);ctx.restore();
  for(const r of rank(d.rows,state.top)){
   const y=series.priceToCoordinate(r.strike);if(y===null||y<10||y>ymax-6)continue;
   const call=(r.c??0)>=(r.p??0),color=call?'#e7b64a':'#49a5df';
   ctx.fillStyle=call?'rgba(231,182,74,.18)':'rgba(73,165,223,.18)';ctx.fillRect(Math.max(0,x0+2),y-8,Math.max(0,Math.min(pw,x0+width-2)-Math.max(0,x0+2)),16);
   ctx.strokeStyle=color;ctx.globalAlpha=.7;ctx.beginPath();ctx.moveTo(Math.max(0,x0),y);ctx.lineTo(Math.min(pw,x0+width),y);ctx.stroke();ctx.globalAlpha=1;
   const label=r.strike+' · P '+fmt(r.p)+' · C '+fmt(r.c);
   ctx.font='bold 11px sans-serif';const tx=Math.max(3,Math.min(pw-ctx.measureText(label).width-3,x0+3));
   ctx.save();ctx.beginPath();ctx.rect(Math.max(0,x0),0,Math.max(0,Math.min(pw,x0+width)-Math.max(0,x0)),ymax);ctx.clip();ctx.fillStyle='#f1f3f7';ctx.fillText(label,tx,y-12);ctx.restore();
  }
 }
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();