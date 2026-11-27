import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const dir=process.argv[2]||path.join(process.env.LOCALAPPDATA,'OI Gold AI Trader','release-2403511213','ai-trader');
const asset=n=>fs.readFileSync(new URL(n,import.meta.url),'utf8');
function insert(s,re,fn){if([...s.matchAll(new RegExp(re.source,'g'))].length!==1)throw Error('Unsupported dashboard build: '+re);return s.replace(re,fn);}
const changes=[];
for(const name of ['owner.html','viewer.html','viewer.js','journal.mjs']){
 const file=path.join(dir,name),old=fs.readFileSync(file,'utf8');let s=old;
 if(name.endsWith('html')&&!s.includes('oi-dashboard-127'))s=insert(s,/<main\b/i,m=>asset('theme.css')+m);
 if(name==='viewer.js'&&!s.includes('function oiTradeCards(')){
   s=insert(s,/function drawChart\(contact\)\s*\{/,m=>m+'\n  oiMetrics(contact);');
   s=insert(s,/if\(n!==serial\)return;/,m=>m+'\n    oiTradeCards(j);');
   s=insert(s,/if\(n===serial\)\{/,m=>m+"document.getElementById('oi-positions')?.remove();");
   s+='\n'+asset('ui.js');
 }
 if(name==='journal.mjs'&&!s.includes('// oi-dashboard-positions')){
   s=insert(s,/return \{ currency, first, last, day: selected, rows,/,()=>asset('positions.txt')+'  return { opened, currency, first, last, day: selected, rows,');
 }
 if(old!==s)changes.push({file,old,s});
}
const done=[],stamp=Date.now();
try{
 for(const c of changes){
   const tmp=c.file+'.'+stamp+path.extname(c.file);
   fs.writeFileSync(tmp,c.s,{flag:'wx'});c.tmp=tmp;
   if(/\.m?js$/.test(c.file))execFileSync(process.execPath,['--check',tmp]);
   fs.copyFileSync(c.file,c.file+'.before-dashboard-'+stamp);
 }
 for(const c of changes){fs.renameSync(c.tmp,c.file);done.push(c);}
}catch(e){for(const c of done.reverse())fs.writeFileSync(c.file,c.old);throw e;}
finally{for(const c of changes)if(c.tmp)fs.rmSync(c.tmp,{force:true});}
console.log('Dashboard 1.27 ready. Restart Start-Phone Private and refresh the phone.');
