const assert=require('node:assert/strict');const {calculate,classify}=require('../sideways.js');
const bars=Array.from({length:100},(_,i)=>({time:i*300,high:101+i,low:99+i,close:100+i}));
let r=calculate(bars,30000);assert.equal(r.adx,100);assert.equal(r.state,'trend');
const reverse=bars.map(b=>({...b,high:202-b.low,low:202-b.high,close:202-b.close}));assert.equal(calculate(reverse,30000).state,'trend');
const sideways=bars.map(b=>({...b,high:101,low:99,close:100}));r=calculate(sideways,30000);assert.equal(r.chop,100);assert.equal(r.adx,0);assert.equal(r.state,'range');
const flat=bars.map(b=>({...b,high:100,low:100,close:100}));assert.equal(calculate(flat,30000).state,'unknown');
assert.equal(calculate(bars.slice(0,27),30000),null);
assert.deepEqual(calculate([...bars,{time:30000,high:9999,low:0,close:500}],30100),calculate(bars,30100));
assert.equal(classify(61.8,19),'mixed');assert.equal(classify(70,20),'mixed');assert.equal(classify(38.2,30),'mixed');assert.equal(classify(20,25),'mixed');
const hand=[10,12,11,13].map((c,i)=>({time:i*300,high:c+1,low:c-1,close:c}));
assert(Math.abs(calculate(hand,1200,2).adx-(100/3+500/7)/2)<1e-10);
const bad=bars.map(b=>({...b}));bad[50].high=NaN;assert.equal(calculate(bad,30000),null);
console.log('PASS: Wilder ADX hand calculation, up/down trends, range, flat/missing data, exact thresholds, warmup, exclusion of forming M5');

const {history,zonesFrom}=require('../sideways.js');
const historyPoints=history(bars,30000);
assert.deepEqual(history(bars.slice(0,60),18000),historyPoints.slice(0,33));
const rangePoints=history(sideways,30000);
assert.deepEqual(zonesFrom(rangePoints),[{start:8100,end:29700,high:101,low:99,count:73}]);
const groups=zonesFrom([
 {time:0,high:10,low:8,state:'mixed'},
 {time:300,high:11,low:9,state:'range'},
 {time:600,high:12,low:7,state:'range'},
 {time:900,high:100,low:0,state:'mixed'},
 {time:1200,high:13,low:8,state:'range'},
 {time:1800,high:14,low:6,state:'range'}
]);
assert.deepEqual(groups,[{start:300,end:600,high:12,low:7,count:2},{start:1200,end:1200,high:13,low:8,count:1},{start:1800,end:1800,high:14,low:6,count:1}]);
console.log('PASS: historical prefix stability, warmup, grouped wick bounds, end and gap splitting');
