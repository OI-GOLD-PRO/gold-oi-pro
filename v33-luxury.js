/* V3.4.0 navigation: reuse native chart/indicator/drawing/settings controls */
(function(){
 function init(){
  const main=document.getElementById('main');if(!main)return;
  document.getElementById('v33nav')?.remove();
  document.getElementById('v33sheet')?.remove();
  const nav=document.createElement('nav');nav.id='v33nav';nav.setAttribute('aria-label','เมนูหลัก');
  const tabs=[['chart','▥','กราฟ'],['oi','◉','OI / Gamma'],['ind','ƒx','อินดิเคเตอร์'],['tools','✎','เครื่องมือ'],['settings','⚙','ตั้งค่า']];
  function setActive(k){nav.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.page===k);b.setAttribute('aria-current',b.dataset.page===k?'page':'false');});}
  function go(k){
   if(k==='oi'){const oi=document.getElementById('oiBtn');if(oi&&!oi.classList.contains('has'))oi.click();setActive('oi');document.getElementById('wrap')?.scrollIntoView({block:'nearest'});return;}
   if(k==='ind'){document.getElementById('indBtn')?.click();setActive('ind');return;}
   if(k==='tools'){document.getElementById('drawBtn')?.click();setActive('tools');return;}
   if(k==='settings'){document.getElementById('setBtn')?.click();setActive('settings');return;}
   setActive('chart');document.getElementById('indMenu')?.setAttribute('hidden','');document.getElementById('drawBar')?.setAttribute('hidden','');
  }
  tabs.forEach(([k,glyph,label])=>{const b=document.createElement('button');b.type='button';b.dataset.page=k;const icon=document.createElement('span');icon.className='v33glyph';icon.textContent=glyph;const text=document.createElement('span');text.textContent=label;b.append(icon,text);b.addEventListener('click',()=>go(k));nav.appendChild(b);});
  main.appendChild(nav);
  setActive('chart');
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
