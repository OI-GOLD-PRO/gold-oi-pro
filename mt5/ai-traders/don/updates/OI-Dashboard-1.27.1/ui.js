function oiMetrics(contact) {
  const chart = document.getElementById('priceChart');
  if (!chart) return;
  let strip = document.getElementById('oi-market-strip');
  if (!strip) {
    strip = document.createElement('div');
    strip.id = 'oi-market-strip';
    chart.before(strip);
  }
  const bar = contact?.candles?.at(-1);
  const previous = contact?.candles?.at(-2);
  const change = bar && previous ? bar[4]-previous[4] : null;
  const values = [['ราคาล่าสุด',bar?.[4]],['เปลี่ยนจากแท่งก่อน',change],['ช่วงสูง–ต่ำ M5',bar ? bar[2]-bar[3] : null]];
  strip.replaceChildren(...values.map(([label,value],i)=>{
    const cell=document.createElement('div'), title=document.createElement('small'), number=document.createElement('b');
    title.textContent=label;
    number.textContent=Number.isFinite(value)?(i===1&&value>0?'+':'')+value.toFixed(2):'—';
    if(i===1 && value) number.className=value>0?'oi-up':'oi-down';
    cell.append(title,number); return cell;
  }));
}
function oiTradeCards(j) {
  const deals=document.getElementById('deals');
  let box=document.getElementById('oi-positions');
  if(!box){box=document.createElement('section');box.id='oi-positions';deals.before(box);}
  const expanded=new Set([...box.querySelectorAll('details[open]')].map(d=>d.dataset.ticket));
  const heading=document.createElement('h3');heading.textContent='ไม้ที่เปิดในวันที่เลือก';
  box.replaceChildren(heading);
  if(!j.opened?.length){const p=document.createElement('p');p.textContent='ไม่มีดีลเปิดในรายงานของวันที่เลือก';box.append(p);}
  for(const r of [...(j.opened||[])].reverse()){
    const card=document.createElement('details'),top=document.createElement('summary');
    card.dataset.ticket=r.ticket;card.open=expanded.has(r.ticket);
    const side=document.createElement('strong');side.textContent=r.side;side.className=r.side==='BUY'?'oi-up':'oi-down';
    top.append(side,'  '+r.symbol+' · '+r.volume+' lot · '+r.time.slice(11));card.append(top);
    function line(value){const p=document.createElement('p');p.textContent=value;card.append(p);}
    line('ดีลเปิด #'+r.ticket+(r.position?' · โพซิชัน #'+r.position:''));
    if(r.reason)line(r.reason);
    if(!r.exits.length)line(r.position?'ยังไม่มีรายการปิดในรายงานสำหรับโพซิชันนี้':'รายงานรุ่นนี้ไม่มีเลขโพซิชันสำหรับจับคู่');
    for(const x of r.exits)line('ปิด '+x.time+' · '+x.volume+' lot · สุทธิดีลปิด '+x.net.toFixed(2)+' '+j.currency);
    box.append(card);
  }
  const caption=document.createElement('h3');caption.textContent='ดีลทั้งหมดในวันที่เลือก';box.append(caption);
}
