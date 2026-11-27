import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const part = name=>fs.readFileSync(new URL(name+'.txt',import.meta.url),'utf8');
function edit(s,a,b){
  if(s.split(a).length!==2)throw Error('Unsupported source near '+a.slice(0,65));
  return s.replace(a,()=>b);
}
function upgrade(s, name){
  if(name==='range' && !s.includes('const donHistory=')){
    s=edit(s,part('channel-old').trimEnd(),part('channel-new').trimEnd());
    s=edit(s,'donchianSeries(lastContact.candles)','donchianSeries(lastContact.candles,JSON.stringify([m.server,m.login,m.symbol]))');
    s=edit(s,'Explain the latest close','Use direction (+1 up, -1 down, 0 unconfirmed) and ATR trail from OI Gold Pro Donchian Trend. Explain the latest close');
  }
  if(name==='lines' && !s.includes('DON Trend')){
    s=edit(s,"' · DON20 บน/กลาง/ล่าง '+[last.upper,last.middle,last.lower].map(v=>v.toFixed(2)).join(' / ')","' · DON Trend '+(last.direction>0?'ขึ้น':last.direction<0?'ลง':'รอเบรก')+(Number.isFinite(last.trail)?' '+last.trail.toFixed(2):'')");
    s=edit(s,'[d.upper,d.lower]','Number.isFinite(d.trail)?[d.trail]:[]');
  }
  const old=part(name+'-old').trimEnd(), updated=part(name+'-new').trimEnd();
  if(s.includes(updated))return s;
  return edit(s,old,updated);
}
const changes=[];
try{
  for(const [file,transform] of [['demo.mjs','range'],['viewer.js','lines']]){
    const src=fs.readFileSync(file,'utf8'),out=upgrade(src.replaceAll("\r\n","\n"),transform);
    if(src.replaceAll("\r\n","\n")===out)continue;
    const tmp=randomUUID()+'.mjs',backup=file+'.before-don-'+Date.now()+'.bak';
    changes.push({file,tmp,backup});
    fs.writeFileSync(tmp,out);
    execFileSync(process.execPath,['--check',tmp]);
    fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
  }
  for(const c of changes){fs.renameSync(c.tmp,c.file);c.done=true;}
  console.log(changes.length?'Installed. Restart Start-Phone Private.':'Already installed.');
}catch(e){for(const c of changes.filter(c=>c.done))fs.copyFileSync(c.backup,c.file);throw e;}
finally{for(const c of changes)fs.rmSync(c.tmp,{force:true});}
