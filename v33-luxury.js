/* V3.3 Luxury navigation: presentation-only, existing controls remain authoritative. */
(function(){
  function init(){
    var main=document.getElementById('main');
    if(!main||document.getElementById('v33nav'))return;
    var nav=document.createElement('nav');nav.id='v33nav';nav.setAttribute('aria-label','เมนู OI Gold Pro');
    var entries=[['chart','▥','กราฟ'],['oi','◉','OI / Gamma'],['news','▤','ข่าว'],['tools','✧','เครื่องมือ'],['settings','⚙','ตั้งค่า']];
    entries.forEach(function(e){var b=document.createElement('button');b.type='button';b.dataset.page=e[0];b.innerHTML='<span class="v33glyph" aria-hidden="true">'+e[1]+'</span><span>'+e[2]+'</span>';b.addEventListener('click',function(){open(e[0]);});nav.appendChild(b);});
    var sheet=document.createElement('section');sheet.id='v33sheet';sheet.hidden=true;sheet.setAttribute('role','dialog');sheet.setAttribute('aria-label','ข้อมูลตลาด');
    main.appendChild(sheet);main.appendChild(nav);
    function active(k){nav.querySelectorAll('button').forEach(function(b){b.classList.toggle('active',b.dataset.page===k);});}
    function close(){sheet.hidden=true;sheet.replaceChildren();active('chart');}
    function line(label,value){var r=document.createElement('div');r.className='v33row';var a=document.createElement('span');a.textContent=label;var b=document.createElement('strong');b.textContent=value||'—';r.append(a,b);sheet.appendChild(r);}
    function action(label,fn){var b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',fn);sheet.appendChild(b);}
    function open(k){
      if(k==='chart'){close();return;}
      if(k==='tools'){close();document.getElementById('indBtn')?.click();return;}
      if(k==='settings'){close();document.getElementById('setBtn')?.click();return;}
      sheet.replaceChildren();sheet.hidden=false;active(k);
      var title=document.createElement('div');title.className='v33title';title.textContent=k==='oi'?'OI / Gamma • ข้อมูลตลาด':'ข่าวและเหตุการณ์';sheet.appendChild(title);
      if(k==='oi'){
        line('สัญลักษณ์',document.getElementById('symName')?.textContent);
        line('ราคาล่าสุด',document.getElementById('price')?.textContent);
        line('เปลี่ยนแปลง',document.getElementById('chg')?.textContent);
        line('แหล่งข้อมูล',document.getElementById('src')?.textContent);
        line('สถานะ OI บนกราฟ',document.getElementById('oiBtn')?.classList.contains('has')?'เปิด':'ตรวจสอบบนกราฟ');
        action('เปิด / ปิด OI บนกราฟ',function(){document.getElementById('oiBtn')?.click();close();});
      }else{
        var chips=document.getElementById('chips');
        var news=chips?.querySelector('#newschip');
        line('ข่าวที่แสดงในแอป',news&&!news.hidden?news.textContent:'ดูแถบข่าวด้านบน');
        action('ไปยังข่าวในแถบข้อมูล',function(){close();news?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});});
      }
      action('กลับไปกราฟ',close);
    }
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!sheet.hidden)close();});
    active('chart');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
