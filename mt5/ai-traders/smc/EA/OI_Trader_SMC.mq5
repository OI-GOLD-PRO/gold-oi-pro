#property strict
#property version "1.05"
#include <Trade/Trade.mqh>
CTrade trade;

input string InpBridgeToken="";               // Optional fallback. SMC Setup normally provides this token.
string bridgeToken;
bool linkReady=false,autoToken=false;
ulong nextLinkCheck=0,nextTokenRead=0,nextDecisionRetry=0;
string lastBridgeError="";
string pendingJob="";
datetime pendingJobBar=0;
ulong pendingJobUntil=0;
double pendingATR=0;
MqlTick pendingQuote;
int bridgeRequestError=0;
string fileBridgeNote="";
uint fileRequestSequence=0;
double dashboardTotal=0,dashboardDaily=0;
int dashboardCount=0;
bool dashboardHedge=false;
string decisionID="";
ulong reviewTicket=0;
input bool InpEnableTrading=false;          // Test on demo first
input double InpMaxRiskPercent=0.50;        // HARD maximum risk per new trade
input double InpMaxTotalRiskPercent=1.00;   // HARD maximum combined open position risk
input double InpDailyLossPercent=0.00;      // Daily equity DD in percent. 0 disables the limit.
input int InpMaxPositions=10;               // HARD maximum open positions
input double InpMinRR=1.20;
input double InpMaxRR=4.00;
input double InpMinSL_ATR=0.70;
input double InpMaxSL_ATR=3.00;
input int InpMinSLPoints=150;
input int InpMaxSpreadPoints=35;
input int InpMaxDeviationPoints=30;
input int InpATRPeriod=14;
input int InpBarsToSend=100;
input int InpMaxPriceDriftPoints=100;
input bool InpAllowAIPartialClose=true;
input bool InpAllowAIExit=true;
input bool InpAllowRealAccount=false;
input bool InpShowSMCChart=true;             // Draw SMC events on this MT5 chart
const string ChartPrefix="OI_SMC_AI_26112631_";
string chartSummary="";
ENUM_LINE_STYLE ZoneStyle(string status){return status=="invalid"?STYLE_DASH:STYLE_SOLID;}
const ulong Magic=26112631;
ulong lastReviewed=0;

