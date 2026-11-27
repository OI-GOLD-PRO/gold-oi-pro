import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const dir=process.argv[2]||path.join(process.env.LOCALAPPDATA,'OI Gold AI Trader','release-2403511213','ai-trader');
const asset=n=>fs.readFileSync(new URL(n,import.meta.url),'utf8');
function insert(s,re,fn){if([...s.matchAll(new RegExp(re.source,'g'))].length!==1)throw Error('Unsupported dashboard build: '+re);return s.replace(re,fn);}
const changes=[];
for(const name of ['owner.html','viewer.html','journal.mjs']){
 const file=path.join(dir,name),old=fs.readFileSync(file,'utf8');let s=old;
 if(name.endsWith('html') && !s.includes('<title>OI GOLD · AI Trader 1.28</title>')){
   const modal=s.match(/<dialog\b[^>]*\bid=["']settings["'][^>]*>[\s\S]*?<\/dialog>/i)?.[0]||'';
   if(name==='owner.html'&&!modal)throw Error('Settings dialog missing; installation stopped.');
   s=asset('page.html').replace('<!--SETTINGS-->',()=>modal).replace('/*SCRIPT*/',()=>asset('app.js'));
 }
 if(name==='journal.mjs'&&!s.includes('// oi-dashboard-positions')){
   s=insert(s,/export\s+async\s+function\s+dailyJournal\s*\(/,()=> 'async function oiOriginalDailyJournal(');
   s+='\n'+asset('positions.txt');

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
console.log('Dashboard 1.28 ready. Restart Start-Phone Private and refresh the phone.');
