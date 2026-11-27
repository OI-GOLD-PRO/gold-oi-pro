import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const path='demo.mjs', original=fs.readFileSync(path,'utf8');
const source=original.replaceAll('\r\n','\n');
const gate=/^      const box = (?:activeBox|sidewaysBox\(m\));\n      if\s*\(box\)\s*\{\n[^}]*?/m;
let next=source;
if(source.includes('const allowedDonSide =')){console.log('DON entry filter already installed');process.exit(0);}
if(!source.includes('const donHistory=new Map()'))throw Error('Install OI-M5-DonTrend first');
if(gate.test(source)){
  const start=source.search(gate), end=source.indexOf('      const [oi,flow]=',start);
  const block=source.slice(start,end);
  if(end<0 || block.length>600 || !block.includes('ไซด์เวย์ M5') || !block.trimEnd().endsWith('}'))throw Error('Unsupported range gate');
  next=source.slice(0,start)+source.slice(end);
}
next=next.replace(/^    m\.donchian20=lastContact\.donchian\.at\(-1\);\n/m,'')
  .replace(/Evaluate market\.donchian20[^'\n]*?(?=Evaluate broker M5 closed candles)/,'');
if(!next.includes("content:'Evaluate broker M5 closed candles") || next.includes('const box = activeBox;') || next.includes('m.donchian20='))throw Error('Unknown bridge version');
function replaceOnce(old,value){
  if(next.split(old).length!==2)throw Error('Unsupported bridge near '+old);
  next=next.replace(old,()=>value);
}
replaceOnce('    const p=await policy(), wait=', `    const don = lastContact.donchian.at(-1);
    const allowedDonSide = Number.isFinite(don?.trail) && lastContact.candles.at(-1)?.[0] === m.candles.at(-1)?.[0]
      ? (don.direction === 1 ? 'BUY' : don.direction === -1 ? 'SELL' : null) : null;
    delete m.ema;
    m.donTrend = don;
    m.allowedEntrySide = allowedDonSide;
    const p=await policy(), wait=`);
replaceOnce('Evaluate broker M5 closed candles','Use Donchian Trend on closed M5 bars as the trend filter. Only open the market.allowedEntrySide. If null, no new entries. Use OI, order flow and price action to decide whether to enter or WAIT. Do not use EMA. Existing positions may still be managed in either direction. Evaluate broker M5 closed candles');
replaceOnce("      if(['BUY','SELL'].includes(d.action)&&", `      if (['BUY','SELL'].includes(d.action) && d.action !== allowedDonSide) {
        d.action = 'WAIT';
        d.reason = allowedDonSide ? 'DON อนุญาตเฉพาะ '+allowedDonSide+' จึงรอ' : 'รอ DON ยืนยันทิศทาง';
      }
      if(['BUY','SELL'].includes(d.action)&&`);
const tmp=randomUUID()+'.mjs';
try{
  fs.writeFileSync(tmp,next);
  execFileSync(process.execPath,['--check',tmp]);
  fs.copyFileSync(path,path+'.before-morning-'+Date.now()+'.bak',fs.constants.COPYFILE_EXCL);
  fs.renameSync(tmp,path);
}finally{fs.rmSync(tmp,{force:true});}
console.log('DON entry filter installed. Restart Start-Phone Private.');