int atrHandle=INVALID_HANDLE;
datetime lastBar=0;
int dayCode=-1;
double dayStartEquity=0;
string pendingReportId="",pendingReportStatus="";
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
string BaselineKey(){return "OI_SMC_DAY_"+IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN))+"_"+IntegerToString((long)Magic)+"_"+IntegerToString(Today());}
void RefreshDay()
{
 if(!TerminalInfoInteger(TERMINAL_CONNECTED)||TimeTradeServer()<=0)return;
 int d=Today();if(d==dayCode)return;dayCode=d;
 string k=BaselineKey();
 if(GlobalVariableCheck(k))dayStartEquity=GlobalVariableGet(k);
 else {dayStartEquity=AccountInfoDouble(ACCOUNT_EQUITY);GlobalVariableSet(k,dayStartEquity);}
}
bool DailyOK(double limit)
{
 if(limit==0)return true;
 RefreshDay();
 return dayStartEquity>0 && AccountInfoDouble(ACCOUNT_EQUITY)>dayStartEquity*(1.0-limit/100.0);
}
bool IsOwn(){return PositionGetString(POSITION_SYMBOL)==_Symbol&&(ulong)PositionGetInteger(POSITION_MAGIC)==Magic;}
int OwnCount(){int n=0;for(int i=PositionsTotal()-1;i>=0;i--){ulong t=PositionGetTicket(i);if(t>0&&IsOwn())n++;}return n;}
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
string Price(double value){return DoubleToString(value,_Digits);}
string PositionJson()
{
 string side=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?"BUY":"SELL";
 return "{\"side\":\""+side+"\",\"entry\":"+Price(PositionGetDouble(POSITION_PRICE_OPEN))+
        ",\"sl\":"+Price(PositionGetDouble(POSITION_SL))+",\"tp\":"+Price(PositionGetDouble(POSITION_TP))+
        ",\"volume\":"+DoubleToString(PositionGetDouble(POSITION_VOLUME),8)+"}";
}
string RatesJson(ENUM_TIMEFRAMES period,int count,datetime cutoff)
{
 MqlRates rates[];
 ArraySetAsSeries(rates,true);
 int copied=CopyRates(_Symbol,period,1,count,rates);
 if(copied<40)return "";
 string array="[";
 for(int i=copied-1;i>=0;i--)
 {
  if(rates[i].time+PeriodSeconds(period)>cutoff)return "";
  if(i<copied-1)array+=",";
  array+="["+IntegerToString((long)rates[i].time)+","+Price(rates[i].open)+","+Price(rates[i].high)+
         ","+Price(rates[i].low)+","+Price(rates[i].close)+"]";
 }
 return array+"]";
}
bool Armed()
{
 return InpEnableTrading && TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) &&
        MQLInfoInteger(MQL_TRADE_ALLOWED) && AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) &&
        AccountInfoInteger(ACCOUNT_TRADE_EXPERT) &&
        (InpAllowRealAccount || AccountInfoInteger(ACCOUNT_TRADE_MODE)==ACCOUNT_TRADE_MODE_DEMO);
}
bool EntryReady(MqlTick &tick)
{
 return TerminalInfoInteger(TERMINAL_CONNECTED) &&
        SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE)==SYMBOL_TRADE_MODE_FULL &&
        tick.bid>0 && tick.ask>=tick.bid &&
        (tick.ask-tick.bid)/_Point<=InpMaxSpreadPoints+1e-6 &&
        MathAbs((long)(TimeTradeServer()-tick.time))<=30;
}
double DailyLoss()
{
 if(dayStartEquity<=0)return 100;
 return MathMax(0,100*(1-AccountInfoDouble(ACCOUNT_EQUITY)/dayStartEquity));
}
string Market(double atr,datetime cutoff,MqlTick &tick)
{
 string m5=RatesJson(PERIOD_M5,InpBarsToSend,cutoff);
 string m15=RatesJson(PERIOD_M15,100,cutoff);
 string h1=RatesJson(PERIOD_H1,100,cutoff);
 if(m5==""||m15==""||h1=="")return "";
 string s="{\"symbol\":\""+Esc(_Symbol)+"\",\"tf\":\"M5\",\"bid\":"+Price(tick.bid)+
  ",\"ask\":"+Price(tick.ask)+",\"point\":"+DoubleToString(_Point,12)+",\"atr\":"+DoubleToString(atr,10)+
  ",\"max_risk_pct\":"+DoubleToString(InpMaxRiskPercent,8)+",\"min_rr\":"+DoubleToString(InpMinRR,10)+
  ",\"max_total_pct\":"+DoubleToString(InpMaxTotalRiskPercent,8)+",\"max_daily_pct\":"+DoubleToString(InpDailyLossPercent,8)+
  ",\"max_rr\":"+DoubleToString(InpMaxRR,10)+",\"min_sl_atr\":"+DoubleToString(InpMinSL_ATR,8)+
  ",\"max_sl_atr\":"+DoubleToString(InpMaxSL_ATR,8)+",\"min_sl_points\":"+IntegerToString(InpMinSLPoints)+
  ",\"max_drift_points\":"+IntegerToString(InpMaxPriceDriftPoints)+",\"daily_loss\":"+DoubleToString(DailyLoss(),8)+
  ",\"daily_ok\":"+(DailyOK(InpDailyLossPercent)?"true":"false")+",\"armed\":"+(Armed()?"true":"false")+
  ",\"entry_ready\":"+((EntryReady(tick)&&iTime(_Symbol,PERIOD_M5,1)+300==cutoff)?"true":"false")+",\"execution\":\""+Esc(statusText)+"\""+
  ",\"m5\":"+m5+",\"m15\":"+m15+",\"h1\":"+h1;
 reviewTicket=0;
 string current="null", firstOwned="null", positions="[";
 ulong firstTicket=0;
 for(int j=0;j<PositionsTotal();j++)
 {
  ulong ticket=PositionGetTicket(j);
  if(ticket==0||!IsOwn())continue;
  string row=PositionJson();
  if(firstTicket==0||ticket<firstTicket){firstTicket=ticket;firstOwned=row;}
  if(ticket>lastReviewed&&(reviewTicket==0||ticket<reviewTicket)){reviewTicket=ticket;current=row;}
  if(StringLen(positions)>1)positions+=",";
  positions+=row;
 }
 if(reviewTicket==0){reviewTicket=firstTicket;current=firstOwned;}
 return s+",\"position\":"+current+",\"chartPositions\":"+positions+"]"+
  ",\"login\":\""+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+
  "\",\"server\":\""+Esc(AccountInfoString(ACCOUNT_SERVER))+"\",\"count\":"+IntegerToString(OwnCount())+"}";
}
int Post(string route,string body,int timeout,string &reply)
{
 fileBridgeNote="";
 bridgeRequestError=0;
 string requestId=IntegerToString((long)TimeLocal())+"-"+IntegerToString(ChartID())+"-"+
                  IntegerToString((long)GetMicrosecondCount())+"-"+IntegerToString((long)fileRequestSequence++);
 string prefix="OI-SMC-Queue-"+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+"\\"+requestId;
 string temporary=prefix+".req.tmp", request=prefix+".req", response=prefix+".res";
 string envelope="{\"route\":\""+Esc(route)+"\",\"token\":\""+Esc(bridgeToken)+"\",\"body\":"+body+"}";
 uchar bytes[];
 int count=StringToCharArray(envelope,bytes,0,WHOLE_ARRAY,CP_UTF8);
 if(count<=1)return -1;
 ResetLastError();
 int writer=FileOpen(temporary,FILE_WRITE|FILE_BIN|FILE_COMMON);
 if(writer==INVALID_HANDLE)
 {
  bridgeRequestError=GetLastError();
  fileBridgeNote="Cannot write request in MT5 Common Files";
  return -1;
 }
 uint written=FileWriteArray(writer,bytes,0,count-1);
 bridgeRequestError=GetLastError();
 FileClose(writer);
 if(written!=(uint)(count-1))
 {
  FileDelete(temporary,FILE_COMMON);
  fileBridgeNote="Incomplete file bridge request";
  return -1;
 }
 ResetLastError();
 if(!FileMove(temporary,FILE_COMMON,request,FILE_COMMON))
 {
  bridgeRequestError=GetLastError();
  FileDelete(temporary,FILE_COMMON);
  fileBridgeNote="Cannot publish file bridge request";
  return -1;
 }
 ulong deadline=GetTickCount64()+(ulong)timeout;
 while(!IsStopped()&&GetTickCount64()<deadline)
 {
  if(FileIsExist(response,FILE_COMMON))
  {
   int reader=FileOpen(response,FILE_READ|FILE_BIN|FILE_COMMON|FILE_SHARE_READ);
   if(reader!=INVALID_HANDLE)
   {
    ulong size=FileSize(reader);
    uint used=0;
    if(size>0&&size<=150000)used=FileReadArray(reader,bytes,0,(int)size);
    FileClose(reader);
    FileDelete(response,FILE_COMMON);
    if(used>0&&used==size)
    {
     string data=CharArrayToString(bytes,0,(int)used,CP_UTF8);
     double status=0;
     if(Num(data,"status",status)&&status>=200&&status<=599&&Field(data,"body",reply))return (int)status;
    }
    fileBridgeNote="Invalid response from file bridge";
    return -1;
   }
  }
  Sleep(40);
 }
 FileDelete(request,FILE_COMMON);
 fileBridgeNote="File bridge waiting on SMC Setup 1.16 in the same Windows user";
 return -1;
}
void FlushReport()
{
 if(pendingReportId=="")return;
 string reply="";
 int http=Post("/api/demo/report","{\"id\":\""+Esc(pendingReportId)+"\",\"status\":\""+
              Esc(pendingReportStatus)+"\"}",2500,reply);
 if(http==200||http==400){pendingReportId="";pendingReportStatus="";}
}
bool SetLimits(string json)
{
 double count,hedge;
 if(!Num(json,"limitTotal",dashboardTotal)||!Num(json,"limitDaily",dashboardDaily)||
    !Num(json,"limitCount",count)||!Num(json,"hedge",hedge))return false;
 if(count<1||count!=MathFloor(count)||dashboardTotal<=0||dashboardDaily<0||dashboardDaily>100)return false;
 dashboardCount=(int)MathMin(count,InpMaxPositions);
 dashboardHedge=hedge==1;
 return true;
}
string TradeReport(string action,bool sent)
{
 uint code=trade.ResultRetcode();
 bool filled=sent&&(code==TRADE_RETCODE_DONE||code==TRADE_RETCODE_DONE_PARTIAL);
 return (filled?"Filled ":code==TRADE_RETCODE_PLACED?"Placed ":"Broker rejected ")+action+
        " (ret="+IntegerToString((int)code)+": "+trade.ResultRetcodeDescription()+")";
}
string ManageExisting(string json,string action)
{
 if(reviewTicket==0||!PositionSelectByTicket(reviewTicket)||!IsOwn())return "Skipped: position changed";
 if(action=="CLOSE")
 {
  if(!InpAllowAIExit)return "Skipped: AI exit disabled";
  return TradeReport("CLOSE",trade.PositionClose(reviewTicket,InpMaxDeviationPoints));
 }
 if(!InpAllowAIPartialClose)return "Skipped: AI partial close disabled";
 double pct=0;
 if(!Num(json,"reduce_pct",pct)||pct<1||pct>50)return "Skipped: invalid partial close";
 double volume=PositionGetDouble(POSITION_VOLUME);
 double closeLots=FloorLots(volume*pct/100.0);
 if(closeLots<=0||volume-closeLots+1e-9<SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN))
  return "Skipped: partial close below broker lot limits";
 return TradeReport("REDUCE",trade.PositionClosePartial(reviewTicket,closeLots,InpMaxDeviationPoints));
}
double AlignPrice(double price,bool up)
{
 double step=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
 if(step<=0)return 0;
 double units=price/step;
 return NormalizeDouble((up?MathCeil(units-1e-8):MathFloor(units+1e-8))*step,_Digits);
}
string OpenFromAI(string json,string action,double atr,MqlTick &before)
{
 double pct=0,sl=0,tp=0,invalidation=0;
 if(!Num(json,"risk_pct",pct)||!Num(json,"sl",sl)||!Num(json,"tp",tp)||!Num(json,"invalidation",invalidation)||
    pct<=0||pct>InpMaxRiskPercent+1e-8||sl<=0||tp<=0||invalidation<=0)return "Skipped: invalid risk or SMC levels";
 if(!DailyOK(InpDailyLossPercent)||!DailyOK(dashboardDaily))return "Skipped: daily equity loss lock";
 if(OwnCount()>=dashboardCount)return "Skipped: SMC position cap";
 bool buy=action=="BUY";
 for(int i=PositionsTotal()-1;i>=0;i--)
 {
  if(!PositionGetTicket(i)||!IsOwn())continue;
  if(PositionGetDouble(POSITION_SL)<=0)return "Skipped: a SMC position has no stop";
  if(!dashboardHedge && ((PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)!=buy))
   return "Skipped: SMC position already open opposite";
 }
 MqlTick tick;
 if(!SymbolInfoTick(_Symbol,tick)||!EntryReady(tick)||
    MathMax(MathAbs(tick.bid-before.bid),MathAbs(tick.ask-before.ask))>InpMaxPriceDriftPoints*_Point)
  return "Skipped: spread, stale quote or price drift";
 if((buy&&tick.bid<=invalidation)||(!buy&&tick.ask>=invalidation))
  return "Skipped: FVG invalidated before execution";
 double entry=buy?tick.ask:tick.bid;
 sl=AlignPrice(sl,!buy);
 double sign=buy?1.0:-1.0;
 double risk=sign*(entry-sl);
 if(sl<=0||risk<MathMax(InpMinSLPoints*_Point,atr*InpMinSL_ATR)||risk>atr*InpMaxSL_ATR)
  return "Skipped: structural SL outside EA limits";
 double bound=entry+sign*risk*InpMaxRR;
 tp=AlignPrice(buy?MathMin(tp,bound):MathMax(tp,bound),!buy);
 double rr=sign*(tp-entry)/risk;
 if(tp<=0||rr<InpMinRR-1e-8||rr>InpMaxRR+1e-8)return "Skipped: RR outside EA limits";
 double stopDistance=(SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)+2)*_Point;
 double stopReference=buy?tick.bid:tick.ask;
 if(sign*(stopReference-sl)<=stopDistance||sign*(tp-stopReference)<=stopDistance)
  return "Skipped: invalid broker stops";
 ENUM_ORDER_TYPE type=buy?ORDER_TYPE_BUY:ORDER_TYPE_SELL;
 double worstEntry=entry+sign*InpMaxDeviationPoints*_Point;
 double worstRisk=sign*(worstEntry-sl);
 if(sign*(tp-worstEntry)/worstRisk<InpMinRR-1e-8)return "Skipped: RR below minimum after slippage allowance";
 double lots=LotsForRisk(type,worstEntry,sl,pct);
 if(lots<=0)return "Skipped: risk budget below minimum lot";
 double margin=0;
 if(!OrderCalcMargin(type,_Symbol,lots,worstEntry,margin)||margin>AccountInfoDouble(ACCOUNT_MARGIN_FREE)*0.90)
  return "Skipped: available margin too low";
 return TradeReport(action,trade.PositionOpen(_Symbol,type,lots,entry,sl,tp,"OI:"+decisionID));
}
void SetChartObject(string name,color tint,ENUM_LINE_STYLE style)
{
 ObjectSetInteger(0,name,OBJPROP_COLOR,tint);
 ObjectSetInteger(0,name,OBJPROP_STYLE,style);
 ObjectSetInteger(0,name,OBJPROP_SELECTABLE,false);
 ObjectSetInteger(0,name,OBJPROP_HIDDEN,true);
}
void ChartText(string key,datetime at,double level,string label,color tint,ENUM_ANCHOR_POINT anchor)
{
 string name=ChartPrefix+key;
 if(!ObjectCreate(0,name,OBJ_TEXT,0,at,level))return;
 SetChartObject(name,tint,STYLE_SOLID);
 ObjectSetInteger(0,name,OBJPROP_ANCHOR,anchor);
 ObjectSetInteger(0,name,OBJPROP_FONTSIZE,9);
 ObjectSetString(0,name,OBJPROP_FONT,"Segoe UI");
 ObjectSetString(0,name,OBJPROP_TEXT,label);
}
string BiasText(string chart,string key)
{
 string node="",side="",kind="";
 double level=0, at=0;
 if(!Field(chart,key,node)||!Field(node,"side",side)||!Field(node,"kind",kind)||
    !Num(node,"level",level)||!Num(node,"at",at))return "-";
 return side+" "+kind+" "+Price(level)+" "+TimeToString((datetime)at,TIME_MINUTES);
}
void DrawMarker(string data,string key,color tint)
{
 string node="",kind="";
 double time=0,pivot=0,level=0,extreme=0;
 if(!Field(data,key,node)||!Field(node,"kind",kind)||!Num(node,"at",time)||
    !Num(node,"pivotAt",pivot)||!Num(node,"level",level)||time<=0||pivot<=0||level<=0)return;
 datetime at=(datetime)time;
 string line=ChartPrefix+key+"_line";
 if(ObjectCreate(0,line,OBJ_TREND,0,(datetime)pivot,level,at,level))
 {
  SetChartObject(line,tint,STYLE_DASH);
  ObjectSetInteger(0,line,OBJPROP_RAY_LEFT,false);
  ObjectSetInteger(0,line,OBJPROP_RAY_RIGHT,false);
 }
 string label=kind+" "+Price(level);
 if(Num(node,"extreme",extreme))label+=" / wick "+Price(extreme);
 ChartText(key+"_label",at,level,label,tint,key=="retest"?ANCHOR_LEFT_UPPER:ANCHOR_LEFT_LOWER);
}
void DrawPlanLine(string key,datetime at,double level,color tint)
{
 string id=ChartPrefix+key+"_line";
 if(ObjectCreate(0,id,OBJ_HLINE,0,0,level))SetChartObject(id,tint,STYLE_DOT);
 ChartText(key+"_label",at,level,"SMC "+key+" "+Price(level),tint,ANCHOR_RIGHT_LOWER);
}
void DrawStructure(string json,datetime bar)
{
 if(!InpShowSMCChart)return;
 string chart="";
 if(!Field(json,"chart",chart))return;
 ObjectsDeleteAll(0,ChartPrefix);
 chartSummary="H1 "+BiasText(chart,"h1Event")+" | M15 "+BiasText(chart,"m15Event");
 string node="",side="",status="";
 double at=0,end=0,low=0,high=0;
 if(Field(chart,"zone",node)&&Num(node,"at",at)&&Num(node,"low",low)&&Num(node,"high",high)&&
    at>0&&low>0&&high>low)
 {
  Field(node,"side",side);
  Field(node,"status",status);
  datetime until=(Num(node,"endAt",end)&&end>at)?(datetime)end:bar+PeriodSeconds(PERIOD_M5);
  color tint=status=="invalid"?clrSlateGray:side=="BUY"?clrSeaGreen:clrDarkOrange;
  string id=ChartPrefix+"fvg";
  if(ObjectCreate(0,id,OBJ_RECTANGLE,0,(datetime)at,low,until,high))
  {
   SetChartObject(id,tint,ZoneStyle(status));
   ObjectSetInteger(0,id,OBJPROP_BACK,true);
  }
  string label="FVG "+Price(low)+" - "+Price(high);
  ChartText("fvg_label",(datetime)at,high,label,tint,ANCHOR_LEFT_UPPER);
  chartSummary+="\n"+label+" | "+status;
 }
 DrawMarker(chart,"sweep",clrGold);
 DrawMarker(chart,"bos",clrDeepSkyBlue);
 DrawMarker(chart,"choch",clrOrchid);
 DrawMarker(chart,"retest",clrMediumSpringGreen);
 double sl=0,tp=0,rr=0;
 if(Field(chart,"plan",node)&&Num(node,"sl",sl)&&Num(node,"tp",tp)&&Num(node,"rr",rr)&&sl>0&&tp>0)
 {
  DrawPlanLine("SL",bar,sl,clrTomato);
  DrawPlanLine("TP",bar,tp,clrSpringGreen);
  chartSummary+=" | Plan RR "+DoubleToString(rr,2);
 }
 ChartRedraw(0);
}
string AccountPayload()
{
 return "{\"login\":\""+IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))+
        "\",\"server\":\""+Esc(AccountInfoString(ACCOUNT_SERVER))+"\",\"symbol\":\""+Esc(_Symbol)+"\"}";
}
void BridgeFailure(int http,int errorCode,string json)
{
 string detail="";
 Field(json,"error",detail);
 StringTrimLeft(json);
 StringTrimRight(json);
 statusText=http<0?"File bridge pending":"File bridge response "+IntegerToString(http);
 if(http==403 && detail=="Bridge credentials required")
  statusText+=" | Token rejected. Save the correct account in SMC Setup 1.16.";
 else if(http==403 && (detail=="Account or symbol mismatch" || detail=="Account, symbol or candle data mismatch"))
  statusText+=" | Match MT5 login, server and chart symbol with SMC Setup.";
 else if(http==403 && json=="Local dashboard required")
  statusText+=" | Close the old SMC window and start Setup 1.16.";
 else if(http==404)
  statusText+=" | Open SMC Setup 1.16.";
 else if(http==422)
  statusText+=" | Waiting for valid closed M5/M15/H1 candles.";
 else if(http<0||http>599)
  statusText+=" | "+fileBridgeNote+(errorCode>0?" (MQL "+IntegerToString(errorCode)+")":"");
 if(statusText!=lastBridgeError)Print(statusText);
 lastBridgeError=statusText;
}
bool CheckBridge()
{
 string json="",service="";
 int http=Post("/api/bridge/check",AccountPayload(),3500,json);
 int errorCode=bridgeRequestError;
 if(http!=200)
 {
  BridgeFailure(http,errorCode,json);
  return false;
 }
 if(!Field(json,"service",service)||service!="OI Gold SMC")
 {
  statusText="Unexpected file bridge service. Start SMC Setup 1.16.";
  return false;
 }
 if(!linkReady)statusText="Waiting for M5/M15/H1";
 lastBridgeError="";
 return true;
}
bool ApplyDecision(datetime bar,string json,double atr,MqlTick &tick)
{
 string action="";
 lastBridgeError="";
 DrawStructure(json,bar);
 if(!Field(json,"action",action))return false;
 if(reviewTicket!=0)lastReviewed=reviewTicket;
 if(action!="BUY"&&action!="SELL"&&action!="CLOSE"&&action!="REDUCE")
 {
  statusText="SMC "+action;
  return true;
 }
 if(!Field(json,"id",decisionID)||StringLen(decisionID)!=20||!SetLimits(json))return false;
 for(int i=0;i<20;i++)
 {
  ushort c=StringGetCharacter(decisionID,i);
  if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return false;
 }
 if(iTime(_Symbol,PERIOD_M5,0)!=bar||!Armed())statusText="Skipped: expired or auto trading off";
 else if(action=="BUY"||action=="SELL")statusText=OpenFromAI(json,action,atr,tick);
 else statusText=ManageExisting(json,action);
 Print(statusText," | AI ",decisionID);
 pendingReportId=decisionID;
 pendingReportStatus=statusText;
 FlushReport();
 return true;
}
void ClearJob()
{
 pendingJob="";
 pendingJobBar=0;
 pendingJobUntil=0;
}
void RetryBridge(int http,string reply)
{
 BridgeFailure(http,bridgeRequestError,reply);
 if(http<0||http>599||http==403||http==404)
 {
  linkReady=false;
  nextLinkCheck=0;
 }
 nextDecisionRetry=GetTickCount64()+5000;
}
void SubmitMarket(datetime bar,string market,double atr,MqlTick &tick)
{
 string json="",newJob="";
 int http=Post("/api/bridge/market",market,4500,json);
 if(http!=202||!Field(json,"job",newJob)||StringLen(newJob)!=20)
 {
  RetryBridge(http,json);
  return;
 }
 for(int i=0;i<20;i++)
 {
  ushort c=StringGetCharacter(newJob,i);
  if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))
  {
   RetryBridge(202,json);
   return;
  }
 }
 DrawStructure(json,bar);
 pendingJob=newJob;
 pendingJobBar=bar;
 pendingJobUntil=GetTickCount64()+40000;
 pendingATR=atr;
 pendingQuote=tick;
 lastBridgeError="";
 statusText="Candles uploaded | Waiting for AI review";
}
void PollDecision(datetime bar)
{
 if(GetTickCount64()>=pendingJobUntil)
 {
  statusText="AI review expired";
  lastBar=bar;
  ClearJob();
  return;
 }
 string json="";
 int http=Post("/api/bridge/poll","{\"job\":\""+pendingJob+"\"}",3500,json);
 if(http==202)return;
 if(http==410)
 {
  statusText="Review no longer available | Resending candles";
  ClearJob();
  nextDecisionRetry=GetTickCount64()+2000;
  return;
 }
 if(http!=200)
 {
  RetryBridge(http,json);
  return;
 }
 if(ApplyDecision(bar,json,pendingATR,pendingQuote))lastBar=bar;
 else
 {
  statusText="Invalid review received";
  lastBar=bar;
 }
 ClearJob();
}
string lastSetupMessage="";
bool timerReady=false;
ulong nextTimerRetry=0;

