#property strict
#property version "1.10"
#include <Trade/Trade.mqh>
CTrade trade;

input string InpApiKey="";                 // Do not share .set files containing this key
input string InpModel="deepseek-chat";      // Set to a model supported by your DeepSeek account
input bool InpEnableTrading=false;          // Test on demo first
input double InpMaxRiskPercent=0.50;        // HARD maximum risk per new trade
input double InpMaxTotalRiskPercent=1.00;   // HARD maximum combined open position risk
input double InpDailyLossPercent=2.00;      // Hard daily equity drawdown lock
input double InpMinRR=1.20;
input double InpMaxRR=4.00;
input double InpMinSL_ATR=0.70;
input double InpMaxSL_ATR=3.00;
input double InpDefaultSL_ATR=1.50;
input int InpMinSLPoints=150;
input int InpMaxSpreadPoints=35;
input int InpMaxDeviationPoints=30;
input int InpATRPeriod=14;
input int InpEMAPeriod=50;
input int InpBarsToSend=40;
input int InpTimeoutMs=12000;
input int InpMinSecondsBetweenCalls=20;
input int InpMaxPriceDriftPoints=100;
input bool InpAllowAIPartialClose=true;
input bool InpAllowAIStopTighten=true;
input bool InpAllowAIExit=true;
input ulong InpMagic=26052026;

int atrHandle=INVALID_HANDLE,emaHandle=INVALID_HANDLE;
datetime lastBar=0,lastRequest=0;
int dayCode=-1;
double dayStartEquity=0;
string statusText="Starting";

