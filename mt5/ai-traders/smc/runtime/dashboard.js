const by=id=>document.getElementById(id);
const fmt=n=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
async function read(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(r.status===401)location.replace('/');if(!r.ok)throw Error();return r.json();}
function text(tag,value,cls){const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;}
function svg(parent,tag,attrs,label){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(label!=null)e.textContent=label;parent.append(e);return e;}
function chart(c){
 const plot=by('plot'),spark=by('spark');plot.replaceChildren();spark.replaceChildren();
 const all=(c?.candles||[]).filter(r=>Array.isArray(r)&&r.length>=5&&r.slice(0,5).every(Number.isFinite));
 by('sym').textContent=c?.symbol||'—';by('price').textContent=fmt(all.at(-1)?.[4]);by('legend').textContent='กราฟ M5 · รอข้อมูลจาก EA';
 if(!all.length)return;
 const rows=all.slice(-60),smc=c.smc||{};
 const zones=(smc.zones||[]).filter(zone=>zone.at>=rows[0][0]).slice(-3);
 const zone=zones.at(-1);
 const plan=smc.plan;
 const time=t=>new Date(t*1000).toISOString().slice(11,16);
 const markers=(smc.markers||[]).filter(m=>Number.isFinite(m.level)&&m.at>=rows[0][0]);
 const planLevels=plan?[['แผน SL',plan.sl,'#ee927f'],['แผน TP',plan.tp,'#8ed7b1']]:[];
 const levels=(c.chartPositions||[]).flatMap(p=>[[p.side,p.entry],['TP',p.tp],['SL',p.sl]]).filter(([,v])=>Number.isFinite(v)&&v>0);
 const values=[...rows.flatMap(r=>[r[2],r[3]]),...markers.map(m=>m.level),...zones.flatMap(z=>[z.low,z.high]),...levels.map(l=>l[1]),...planLevels.map(l=>l[1])];
 const min=Math.min(...values),max=Math.max(...values),range=max-min||1;
 const y=v=>225-(v-min)/range*202,x=i=>7+(i+.5)*430/rows.length;
 const line=(x1,y1,x2,y2,color,dash='')=>svg(plot,'line',{x1,y1,x2,y2,stroke:color,'stroke-dasharray':dash});
 const label=(x,y,t,color)=>svg(plot,'text',{x,y,fill:color,'font-size':11},t);
 for(let i=0;i<=5;i++){const v=min+range*i/5;line(0,y(v),442,y(v),'#25373b');label(448,y(v)+4,fmt(v),'#d9e5e3');}
 for(let i=0;i<4;i++){const j=Math.round(i*(rows.length-1)/3),dt=new Date(rows[j][0]*(rows[j][0]<1e12?1000:1));line(x(j),4,x(j),235,'#233235');label(Math.max(2,x(j)-15),255,dt.toISOString().slice(11,16),'#c5d3d0');}
 for(const box of zones){
   const first=rows.findIndex(r=>r[0]>=box.at);
   const end=box.endAt?rows.findIndex(r=>r[0]>=box.endAt):-1;
   const color=box.status==='invalid'?'#9aa7a9':box.side==='BUY'?'#39da91':'#ff8d38';
   const rect=svg(plot,'rect',{x:x(first),y:y(box.high),width:Math.max(4,(end<0?442:x(end))-x(first)),
     height:Math.max(2,y(box.low)-y(box.high)),fill:color,'fill-opacity':.17,stroke:color,
     'stroke-dasharray':box.status==='invalid'?'3 3':''});
   svg(rect,'title',{},'FVG '+fmt(box.low)+'–'+fmt(box.high)+' · '+time(box.at));
   label(Math.min(x(first)+3,328),Math.max(14,y(box.high)-3),'FVG '+fmt(box.low)+'–'+fmt(box.high),color);
 }
 rows.forEach((r,i)=>{const color=r[4]>=r[1]?'#26b89f':'#f06456',w=290/rows.length;line(x(i),y(r[2]),x(i),y(r[3]),color);svg(plot,'rect',{x:x(i)-w/2,y:Math.min(y(r[1]),y(r[4])),width:w,height:Math.max(1,Math.abs(y(r[1])-y(r[4]))),fill:color});});
 for(const marker of markers){
   const at=rows.findIndex(r=>r[0]===marker.at);
   if(at<0)continue;
   const start=rows.findIndex(r=>r[0]>=marker.pivotAt);
   const color=marker.kind==='Sweep'?'#e9ae39':marker.kind==='Retest'?'#83e7be':marker.kind==='CHoCH'?'#e2a1ef':'#76bef4';
   line(x(Math.max(0,start)),y(marker.level),x(at),y(marker.level),color,'4 3');
   const dot=svg(plot,'circle',{cx:x(at),cy:y(marker.level),r:2.6,fill:color});
   svg(dot,'title',{},marker.kind+' '+fmt(marker.level)+' · '+time(marker.at));
   if(markers.findLast(m=>m.kind===marker.kind)===marker)
     label(Math.min(x(at)+3,355),Math.max(14,y(marker.level)+(marker.kind==='Retest'?13:-3)),marker.kind+' '+fmt(marker.level),color);
 }
 for(const [name,v,color] of planLevels){line(0,y(v),442,y(v),color,'2 5');label(95,Math.max(14,y(v)-2),name+' '+fmt(v),color);}
 for(const [name,v] of levels){line(0,y(v),442,y(v),'#bfcbd2','4 3');label(5,y(v)-2,name+' '+fmt(v),'#ecf0ee');}
 const close=rows.at(-1)[4];line(0,y(close),442,y(close),'#55cdb9','3 3');svg(plot,'rect',{x:443,y:y(close)-9,width:76,height:18,fill:'#167c71'});label(448,y(close)+4,fmt(close),'white');
 const bias=(tf,event)=>tf+' '+(event?event.side+' · '+event.kind+' '+fmt(event.level)+' ('+time(event.at)+')':'—');
 const legend=by('legend');
 legend.replaceChildren(text('div',bias('H1',smc.h1Event)+'  |  '+bias('M15',smc.m15Event)));
 const current=['Sweep','CHoCH','BOS','Retest'].map(kind=>markers.findLast(m=>m.kind===kind)).filter(Boolean)
   .map(m=>m.kind+' '+fmt(m.level)+' ('+time(m.at)+')'+(m.kind==='Sweep'?' · ไส้ '+fmt(m.extreme):''));
 if(zone){const state={active:'รอ Retest',confirmed:'ยืนยันแล้ว',invalid:'ยกเลิก'};
   current.push('FVG '+fmt(zone.low)+'–'+fmt(zone.high)+' · '+state[zone.status]);}
 if(current.length)legend.append(text('div',current.join('  |  ')));
 if(plan)legend.append(text('div','แผน '+plan.side+' · SL '+fmt(plan.sl)+' · TP '+fmt(plan.tp)+' · RR '+fmt(plan.rr)));
 const closes=rows.map(r=>r[4]),lo=Math.min(...closes),span=Math.max(...closes)-lo||1;
 svg(spark,'polyline',{points:closes.map((v,i)=>(i*128/Math.max(1,closes.length-1))+','+(38-(v-lo)/span*34)).join(' '),stroke:'#d89822','stroke-width':2,fill:'none'});
}
function decisionDetails(decision) {
 const exp=decision?.explanation;
 if(!exp)return [];
 const lines=[];
 const paragraph=(label,value,cls)=>{if(value)lines.push(text('p',label+' · '+value,cls));};
 paragraph('เงื่อนไขระบบ',exp.strategyReason);
 paragraph('รออะไร',exp.next || exp.ai?.waitFor || exp.tradeWait);
 if(exp.next && exp.ai?.waitFor && exp.ai.waitFor!==exp.next)paragraph('AI เพิ่มเติม',exp.ai.waitFor);
 if(exp.tradeWait && exp.tradeWait!==(exp.next || exp.ai?.waitFor)) paragraph('สถานะส่งคำสั่ง',exp.tradeWait);
 const plan=exp.plan;
 if(plan) {
   paragraph(['BUY','SELL'].includes(decision.action)?'แผนที่ AI อนุมัติ':'แผนอ้างอิง · รอยืนยัน',
     plan.side+' · เข้า '+fmt(plan.entry)+' · SL '+fmt(plan.sl)+' · TP '+fmt(plan.tp)+' · RR '+fmt(plan.rr),'plan-prices');
 }
 const position=exp.position;
 if(position) {
   paragraph('ไม้ที่ประเมิน',position.side+' · เข้า '+fmt(position.entry)+' · SL '+fmt(position.sl)+' · TP '+fmt(position.tp),'plan-prices');
   if(Number.isFinite(position.exitReference))paragraph('ราคาปิดอ้างอิง',fmt(position.exitReference)+
     (Number.isFinite(exp.reducePct)?' · ลด '+exp.reducePct+'%':''),'plan-prices');
 }
 if(decision.execution)paragraph('ผลจาก MT5',decision.execution);
 return lines;
}
function showDecision(decision) {
 const details=by('trade-explanation');
 const lines=decisionDetails(decision);
 details.replaceChildren(...lines);
 details.hidden=!lines.length;
 by('action').textContent=decision?.action||'—';
 const ai=decision?.explanation?.ai?.reason;
 by('why').textContent=ai?'AI · '+ai:decision?.reason||'รอผลการวิเคราะห์';
}
function decisionCard(decision) {
 const card=text('div','','decision-card');
 card.append(text('strong',new Date(decision.at).toLocaleString('th-TH')+' · '+decision.action),
   text('p',(decision.explanation?.ai?'AI · ':'')+(decision.explanation?.ai?.reason||decision.reason)));
 const lines=decisionDetails(decision);
 if(!lines.length&&decision.execution)lines.push(text('p','ผลจาก MT5 · '+decision.execution));
 card.append(...lines);
 return card;
}
async function status(){
 try{const {lastContact:c,recent=[],policy:p,bridgeSeenAt,model}=await read('/api/demo/status');const live=c&&Date.now()-Date.parse(c.at)<360000;
 const linked=Date.now()-Date.parse(bridgeSeenAt)<90000;
 by('online').textContent=live?'● EA ออนไลน์':linked?'● เชื่อมต่อแล้ว · รอข้อมูลแท่ง':'● รอ EA';
 by('online').classList.toggle('live',!!(live||linked));chart(live?c:null);
 const cap=live?Math.min(c.maxRisk,p.perTrade):p.perTrade;
 const total=live?Math.min(c.maxTotal,p.total):p.total;
 const eaDaily=live?c.maxDaily:0;
 const daily=p.daily>0&&eaDaily>0?Math.min(eaDaily,p.daily):Math.max(eaDaily,p.daily);
 const dailyText=daily===0?'ไม่จำกัด':daily+'%';
 by('risk').textContent=(p.enabled&&c?.armed&&live?'เปิดส่งคำสั่ง':'ดูสัญญาณ')+
   ' · เสี่ยงต่อไม้สูงสุด '+cap+'% · รวม ≤ '+total+'% · Daily DD '+dailyText+(live?' · RR '+c.minRR+'–'+c.maxRR:'')+
   ' · OpenCode Go / '+model;
 const latest=recent[0];
 const current=live && latest && (latest.bar===undefined || latest.bar===c.candles.at(-1)?.[0]);
 showDecision(current?latest:null);
 if(live&&!current)by('why').textContent='ได้รับข้อมูลแท่งแล้ว · กำลังวิเคราะห์แท่งล่าสุด';
 by('feed').replaceChildren(...recent.map(decisionCard));
 }catch{by('online').classList.remove('live');by('online').textContent='● ติดต่อ EA ไม่ได้';chart(null);showDecision(null);by('why').textContent='รอการเชื่อมต่อ MT5';}
}
let seq=0;
async function journal(){const n=++seq;
 try{const j=await read('/api/journal?day='+encodeURIComponent(by('day').value));if(n!==seq)return;
 const expanded=new Set([...by('trades').querySelectorAll('details[open]')].map(e=>e.dataset.ticket));
 by('day').value=j.day;by('day').min=j.first;by('day').max=j.last.slice(0,10);by('trades').replaceChildren();
 for(const r of [...(j.opened||[])].reverse()){
 const card=document.createElement('details'),row=document.createElement('summary');card.dataset.ticket=r.ticket;card.open=expanded.has(r.ticket);
 const exits=r.exits||[],shared=j.opened.some(t=>t.ticket!==r.ticket&&t.position&&t.position===r.position);
 const closed=exits.length&&!shared&&Math.abs(exits.reduce((a,e)=>a+e.volume,0)-r.volume)<1e-7;
 const net=closed?r.net+exits.reduce((a,e)=>a+e.net,0):null;
 row.append(text('span',r.time.slice(11)),text('b',r.side,r.side==='BUY'?'buy':'sell'),text('span',r.volume),text('b',net==null?'—':(net>0?'+':'')+fmt(net)+' '+j.currency,net>0?'positive':net<0?'negative':''));
 card.append(row,text('p',r.symbol+' · ดีล #'+r.ticket+(r.position?' · โพซิชัน #'+r.position:'')));if(r.reason)card.append(text('p',r.reason));
 for(const e of exits)card.append(text('p','ปิด '+e.time+' · '+e.volume+' lot · '+fmt(e.net)+' '+j.currency));
 by('trades').append(card);}
 if(!j.opened?.length)by('trades').append(text('p','ไม่มีดีลเปิดในวันที่เลือก'));
 by('total').textContent=j.day+' · สุทธิทุกดีลในวัน '+fmt(j.net)+' '+j.currency;
 }catch{if(n===seq){by('trades').replaceChildren();by('total').textContent='รอรายงานจาก MT5';}}}