void ShowSetup(string reason)
{
 Comment("OI GOLD SMC AI 1.05 | WAIT SETUP\n",reason);
 if(reason!=lastSetupMessage)Print("SMC setup: ",reason);
 lastSetupMessage=reason;
}

bool TokenValid(string value)
{
 return StringLen(value)>=24 && StringLen(value)<=256 &&
        StringFind(value,"\n")<0 && StringFind(value,"\r")<0;
}
void RefreshBridgeToken()
{
 ulong now=GetTickCount64();
 if(now<nextTokenRead)return;
 nextTokenRead=now+4000;
 string candidate="";
 long login=AccountInfoInteger(ACCOUNT_LOGIN);
 if(login>0)
 {
  string name="OI-SMC-Bridge-"+IntegerToString(login)+".txt";
  int handle=FileOpen(name,FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON|FILE_SHARE_READ|FILE_SHARE_WRITE,0,CP_UTF8);
  if(handle!=INVALID_HANDLE)
  {
   string protocol=FileReadString(handle);
   string broker=FileReadString(handle);
   string symbol=FileReadString(handle);
   string token=FileReadString(handle);
   FileClose(handle);
   StringTrimLeft(token);
   StringTrimRight(token);
   if(protocol=="OI_SMC_BRIDGE_V1" && broker==AccountInfoString(ACCOUNT_SERVER) &&
      symbol==_Symbol && TokenValid(token))candidate=token;
  }
 }
 autoToken=candidate!="";
 if(!autoToken)
 {
  candidate=InpBridgeToken;
  StringTrimLeft(candidate);
  StringTrimRight(candidate);
 }
 if(candidate!=bridgeToken)
 {
  bridgeToken=candidate;
  linkReady=false;
  nextLinkCheck=0;
 }
}