string Esc(string s){StringReplace(s,"\\","\\\\");StringReplace(s,"\"","\\\"");StringReplace(s,"\r","");StringReplace(s,"\n","\\n");return s;}
int SkipWS(string s,int p){while(p<StringLen(s) && StringGetCharacter(s,p)<=32)p++;return p;}
// Strict top-level JSON field scanner; skips strings and nested values safely.
bool Field(string s,string key,string &out)
{
 int p=SkipWS(s,0); if(p>=StringLen(s)||StringGetCharacter(s,p)!='{')return false;
 p++;
 while(p<StringLen(s))
 {
  p=SkipWS(s,p);if(p>=StringLen(s)||StringGetCharacter(s,p)=='}')break;
  if(StringGetCharacter(s,p)!='"')return false;
  p++;string k="";bool esc=false;
  while(p<StringLen(s)) {ushort c=StringGetCharacter(s,p++);if(esc){k+=ShortToString(c);esc=false;}else if(c=='\\')esc=true;else if(c=='"')break;else k+=ShortToString(c);}
  p=SkipWS(s,p);if(p>=StringLen(s)||StringGetCharacter(s,p++)!=':')return false;
  p=SkipWS(s,p);int start=p;bool quoted=(p<StringLen(s)&&StringGetCharacter(s,p)=='"');
  if(quoted)
  {
   p++;out="";esc=false;
   while(p<StringLen(s)){ushort c=StringGetCharacter(s,p++);if(esc){if(c=='n')out+="\n";else if(c=='t')out+="\t";else if(c=='r')out+="\r";else out+=ShortToString(c);esc=false;}else if(c=='\\')esc=true;else if(c=='"')break;else out+=ShortToString(c);}
  }
  else
  {
   int depth=0;bool inStr=false;esc=false;
   while(p<StringLen(s))
   {
    ushort c=StringGetCharacter(s,p);
    if(inStr){if(esc)esc=false;else if(c=='\\')esc=true;else if(c=='"')inStr=false;}
    else {if(c=='"')inStr=true;else if(c=='{'||c=='[')depth++;else if(c=='}'||c==']'){if(depth==0)break;depth--;}else if(c==','&&depth==0)break;}
    p++;
   }
   out=StringSubstr(s,start,p-start);StringTrimLeft(out);StringTrimRight(out);
  }
  if(k==key)return true;
  p=SkipWS(s,p);if(p<StringLen(s)&&StringGetCharacter(s,p)==','){p++;continue;}break;
 }
 return false;
}
bool Num(string json,string key,double &v)
{
 string s;if(!Field(json,key,s)||s=="null"||s=="")return false;
 for(int i=0;i<StringLen(s);i++){ushort c=StringGetCharacter(s,i);if(!((c>='0'&&c<='9')||c=='-'||c=='+'||c=='.'||c=='e'||c=='E'))return false;}
 v=StringToDouble(s);return MathIsValidNumber(v);
}
int Today(){MqlDateTime d;TimeToStruct(TimeTradeServer(),d);return d.year*10000+d.mon*100+d.day;}
string BaselineKey(){return "DS_M5_DAY_"+IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN))+"_"+IntegerToString((long)InpMagic)+"_"+IntegerToString(Today());}
void RefreshDay()
{
 int d=Today();if(d==dayCode)return;dayCode=d;
 string k=BaselineKey();
 if(GlobalVariableCheck(k))dayStartEquity=GlobalVariableGet(k);
 else {dayStartEquity=AccountInfoDouble(ACCOUNT_EQUITY);GlobalVariableSet(k,dayStartEquity);}
}
bool DailyOK(){RefreshDay();return dayStartEquity>0 && AccountInfoDouble(ACCOUNT_EQUITY)>dayStartEquity*(1.0-InpDailyLossPercent/100.0);}
bool IsOwn(){return PositionGetString(POSITION_SYMBOL)==_Symbol&&(ulong)PositionGetInteger(POSITION_MAGIC)==InpMagic;}
int OwnCount(){int n=0;for(int i=PositionsTotal()-1;i>=0;i--){ulong t=PositionGetTicket(i);if(t>0&&IsOwn())n++;}return n;}
bool OwnPosition(ulong &ticket,ENUM_POSITION_TYPE &side,double &volume,double &entry,double &sl,double &tp)
{
 for(int i=PositionsTotal()-1;i>=0;i--){ulong t=PositionGetTicket(i);if(t>0&&IsOwn()){ticket=t;side=(ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);volume=PositionGetDouble(POSITION_VOLUME);entry=PositionGetDouble(POSITION_PRICE_OPEN);sl=PositionGetDouble(POSITION_SL);tp=PositionGetDouble(POSITION_TP);return true;}}
 return false;
}
double RiskMoney(ENUM_ORDER_TYPE type,double volume,double entry,double sl)
{
 if(sl<=0)return DBL_MAX;double pnl=0;if(!OrderCalcProfit(type,_Symbol,volume,entry,sl,pnl))return DBL_MAX;
 return MathMax(0,-pnl);
}
double OpenRiskMoney()
{
 double risk=0;
 for(int i=PositionsTotal()-1;i>=0;i--)
 {
  ulong t=PositionGetTicket(i);if(t<=0||!IsOwn())continue;
  ENUM_ORDER_TYPE type=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?ORDER_TYPE_BUY:ORDER_TYPE_SELL);
  risk+=RiskMoney(type,PositionGetDouble(POSITION_VOLUME),PositionGetDouble(POSITION_PRICE_OPEN),PositionGetDouble(POSITION_SL));
 }
 return risk;
}
double FloorLots(double raw)
{
 double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP),minv=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN),maxv=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
 if(step<=0||raw<minv)return 0;
 double v=MathFloor(MathMin(raw,maxv)/step+1e-9)*step;
 if(v<minv)return 0;return NormalizeDouble(v,8);
}
double LotsForRisk(ENUM_ORDER_TYPE type,double entry,double sl,double riskPct)
{
 double loss=RiskMoney(type,1.0,entry,sl);if(loss<=0||loss==DBL_MAX)return 0;
 double equity=AccountInfoDouble(ACCOUNT_EQUITY);
 double available=MathMin(equity*riskPct/100.0,equity*InpMaxTotalRiskPercent/100.0-OpenRiskMoney());
 if(available<=0)return 0;return FloorLots(available/loss);
}
string Market(double atr,double ema)
{
 int n=MathMax(10,MathMin(100,InpBarsToSend));MqlRates r[];ArraySetAsSeries(r,true);
 if(CopyRates(_Symbol,PERIOD_M5,1,n,r)!=n)return "";
 MqlTick tick;if(!SymbolInfoTick(_Symbol,tick))return "";
 string s="{\"symbol\":\""+Esc(_Symbol)+"\",\"tf\":\"M5\",\"bid\":"+DoubleToString(tick.bid,_Digits)+",\"ask\":"+DoubleToString(tick.ask,_Digits)+",\"atr\":"+DoubleToString(atr,_Digits)+",\"ema\":"+DoubleToString(ema,_Digits)+",\"equity\":"+DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)+",\"max_risk_pct\":"+DoubleToString(InpMaxRiskPercent,3)+",\"candles\":[";
 for(int i=n-1;i>=0;i--){if(i<n-1)s+=",";s+="["+IntegerToString((long)r[i].time)+","+DoubleToString(r[i].open,_Digits)+","+DoubleToString(r[i].high,_Digits)+","+DoubleToString(r[i].low,_Digits)+","+DoubleToString(r[i].close,_Digits)+","+IntegerToString(r[i].tick_volume)+"]";}
 s+="]";
 ulong ticket;ENUM_POSITION_TYPE side;double volume,entry,sl,tp;
 if(OwnPosition(ticket,side,volume,entry,sl,tp))s+=",\"position\":{\"side\":\""+(side==POSITION_TYPE_BUY?"BUY":"SELL")+"\",\"volume\":"+DoubleToString(volume,8)+",\"entry\":"+DoubleToString(entry,_Digits)+",\"sl\":"+DoubleToString(sl,_Digits)+",\"tp\":"+DoubleToString(tp,_Digits)+"}";
 else s+=",\"position\":null";
 return s+"}";
}
bool AskAI(string market,string &decision)
{
 if(StringLen(InpApiKey)<8){statusText="Missing DeepSeek API key";return false;}
 if(TimeCurrent()-lastRequest<InpMinSecondsBetweenCalls){statusText="API cooldown";return false;}
 lastRequest=TimeCurrent();
 string prompt="You analyze XAUUSD M5 CLOSED candles only. Never invent OI, delta, news, or market data. Output ONE compact JSON object, no markdown. Keys: action (BUY,SELL,WAIT,CLOSE,REDUCE,HOLD), risk_pct (number 0 to max_risk_pct), sl_atr (number 0.7 to 3.0), rr (number 1.2 to 4.0), reduce_pct (number 0 to 100), reason (short English). If position exists: only HOLD,CLOSE,REDUCE; if none: only BUY,SELL,WAIT. Risk is a proposal only. Prefer WAIT/HOLD when uncertain. CLOSE if exit evidence, REDUCE for risk deterioration. Never recommend widening stops. All price and risk checks are enforced by EA.";
 string body="{\"model\":\""+Esc(InpModel)+"\",\"response_format\":{\"type\":\"json_object\"},\"max_tokens\":240,\"messages\":[{\"role\":\"system\",\"content\":\""+Esc(prompt)+"\"},{\"role\":\"user\",\"content\":\""+Esc(market)+"\"}]}";
 char payload[],response[];int n=StringToCharArray(body,payload,0,WHOLE_ARRAY,CP_UTF8);if(n<=1)return false;ArrayResize(payload,n-1);
 string headers="Content-Type: application/json\r\nAuthorization: Bearer "+InpApiKey+"\r\n",rh="";
 ResetLastError();int http=WebRequest("POST","https://api.deepseek.com/chat/completions",headers,InpTimeoutMs,payload,response,rh);
 if(http!=200){statusText="API error HTTP="+IntegerToString(http)+" MT5="+IntegerToString(GetLastError());Print(statusText);return false;}
 string raw=CharArrayToString(response,0,-1,CP_UTF8),choices="",first="",msg="",content="",finish="";
 if(!Field(raw,"choices",choices)||StringLen(choices)<3){statusText="Missing choices";return false;}
 // choices array contains the first object; extract it with a balanced scan
 int p=StringFind(choices,"{");if(p<0)return false;int depth=0,end=-1;bool inStr=false,esc=false;
 for(int i=p;i<StringLen(choices);i++){ushort c=StringGetCharacter(choices,i);if(inStr){if(esc)esc=false;else if(c=='\\')esc=true;else if(c=='"')inStr=false;}else{if(c=='"')inStr=true;else if(c=='{')depth++;else if(c=='}'&&--depth==0){end=i;break;}}}
 if(end<0)return false;first=StringSubstr(choices,p,end-p+1);
 if(!Field(first,"finish_reason",finish)||finish!="stop"||!Field(first,"message",msg)||!Field(msg,"content",content)){statusText="AI incomplete";return false;}
 string action="";if(!Field(content,"action",action)){statusText="Invalid AI JSON";return false;}
 decision=content;return true;
}
bool StopsValid(ENUM_ORDER_TYPE type,double sl,double tp,MqlTick &tick)
{
 double minDist=((double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)+2)*_Point;
 if(type==ORDER_TYPE_BUY)return sl<tick.bid-minDist&&tp>tick.bid+minDist;
 return sl>tick.ask+minDist&&tp<tick.ask-minDist;
}
void ManageExisting(string json,double atr)
{
 ulong ticket;ENUM_POSITION_TYPE side;double vol,entry,sl,tp;
 if(!OwnPosition(ticket,side,vol,entry,sl,tp))return;
 string action="",reason="";if(!Field(json,"action",action))return;Field(json,"reason",reason);
 if(action=="CLOSE"&&InpAllowAIExit)
 {
  bool sent=trade.PositionClose(ticket,InpMaxDeviationPoints);
  statusText="AI CLOSE "+IntegerToString((long)ticket)+" ret="+IntegerToString((int)trade.ResultRetcode());Print(statusText," ",reason);
  return;
 }
 if(action=="REDUCE"&&InpAllowAIPartialClose)
 {
  double pct=0;if(!Num(json,"reduce_pct",pct)||pct<=0||pct>100)return;
  double minv=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
  double closeLots=FloorLots(vol*pct/100.0);
  if(closeLots<minv){statusText="Partial below minimum volume";return;}
  if(vol-closeLots<minv) {statusText="Partial would leave invalid volume";return;}
  if((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING){statusText="Partial close disabled on netting account";return;}
  bool sent=trade.PositionClosePartial(ticket,closeLots,InpMaxDeviationPoints);
  statusText="AI REDUCE "+DoubleToString(closeLots,2)+" ret="+IntegerToString((int)trade.ResultRetcode());Print(statusText," ",reason);
  return;
 }
 // AI can tighten a stop to a fixed ATR distance from current market, never loosen it.
 if(action=="HOLD"&&InpAllowAIStopTighten&&sl>0)
 {
  double factor=0;if(!Num(json,"sl_atr",factor)||factor<InpMinSL_ATR||factor>InpMaxSL_ATR)return;
  MqlTick tick;if(!SymbolInfoTick(_Symbol,tick))return;
  double minDist=((double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)+(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL)+3)*_Point;
  double candidate=(side==POSITION_TYPE_BUY?tick.bid-MathMax(atr*factor,minDist):tick.ask+MathMax(atr*factor,minDist));
  candidate=NormalizeDouble(candidate,_Digits);
  if((side==POSITION_TYPE_BUY&&candidate>sl+_Point&&candidate<tick.bid-minDist+_Point)||(side==POSITION_TYPE_SELL&&candidate<sl-_Point&&candidate>tick.ask+minDist-_Point))
  {
   bool sent=trade.PositionModify(ticket,candidate,tp);
   statusText="AI tighten SL ret="+IntegerToString((int)trade.ResultRetcode());Print(statusText);
  }
 }
}
void OpenFromAI(string json,double atr,MqlTick &before)
{
 string action="",reason="";if(!Field(json,"action",action))return;Field(json,"reason",reason);
 if(action!="BUY"&&action!="SELL"){statusText="AI "+action+" "+reason;return;}
 double pct=0,slAtr=0,rr=0;
 if(!Num(json,"risk_pct",pct)||!Num(json,"sl_atr",slAtr)||!Num(json,"rr",rr)){statusText="AI missing MM fields";return;}
 if(pct<=0||pct>InpMaxRiskPercent||slAtr<InpMinSL_ATR||slAtr>InpMaxSL_ATR||rr<InpMinRR||rr>InpMaxRR){statusText="AI MM outside limits";return;}
 if(!DailyOK()||OwnCount()>0)return;
 MqlTick tick;if(!SymbolInfoTick(_Symbol,tick))return;
 if(tick.ask<=tick.bid||(tick.ask-tick.bid)/_Point>InpMaxSpreadPoints||MathAbs(tick.bid-before.bid)/_Point>InpMaxPriceDriftPoints){statusText="Spread/price drift";return;}
 ENUM_ORDER_TYPE type=(action=="BUY"?ORDER_TYPE_BUY:ORDER_TYPE_SELL);
 double entry=(type==ORDER_TYPE_BUY?tick.ask:tick.bid);
 double minDist=((double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)+3)*_Point;
 double dist=MathMax(MathMax(InpMinSLPoints*_Point,atr*slAtr),minDist+2*_Point);
 double sl=NormalizeDouble(entry+(type==ORDER_TYPE_BUY?-dist:dist),_Digits);
 double tp=NormalizeDouble(entry+(type==ORDER_TYPE_BUY?dist*rr:-dist*rr),_Digits);
 if(!StopsValid(type,sl,tp,tick)){statusText="Invalid broker stops";return;}
 double lots=LotsForRisk(type,entry,sl,pct);
 if(lots<=0){statusText="Risk budget below min lot";return;}
 double margin=0;if(!OrderCalcMargin(type,_Symbol,lots,entry,margin)||margin>AccountInfoDouble(ACCOUNT_MARGIN_FREE)*0.90){statusText="Margin guard";return;}
 bool sent=trade.PositionOpen(_Symbol,type,lots,entry,sl,tp,"DS M5 Adaptive 1.10");
 statusText="AI "+action+" lots="+DoubleToString(lots,2)+" ret="+IntegerToString((int)trade.ResultRetcode());
 Print(statusText," ",trade.ResultRetcodeDescription()," risk% ",pct," SL ",sl," TP ",tp," ",reason);
}
void Analyze()
{
 if(!InpEnableTrading){statusText="Trading disabled";return;}
 if(!DailyOK()){statusText="Daily equity loss lock";return;}
 if((int)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE)!=SYMBOL_TRADE_MODE_FULL){statusText="Symbol trading disabled";return;}
 MqlTick tick;if(!SymbolInfoTick(_Symbol,tick))return;
 if(tick.ask<=tick.bid||(tick.ask-tick.bid)/_Point>InpMaxSpreadPoints){statusText="Spread filter";return;}
 double a[],e[];if(CopyBuffer(atrHandle,0,1,1,a)!=1||CopyBuffer(emaHandle,0,1,1,e)!=1||a[0]<=0){statusText="Indicators not ready";return;}
 string market=Market(a[0],e[0]);if(market==""){statusText="Candles unavailable";return;}
 string json="";if(!AskAI(market,json))return;
 string action="";if(!Field(json,"action",action))return;
 Print("DeepSeek decision: ",json);
 if(OwnCount()>0){if(action!="HOLD"&&action!="CLOSE"&&action!="REDUCE"){statusText="Invalid management action";return;}ManageExisting(json,a[0]);}
 else {if(action!="BUY"&&action!="SELL"&&action!="WAIT"){statusText="Invalid entry action";return;}OpenFromAI(json,a[0],tick);}
}
int OnInit()
{
 if(_Period!=PERIOD_M5||InpMaxRiskPercent<=0||InpMaxRiskPercent>5||InpMaxTotalRiskPercent<InpMaxRiskPercent||InpDailyLossPercent<=0||InpDailyLossPercent>20||InpMinRR<=0||InpMaxRR<InpMinRR||InpMinSL_ATR<=0||InpMaxSL_ATR<InpMinSL_ATR||InpBarsToSend<10||InpMaxSpreadPoints<=0)return INIT_PARAMETERS_INCORRECT;
 atrHandle=iATR(_Symbol,PERIOD_M5,InpATRPeriod);emaHandle=iMA(_Symbol,PERIOD_M5,InpEMAPeriod,0,MODE_EMA,PRICE_CLOSE);
 if(atrHandle==INVALID_HANDLE||emaHandle==INVALID_HANDLE)return INIT_FAILED;
 trade.SetExpertMagicNumber(InpMagic);trade.SetDeviationInPoints(InpMaxDeviationPoints);trade.SetTypeFillingBySymbol(_Symbol);
 RefreshDay();lastBar=iTime(_Symbol,PERIOD_M5,0);EventSetTimer(2);return INIT_SUCCEEDED;
}
void OnDeinit(const int reason){EventKillTimer();if(atrHandle!=INVALID_HANDLE)IndicatorRelease(atrHandle);if(emaHandle!=INVALID_HANDLE)IndicatorRelease(emaHandle);Comment("");}
void OnTimer()
{
 RefreshDay();
 Comment("DeepSeek Gold M5 Adaptive v1.10\n",_Symbol," | ",(InpEnableTrading?"AUTO":"OFF"),"\n",statusText,"\nEquity: ",DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)," | Daily baseline: ",DoubleToString(dayStartEquity,2),"\nOwn positions: ",OwnCount());
 datetime b=iTime(_Symbol,PERIOD_M5,0);if(b<=0||b==lastBar)return;lastBar=b;Analyze();
}
