const el=id=>document.getElementById(id);
async function read(url){
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('อ่านข้อมูลไม่ได้');
  return r.json();
}
function list(id,lines){
  el(id).replaceChildren(...lines.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
}
function drawChart(contact){
  const canvas=el('priceChart');
  if(!canvas)return;
  const rows=contact?.candles || [];
  canvas.hidden=!rows.length;
  el('chartTitle').textContent=rows.length
    ? contact.symbol+' · M5 · บัญชีลงท้าย '+contact.loginSuffix+' · '+rows.at(-1)[4]
    : 'กราฟ M5 · รอข้อมูลจาก EA ของบัญชี MT5';
  if(!rows.length)return;
  const scale=window.devicePixelRatio||1;
  canvas.width=Math.round(canvas.clientWidth*scale);
  canvas.height=Math.round(canvas.clientHeight*scale);
  const ctx=canvas.getContext('2d');
  const low=Math.min(...rows.map(r=>r[3])),high=Math.max(...rows.map(r=>r[2]));
  const y=price=>5+(high-price)/(high-low||1)*(canvas.height-10);
  const step=canvas.width/rows.length;
  rows.forEach(([,open,top,bottom,close],i)=>{
    const x=(i+.5)*step;
    ctx.strokeStyle=ctx.fillStyle=close>=open?'#2ab8a8':'#ed6669';
    ctx.beginPath();ctx.moveTo(x,y(top));ctx.lineTo(x,y(bottom));ctx.stroke();
    ctx.fillRect(x-step*.32,Math.min(y(open),y(close)),step*.64,Math.max(scale,Math.abs(y(open)-y(close))));
  });
}
async function status(){
  try{
    const {lastContact,policy,recent}=await read('/api/demo/status');
    const online=lastContact && Date.now()-Date.parse(lastContact.at)<360000;
    lamp(online,online?"EA ออนไลน์":"รอสัญญาณจาก EA");
    drawChart(online ? lastContact : null);
    el('state').textContent=online?lastContact.symbol+' · เปิดอยู่ '+lastContact.count+' ไม้':'รอการติดต่อจาก MT5';
    el('risk').textContent=(policy.enabled?'เปิด':'ปิด')+' เทรด MT5 · เสี่ยงต่อไม้ '+policy.perTrade+'% · รวม '+policy.total+'%';
    list('feed',recent.length?recent.map(d=>new Date(d.at).toLocaleString('th-TH')+' · '+d.action+' · '+d.reason):['ยังไม่มีคำตัดสินของ AI']);
  }catch{lamp(false,"อ่านสถานะไม่ได้");drawChart(null);el('state').textContent='เชื่อมต่อ EA ไม่ได้';el('risk').textContent='';list('feed',[]);}
}
let serial=0;
async function journal(){
  const n=++serial;
  try{
    const j=await read('/api/journal?day='+encodeURIComponent(el('day').value));
    if(n!==serial)return;
    calendar(j);el('day').value=j.day;el('day').min=j.first;el('day').max=j.last.slice(0,10);
    el('total').textContent=j.rows.length+' ดีล · สุทธิ '+j.net.toFixed(2)+' '+j.currency+' · อัปเดต '+j.last;
    list('deals',j.rows.slice().reverse().map(r=>r.time+' · '+r.symbol+' '+r.side+' '+r.volume+' lot · '+r.net.toFixed(2)+' '+j.currency+(r.reason?' · '+r.reason:'')));
  }catch{if(n===serial){el('month').textContent='';el('calendar').replaceChildren();el('total').textContent='รอรายงาน MT5';list('deals',[]);}}
}
async function refresh(){
  if(document.hidden)return;
  status();journal();
  try{const o=await read('/api/oi-snapshot');el('oi').textContent='OI '+o.contract+' · '+o.status+' · '+(o.quotes_as_of_utc||'—');}
  catch{el('oi').textContent='อ่านฟีด OI ไม่ได้';}
}
el('day').onchange=journal;document.addEventListener('visibilitychange',refresh);setInterval(refresh,30000);refresh();
function lamp(online,text){
  el('lamp').classList.toggle('online',Boolean(online));
  el('lamp').textContent=text;
}
function calendar(j){
  const grid=el('calendar'),month=j.day.slice(0,7),[y,m]=month.split('-').map(Number);
  const money=n=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:'exceptZero'});
  const sum=Object.values(j.totals).reduce((a,b)=>a+b,0);
  el('month').textContent=new Date(y,m-1,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'})+' · สุทธิ '+money(sum)+' '+j.currency;
  grid.replaceChildren();
  for(const label of ['จ','อ','พ','พฤ','ศ','ส','อา']){
    const day=document.createElement('span');day.textContent=label;grid.append(day);
  }
  const offset=(new Date(y,m-1,1).getDay()+6)%7;
  for(let i=0;i<offset;i++)grid.append(document.createElement('span'));
  for(let d=1;d<=new Date(y,m,0).getDate();d++){
    const date=month+'-'+String(d).padStart(2,'0'),val=j.totals[date];
    const button=document.createElement('button'),amount=document.createElement('small');
    button.textContent=d;button.disabled=date<j.first||date>j.last.slice(0,10);
    if(date===j.day)button.setAttribute('aria-current','date');
    amount.textContent=val===undefined?'—':money(val);
    amount.className=val>0?'gain':val<0?'loss':'';
    button.append(amount);button.onclick=()=>{el('day').value=date;journal();};grid.append(button);
  }
}
const tabs=Array.from(el('tabs').children),historyPanel=el('day').closest('.panel');
function showTab(index){
  for(const panel of document.querySelectorAll('main > .panel'))panel.hidden=(panel===historyPanel)!==(index===1);
  tabs.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  if(index===1)journal();else status();
}
tabs.forEach((b,i)=>b.onclick=()=>showTab(i));
showTab(0);
