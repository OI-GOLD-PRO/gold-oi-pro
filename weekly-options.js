(() => {
  'use strict';
  const dialog = document.createElement('dialog');
  dialog.id = 'weeklyOptions';
  document.body.append(dialog);
  dialog.innerHTML = `<header><strong>สรุป COMEX Gold Options</strong><button aria-label="ปิด">✕</button></header>
    <nav><label>วันที่ <select class="date"></select></label><label>สัญญา / เดือน <select class="contract"></select></label>
    <label>เทียบกับ <select class="mode"><option value="weekly">ปลายสัปดาห์ก่อน</option><option value="daily">วันซื้อขายก่อน</option></select></label><button class="reload">โหลดใหม่</button></nav>
    <p role="status"></p><section></section>`;
  const $ = s => dialog.querySelector(s);
  const panel = $('section');
  const text = (tag, value, parent = panel) => {
    const node = document.createElement(tag);
    node.textContent = value;
    parent.append(node);
    return node;
  };
  const link = (name,url) => {
    const a = text('a',name+' ↗ ');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
  };
  const table = (columns, rows) => {
    const wrap = text('div','');
    wrap.className = 'opt-scroll';
    const tbl = text('table','',wrap);
    const header = tbl.createTHead().insertRow();
    columns.forEach(c => text('th',c,header));
    const body = tbl.createTBody();
    rows.forEach(r => {
      const tr = body.insertRow();
      r.forEach(v => text('td',v == null ? 'ไม่มีข้อมูล' : v,tr));
    });
  };
  let data, week = [], version = 0;
  const fmt = x => x == null ? null : x.toLocaleString('en-US');
  function draw() {
    panel.replaceChildren();
    if (!data) return;
    const series = data.contracts.find(c => c.key === $('.contract').value);
    if (series) {
      const mode = $('.mode').value;
      text('p', mode === 'weekly' ? 'OI วันที่ '+data.date+' เทียบวันฐาน '+(data.base || 'ไม่มีข้อมูล') : 'OI วันที่ '+data.date+' เทียบวันซื้อขายก่อนตามค่า Change ของ CME');
      for (const [side,label] of [['C','Call'],['P','Put']]) {
        const group = series[mode][side];
        text('h3', label+' · เทียบได้ '+group.matched+' จาก '+group.available+' Strike ที่พบ');
        if (!group.rows.length) { text('p','ไม่มีคู่ข้อมูลสำหรับจัดอันดับ'); continue; }
        table(['อันดับ','Strike','OI ฐาน','OI ล่าสุด','ΔOI','Volume วันนั้น'],group.rows.map(([k,b,o,d,v],i)=>[i+1,fmt(k),fmt(b),fmt(o),(d>0?'+':'')+fmt(d),fmt(v)]));
      }
      text('p','IV ATM '+(series.iv == null?'ไม่มีข้อมูล':series.iv+'%')+' · Expected Move ถึงวันหมดอายุ '+(series.em == null?'ไม่มีข้อมูล':'±$'+series.em+' ('+series.expiry+' · ATM settlement straddle)'));
      link('CME วันรายงาน',series.url);
      if (mode==='weekly' && series.baseUrl) link('CME วันฐาน',series.baseUrl);
      if (series.iv != null) link('ประวัติ IV','iv_hist.json');
      if (series.settleSource) link('Settlement','https://github.com/OI-GOLD-PRO/gold-oi-pro/blob/'+series.settleSource+'/cme_oi.json');
    } else text('p','ไม่มีข้อมูลสัญญาจาก CME สำหรับวันนี้');
    text('h3','การทดสอบแนว OI บน GC=F · '+data.date);
    text('p','ใช้ 10 แนว OI สูงสุดของ Call และ Put จากสัญญาที่แอปติดตาม ณ เวลานั้น รวม Strike ซ้ำ นับครั้งแรกที่ M5 แตะแนวแล้วปิดฝั่งเดิมเป็นเด้ง ปิดอีกฝั่งเป็นทะลุ ปิดตรงแนวไม่นับ');
    table(['ตลาด (เวลาไทย)','เด้ง','ทะลุ','M5 ใช้ได้ / ทั้งช่วง'],data.sessions.map(([name,b,k,n,total],i)=>[name+' '+['06–13','13–19','19–05','05–06'][i],b,k,n+' / '+total]));
    if ($('.mode').value==='weekly' && week.length) {
      text('h3','รวมตามตลาด · สัปดาห์ถึง '+data.date);
      table(['ตลาด','เด้ง','ทะลุ','วันมี M5 / วันที่มีรายงาน'],data.sessions.map(([name],i)=>{
        const valid = week.map(d=>d?.sessions[i]).filter(r=>r && r[3]>0);
        const sum = k => valid.length ? valid.reduce((a,r)=>a+r[k],0) : null;
        return [name,sum(1),sum(2),valid.length+' / '+week.length];
      }));
    }
    text('p','ช่วงหลังเที่ยงคืนนับต่อวันเริ่มตลาด ตัวเลขเป็นผลเฉพาะแท่งที่ตรวจได้ รวมช่วงตลาดปิดในจำนวนแท่งตามเวลา');
    [...new Set(data.sessions.filter(r=>r[3]).map(r=>r[6]).filter(Boolean))].forEach(sha=>link('ราคา GC=F M5','https://github.com/OI-GOLD-PRO/gold-oi-pro/blob/'+sha+'/gcy.json'));
    [...new Set(data.sessions.flatMap(r=>r[5]))].forEach((sha,i)=>link('แนว OI '+(i+1),'https://github.com/OI-GOLD-PRO/gold-oi-pro/blob/'+sha+'/cme_oi.json'));
  }
  const get = async path => {
    const r = await fetch(path,{cache:'no-store'});
    if (!r.ok) throw Error('HTTP '+r.status);
    return r.json();
  };
  async function load(refresh) {
    const id=++version;
    data=null;
    panel.replaceChildren();
    $('p').textContent='กำลังโหลด…';
    try {
      if (refresh) {
        const dates=await get('reports/dates.json');
        if (id!==version) return;
        const selected=$('.date').value;
        $('.date').replaceChildren(...dates.map(d=>new Option(d,d)));
        if (dates.includes(selected)) $('.date').value=selected;
      }
      if (!$('.date').value) throw Error('ยังไม่มีรายงาน');
      const report=await get('reports/'+$('.date').value+'.json');
      if (id!==version) return;
      const first = new Date(report.date+'T00:00:00Z');
      first.setUTCDate(first.getUTCDate()-(first.getUTCDay()+6)%7);
      const monday=first.toISOString().slice(0,10);
      const prior=Array.from($('.date').options,o=>o.value).filter(d=>d>=monday && d<report.date);
      const previous=await Promise.all(prior.map(d=>get('reports/'+d+'.json').catch(()=>null)));
      if (id!==version) return;
      week=[...previous,report];
      data=report;
      const selected=$('.contract').value;
      $('.contract').replaceChildren(...report.contracts.map(c=>new Option(c.name,c.key)));
      if (report.contracts.some(c=>c.key===selected)) $('.contract').value=selected;
      $('p').textContent='จัดอันดับตามขนาดการเปลี่ยน OI ทั้งเพิ่มและลด · ข้อมูล CME รอบ Preliminary';
      draw();
    } catch (e) { if (id===version) $('p').textContent='โหลดรายงานไม่ได้ · '+e.message; }
  }
  document.getElementById('optionsReportBtn').onclick=()=>{dialog.showModal();load(true);};
  $('header button').onclick=()=>dialog.close();
  $('.reload').onclick=()=>load(true);
  $('.date').onchange=()=>load(false);
  $('.contract').onchange=$('.mode').onchange=draw;
  window.bindRightSwipeDismiss?.(dialog,()=>dialog.close());
})();
