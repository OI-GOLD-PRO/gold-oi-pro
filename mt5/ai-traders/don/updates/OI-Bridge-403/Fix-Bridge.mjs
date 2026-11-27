import fs from 'node:fs';
const file = new URL('./server.mjs', import.meta.url);
const source = fs.readFileSync(file,'utf8');
const before = "  if (!/^127[.]0[.]0[.]1:\\d+$/.test(req.headers.host||''))";
const after = "  const localEaRequest = req.method === 'POST' && req.url === '/api/demo/decision' &&\n    req.socket.remoteAddress === '127.0.0.1' && !req.headers.origin &&\n    ['127.0.0.1', 'localhost', 'localhost:' + req.socket.localPort].includes(req.headers.host);\n  if (!localEaRequest && !/^127[.]0[.]0[.]1:\\d+$/.test(req.headers.host||''))";
if(source.includes('const localEaRequest =')) console.log('Already updated');
else if(source.split(before).length !== 2) throw Error('Different server version. No changes made.');
else {
  fs.copyFileSync(file,new URL('./server.before-ea-host.mjs',import.meta.url),fs.constants.COPYFILE_EXCL);
  const temp=new URL('./server.ea-update.tmp',import.meta.url);
  fs.writeFileSync(temp,source.replace(before,()=>after),{flag:'wx'});
  fs.renameSync(temp,file);
  console.log('Updated. Restart Start-Phone.');
}
