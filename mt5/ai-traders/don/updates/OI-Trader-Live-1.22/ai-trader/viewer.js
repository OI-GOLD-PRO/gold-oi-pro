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
    drawChart(online ? lastContact : null);
    el('state').textContent=online?lastContact.symbol+' · เปิดอยู่ '+lastContact.count+' ไม้':'รอการติดต่อจาก MT5';
    el('risk').textContent=(policy.enabled?'เปิด':'ปิด')+' เทรด MT5 · เสี่ยงต่อไม้ '+policy.perTrade+'% · รวม '+policy.total+'%';
    list('feed',recent.length?recent.map(d=>new Date(d.at).toLocaleString('th-TH')+' · '+d.action+' · '+d.reason):['ยังไม่มีคำตัดสินของ AI']);
  }catch{drawChart(null);el('state').textContent='เชื่อมต่อ EA ไม่ได้';el('risk').textContent='';list('feed',[]);}
}
let serial=0;
async function journal(){
  const n=++serial;
  try{
    const j=await read('/api/journal?day='+encodeURIComponent(el('day').value));
    if(n!==serial)return;
    el('day').value=j.day;el('day').min=j.first;el('day').max=j.last.slice(0,10);
    el('total').textContent=j.rows.length+' ดีล · สุทธิ '+j.net.toFixed(2)+' '+j.currency+' · อัปเดต '+j.last;
    list('deals',j.rows.slice().reverse().map(r=>r.time+' · '+r.symbol+' '+r.side+' '+r.volume+' lot · '+r.net.toFixed(2)+' '+j.currency+(r.reason?' · '+r.reason:'')));
  }catch{if(n===serial){el('total').textContent='รอรายงาน MT5';list('deals',[]);}}
}
async function refresh(){
  if(document.hidden)return;
  status();journal();
  try{const o=await read('/api/oi-snapshot');el('oi').textContent='OI '+o.contract+' · '+o.status+' · '+(o.quotes_as_of_utc||'—');}
  catch{el('oi').textContent='อ่านฟีด OI ไม่ได้';}
}
el('day').onchange=journal;document.addEventListener('visibilitychange',refresh);setInterval(refresh,30000);refresh();
