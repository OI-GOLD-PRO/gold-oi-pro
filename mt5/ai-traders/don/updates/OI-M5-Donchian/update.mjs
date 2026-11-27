import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const part = name=>fs.readFileSync(new URL(name+'.txt',import.meta.url),'utf8');
function edit(s,a,b){
  if(s.split(a).length!==2)throw Error('Unsupported source near '+a.slice(0,65));
  return s.replace(a,()=>b);
}
function server(s){
  if(s.includes('function donchianSeries(rows)'))return s;
  if(!s.includes('function sidewaysBox(m)')){
    s=part('range')+'\n'+s;
    const anchor='      const [oi,flow]=';
    s=edit(s,anchor,`      const box = sidewaysBox(m);
      if(box){
        const reason='ไซด์เวย์ M5 รอราคาปิดนอกกรอบ '+box.low+' – '+box.high;
        await appendFile(logPath,JSON.stringify({key,at:new Date().toISOString(),action:'WAIT',reason})+'\\n',{mode:0o600});
        return send(200,{action:'WAIT',reason});
      }
`+anchor);
  }
  s=edit(s,'box = {high,low}','box = {high,low,start:prior[0][0]}');
  s=edit(s,'const box = sidewaysBox(m);','const box = activeBox;');
  const anchor='    const p=await policy(), wait=';
  s=edit(s,anchor,`    const activeBox=sidewaysBox(m);
    lastContact.sidewaysRange=activeBox;
    lastContact.donchian=donchianSeries(lastContact.candles);
    m.donchian20=lastContact.donchian.at(-1);
`+anchor);
  return part('channel')+'\n'+edit(s,'Evaluate broker M5 closed candles','Evaluate market.donchian20 using the previous 20 closed M5 bars. Explain the latest close relative to upper, middle and lower bands in Thai alongside order flow and OI. A breakout is context, not an instruction to trade. If unavailable omit it. Evaluate broker M5 closed candles');
}
function viewer(s){
  if(s.includes('const don = contact.donchian'))return s;
  const a='  const low=Math.min(...rows.map(r=>r[3])';
  s=edit(s,a,part('draw')+a+',...levels');
  s=edit(s,'high=Math.max(...rows.map(r=>r[2])','high=Math.max(...rows.map(r=>r[2]),...levels');
  const b='  rows.forEach(([,open,top,bottom,close],i)=>{';
  return edit(s,b,part('lines')+b);
}
const changes=[];
try{
  for(const [file,transform] of [['demo.mjs',server],['viewer.js',viewer]]){
    const src=fs.readFileSync(file,'utf8'),out=transform(src);
    if(src===out)continue;
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
