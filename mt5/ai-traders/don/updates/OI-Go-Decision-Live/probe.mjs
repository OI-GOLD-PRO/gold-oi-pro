import {decide} from './decision.mjs';
let key='';
for await(const chunk of process.stdin)key+=chunk;
try {
 const result=await decide({market:{allowedEntrySide:'BUY',position:null,max_risk_pct:0.5},policy:{perTrade:0.5},note:'Synthetic setup check only. Choose WAIT. No trade is executed.'},key.trim());
 if(result.action!=='WAIT')throw Error('Expected WAIT for the setup check');
 console.log('Go Decision test passed.');
} catch(e){console.error(e.message);process.exitCode=1;}
