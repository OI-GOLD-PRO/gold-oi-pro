"use strict";
const form=document.getElementById("riskForm"), message=document.getElementById("riskMessage");
const key="oi-gold-ai-trader-demo-risk-v1";
try {const saved=JSON.parse(localStorage.getItem(key)||"null");if(saved){for(const [name,value] of Object.entries(saved)){const field=form.elements.namedItem(name);if(field){if(field.type==="checkbox")field.checked=Boolean(value);else field.value=String(value)}}}}catch(_){}
document.getElementById("day").value=new Date().toLocaleDateString("en-CA");
form.addEventListener("submit",event=>{event.preventDefault();const fd=new FormData(form);const policy={perTrade:Number(fd.get("perTrade")),total:Number(fd.get("total")),daily:Number(fd.get("daily")),positions:Number(fd.get("positions")),hedging:fd.has("hedging")};
if(![policy.perTrade,policy.total,policy.daily,policy.positions].every(Number.isFinite)||policy.perTrade<=0||policy.total<policy.perTrade||policy.daily<=0||!Number.isInteger(policy.positions)||policy.positions<1){message.textContent="Invalid policy: total open risk must be at least per-trade risk.";return;}
try{localStorage.setItem(key,JSON.stringify(policy));message.textContent="Demo settings saved in this browser only. No EA changes sent.";}catch(_){message.textContent="Browser storage unavailable. Settings were not saved.";}
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
