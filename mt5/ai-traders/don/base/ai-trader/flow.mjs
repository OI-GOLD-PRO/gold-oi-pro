// One complete closed M5 bar, expressed in Binance XAUUSDT prices and quantities.
export async function orderFlow(now=Date.now(), request=fetch) {
  const end=Math.floor(now/300000)*300000, start=end-300000;
  const levels=new Map(), large=[];
  let previous=null, buy=0, sell=0, trades=0;
  const threshold=Number(process.env.OI_BIG_TRADE_MIN||5);
  if(!(threshold>0)) throw Error('Invalid big trade threshold');
  for(let page=0;page<12;page++) {
    const params=new URLSearchParams({symbol:'XAUUSDT',limit:'1000'});
    if(previous===null){params.set('startTime',start);params.set('endTime',end-1);}
    else params.set('fromId',previous+1);
    const response=await request('https://fapi.binance.com/fapi/v1/aggTrades?'+params,{signal:AbortSignal.timeout(3500)});
    if(!response.ok) throw Error('Trade feed unavailable');
    const rows=await response.json();
    if(!Array.isArray(rows)) throw Error('Invalid trade feed');
    let complete=rows.length<1000;
    for(const r of rows){
      if(!Number.isSafeInteger(r.T)||r.T<start||!Number.isSafeInteger(r.a)||(previous!==null&&r.a!==previous+1))throw Error('Trade history gap');
      if(r.T>=end){complete=true;break;}
      const px=Number(r.p),qty=Number(r.q);
      if(!(px>0&&qty>0&&Number.isFinite(qty)&&Number.isFinite(px))||typeof r.m!=='boolean')throw Error('Invalid trade');
      previous=r.a;trades++;
      const key=Math.floor(px*10+1e-8)/10;
      const level=levels.get(key)||{price:key,buy:0,sell:0};
      if(r.m){sell+=qty;level.sell+=qty;}else{buy+=qty;level.buy+=qty;}
      levels.set(key,level);
      if(qty>=threshold)large.push({price:px,qty,side:r.m?'sell':'buy',time:r.T});
    }
    if(complete)return {source:'Binance XAUUSDT',start,end,trades,buy,sell,delta:buy-sell,
      big_trade_threshold:threshold,big_trades:large,footprint_volume_profile:[...levels.values()].sort((a,b)=>a.price-b.price)};
  }
  throw Error('Trade history incomplete');
}
