import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const path='demo.mjs', original=fs.readFileSync(path,'utf8');
const source=original.replaceAll('\r\n','\n');
const gate=/^      const box = (?:activeBox|sidewaysBox\(m\));\n      if\s*\(box\)\s*\{\n[^}]*?/m;
let next=source;
if(gate.test(source)){
  const start=source.search(gate), end=source.indexOf('      const [oi,flow]=',start);
  const block=source.slice(start,end);
  if(end<0 || block.length>600 || !block.includes('ไซด์เวย์ M5') || !block.trimEnd().endsWith('}'))throw Error('Unsupported range gate');
  next=source.slice(0,start)+source.slice(end);
}
next=next.replace(/^    m\.donchian20=lastContact\.donchian\.at\(-1\);\n/m,'')
  .replace(/Evaluate market\.donchian20[^'\n]*?(?=Evaluate broker M5 closed candles)/,'');
if(!next.includes("content:'Evaluate broker M5 closed candles") || next.includes('const box = activeBox;') || next.includes('m.donchian20='))throw Error('Unknown bridge version');
if(next===source){console.log('Morning analysis already active');process.exit(0);}
const tmp=randomUUID()+'.mjs';
try{
  fs.writeFileSync(tmp,next);
  execFileSync(process.execPath,['--check',tmp]);
  fs.copyFileSync(path,path+'.before-morning-'+Date.now()+'.bak',fs.constants.COPYFILE_EXCL);
  fs.renameSync(tmp,path);
}finally{fs.rmSync(tmp,{force:true});}
console.log('Morning analysis restored. Restart Start-Phone Private.');
