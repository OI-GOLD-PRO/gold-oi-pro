/* V3.4.0 navigation: reuse native chart/indicator/drawing/settings controls */
(function(){
 function init(){
  const main=document.getElementById('main');if(!main)return;
  document.getElementById('v33nav')?.remove();
  document.getElementById('v33sheet')?.remove();
  // V3.5: keep original interactive elements, only relocate their DOM nodes.
  const header=main.querySelector(':scope > header');
  if(header && !header.querySelector('.v35brand')){
    const px=header.querySelector('.px'), logo=px?.querySelector('.price-logo'), quote=px?.querySelector('.price-stack');
    const sym=header.querySelector('.sym'), source=header.querySelector('#src');
    const siren=header.querySelector('#siren');
    const brand=document.createElement('div');brand.className='v35brand';
    const quoteRow=document.createElement('div');quoteRow.className='v35quote';
    const actions=document.createElement('div');actions.className='v35actions';
    const sourceRow=document.createElement('div');sourceRow.className='v35source';
    if(logo)brand.appendChild(logo);
    if(sym)quoteRow.appendChild(sym);
    if(quote)quoteRow.appendChild(quote);
    if(source)sourceRow.appendChild(source);
    // The dashboard shortcut is injected by dash.js; preserve its click handler.
    const icons=[...header.querySelectorAll('button.icon')].filter(b=>b.id!=='setBtn');
    const dashboard=icons.find(b=>b.id!=='layBtn'&&b.id!=='reload')||null;
    if(siren)actions.appendChild(siren);
    if(dashboard)actions.appendChild(dashboard);
    for(const id of ['layBtn','reload']){const b=header.querySelector('#'+id);if(b)actions.appendChild(b);}
    header.append(brand,quoteRow,actions,sourceRow);
    if(px)px.style.display='none';
    header.classList.add('v35header');
  }
  const sheet=document.createElement('section');sheet.id='v34oi';sheet.hidden=true;sheet.setAttribute('aria-label','OI และ Gamma');sheet.innerHTML='<div class="v34oihead"><strong>OI / Gamma</strong><button type="button" id="v34close" aria-label="ปิด">✕</button></div><p>OI ราย Strike จากข้อมูลที่แอปโหลดล่าสุด</p><div id="v34oiStatus">กำลังรอข้อมูล OI…</div><div id="v34oiChart" role="img" aria-label="กราฟแท่ง Open Interest แยก Call และ Put ตาม Strike"></div><div class="v34oiactions"><button type="button" id="v34show">แสดง OI บนกราฟ</button><button type="button" id="v34hide">ซ่อน OI</button></div><small>ข้อมูล OI ยังเป็น Overlay บนกราฟราคา ไม่ใช่กราฟแยก</small>';main.appendChild(sheet);sheet.querySelector('#v34close').addEventListener('click',()=>{sheet.hidden=true;setActive('chart');});sheet.querySelector('#v34show').addEventListener('click',()=>{const b=document.getElementById('oiBtn');if(b&&!b.classList.contains('has'))b.click();sheet.hidden=true;setActive('oi');});sheet.querySelector('#v34hide').addEventListener('click',()=>{const b=document.getElementById('oiBtn');if(b&&b.classList.contains('has'))b.click();sheet.hidden=true;setActive('chart');});
  function renderOI(data){
    const host=sheet.querySelector('#v34oiChart'), status=sheet.querySelector('#v34oiStatus');
    host.replaceChildren();
    if(!data||!Array.isArray(data.rows)||!data.rows.length){status.textContent='ยังไม่มีข้อมูล OI ราย Strike จากแหล่งข้อมูลปัจจุบัน';return;}
    const rows=data.rows.filter(r=>Number.isFinite(+r.strike)).sort((a,b)=>b.strike-a.strike);
    const sumC=rows.reduce((a,r)=>a+(+r.c||0),0),sumP=rows.reduce((a,r)=>a+(+r.p||0),0);
    status.textContent='สัญญา '+(data.contract||'—')+'  ·  Call OI '+sumC.toLocaleString()+'  ·  Put OI '+sumP.toLocaleString();
    const max=Math.max(1,...rows.flatMap(r=>[+r.c||0,+r.p||0]));
    rows.forEach(r=>{
      const row=document.createElement('div');row.className='v34strike';
      const c=document.createElement('div');c.className='v34side call';
      const cn=document.createElement('span');cn.textContent=(+r.c||0).toLocaleString();
      const cb=document.createElement('i');cb.style.width=(Math.max(0,+r.c||0)/max*100)+'%';
      c.append(cn,cb);
      const strike=document.createElement('strong');strike.textContent=r.strike;
      const p=document.createElement('div');p.className='v34side put';
      const pb=document.createElement('i');pb.style.width=(Math.max(0,+r.p||0)/max*100)+'%';
      const pn=document.createElement('span');pn.textContent=(+r.p||0).toLocaleString();
      p.append(pb,pn);row.append(c,strike,p);host.appendChild(row);
    });
  }
  window.addEventListener('oi-gold-data',e=>renderOI(e.detail));
  if(window.__oiGoldLatest)renderOI(window.__oiGoldLatest);
  const nav=document.createElement('nav');nav.id='v33nav';nav.setAttribute('aria-label','เมนูหลัก');
  const tabs=[['chart','▥','กราฟ'],['oi','◎','OI / Gamma'],['ind','ƒx','อินดิเคเตอร์'],['tools','✎','เครื่องมือ'],['settings','⚙','ตั้งค่า']];
  function setActive(k){nav.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.page===k);b.setAttribute('aria-current',b.dataset.page===k?'page':'false');});}
  function go(k){
   if(k!=='oi')sheet.hidden=true;
   if(k==='oi'){sheet.hidden=false;setActive('oi');return;}
   if(k==='ind'){document.getElementById('indBtn')?.click();setActive('ind');return;}
   if(k==='tools'){document.getElementById('drawBtn')?.click();setActive('tools');return;}
   if(k==='settings'){document.getElementById('setBtn')?.click();setActive('settings');return;}
   setActive('chart');document.getElementById('indMenu')?.setAttribute('hidden','');document.getElementById('drawBar')?.setAttribute('hidden','');
  }
  tabs.forEach(([k,glyph,label])=>{const b=document.createElement('button');b.type='button';b.dataset.page=k;const icon=document.createElement('span');icon.className='v33glyph';icon.textContent=glyph;icon.classList.add('v35glyph-'+k);const text=document.createElement('span');text.textContent=label;b.append(icon,text);b.addEventListener('click',e=>{e.stopPropagation();go(k);});nav.appendChild(b);});
  main.appendChild(nav);
  setActive('chart');
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
