"use strict";
const form=document.getElementById("riskForm"), message=document.getElementById("riskMessage");
async function updateBridge(fill=false) {
  const r=await fetch('./api/demo/status',{cache:'no-store'});
  if(!r.ok)throw Error('โหลดสถานะไม่ได้');
  const data=await r.json();
  if(fill)for(const [key,value] of Object.entries(data.policy)){
    const el=form.elements.namedItem(key);
    if(el.type==='checkbox')el.checked=value;else el.value=value;
  }
  const online=data.lastContact && Date.now()-Date.parse(data.lastContact.at)<360000;
  document.querySelector('#bridgeState').textContent=online?'เชื่อมต่อแล้ว':'รอ MT5 Demo';
  document.querySelector('#tradeState').textContent=data.policy.enabled?'อนุญาต Demo':'ปิด';
  document.querySelector('#positionsCount').textContent=online?data.lastContact.count:'—';
  const feed=document.querySelector('#decisionFeed');
  feed.replaceChildren(...data.recent.map(d=>{
    const line=document.createElement('p');
    line.textContent=new Date(d.at).toLocaleString('th-TH')+' · '+d.action+' · '+d.reason;
    return line;
  }));
}
updateBridge(true).catch(e=>message.textContent=e.message);
setInterval(()=>updateBridge().catch(()=>{}),15000);
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const p={};
  for(const el of form.elements)if(el.name)p[el.name]=el.type==='checkbox'?el.checked:Number(el.value);
  try{
    const r=await fetch('./api/demo/policy',{method:'POST',headers:{'X-OI-Dashboard':'1','Content-Type':'application/json'},body:JSON.stringify(p)});
    if(!r.ok)throw Error('บันทึกไม่สำเร็จ กรุณาตรวจเพดานความเสี่ยง');
    message.textContent='บันทึกแล้ว';await updateBridge();
  }catch(e){message.textContent=e.message;}
});
const oiRefresh = document.getElementById("oiRefresh");
const oiState = document.getElementById("oiFeedState");
const oiMessage = document.getElementById("oiFeedMessage");
const oiMetrics = document.getElementById("oiMetrics");
const oiTimeFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", calendar: "gregory",
  dateStyle: "short", timeStyle: "medium"
});
const oiStatus = {
  fresh: "ข้อมูลพร้อมอ่าน",
  stale: "ข้อมูลราคาออปชันเกิน 15 นาที",
  expired: "สัญญาหมดอายุ",
  missing_timestamp: "ไม่มีเวลาอัปเดตราคา",
  future_timestamp: "เวลาราคาอยู่ในอนาคต"
};
const oiValue = (value, suffix = "") => Number.isFinite(value)
  ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) + suffix : "—";
const oiTimeLabel = value => value ? oiTimeFormat.format(new Date(value)) + " ICT" : "—";

async function loadOiSnapshot() {
  if (oiRefresh.disabled || document.visibilityState === "hidden") return;
  oiRefresh.disabled = true;
  oiState.textContent = "กำลังตรวจสอบ";
  try {
    const response = await fetch("./api/oi-snapshot", {
      cache: "no-store", signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error("OI snapshot unavailable");
    const data = await response.json();
    const message = oiStatus[data.status];
    if (typeof message !== "string") throw new Error("Unknown OI feed status");
    oiState.textContent = data.status === "fresh" ? "เชื่อมต่อแล้ว" : "ข้อมูลใช้ไม่ได้";
    oiMessage.textContent = data.status === "fresh"
      ? message + " · พบ OI " + data.oi_coverage.reported + " จาก " + data.oi_coverage.option_rows + " รายการ Call/Put"
      : message;
    document.getElementById("oiContract").textContent = data.contract + " · " + data.expiry_date;
    document.getElementById("oiQuotesTime").textContent = oiTimeLabel(data.quotes_as_of_utc);
    document.getElementById("oiTime").textContent = oiTimeLabel(data.oi_as_of_utc);
    document.getElementById("oiAtmIv").textContent = oiValue(data.atm_iv_pct, "%");
    document.getElementById("oiExpectedMove").textContent = oiValue(data.expected_move_usd, " USD");
    document.getElementById("oiGammaFlip").textContent = oiValue(data.gamma_flip_intraday);
    oiMetrics.hidden = false;
  } catch {
    oiState.textContent = "ขาดการเชื่อมต่อ";
    oiMessage.textContent = "อ่านข้อมูลไม่ได้ในขณะนี้";
    oiMetrics.hidden = true;
  } finally {
    oiRefresh.disabled = false;
  }
}

oiRefresh.addEventListener("click", loadOiSnapshot);
document.addEventListener("visibilitychange", loadOiSnapshot);
setInterval(loadOiSnapshot, 60_000);
loadOiSnapshot();

const analyzeButton = document.getElementById('analyze');
analyzeButton.addEventListener('click', async () => {
  const output = document.getElementById('analysis');
  analyzeButton.disabled = true;
  output.textContent = 'กำลังวิเคราะห์…';
  try {
    const response = await fetch('./api/analyze', { method: 'POST', headers: { 'X-OI-Dashboard': '1' } });
    const data = await response.json();
    output.textContent = response.ok ? oiTimeLabel(data.quotes_as_of_utc) + '\n' + data.answer : data.error;
  } catch {
    output.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
  } finally {
    analyzeButton.disabled = false;
  }
});

const journalDay = document.getElementById('day');
journalDay.value = '';
let journalRequest = 0;
async function refreshJournal() {
  const sequence = ++journalRequest;
  const body = document.getElementById('journalRows');
  const status = document.getElementById('journalStatus');
  try {
    const response = await fetch('./api/journal?day=' + encodeURIComponent(journalDay.value), {cache:'no-store'});
    const data = await response.json();
    if (sequence !== journalRequest) return;
    if (!response.ok) throw Error(data.error);
    journalDay.value = data.day;
    journalDay.min = data.first;
    journalDay.max = data.last.slice(0,10);
    body.replaceChildren();
    const covered = data.day >= data.first && data.day <= journalDay.max;
    status.textContent = (covered ? data.rows.length + ' ดีล · สุทธิ ' + data.net.toFixed(2) + ' ' + data.currency : 'วันที่อยู่นอกช่วงรายงาน') +
      ' · อัปเดตตามเวลาโบรกเกอร์ ' + data.last;
    for (const row of data.rows.slice().reverse()) {
      const tr = body.insertRow();
      for (const value of [row.time,row.ticket,row.symbol,row.side + ' / ' + row.entry.replace('DEAL_ENTRY_', ''),row.volume,row.net.toFixed(2),row.reason||"—"]) {
        tr.insertCell().textContent = value;
      }
    }
  } catch (error) {
    if (sequence !== journalRequest) return;
    body.replaceChildren();
    status.textContent = error.message;
  }
}
journalDay.addEventListener('change', refreshJournal);
setInterval(() => { if (!document.hidden) refreshJournal(); }, 30_000);
refreshJournal();
