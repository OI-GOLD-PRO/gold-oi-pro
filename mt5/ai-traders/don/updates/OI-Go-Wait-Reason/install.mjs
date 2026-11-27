import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const dir=process.argv[2]||path.join(process.env.LOCALAPPDATA,'OI Gold AI Trader','release-2403511213','ai-trader');
const file=path.join(dir,'oi-go-decision.mjs');
const old=fs.readFileSync(file,'utf8');
if(old.includes('function waitConditions(state)')){console.log('WAIT reasons already installed');process.exit(0);}
let src=old.replaceAll('\r\n','\n');
if(!src.includes('function describe(state,result)')) throw Error('Install OI-Go-Decision-Details first');
for(const [a,b] of [
 ["reason:'รอ DON ยืนยันฝั่งเปิดไม้'","reason:waitConditions(state).trend"],
 ["  if(hasPosition) qs.reduce=", "  const candidates=waitConditions(state);\n  if(Object.keys(candidates).length>1) qs.waitFor=question('If the action is WAIT, select the best supported explanation and next observation for this bar. Choose review if none fits.',candidates);\n  if(hasPosition) qs.reduce="],
 ["  if(['BUY','SELL'].includes(action)){","  if(action==='WAIT'){\n    const selected=answers?.waitFor?.choice;\n    const explanation=Object.hasOwn(candidates,selected)?candidates[selected]:(candidates.review??candidates.trend);\n    result.reason+=' · '+explanation;\n  }\n  if(['BUY','SELL'].includes(action)){"]
]){
 if(src.split(a).length!==2)throw Error('Unsupported Decision version');
 src=src.replace(a,b);
}
const tmp=file+'.'+Date.now()+'.mjs';
try {
 fs.writeFileSync(tmp,src+'\n'+fs.readFileSync(new URL('./wait.txt',import.meta.url),'utf8'),{flag:'wx'});
 execFileSync(process.execPath,['--check',tmp]);
 fs.copyFileSync(file,file+'.before-details-'+Date.now()+'.bak');
 fs.renameSync(tmp,file);
}finally{fs.rmSync(tmp,{force:true});}
console.log('WAIT reasons installed. Restart Start-Phone Private.');
