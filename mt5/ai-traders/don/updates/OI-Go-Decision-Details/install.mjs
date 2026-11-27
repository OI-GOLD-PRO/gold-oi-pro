import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const dir=process.argv[2]||path.join(process.env.LOCALAPPDATA,'OI Gold AI Trader','release-2403511213','ai-trader');
const file=path.join(dir,'oi-go-decision.mjs');
const old=fs.readFileSync(file,'utf8');
if(old.includes('function describe(state,result)')){console.log('Details already installed');process.exit(0);}
let src=old.replaceAll('\r\n','\n');
for(const [a,b] of [
 ["return {action:'WAIT',reason:'รอ DON ยืนยันฝั่งเปิดไม้'}","return describe(state,{action:'WAIT',reason:'รอ DON ยืนยันฝั่งเปิดไม้'})"],
 ["  return result;","  return describe(state,result);"]
]){
 if(src.split(a).length!==2) throw Error('Unsupported Decision version');
 src=src.replace(a,b);
}
const tmp=file+'.'+Date.now()+'.mjs';
try {
 fs.writeFileSync(tmp,src+'\n'+fs.readFileSync(new URL('./detail.txt',import.meta.url),'utf8'),{flag:'wx'});
 execFileSync(process.execPath,['--check',tmp]);
 fs.copyFileSync(file,file+'.before-details-'+Date.now()+'.bak');
 fs.renameSync(tmp,file);
}finally{fs.rmSync(tmp,{force:true});}
console.log('Details installed. Restart Start-Phone Private.');