function navigate(tab){by('dateBox').hidden=tab!=='history';document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));if(tab==='home')window.scrollTo(0,0);else by(tab).scrollIntoView();}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>navigate(b.dataset.tab));
const form=by('riskForm'),sheet=by('settings');
for(const b of document.querySelectorAll('[data-settings]')){b.hidden=!form;b.onclick=async()=>{sheet.showModal();const save=form.querySelector('[type=submit]');save.disabled=true;try{const {policy}=await read('/api/demo/status');for(const [k,v] of Object.entries(policy)){const f=form.elements.namedItem(k);if(f){if(f.type==='checkbox')f.checked=v;else f.value=v;}}save.disabled=false;by('riskMessage').textContent='';}catch{by('riskMessage').textContent='โหลดค่าไม่ได้';}};}
if(form){by('closeSettings').onclick=()=>sheet.close();form.onsubmit=async e=>{e.preventDefault();const policy={};for(const f of form.elements)if(f.name)policy[f.name]=f.type==='checkbox'?f.checked:Number(f.value);try{const res=await fetch('/api/demo/policy',{method:'POST',headers:{'Content-Type':'application/json','X-OI-Dashboard':'1'},body:JSON.stringify(policy)});if(!res.ok)throw Error();by('riskMessage').textContent='บันทึกแล้ว';status();}catch{by('riskMessage').textContent='บันทึกไม่สำเร็จ';}};}
async function refresh(){if(document.hidden)return;status();journal();try{const o=await read('/api/oi-snapshot');by('oi').textContent='OI '+o.contract+' · '+o.status;}catch{by('oi').textContent='รอ OI';}}
by('day').onchange=journal;refresh();setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);
