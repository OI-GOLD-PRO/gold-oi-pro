import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
const plans = [];
for (const name of ['server.mjs','demo.mjs']) {
  const file = path.join(dir,name);
  const old = fs.readFileSync(file,'utf8');
  if (old.includes("import { ai } from './oi-provider.mjs';")) continue;
  const patterns = [
    [/'https:\/\/api\.deepseek\.com\/chat\/completions'/g, 'ai.url'],
    [/process\.env\.DEEPSEEK_MODEL\s*\|\|\s*'deepseek-flash'/g, 'ai.model'],
    [/process\.env\.DEEPSEEK_API_KEY/g, 'ai.key']
  ];
  let code = old;
  for (const [pattern,value] of patterns) {
    if (!code.match(pattern)) throw Error('Unsupported bridge version in ' + name + ' (' + value + ')');
    code = code.replace(pattern,value);
  }
  code = "import { ai } from './oi-provider.mjs';\n" + code.replace(/'DeepSeek HTTP '/g,"ai.name + ' HTTP '").replace(/'DeepSeek ตอบ HTTP '/g,"ai.name + ' HTTP '");
  plans.push({file,code});
}
const helper = path.join(dir,'oi-provider.mjs');
plans.unshift({file:helper,code:fs.readFileSync(fileURLToPath(new URL('./provider.mjs',import.meta.url)),'utf8')});
const stamp = Date.now();
for (const p of plans) {
  p.temp = p.file + '.' + stamp + '.mjs';
  fs.writeFileSync(p.temp,p.code,{flag:'wx'});
  execFileSync(process.execPath,['--check',p.temp]);
}
for (const p of plans) {
  if (fs.existsSync(p.file)) fs.copyFileSync(p.file,p.file + '.before-go-' + stamp);
  fs.renameSync(p.temp,p.file);
}