string SetupReason()
{
 if(MQLInfoInteger(MQL_TESTER))return "SMC file bridge requires an MT5 terminal outside Strategy Tester.";
 if(_Period!=PERIOD_M5)return "Switch this chart to M5.";
 if(!TerminalInfoInteger(TERMINAL_CONNECTED))return "Waiting for MT5 broker connection.";
 RefreshBridgeToken();
 if(!TokenValid(bridgeToken))
    return "Save the matching account in SMC Setup 1.16. Manual fallback: F7 > InpBridgeToken.";
 if(AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
    return "This strategy requires an MT5 Hedging account.";
 if(!MathIsValidNumber(InpMaxRiskPercent)||!MathIsValidNumber(InpMaxTotalRiskPercent)||
    InpMaxRiskPercent<=0||InpMaxRiskPercent>100||InpMaxTotalRiskPercent<=0||InpMaxTotalRiskPercent>100)
    return "F7: risk per trade and total risk must be above 0 and at most 100.";
 if(!MathIsValidNumber(InpDailyLossPercent)||InpDailyLossPercent<0||InpDailyLossPercent>100)
    return "F7: Daily DD must be 0 (off) to 100.";
 if(InpMaxPositions<1)return "F7: maximum positions must be at least 1.";
 if(InpMinRR<=0 || InpMaxRR<InpMinRR)return "F7: check InpMinRR and InpMaxRR.";
 if(InpMinSL_ATR<=0 || InpMaxSL_ATR<InpMinSL_ATR)return "F7: check SL ATR limits.";
 if(InpMinSLPoints<1 || InpMaxSpreadPoints<1 || InpMaxDeviationPoints<0 || InpMaxPriceDriftPoints<1)
    return "F7: check stop, spread, deviation and drift points.";
 if(InpATRPeriod<2 || InpBarsToSend<40 || InpBarsToSend>200)
    return "F7: ATR period must be >= 2 and bars to send must be 40..200.";
 if(atrHandle==INVALID_HANDLE)atrHandle=iATR(_Symbol,PERIOD_M5,InpATRPeriod);
 return "";
}

void StartSMCTimer()
{
 timerReady=EventSetTimer(2);
 if(!timerReady)
 {
  ShowSetup("MT5 timer unavailable. Retrying on incoming ticks.");
  nextTimerRetry=GetTickCount64()+2000;
 }
}

void OnTick()
{
 if(!timerReady && GetTickCount64()>=nextTimerRetry)StartSMCTimer();
}

int OnInit()
{
 trade.SetExpertMagicNumber(Magic);
 trade.SetDeviationInPoints(InpMaxDeviationPoints);
 trade.SetTypeFillingBySymbol(_Symbol);
 string reason=SetupReason();
 if(reason!="")ShowSetup(reason);
 StartSMCTimer();
 return INIT_SUCCEEDED;
}
void OnDeinit(const int reason)
{
 EventKillTimer();
 ObjectsDeleteAll(0,ChartPrefix);
 if(atrHandle!=INVALID_HANDLE)IndicatorRelease(atrHandle);
 Comment("");
}
void OnTimer()
{
 string reason=SetupReason();
 if(reason!=""){ShowSetup(reason);return;}
 lastSetupMessage="";
 RefreshDay();
 ulong now=GetTickCount64();
 if(now>=nextLinkCheck)
 {
  linkReady=CheckBridge();
  nextLinkCheck=GetTickCount64()+(linkReady?30000:8000);
 }
 Comment("OI GOLD SMC AI 1.05 | ",_Symbol," M5 | ",(Armed()?"ARMED":"OBSERVE"),
         "\n",(linkReady?(autoToken?"File Bridge OK | Auto-link | ":"File Bridge OK | Manual token | "):""),statusText,
         "\nDaily equity loss: ",DoubleToString(DailyLoss(),2),"% | EA DD limit: ",
         (InpDailyLossPercent==0?"OFF":DoubleToString(InpDailyLossPercent,2)+"%")," | SMC positions: ",OwnCount(),"\n",chartSummary);
 if(!linkReady||now<nextDecisionRetry)return;
 if(atrHandle==INVALID_HANDLE)return;
 datetime bar=iTime(_Symbol,PERIOD_M5,0);
 if(bar<=0||bar==lastBar)return;
 if(pendingJob!=""&&pendingJobBar!=bar)ClearJob();
 if(pendingJob!=""){PollDecision(bar);return;}
 double atr[];
 MqlTick tick;
 if(CopyBuffer(atrHandle,0,1,1,atr)!=1||atr[0]<=0||!SymbolInfoTick(_Symbol,tick))return;
 string market=Market(atr[0],bar,tick);
 if(market=="")return;
 FlushReport();
 SubmitMarket(bar,market,atr[0],tick);
}
