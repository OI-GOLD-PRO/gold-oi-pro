const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),{webcrypto,createHash}=require('node:crypto');
const loader=fs.readFileSync('launcher/update-loader-built.js','utf8');
function packet(version='1.0.1'){
 const code='window.testRelease="'+version+'";';const sha256=createHash('sha256').update(code).digest('hex');return{schema:1,version,code,sha256,file:'ui-'+sha256+'.js'};
}
async function run(network,cached){
 const elements={};const element=()=>({textContent:'',style:{},setAttribute(){},append(){},prepend(){},parentElement:{after(){}}});
 for(const k of ['side','topic','oiDataStatus','oiDataPreview','oiFetchData','oiClearData'])elements[k]=element();
 elements.topic.value='';
 const memory={};if(cached)memory['oi-roundtable-ui-cache-v1']=JSON.stringify(cached);
 let ctx;const document={getElementById:k=>elements[k],createElement:element,head:{append(){}},body:{append(s){vm.runInContext(s.textContent,ctx)}}};
 ctx=vm.createContext({document,window:{},matchMedia:()=>({matches:false}),TextEncoder,crypto:webcrypto,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date,
 localStorage:{getItem:k=>memory[k]??null,setItem:(k,v)=>memory[k]=v},fetch:network});
 await vm.runInContext(loader,ctx);
 return {ctx,memory};
}
(async()=>{
 const p=packet();const success=async u=>({ok:true,text:async()=>u.includes('manifest.json')?JSON.stringify(p):p.code});
 let r=await run(success);assert.equal(r.ctx.window.testRelease,'1.0.1');assert.equal(JSON.parse(r.memory['oi-roundtable-ui-cache-v1']).sha256,p.sha256);
 r=await run(async()=>{throw Error('offline')},p);assert.equal(r.ctx.window.testRelease,'1.0.1');assert(r.ctx.window.__oiUIReady);
 r=await run(async()=>{throw Error('offline')},{...p,code:'window.bad=true'});assert.equal(r.ctx.window.bad,undefined);assert(r.ctx.window.__oiUIReady);
 r=await run(async u=>({ok:true,text:async()=>u.includes('manifest')?JSON.stringify(p):'window.bad=true'}));assert.equal(r.ctx.window.bad,undefined);assert(r.ctx.window.__oiUIReady);
 const malformed={...p,file:'https://evil.invalid/script.js'};let urls=[];
 r=await run(async u=>{urls.push(u);return{ok:true,text:async()=>JSON.stringify(malformed)}});assert.equal(urls.length,1);assert(r.ctx.window.__oiUIReady);
 console.log('PASS: online release, verified cache, corrupted cache rejection, hash mismatch fallback, fixed-origin filename validation');
})().catch(e=>{console.error(e);process.exitCode=1});
