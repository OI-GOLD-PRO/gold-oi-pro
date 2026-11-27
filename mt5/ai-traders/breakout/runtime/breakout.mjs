export function candles(rows, minimum) {
  if (!Array.isArray(rows) || rows.length < minimum || rows.length > 200) return null;
  let previous = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 5 || !row.every(Number.isFinite)) return null;
    const [time, open, high, low, close] = row;
    if (!Number.isSafeInteger(time) || time <= previous || low <= 0 ||
        high < Math.max(open, close) || low > Math.min(open, close)) return null;
    previous = time;
  }
  return rows;
}

const average = xs => xs.reduce((a,b)=>a+b,0)/xs.length;
const atr = bars => average(bars.slice(-15).slice(1).map((r,i)=>{
  const prior=bars.slice(-15)[i][4];
  return Math.max(r[2]-r[3],Math.abs(r[2]-prior),Math.abs(r[3]-prior));
}));

function trend(bars) {
  if (bars.length<32) return 'SIDEWAYS';
  const closes=bars.map(r=>r[4]), tail=closes.slice(-13);
  const distance=tail.slice(1).reduce((s,c,i)=>s+Math.abs(c-tail[i]),0);
  const fast=average(closes.slice(-8)), slow=average(closes.slice(-24));
  const slope=fast-average(closes.slice(-12,-4));
  const efficiency=distance?Math.abs(tail.at(-1)-tail[0])/distance:0;
  const minSlope=0.12*atr(bars);
  if (efficiency>=0.25 && fast>slow && slope>minSlope && closes.at(-1)>slow) return 'BUY';
  if (efficiency>=0.25 && fast<slow && slope< -minSlope && closes.at(-1)<slow) return 'SELL';
  return 'SIDEWAYS';
}

function range(bars,tf) {
  const sample=bars.slice(-8), high=Math.max(...sample.map(r=>r[2])),low=Math.min(...sample.map(r=>r[3]));
  const unit=atr(bars), width=high-low;
  const touches=(index,edge)=>sample.map((r,i)=>Math.abs(r[index]-edge)<=unit*0.30?i:-1).filter(i=>i>=0);
  const separated=t=>t.length>=2 && t.at(-1)-t[0]>=2;
  return {at:sample[0][0],low,high,tf,unit,status:'active',quality:unit>0 && width>=unit && width<=4*unit &&
    separated(touches(2,high)) && separated(touches(3,low))};
}

export function evaluateBreakout(m) {
  const regime=trend(m.m15), now=m.m5.at(-1);
  const fallback=range(m.m5,'M5');
  const result={regime,zones:[fallback],markers:[],plan:null};
  const finish=(reason,stage,text)=>({...result,reason,note:reason,next:stage?{stage,text}:null});
  if(regime==='SIDEWAYS') return finish('M15 ยังเป็นไซด์เวย์','trend','รอให้ M15 ยืนยันเทรนด์ก่อน แล้วจึงหาเบรกตามทิศนั้น');
  const sign=regime==='BUY'?1:-1;
  for(const [tf,bars,seconds] of [['M15',m.m15,900],['M5',m.m5,300]]) {
    for(let i=bars.length-1;i>=bars.length-5;i--){
      const b=bars[i], end=b[0]+seconds;
      if(now[0]+300-end>1200 || end>now[0]+300) continue;
      const before=bars.slice(0,i), z=range(before,tf);
      if(!z.quality || before.at(-1)[0]+seconds!==b[0]) continue;
      const level=sign>0?z.high:z.low, buffer=Math.max(z.unit*.12,2*(m.ask-m.bid));
      const body=sign*(b[4]-b[1]), spread=b[2]-b[3];
      if(sign*(b[4]-level)<buffer || body<.55*spread || body<.55*z.unit ||
        sign*((sign>0?b[2]:b[3])-b[4])>.25*spread) continue;
      const previousTrend=trend(m.m15.filter(r=>r[0]+900<=b[0]));
      if(previousTrend!==regime) continue;
      const marker={kind:tf+' Break',side:regime,pivotAt:z.at,at:end-300,level};
      Object.assign(z,{endAt:end,status:'active',side:regime});
      result.zones=[z];result.markers=[marker];
      const after=m.m5.filter(r=>r[0]>=end);
      if(after.some((r,k)=>r[0]!==end+300*k || sign*(r[4]-level)<=0)){
        z.status='invalid';return finish('ยกเลิกเบรก ราคาเสียระดับหรือข้อมูลขาดช่วง','invalid','รอกรอบใหม่และแท่งปิดเบรกที่มีข้อมูลต่อเนื่อง');
      }
      const retest=after.find(r=>sign*((sign>0?r[3]:r[2])-level)<=.20*m.atr &&
        sign*(r[4]-level)>=.08*m.atr && sign*(r[4]-r[1])>0);
      if(!retest) return finish('พบ '+tf+' เบรก '+level.toFixed(2),'retest','ให้ M5 ย่อทดสอบ '+level.toFixed(2)+' แล้วปิด'+(sign>0?'เหนือ':'ใต้')+'ระดับนี้ตามทิศเบรก');
      result.markers.push({...marker,kind:'Retest',at:retest[0],pivotAt:marker.at});
      if(retest!==now) return finish('Retest ผ่านไปแล้ว','missed','รอกรอบและจุด Retest ใหม่');
      z.status='confirmed';
      const entry=sign>0?m.ask:m.bid;
      if(sign*(entry-level)<=0 || sign*(entry-level)>1.2*m.atr) return finish('ราคาปัจจุบันเสียระดับหรือไกลจุดเบรกเกินไป','price','รอสัญญาณใหม่ที่ราคาเข้าอยู่ในระยะอนุญาตจากจุดเบรก');
      const extreme=sign>0?Math.min(level,retest[3]):Math.max(level,retest[2]);
      const distance=Math.max(sign*(entry-extreme)+.15*m.atr,m.min_sl_points*m.point,m.min_sl_atr*m.atr);
      if(distance>m.max_sl_atr*m.atr) return finish('SL หลังจุดทดสอบเกินเพดาน EA','stop','รอเบรกและ Retest ที่ระยะ SL อยู่ในเพดาน EA');
      const rr=Math.min(m.max_rr,Math.max(2,m.min_rr+.2));
      result.plan={side:regime,tf,entry,level,invalidation:level,sl:entry-sign*distance,tp:entry+sign*distance*rr,rr};
      return finish(tf+' เบรกตามเทรนด์ M15 และ M5 ยืนยัน Retest ที่ '+level.toFixed(2));
    }
  }
  const levels = [fallback, range(m.m15,'M15')].filter(z => z.quality)
    .map(z => z.tf + ' ' + (sign>0?z.high:z.low).toFixed(2));
  return finish('เทรนด์ M15 เป็นฝั่ง '+regime,'break','รอแท่งปิด'+(sign>0?'เหนือ':'ใต้')+'กรอบสะสม'+
    (levels.length ? ' '+levels.join(' หรือ ') : ' M5 หรือ M15 ที่ผ่านเกณฑ์')+' ด้วยแรงตามเทรนด์');
}
