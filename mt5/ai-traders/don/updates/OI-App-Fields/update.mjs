import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const updates=[];
for(const file of ['owner.html','index.html','demo.mjs']){
  const src=fs.readFileSync(file,'utf8');
  let next=src;
  if(file.endsWith('.html')){
    for(const name of ['perTrade','total','daily','positions']){
      const field=new RegExp('<input\\b(?=[^>]*\\bname=["\']'+name+'["\'])[^>]*>','i');
      if(!field.test(next)) throw Error('Missing field '+name+' in '+file);
      next=next.replace(field,tag=>tag.replace(/\s(?:max|min|step)=["'][^"']*["']/gi,'').replace(/>$/,name==='positions'?' min="1" step="1">':' min="0" step="any">'));
    }
  }else{
    const validation=/(!Number\.isInteger\(p\.positions\))[\s\S]*?(?=\)\s*throw Error\('Invalid risk limits'\))/;
    const old=src.match(validation)?.[0];
    if(!old || old.includes(';') || old.length>600) throw Error('Unsupported policy validator');
    next=src.replace(validation,'!Number.isSafeInteger(p.positions) || p.positions<1 ||\n      ![p.perTrade,p.total,p.daily].every(x=>Number.isFinite(x) && x>0)');
    next=next.replace(/limitCount:\s*p\.positions\b/g,'limitCount:Math.min(p.positions,2147483647)');
  }
  if(next!==src) updates.push({file,src,next});
}
for(const {file,src,next} of updates){
  if(!fs.existsSync(file+'.before-app-fields')) fs.writeFileSync(file+'.before-app-fields',src,{flag:'wx'});
  fs.writeFileSync(file,next);
}
console.log('Dashboard settings updated: '+root);
