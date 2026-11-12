const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const el=()=>({value:'',textContent:'',disabled:false,parentElement:{after(){}},innerHTML:''});
const nodes=Object.fromEntries(['topic','oiAccessCode','oiDataStatus','oiDataPreview','oiFetchData','oiClearData'].map(k=>[k,el()]));
let fixture,requests=[];
const ctx={document:{getElementById:k=>nodes[k],createElement:el},URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date,console,fetch:async(u)=>{requests.push(u);return{ok:true,json:async()=>fixture}}};
vm.runInNewContext(fs.readFileSync('launcher/oi-data-check.js','utf8'),ctx);
(async()=>{
 await nodes.oiFetchData.onclick();assert.equal(requests.length,0);
 nodes.oiAccessCode.value='SECRET-CODE';nodes.topic.value='My question';
 fixture={stamp:'2026-11-12',levels:[{strike:4100,call:200,put:100}],cfg:{contract:'GC',volume:'{"4100":12}',dash:'{"updated":"2026-11-12","bias":"up","token":"SECRET-TOKEN"}',gc_price:4102}};
 await nodes.oiFetchData.onclick();assert(nodes.topic.value.startsWith('My question'));assert(nodes.topic.value.includes('dashboard_analysis'));assert(!nodes.topic.value.includes('SECRET'));assert.equal(requests[0].searchParams.get('sym'),'gold');
 await nodes.oiFetchData.onclick();assert.equal(nodes.topic.value.split('[OI_GOLD_DATA_BEGIN]').length,2);
 fixture={error:'auth'};await nodes.oiFetchData.onclick();assert.equal(nodes.topic.value,'My question');assert(nodes.oiDataStatus.textContent.includes('รหัส'));
 fixture={levels:[],cfg:{dash:'broken'}};await nodes.oiFetchData.onclick();assert.equal(nodes.topic.value,'My question');assert(nodes.oiDataStatus.textContent.includes('JSON'));
 nodes.oiClearData.onclick();assert.equal(nodes.oiAccessCode.value,'');
 console.log('PASS: missing auth, snapshot attachment, secret exclusion, repeat fetch, auth failure clears stale data, malformed JSON, clear');
})().catch(e=>{console.error(e);process.exitCode=1});
