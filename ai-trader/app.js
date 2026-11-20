"use strict";
const form=document.getElementById("riskForm"), message=document.getElementById("riskMessage");
const key="oi-gold-ai-trader-demo-risk-v1";
try {const saved=JSON.parse(localStorage.getItem(key)||"null");if(saved){for(const [name,value] of Object.entries(saved)){const field=form.elements.namedItem(name);if(field){if(field.type==="checkbox")field.checked=Boolean(value);else field.value=String(value)}}}}catch(_){}
document.getElementById("day").value=new Date().toLocaleDateString("en-CA");
form.addEventListener("submit",event=>{event.preventDefault();const fd=new FormData(form);const policy={perTrade:Number(fd.get("perTrade")),total:Number(fd.get("total")),daily:Number(fd.get("daily")),positions:Number(fd.get("positions")),hedging:fd.has("hedging")};
if(![policy.perTrade,policy.total,policy.daily,policy.positions].every(Number.isFinite)||policy.perTrade<=0||policy.total<policy.perTrade||policy.daily<=0||!Number.isInteger(policy.positions)||policy.positions<1){message.textContent="Invalid policy: total open risk must be at least per-trade risk.";return;}
try{localStorage.setItem(key,JSON.stringify(policy));message.textContent="Demo settings saved in this browser only. No EA changes sent.";}catch(_){message.textContent="Browser storage unavailable. Settings were not saved.";}
});