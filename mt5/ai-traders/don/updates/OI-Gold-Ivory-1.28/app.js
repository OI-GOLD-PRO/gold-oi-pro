const by=id=>document.getElementById(id);
const fmt=n=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
async function read(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();return r.json();}
function text(tag,value,cls){const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;}
function svg(parent,tag,attrs,label){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(label!=null)e.textContent=label;parent.append(e);return e;}
function chart(c){
 const plot=by('plot'),spark=by('spark');plot.replaceChildren();spark.replaceChildren();
 const all=(c?.candles||[]).filter(r=>Array.isArray(r)&&r.length>=5&&r.slice(0,5).every(Number.isFinite));
 by('sym').textContent=c?.symbol||'—';by('price').textContent=fmt(all.at(-1)?.[4]);by('legend').textContent='กราฟ M5 · รอข้อมูลจาก EA';
 if(!all.length)return;
 const offset=Math.max(0,all.length-60),rows=all.slice(offset),dc=c.donchian||[];
 const bands=rows.map((r,i)=>{const at=offset+i,d=dc[at+dc.length-all.length];if(Number.isFinite(d?.upper)&&Number.isFinite(d?.lower))return [d.upper,d.lower];if(at<20)return null;const prev=all.slice(at-20,at);return [Math.max(...prev.map(b=>b[2])),Math.min(...prev.map(b=>b[3]))];});
 const levels=(c.chartPositions||[]).flatMap(p=>[[p.side,p.entry],['TP',p.tp],['SL',p.sl]]).filter(([,v])=>Number.isFinite(v)&&v>0);
 const values=[...rows.flatMap(r=>[r[2],r[3]]),...bands.filter(Boolean).flat(),...levels.map(l=>l[1])];
 const min=Math.min(...values),max=Math.max(...values),range=max-min||1;
 const y=v=>225-(v-min)/range*202,x=i=>7+(i+.5)*430/rows.length;
 const line=(x1,y1,x2,y2,color,dash='')=>svg(plot,'line',{x1,y1,x2,y2,stroke:color,'stroke-dasharray':dash});
 const label=(x,y,t,color)=>svg(plot,'text',{x,y,fill:color,'font-size':11},t);
 for(let i=0;i<=5;i++){const v=min+range*i/5;line(0,y(v),442,y(v),'#25373b');label(448,y(v)+4,fmt(v),'#d9e5e3');}
 for(let i=0;i<4;i++){const j=Math.round(i*(rows.length-1)/3),dt=new Date(rows[j][0]*(rows[j][0]<1e12?1000:1));line(x(j),4,x(j),235,'#233235');label(Math.max(2,x(j)-15),255,dt.toISOString().slice(11,16),'#c5d3d0');}
 for(const side of [0,1]){let path='';bands.forEach((b,i)=>{if(b)path+=(bands[i-1]?'H'+x(i)+'V':'M'+x(i)+' ')+y(b[side]);});svg(plot,'path',{d:path,fill:'none',stroke:'#e9ae39','stroke-width':1.6});}
 rows.forEach((r,i)=>{const color=r[4]>=r[1]?'#26b89f':'#f06456',w=290/rows.length;line(x(i),y(r[2]),x(i),y(r[3]),color);svg(plot,'rect',{x:x(i)-w/2,y:Math.min(y(r[1]),y(r[4])),width:w,height:Math.max(1,Math.abs(y(r[1])-y(r[4]))),fill:color});});
 for(const [name,v] of levels){line(0,y(v),442,y(v),'#bfcbd2','4 3');label(5,y(v)-2,name+' '+fmt(v),'#ecf0ee');}
 const close=rows.at(-1)[4];line(0,y(close),442,y(close),'#55cdb9','3 3');svg(plot,'rect',{x:443,y:y(close)-9,width:76,height:18,fill:'#167c71'});label(448,y(close)+4,fmt(close),'white');
 const b=bands.at(-1);by('legend').textContent=c.symbol+'  M5'+(b?'   ━ DON Upper '+fmt(b[0])+'   ━ DON Lower '+fmt(b[1]):'');
 const closes=rows.map(r=>r[4]),lo=Math.min(...closes),span=Math.max(...closes)-lo||1;
 svg(spark,'polyline',{points:closes.map((v,i)=>(i*128/Math.max(1,closes.length-1))+','+(38-(v-lo)/span*34)).join(' '),stroke:'#d89822','stroke-width':2,fill:'none'});
}
async function status(){
 try{const {lastContact:c,recent=[],policy:p}=await read('/api/demo/status');const live=c&&Date.now()-Date.parse(c.at)<360000;
 by('online').textContent=live?'● EA ออนไลน์':'● รอ EA';by('online').classList.toggle('live',!!live);chart(live?c:null);
 by('risk').textContent=(p.enabled?'เปิด':'ปิด')+' เทรด MT5 · เสี่ยงต่อไม้ '+p.perTrade+'% · รวม '+p.total+'%';
 const d=recent[0];by('action').textContent=d?.action||'—';const reason=d?.reason||'';const parts=reason.split(/[·|]/).map(s=>s.trim()).filter(Boolean);
 by('why').textContent=parts.find(t=>t.includes('รอ')&&t.length>12)||parts.find(t=>t.length>18)||reason||'รอผลการวิเคราะห์';
 by('feed').replaceChildren(...recent.map(d=>text('p',new Date(d.at).toLocaleString('th-TH')+' · '+d.action+' · '+d.reason,'entry')));
 }catch{by('online').classList.remove('live');by('online').textContent='● ติดต่อ EA ไม่ได้';chart(null);by('why').textContent='รอการเชื่อมต่อ MT5';by('action').textContent='—';}
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
