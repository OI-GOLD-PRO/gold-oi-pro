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
      const row=document.createElement('div');row.className='v34strike';row.dataset.k=r.strike;
      const c=document.createElement('div');c.className='v34side call';
      const cn=document.createElement('span');cn.textContent=(+r.c||0).toLocaleString();
      const cb=document.createElement('i');cb.style.width=(Math.max(0,+r.c||0)/max*100)+'%';
      c.append(cn,cb);
      const strike=document.createElement('strong');strike.textContent=r.strike;
      const p=document.createElement('div');p.className='v34side put';
      const pb=document.createElement('i');pb.style.width=(Math.max(0,+r.p||0)/max*100)+'%';
      const pn=document.createElement('span');pn.textContent=(+r.p||0).toLocaleString();
      p.append(pb,pn);const tg=document.createElement('em');tg.className='v34tag';row.append(c,strike,p,tg);host.appendChild(row);
    });
    tagRows();placeNow(true);
  }
  // V4.5.5 (Claude): ขีดราคาปัจจุบันระหว่าง strike ในแถบ OI · อัปเดตทุก 3 วินาที · เปิดแถบแล้วเลื่อนไปที่ราคาอัตโนมัติ
  function nowPrice(){const O=window.OI;if(!O||O.lastClose==null||!isFinite(O.lastClose))return null;const r0=O.oi&&O.oi.rows?O.oi.rows.find(r=>r.price!=null):null;return O.lastClose-(r0?r0.price-r0.strike:0);}
  function placeNow(scroll){
    const host=sheet.querySelector('#v34oiChart');if(!host)return;const P=nowPrice();let m=host.querySelector('.v34now');
    if(P==null){if(m)m.remove();return;}
    if(!m){m=document.createElement('div');m.className='v34now';m.innerHTML='<span></span>';}
    m.firstChild.textContent='ราคา '+P.toFixed(1);
    const rowsEl=[...host.querySelectorAll('.v34strike')],nxt=rowsEl.find(el=>+el.dataset.k<P);
    if(nxt){if(m.nextSibling!==nxt)host.insertBefore(m,nxt);}else if(host.lastChild!==m)host.appendChild(m);
    if(scroll&&!sheet.hidden)m.scrollIntoView({block:'center'});
  }
  // V4.9.87: คอลัมน์ท้าย = อันดับโซน OI (C#/P# ตามฝั่งที่ OI มากกว่า เหมือนแถบโซนบนกราฟ) + เกรด 🌏 (A/B ถ้าเป็นเส้นของ OI Session Fade)
  function tagRows(){
    const host=sheet.querySelector('#v34oiChart'),O=window.OI;if(!host)return;const oi=O&&O.oi;
    let lv=[];try{const F=window.OI_sfade;if(F){lv=F.levels_||[];if(!lv.length&&F.levels){const P=nowPrice();if(P!=null)lv=F.levels(P)||[];}}}catch(e){}
    host.querySelectorAll('.v34strike').forEach(el=>{
      const k=+el.dataset.k,t=el.querySelector('.v34tag');if(!t)return;
      const r=oi&&oi.rows?oi.rows.find(x=>x.strike===k):null;
      const rC=r&&r.c>0?(oi.rankC.get(k)||0):0,rP=r&&r.p>0?(oi.rankP.get(k)||0):0;
      const useC=rC&&(!rP||r.c>=r.p),rk=useC?rC:rP,z=lv.find(x=>x.k===k);
      t.innerHTML=(rk?`<b class="${useC?'c':'p'}">${useC?'C':'P'}#${rk}</b>`:'')+(z?`<i class="g${z.grade}">🌏${z.grade}</i>`:'');
    });
  }
  setInterval(()=>{if(!sheet.hidden){placeNow(false);tagRows();}},3000);
  new MutationObserver(()=>{if(!sheet.hidden)setTimeout(()=>placeNow(true),50);}).observe(sheet,{attributes:true,attributeFilter:['hidden']});
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
