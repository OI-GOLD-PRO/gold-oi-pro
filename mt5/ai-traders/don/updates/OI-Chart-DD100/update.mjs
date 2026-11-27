import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const edits = [];
function edit(name, transform) {
  const file = path.join(root, name);
  const original = fs.readFileSync(file, 'utf8');
  const updated = transform(original);
  edits.push({file, original, updated});
}
function replace(source, pattern, value) {
  if (!pattern.test(source)) throw Error('Unsupported version: '+pattern);
  return source.replace(pattern, value);
}
for (const file of ['index.html','owner.html']) {
  edit(file, s => replace(s, /(<input\b[^>]*name="daily"[^>]*max=")(?:20|100)(")/, '$1'+'100'+'$2'));
}
edit('demo.mjs', s => {
  s = replace(s,/p\.daily\s*>\s*(?:20|100)\b/,'p.daily>100');
  if (s.includes('chartPositions:')) return s;
  return replace(s,/lastContact\s*=\s*\{(?=at:)/,'lastContact={chartPositions:(Array.isArray(m.chartPositions)?m.chartPositions:[m.position]).filter(p=>p && ["BUY","SELL"].includes(p.side) && Number.isFinite(p.entry) && p.entry>0).map(({side,entry,tp,sl})=>({side,entry,tp,sl})),');
});
const snapshot = String.raw` s+=",\"chartPositions\":[";
 bool firstPosition=true;
 for(int j=0;j<PositionsTotal();j++){
  if(PositionGetTicket(j)==0 || !IsOwn())continue;
  if(!firstPosition)s+=",";
  firstPosition=false;
  string direction=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?"BUY":"SELL";
  s+="{\"side\":\""+direction+"\",\"entry\":"+DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN),_Digits)+",\"sl\":"+DoubleToString(PositionGetDouble(POSITION_SL),_Digits)+",\"tp\":"+DoubleToString(PositionGetDouble(POSITION_TP),_Digits)+"}";
 }
 s+="]";
`;
for (const file of ['OI_Trader_Live.mq5','OI_Trader_Demo.mq5']){
  edit(file,s=>{
    s=replace(s,/InpDailyLossPercent\s*>\s*(?:20|100)\b/,'InpDailyLossPercent>100').replace(/(InpDailyLossPercent must be above 0 and at most )20/,'$1100');
    if(!s.includes('chartPositions')) s=replace(s,/ return s\+"[^\n]*AccountInfoInteger\(ACCOUNT_LOGIN\)/,m=>snapshot+m);
    return s;
  });
}
edit('viewer.js',s=>{
  if(s.includes('const chartLevels'))return s;
  const start=s.indexOf('  const low=Math.min',s.indexOf('function drawChart'));
  const end=s.indexOf('  rows.forEach',start);
  if(start<0||end<0)throw Error('Unsupported chart layout');
  return s.slice(0,start)+`  const chartLevels=[];
  for(const [index,p] of (contact.chartPositions||[]).entries()){
    for(const [label,price,color] of [[p.side,p.entry,'#ecc778'],['TP',p.tp,'#54d8a6'],['SL',p.sl,'#ff9191']]){
      if(Number.isFinite(price)&&price>0)chartLevels.push({price,color,text:(contact.chartPositions.length>1?(index+1)+' ':'')+label+' '+price});
    }
  }
  const prices=chartLevels.map(level=>level.price);
  const low=Math.min(...rows.map(r=>r[3]),...prices),high=Math.max(...rows.map(r=>r[2]),...prices);
  const pad=10*scale;
  const y=price=>pad+(high-price)/(high-low||1)*(canvas.height-2*pad);
  ctx.font=(11*scale)+'px sans-serif';
  const labelWidth=chartLevels.length?Math.max(...chartLevels.map(l=>ctx.measureText(l.text).width))+8*scale:0;
  const plotWidth=canvas.width-labelWidth;
  const step=plotWidth/rows.length;
  ctx.textBaseline='middle';
  let labelBottom=0;
  for(const level of chartLevels.sort((a,b)=>b.price-a.price)){
    const lineY=y(level.price);
    ctx.strokeStyle=ctx.fillStyle=level.color;
    ctx.setLineDash([4*scale,3*scale]);
    ctx.beginPath();ctx.moveTo(0,lineY);ctx.lineTo(plotWidth,lineY);ctx.stroke();
    const labelY=Math.max(lineY,labelBottom+7*scale);
    ctx.fillText(level.text,plotWidth+3*scale,labelY);
    labelBottom=labelY+6*scale;
  }
  ctx.setLineDash([]);
`+s.slice(end);
});
for(const {file,original,updated} of edits){
  if(original===updated)continue;
  if(!fs.existsSync(file+'.before-chart'))fs.copyFileSync(file,file+'.before-chart');
  fs.writeFileSync(file,updated);
}
console.log('Updated dashboard and EA source in '+root);
