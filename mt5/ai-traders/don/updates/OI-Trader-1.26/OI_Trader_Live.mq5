#property strict
#property version "1.26"
#include <Trade/Trade.mqh>
CTrade trade;

input string InpBridgeToken="";
double dashboardTotal=0,dashboardDaily=0;
int dashboardCount=0;
bool dashboardHedge=false;
string decisionID="";
ulong reviewTicket=0;
input bool InpEnableTrading=false;          // Test on demo first
input double InpMaxRiskPercent=0.50;        // HARD maximum risk per new trade
input double InpMaxTotalRiskPercent=1.00;   // HARD maximum combined open position risk
input double InpDailyLossPercent=2.00;      // Hard daily equity drawdown lock
input int InpMaxPositions=10;               // HARD maximum open positions
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
input ulong InpMagic=26052027;

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
 double available=MathMin(equity*riskPct/100.0,equity*MathMin(InpMaxTotalRiskPercent,dashboardTotal)/100.0-OpenRiskMoney());
 if(available<=0)return 0;return FloorLots(available/loss);
}
string Market(double atr,double ema)
{
 int n=MathMax(10,MathMin(100,InpBarsToSend));MqlRates r[];ArraySetAsSeries(r,true);
 if(CopyRates(_Symbol,PERIOD_M5,1,n,r)!=n)return "";
 MqlTick tick;if(!SymbolInfoTick(_Symbol,tick))return "";
 string s="{\"symbol\":\""+Esc(_Symbol)+"\",\"tf\":\"M5\",\"bid\":"+DoubleToString(tick.bid,_Digits)+",\"ask\":"+DoubleToString(tick.ask,_Digits)+",\"atr\":"+DoubleToString(atr,_Digits)+",\"ema\":"+DoubleToString(ema,_Digits)+",\"equity\":"+DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)+",\"max_risk_pct\":"+DoubleToString(InpMaxRiskPercent,3)+",\"min_rr\":"+DoubleToString(InpMinRR,16)+",\"max_rr\":"+DoubleToString(InpMaxRR,16)+",\"candles\":[";
 for(int i=n-1;i>=0;i--){if(i<n-1)s+=",";s+="["+IntegerToString((long)r[i].time)+","+DoubleToString(r[i].open,_Digits)+","+DoubleToString(r[i].high,_Digits)+","+DoubleToString(r[i].low,_Digits)+","+DoubleToString(r[i].close,_Digits)+","+IntegerToString(r[i].tick_volume)+"]";}
 s+="]";
 ulong ticket;ENUM_POSITION_TYPE side;double volume,entry,sl,tp;
 reviewTicket=0;
 if(OwnPosition(ticket,side,volume,entry,sl,tp)){reviewTicket=ticket;s+=",\"position\":{\"side\":\""+(side==POSITION_TYPE_BUY?"BUY":"SELL")+"\",\"volume\":"+DoubleToString(volume,8)+",\"entry\":"+DoubleToString(entry,_Digits)+",\"sl\":"+DoubleToString(sl,_Digits)+",\"tp\":"+DoubleToString(tp,_Digits)+"}";
 } else s+=",\"position\":null";
 s+=",\"chartPositions\":[";
 bool firstPosition=true;
 for(int j=0;j<PositionsTotal();j++){
  if(PositionGetTicket(j)==0 || !IsOwn())continue;
  if(!firstPosition)s+=",";
  firstPosition=false;
  string direction=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?"BUY":"SELL";
  s+="{\"side\":\""+direction+"\",\"entry\":"+DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN),_Digits)+",\"sl\":"+DoubleToString(PositionGetDouble(POSITION_SL),_Digits)+",\"tp\":"+DoubleToString(PositionGetDouble(POSITION_TP),_Digits)+"}";
 }
 s+="]";
 return s+",\"login\":\""+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+"\",\"server\":\""+Esc(AccountInfoString(ACCOUNT_SERVER))+"\",\"count\":"+IntegerToString(OwnCount())+"}";
}
bool AskAI(string market,string &decision)
{
 char payload[],response[];int n=StringToCharArray(market,payload,0,WHOLE_ARRAY,CP_UTF8);ArrayResize(payload,n-1);
 string headers="Content-Type: application/json\r\nAuthorization: Bearer "+InpBridgeToken+"\r\n",rh;
 int http=WebRequest("POST","http://127.0.0.1:4173/api/demo/decision",headers,45000,payload,response,rh);
 if(http!=200){statusText="Bridge HTTP "+IntegerToString(http);return false;}
 decision=CharArrayToString(response,0,-1,CP_UTF8);
 double count,hedge;
 if(!Field(decision,"id",decisionID)||!Num(decision,"limitTotal",dashboardTotal)||!Num(decision,"limitDaily",dashboardDaily)||!Num(decision,"limitCount",count)||!Num(decision,"hedge",hedge))return false;
 if(!MathIsValidNumber(count)||count<1||count!=MathFloor(count))return false;
 dashboardCount=(int)MathMin(count,InpMaxPositions);dashboardHedge=hedge==1;return true;
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
 if(reviewTicket==0||!PositionSelectByTicket(reviewTicket)||!IsOwn())return;
 ticket=reviewTicket;side=(ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);vol=PositionGetDouble(POSITION_VOLUME);entry=PositionGetDouble(POSITION_PRICE_OPEN);sl=PositionGetDouble(POSITION_SL);tp=PositionGetDouble(POSITION_TP);
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
 if(!MathIsValidNumber(pct)||pct<=0||slAtr<InpMinSL_ATR||slAtr>InpMaxSL_ATR||rr<InpMinRR||rr>InpMaxRR){statusText=StringFormat("AI MM outside limits: RR %.2f [%.2f..%.2f], SL %.2f ATR [%.2f..%.2f], risk %.2f%%",rr,InpMinRR,InpMaxRR,slAtr,InpMinSL_ATR,InpMaxSL_ATR,pct);Print(statusText);return;}
 if(!DailyOK()||PositionsTotal()>=dashboardCount||OrdersTotal()>0||AccountInfoDouble(ACCOUNT_EQUITY)<=dayStartEquity*(1-dashboardDaily/100))return;
 for(int i=PositionsTotal()-1;i>=0;i--){
   if(!PositionGetTicket(i)||!IsOwn()||PositionGetDouble(POSITION_SL)<=0)return;
   if(!dashboardHedge && ((PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)!=(action=="BUY")))return;
 }
 MqlTick tick;if(!SymbolInfoTick(_Symbol,tick))return;
 if(tick.ask<=tick.bid||(tick.ask-tick.bid)/_Point>InpMaxSpreadPoints||MathAbs(tick.bid-before.bid)/_Point>InpMaxPriceDriftPoints){statusText="Spread/price drift";return;}
 ENUM_ORDER_TYPE type=(action=="BUY"?ORDER_TYPE_BUY:ORDER_TYPE_SELL);
 double entry=(type==ORDER_TYPE_BUY?tick.ask:tick.bid);
 double minDist=((double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)+3)*_Point;
 double dist=MathMax(MathMax(InpMinSLPoints*_Point,atr*slAtr),minDist+2*_Point);
 double sl=NormalizeDouble(entry+(type==ORDER_TYPE_BUY?-dist:dist),_Digits);
 double tp=NormalizeDouble(entry+(type==ORDER_TYPE_BUY?dist*rr:-dist*rr),_Digits);
 if(!StopsValid(type,sl,tp,tick)){statusText="Invalid broker stops";return;}
 double lots=LotsForRisk(type,entry,sl,MathMin(pct,InpMaxRiskPercent));
 if(lots<=0){statusText="Risk budget below min lot";return;}
 double margin=0;if(!OrderCalcMargin(type,_Symbol,lots,entry,margin)||margin>AccountInfoDouble(ACCOUNT_MARGIN_FREE)*0.90){statusText="Margin guard";return;}
 bool sent=trade.PositionOpen(_Symbol,type,lots,entry,sl,tp,"OI:"+decisionID);
 statusText="AI "+action+" lots="+DoubleToString(lots,2)+" ret="+IntegerToString((int)trade.ResultRetcode());
 Print(statusText," ",trade.ResultRetcodeDescription()," risk% ",pct," SL ",sl," TP ",tp," ",reason);
}
void Analyze()
{
 if(!InpEnableTrading){statusText="Trading disabled";return;}

 if((int)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE)!=SYMBOL_TRADE_MODE_FULL){statusText="Symbol trading disabled";return;}
 MqlTick tick;if(!SymbolInfoTick(_Symbol,tick))return;
 if(tick.ask<=tick.bid||(tick.ask-tick.bid)/_Point>InpMaxSpreadPoints){statusText="Spread filter";return;}
 double a[],e[];if(CopyBuffer(atrHandle,0,1,1,a)!=1||CopyBuffer(emaHandle,0,1,1,e)!=1||a[0]<=0){statusText="Indicators not ready";return;}
 string market=Market(a[0],e[0]);if(market==""){statusText="Candles unavailable";return;}
 datetime requestedBar=iTime(_Symbol,PERIOD_M5,0);
 string json="";if(!AskAI(market,json))return;
 if(iTime(_Symbol,PERIOD_M5,0)!=requestedBar || AccountInfoInteger(ACCOUNT_TRADE_MODE)!=ACCOUNT_TRADE_MODE_REAL){statusText="Decision expired";return;}
 string action="";if(!Field(json,"action",action))return;
 Print("DeepSeek decision: ",json);
 if(action=="BUY"||action=="SELL")OpenFromAI(json,a[0],tick);
 else if(OwnCount()>0)ManageExisting(json,a[0]);
}
int OnInit()
{
 bool valid=true;
 if(AccountInfoInteger(ACCOUNT_TRADE_MODE)!=ACCOUNT_TRADE_MODE_REAL){ Print("OI setup: Real account required"); valid=false; }
 if(AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING){ Print("OI setup: Hedging account required"); valid=false; }
 if(StringLen(InpBridgeToken)<24){ Print("OI setup: InpBridgeToken: copy the full bridge-token.txt value"); valid=false; }
 if(_Period!=PERIOD_M5){ Print("OI setup: M5 chart required"); valid=false; }
 if(!MathIsValidNumber(InpMaxRiskPercent)||InpMaxRiskPercent<=0){ Print("OI setup: InpMaxRiskPercent must be positive"); valid=false; }
 if(!MathIsValidNumber(InpMaxTotalRiskPercent)||InpMaxTotalRiskPercent<=0){ Print("OI setup: InpMaxTotalRiskPercent must be positive"); valid=false; }
 if(InpMaxPositions<1){ Print("OI setup: InpMaxPositions must be positive"); valid=false; }
 if(!MathIsValidNumber(InpDailyLossPercent)||InpDailyLossPercent<=0||InpDailyLossPercent>100){ Print("OI setup: InpDailyLossPercent must be above 0 and at most 100"); valid=false; }
 if(InpMinRR<=0||InpMaxRR<InpMinRR){ Print("OI setup: Check InpMinRR and InpMaxRR"); valid=false; }
 if(InpMinSL_ATR<=0||InpMaxSL_ATR<InpMinSL_ATR){ Print("OI setup: Check InpMinSL_ATR and InpMaxSL_ATR"); valid=false; }
 if(InpBarsToSend<10){ Print("OI setup: InpBarsToSend must be at least 10"); valid=false; }
 if(InpMaxSpreadPoints<=0){ Print("OI setup: InpMaxSpreadPoints must be positive"); valid=false; }
 if(!valid)return INIT_PARAMETERS_INCORRECT;
 atrHandle=iATR(_Symbol,PERIOD_M5,InpATRPeriod);emaHandle=iMA(_Symbol,PERIOD_M5,InpEMAPeriod,0,MODE_EMA,PRICE_CLOSE);
 if(atrHandle==INVALID_HANDLE||emaHandle==INVALID_HANDLE)return INIT_FAILED;
 trade.SetExpertMagicNumber(InpMagic);trade.SetDeviationInPoints(InpMaxDeviationPoints);trade.SetTypeFillingBySymbol(_Symbol);
 ChartSetInteger(0,CHART_SHOW_TRADE_HISTORY,true);
 ChartRedraw();
 RefreshDay();lastBar=iTime(_Symbol,PERIOD_M5,0);EventSetTimer(2);return INIT_SUCCEEDED;
}
void OnDeinit(const int reason){EventKillTimer();if(atrHandle!=INVALID_HANDLE)IndicatorRelease(atrHandle);if(emaHandle!=INVALID_HANDLE)IndicatorRelease(emaHandle);Comment("");}
void OnTimer()
{
 RefreshDay();
 Comment("OI Gold AI Trader LIVE v1.26\n",_Symbol," | ",(InpEnableTrading?"AUTO":"OFF"),"\n",statusText,"\nEquity: ",DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)," | Daily baseline: ",DoubleToString(dayStartEquity,2),"\nOwn positions: ",OwnCount());
 datetime b=iTime(_Symbol,PERIOD_M5,0);if(b<=0||b==lastBar)return;lastBar=b;Analyze();
}
