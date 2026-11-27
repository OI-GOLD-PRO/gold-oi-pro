import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const dir=process.argv[2], file=path.join(dir,'demo.mjs');
let src=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
if(!src.includes('m.allowedEntrySide = allowedDonSide;'))throw Error('OI-M5-DON-Side bridge required');
const marker="import * as goDecision from './oi-go-decision.mjs';";
const stamp=Date.now();
function install(dest,code){
 const tmp=dest+'.'+stamp+'.mjs';
 try {
  fs.writeFileSync(tmp,code,{flag:'wx'});
  execFileSync(process.execPath,['--check',tmp]);
  if(fs.existsSync(dest)) fs.copyFileSync(dest,dest+'.backup-'+stamp);
  fs.renameSync(tmp,dest);
 }finally{fs.rmSync(tmp,{force:true});}
}
if(!src.includes(marker)){
 const gate=/\|\| !(process\.env\.DEEPSEEK_API_KEY|ai\.key)\) return send\(200,wait\);/;
 const block=/      const response=await fetch\([^\n]+\n[\s\S]*?      const d=JSON\.parse\(choice\.message\.content\);/;
 if(!gate.test(src)||!block.test(src))throw Error('Unrecognized decision handler');
 src=marker+'\n'+src.replace(gate,'|| (!goDecision.enabled && !$1)) return send(200,wait);').replace(block,old=>'      let d;\n      if(goDecision.enabled){\n        d=await goDecision.decide({market:m,options:oi,order_flow:flow,policy:p});\n      } else {\n'+old.replace('const d=JSON.parse','d=JSON.parse')+'\n      }');
}
install(path.join(dir,'oi-go-decision.mjs'),fs.readFileSync(new URL('./decision.mjs',import.meta.url)));
if(!fs.readFileSync(file,'utf8').includes(marker)) install(file,src);
