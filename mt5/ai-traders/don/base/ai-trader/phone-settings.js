const sheet=document.getElementById('settings');
const form=document.getElementById('riskForm');
const save=form.querySelector('button[type=submit]');
const message=document.getElementById('riskMessage');
document.getElementById('closeSettings').onclick=()=>sheet.close();
document.getElementById('openSettings').onclick=async()=>{
  sheet.showModal();save.disabled=true;message.textContent='กำลังโหลดค่าปัจจุบัน';
  try{
    const {policy}=await read('/api/demo/status');
    for(const [name,value] of Object.entries(policy)){
      const field=form.elements.namedItem(name);
      if(field.type==='checkbox')field.checked=value;else field.value=value;
    }
    message.textContent='';save.disabled=false;
  }catch{message.textContent='โหลดค่าไม่ได้ กรุณาปิดแล้วเปิดอีกครั้ง';}
};
form.onsubmit=async event=>{
  event.preventDefault();save.disabled=true;
  const policy={};
  for(const field of form.elements)if(field.name)policy[field.name]=field.type==='checkbox'?field.checked:Number(field.value);
  try{
    const r=await fetch('/api/demo/policy',{method:'POST',headers:{'Content-Type':'application/json','X-OI-Dashboard':'1'},body:JSON.stringify(policy)});
    if(!r.ok)throw Error();
    message.textContent='บันทึกแล้ว · EA ใช้ค่านี้ในการขอแผนครั้งถัดไป';status();
  }catch{message.textContent='บันทึกไม่สำเร็จ ตรวจความเสี่ยงรวมและการเชื่อมต่อ';}
  finally{save.disabled=false;}
};
