// Historical OI Zones API helper. Call from the existing authenticated doGet router:
// if (e.parameter.api === 'oi_history') return oiHistoryResponse_();
// IMPORTANT: enforce the same auth code/expiry checks as api=data BEFORE calling this helper.
// Deploy Apps Script web app again after adding the route.
function oiHistoryResponse_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const byDay = {};
  const backup = ss.getSheetByName('oi_backup');
  if (backup && backup.getLastRow() > 1) {
    const rows = backup.getRange(2,1,backup.getLastRow()-1,29).getValues();
    const groups = {};
    rows.forEach(r => {
      const id = String(r[0] || ''), part = Number(r[25]), parts = Number(r[26]);
      if (!id || !(part>=1) || !(parts>=1) || !r[28]) return;
      const g = groups[id] || (groups[id]={parts:parts,rows:[]});
      if(g.parts!==parts)return;
      g.rows[part-1]=String(r[28]);
    });
    Object.keys(groups).sort().forEach(id=>{
      const g=groups[id];if(g.rows.filter(Boolean).length!==g.parts)return;
      try {
        const raw=g.rows.join('');
        const sha=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw,Utilities.Charset.UTF_8)
          .map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
        const meta=rows.find(r=>String(r[0])===id);
        if(!meta||sha!==String(meta[27]))return;
        const obj=JSON.parse(raw),p=obj.payload||{},date=String(obj.captured_th||'').slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
        const strikes={};
        (p.rows||[]).forEach(r=>{
          const k=Number(r[0]),side=r[1],oi=r[11];
          if(!isFinite(k)||!['P','C'].includes(side))return;
          const a=strikes[k]||(strikes[k]={strike:k,p:null,c:null});
          if(typeof oi==='number'&&isFinite(oi))a[side.toLowerCase()]=oi;
        });
        const item={date:date,contract:String(meta[3]||''),captured_th:String(meta[1]||''),
          source_updated_th:String(meta[6]||''),status:String(meta[8]||''),rows:Object.values(strikes)};
        if(!byDay[date]||item.captured_th>byDay[date].captured_th)byDay[date]=item;
      }catch(err){console.warn('oi_history skip snapshot',id,err);}
    });
  }
  const recovered=ss.getSheetByName('oi_recovered');
  if(recovered&&recovered.getLastRow()>1){
    const rr=recovered.getRange(2,1,recovered.getLastRow()-1,10).getValues();
    rr.forEach(r=>{
      const date=String(r[0]||'').slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||byDay[date])return;
      const strike=Number(r[4]),oi=Number(r[5]),side=String(r[6]||'').toUpperCase();
      if(!isFinite(strike)||!isFinite(oi)||!['P','C'].includes(side))return;
      const item=byDay[date]||(byDay[date]={date:date,contract:String(r[3]||''),captured_th:String(r[1]||''),
        status:'RECOVERED_PARTIAL',rows:[]});
      let a=item.rows.find(x=>x.strike===strike);
      if(!a){a={strike:strike,p:null,c:null};item.rows.push(a);}
      a[side.toLowerCase()]=oi;
    });
  }
  return ContentService.createTextOutput(JSON.stringify({days:Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date)),
    warning:'Snapshots are historical observations; recovered rows may be incomplete'}))
    .setMimeType(ContentService.MimeType.JSON);
}
