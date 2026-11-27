import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const dir=process.argv[2]||path.join(process.env.LOCALAPPDATA,'OI Gold AI Trader','release-2403511213','ai-trader');
const changes=[];
function patch(name,rules){
 const file=path.join(dir,name);
 let text=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
 for(const [before,after] of rules){
   if(after && text.includes(after))continue;
   if(!after && !text.includes(before) && text.includes("const targets=rrOK?" ) && !text.includes("normal:'2R'"))continue;
   if(text.split(before).length!==2)throw Error('Unsupported version: '+name);
   text=text.replace(before,()=>after);
 }
 if(text!==fs.readFileSync(file,'utf8'))changes.push({file,text});
}
patch('oi-go-decision.mjs',[
 ['const side=market.allowedEntrySide;',`const rrOK=Number.isFinite(market.min_rr)&&Number.isFinite(market.max_rr)&&market.min_rr>0&&market.max_rr>=market.min_rr;
  if(!rrOK && !market.position)return {action:'WAIT',reason:'รอช่วง Min/Max RR จาก EA 1.25'};
  const side=rrOK?market.allowedEntrySide:null;
  const targets=rrOK?[...new Set([market.min_rr,...[1.2,2,3].filter(r=>r>market.min_rr&&r<market.max_rr),market.max_rr])]:[];`],
 [",\n    target:question('Choose reward to risk based on nearby levels.',{near:'1.2R',normal:'2R',far:'3R'})",""],
 ["  if(hasPosition) qs.reduce=",`  if(entry && targets.length>1)qs.target=question('Choose a reward/risk target justified by nearby levels within MT5 limits.',Object.fromEntries(targets.map((v,i)=>['r'+i,v+'R'])));
  if(hasPosition) qs.reduce=`],
 ["result.rr={near:1.2,normal:2,far:3}[pick('target')];","result.rr=targets.length===1?targets[0]:targets[Number(pick('target').slice(1))];"]
]);
patch('demo.mjs',[
 ['d.rr<1.2||d.rr>4',"(goDecision.enabled ? !(Number.isFinite(m.min_rr)&&Number.isFinite(m.max_rr)&&m.min_rr>0&&d.rr>=m.min_rr&&d.rr<=m.max_rr) : (d.rr<1.2 || d.rr>4))"]
]);
const stamp=Date.now();
for(const item of changes){
 item.tmp=item.file+'.'+stamp+'.mjs';
 fs.writeFileSync(item.tmp,item.text,{flag:'wx'});
 execFileSync(process.execPath,['--check',item.tmp]);
 fs.copyFileSync(item.file,item.file+'.before-rr-'+stamp);
}
for(const item of changes)fs.renameSync(item.tmp,item.file);
console.log('RR bridge ready. Compile EA 1.25 and restart Start-Phone Private.');
