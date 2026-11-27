import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';

const file = join(homedir(),'.oi-gold-ai-trader','go-decision.json');
export const enabled = existsSync(file);
let cached;
function credentials(){
  if (!cached) {
    const cfg = JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
    const ps = "$ErrorActionPreference='Stop'; $s=ConvertTo-SecureString ([Console]::In.ReadToEnd()); [Console]::Write([Net.NetworkCredential]::new('', $s).Password)";
    cached = execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{input:cfg.secret,encoding:'utf8'}).trim();
    if (!cached) throw Error('Empty Decision credential');
  }
  return cached;
}
if(enabled) console.log('MT5 decision provider: OpenCode Go Decision / jev-1.14');
const question = (instructions,criteria)=>({type:'choice',instructions,criteria});
const reasons = {mixed:'สัญญาณผสม',trend:'ทิศทาง DON',flow:'แรงซื้อขาย',zones:'โซน OI',manage:'การจัดการไม้เดิม'};
export async function decide(state, key, request=fetch){
  const {market,policy}=state;
  const side=market.allowedEntrySide;
  const hasPosition=['BUY','SELL'].includes(market.position?.side);
  const actions={WAIT:'Wait if uncertain or no entry setup.'};
  if (['BUY','SELL'].includes(side)) actions[side]='Open a new position only with supporting price, OI and flow.';
  if(hasPosition) Object.assign(actions,{HOLD:'Keep existing position',REDUCE:'Reduce existing exposure',CLOSE:'Exit existing position'});
  if(Object.keys(actions).length===1) return {action:'WAIT',reason:'รอ DON ยืนยันฝั่งเปิดไม้'};
  const qs={action:question('Choose one action for this closed M5 bar. Observe position, policy and allowedEntrySide.',actions),reason:question('Choose the main factor for the action.',reasons)};
  const entry=['BUY','SELL'].includes(side);
  if(entry) Object.assign(qs,{
    budget:question('Choose fraction of the lower EA and app per-trade risk cap.',{quarter:'25%',half:'50%',full:'100%'}),
    stop:question('Choose stop distance based on volatility and structure.',{tight:'1 ATR',normal:'1.5 ATR',wide:'2 ATR'}),
    target:question('Choose reward to risk based on nearby levels.',{near:'1.2R',normal:'2R',far:'3R'})
  });
  if(hasPosition) qs.reduce=question('If reducing, select fraction of position.',{quarter:'25%',half:'50%'});
  const res=await request('https://opencode.ai/inference/go/systemone/v1/systemone',{method:'POST',redirect:'error',signal:AbortSignal.timeout(35000),headers:{Authorization:'Bearer '+(key??credentials()),'Content-Type':'application/json','User-Agent':'OI-AI-Trader-Bridge/2'},body:JSON.stringify({model:'jev-1.14',state:JSON.stringify(state),questions:qs})});
  if(!res.ok){
    const detail=await res.json().catch(()=>({}));
    const msg=detail.error?.message??detail.message;
    const secret=key??cached;
    throw Error('Go Decision HTTP '+res.status+(typeof msg==='string'?' '+msg.replaceAll(secret,'[hidden]').slice(0,240):''));
  }
  const {answers}=await res.json();
  function pick(id){
    const val=answers?.[id]?.choice;
    if(typeof val!=='string'||!Object.hasOwn(qs[id].criteria,val))throw Error('Invalid Go Decision answer: '+id);
    return val;
  }
  const action=pick('action');
  const result={action,reason:'Go Decision · '+reasons[pick('reason')]+' · '+action};
  if(['BUY','SELL'].includes(action)){
    const cap=Math.min(policy.perTrade,market.max_risk_pct);
    if(!Number.isFinite(cap)||cap<=0)throw Error('Missing risk cap');
    result.risk_pct=cap*{quarter:.25,half:.5,full:1}[pick('budget')];
    result.sl_atr={tight:1,normal:1.5,wide:2}[pick('stop')];
    result.rr={near:1.2,normal:2,far:3}[pick('target')];
  }
  if(action==='REDUCE')result.reduce_pct={quarter:25,half:50}[pick('reduce')];
  return result;
}
