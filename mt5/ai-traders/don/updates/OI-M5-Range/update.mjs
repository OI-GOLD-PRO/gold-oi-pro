import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const file = 'demo.mjs';
const src = fs.readFileSync(file,'utf8');
if (src.includes('function sidewaysBox(m)')) {
  console.log('Already installed');
  process.exit(0);
}
const anchor = '      const [oi,flow]=await Promise.all(';
if (src.split(anchor).length !== 2 || !src.includes('const bar=m.candles.at(-1)[0], key=') || !src.includes('appendFile(logPath')) throw Error('Unsupported demo.mjs');
const helper = fs.readFileSync(new URL('range.txt',import.meta.url),'utf8');
const gate = `      const box = sidewaysBox(m);
      if (box) {
        const reason = 'ไซด์เวย์ M5 รอราคาปิดนอกกรอบ ' + box.low + ' – ' + box.high;
        await appendFile(logPath, JSON.stringify({key,at:new Date().toISOString(),action:'WAIT',reason})+'\\n',{mode:0o600});
        return send(200,{action:'WAIT',reason});
      }
`;
const temp = '.range-'+randomUUID()+'.mjs';
try {
  fs.writeFileSync(temp, helper+'\n'+src.replace(anchor,gate+anchor));
  execFileSync(process.execPath,['--check',temp]);
  fs.copyFileSync(file,file+'.before-range-'+Date.now()+'.bak',fs.constants.COPYFILE_EXCL);
  fs.renameSync(temp,file);
} finally { fs.rmSync(temp,{force:true}); }
console.log('Installed. Restart the dashboard bridge.');
