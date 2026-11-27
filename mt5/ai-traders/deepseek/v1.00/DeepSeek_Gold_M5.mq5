#property strict
#property version "1.00"
#include <Trade/Trade.mqh>
CTrade trade;

input string InpApiKey = ""; // DeepSeek key; keep .set files private
input string InpModel = "deepseek-flash";
input bool InpEnableTrading = false; // enable only after demo testing
input double InpRiskPercent = 0.5;
input double InpDailyLossPercent = 2.0;
input double InpRR = 2.0;
input int InpMaxSpreadPoints = 35;
input int InpMinSLPoints = 150;
input double InpATRMultiplier = 1.5;
input int InpATRPeriod = 14;
input int InpEMAPeriod = 50;
input int InpBarsToSend = 40;
input int InpTimeoutMs = 12000;
input ulong InpMagic = 26052026;
input int InpDeviationPoints = 30;

int atrHandle = INVALID_HANDLE, emaHandle = INVALID_HANDLE;
datetime lastBar=0;
double dayStartEquity=0;
int dayCode=-1;
string lastStatus="Waiting";

string EscapeJson(string s)
{
  StringReplace(s,"\\","\\\\");
  StringReplace(s,"\"","\\\"");
  StringReplace(s,"\r", "");
  StringReplace(s,"\n", "\\n");
  return s;
}
// Extract a JSON string value; supports escaped characters and nested response text.
bool JsonString(string json,string key,string &value)
{
  string needle="\""+key+"\"";
  int p=StringFind(json,needle);
  if(p<0) return false;
  p=StringFind(json,":",p+StringLen(needle));
  if(p<0) return false;
  p++;
  while(p<StringLen(json) && StringGetCharacter(json,p)<=32) p++;
  if(p>=StringLen(json) || StringGetCharacter(json,p)!=34) return false;
  p++; value=""; bool escaped=false;
  for(int i=p;i<StringLen(json);i++)
  {
    ushort c=StringGetCharacter(json,i);
    if(escaped)
    {
      if(c==110) value+="\n";
      else if(c==114) value+="\r";
      else if(c==116) value+="\t";
      else value+=ShortToString(c);
      escaped=false;
    }
    else if(c==92) escaped=true;
    else if(c==34) return true;
    else value+=ShortToString(c);
  }
  return false;
}
int TodayCode()
{
  MqlDateTime d; TimeToStruct(TimeCurrent(),d);
  return d.year*10000+d.mon*100+d.day;
}
void RefreshDaily()
{
  int d=TodayCode();
  if(d!=dayCode){ dayCode=d; dayStartEquity=AccountInfoDouble(ACCOUNT_EQUITY); }
}
bool DailyAllowed()
{
  RefreshDaily();
  if(dayStartEquity<=0) return false;
  return AccountInfoDouble(ACCOUNT_EQUITY)>dayStartEquity*(1.0-InpDailyLossPercent/100.0);
}
int CountOwnPositions()
{
  int n=0;
  for(int i=PositionsTotal()-1;i>=0;i--)
  {
    ulong ticket=PositionGetTicket(i);
    if(ticket>0 && PositionGetString(POSITION_SYMBOL)==_Symbol && (ulong)PositionGetInteger(POSITION_MAGIC)==InpMagic) n++;
  }
  return n;
}
string MarketPayload(double atr,double ema)
{
  MqlRates rates[]; ArraySetAsSeries(rates,true);
  int count=MathMax(10,MathMin(100,InpBarsToSend));
  if(CopyRates(_Symbol,PERIOD_M5,1,count,rates)!=count) return "";
  MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return "";
  string s="{\"symbol\":\""+EscapeJson(_Symbol)+"\",\"timeframe\":\"M5\",\"bid\":"+DoubleToString(tick.bid,_Digits)+",\"ask\":"+DoubleToString(tick.ask,_Digits)+",\"atr\":"+DoubleToString(atr,_Digits)+",\"ema50\":"+DoubleToString(ema,_Digits)+",\"candles_oldest_first\":[";
  for(int i=count-1;i>=0;i--)
  {
    if(i<count-1) s+=",";
    s+="["+IntegerToString((long)rates[i].time)+","+DoubleToString(rates[i].open,_Digits)+","+DoubleToString(rates[i].high,_Digits)+","+DoubleToString(rates[i].low,_Digits)+","+DoubleToString(rates[i].close,_Digits)+","+IntegerToString(rates[i].tick_volume)+"]";
  }
  return s+"]}";
}
bool AskDeepSeek(string market,string &action,string &reason)
{
  string sys="You are a cautious XAUUSD M5 trading signal analyst. Analyze ONLY provided closed candles, ATR and EMA. Do not invent order flow, news, OI, or missing data. Return strictly a JSON object with string keys action (BUY, SELL or WAIT) and reason (short ASCII English). Prefer WAIT when uncertain. No markdown.";
  string body="{\"model\":\""+EscapeJson(InpModel)+"\",\"thinking\":{\"type\":\"disabled\"},\"response_format\":{\"type\":\"json_object\"},\"max_tokens\":180,\"messages\":[{\"role\":\"system\",\"content\":\""+EscapeJson(sys)+"\"},{\"role\":\"user\",\"content\":\""+EscapeJson(market)+"\"}]}";
  char payload[],response[];
  int bytes=StringToCharArray(body,payload,0,WHOLE_ARRAY,CP_UTF8);
  if(bytes<=1) return false;
  ArrayResize(payload,bytes-1); // remove terminal null
  string headers="Content-Type: application/json\r\nAuthorization: Bearer "+InpApiKey+"\r\n";
  string resultHeaders="";
  ResetLastError();
  int status=WebRequest("POST","https://api.deepseek.com/chat/completions",headers,InpTimeoutMs,payload,response,resultHeaders);
  if(status!=200){lastStatus="API HTTP="+IntegerToString(status)+" err="+IntegerToString(GetLastError()); Print(lastStatus);return false;}
  string raw=CharArrayToString(response,0,-1,CP_UTF8);
  string finish="";
  if(!JsonString(raw,"finish_reason",finish) || finish!="stop") {lastStatus="AI incomplete";return false;}
  string content="";
  if(!JsonString(raw,"content",content)) {lastStatus="AI content missing";return false;}
  if(!JsonString(content,"action",action) || !JsonString(content,"reason",reason)) {lastStatus="AI invalid JSON fields";return false;}
  if(action!="BUY" && action!="SELL" && action!="WAIT") {lastStatus="AI invalid action";return false;}
  if(StringLen(reason)>120) reason=StringSubstr(reason,0,120);
  return true;
}
double VolumeForRisk(ENUM_ORDER_TYPE type,double entry,double stop)
{
  double oneLotLoss=0;
  if(!OrderCalcProfit(type,_Symbol,1.0,entry,stop,oneLotLoss)) return 0;
  oneLotLoss=MathAbs(oneLotLoss);
  if(oneLotLoss<=0) return 0;
  double riskMoney=AccountInfoDouble(ACCOUNT_EQUITY)*InpRiskPercent/100.0;
  double raw=riskMoney/oneLotLoss;
  double minv=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN), maxv=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX),step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
  if(step<=0 || raw<minv) return 0; // never round up beyond risk budget
  double lots=MathFloor(MathMin(raw,maxv)/step+1e-9)*step;
  return NormalizeDouble(lots,8);
}
void ProcessClosedBar()
{
  if(!InpEnableTrading){lastStatus="Trading disabled (demo first)";return;}
  if(StringLen(InpApiKey)<8){lastStatus="Missing API key";return;}
  if(!DailyAllowed()){lastStatus="Daily loss limit";return;}
  if(CountOwnPositions()>0){lastStatus="Existing EA position";return;}
  if((int)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_MODE)!=SYMBOL_TRADE_MODE_FULL){lastStatus="Symbol not tradable";return;}
  MqlTick tick; if(!SymbolInfoTick(_Symbol,tick)) return;
  if(tick.ask<=tick.bid || (tick.ask-tick.bid)/_Point>InpMaxSpreadPoints){lastStatus="Spread filter";return;}
  double a[],e[];
  if(CopyBuffer(atrHandle,0,1,1,a)!=1 || CopyBuffer(emaHandle,0,1,1,e)!=1 || a[0]<=0){lastStatus="Indicators not ready";return;}
  string market=MarketPayload(a[0],e[0]); if(market==""){lastStatus="Missing candles";return;}
  string action="",reason="";
  if(!AskDeepSeek(market,action,reason)) return;
  lastStatus=action+" | "+reason;
  Print("DeepSeek: ",lastStatus);
  if(action=="WAIT") return;
  // Refresh market after network latency; reject large drift from request quote.
  MqlTick fresh; if(!SymbolInfoTick(_Symbol,fresh)) return;
  if((fresh.ask-fresh.bid)/_Point>InpMaxSpreadPoints) return;
  if(MathAbs(fresh.bid-tick.bid)>a[0]*0.20){lastStatus="Price drift";return;}
  if(!DailyAllowed() || CountOwnPositions()>0) return;
  ENUM_ORDER_TYPE type=(action=="BUY"?ORDER_TYPE_BUY:ORDER_TYPE_SELL);
  double entry=(type==ORDER_TYPE_BUY?fresh.ask:fresh.bid);
  double stopLevel=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point;
  double slDistance=MathMax(MathMax(InpMinSLPoints*_Point,a[0]*InpATRMultiplier),stopLevel+2*_Point);
  double sl=NormalizeDouble(entry+(type==ORDER_TYPE_BUY?-slDistance:slDistance),_Digits);
  double tp=NormalizeDouble(entry+(type==ORDER_TYPE_BUY?slDistance*InpRR:-slDistance*InpRR),_Digits);
  double lots=VolumeForRisk(type,entry,sl);
  if(lots<=0){lastStatus="Risk too small for minimum lot";return;}
  double margin=0;
  if(!OrderCalcMargin(type,_Symbol,lots,entry,margin) || margin>AccountInfoDouble(ACCOUNT_MARGIN_FREE)){lastStatus="Insufficient margin";return;}
  trade.SetExpertMagicNumber(InpMagic);
  trade.SetDeviationInPoints(InpDeviationPoints);
  trade.SetTypeFillingBySymbol(_Symbol);
  bool ok=trade.PositionOpen(_Symbol,type,lots,entry,sl,tp,"DeepSeek M5 v1.00");
  Print("Order ",ok," retcode=",trade.ResultRetcode()," ",trade.ResultRetcodeDescription()," lots=",lots," SL=",sl," TP=",tp);
}
int OnInit()
{
  if(_Period!=PERIOD_M5){Print("Attach EA to M5 chart");return INIT_PARAMETERS_INCORRECT;}
  if(InpRiskPercent<=0 || InpRiskPercent>5 || InpDailyLossPercent<=0 || InpRR<=0 || InpATRMultiplier<=0 || InpBarsToSend<10) return INIT_PARAMETERS_INCORRECT;
  atrHandle=iATR(_Symbol,PERIOD_M5,InpATRPeriod);
  emaHandle=iMA(_Symbol,PERIOD_M5,InpEMAPeriod,0,MODE_EMA,PRICE_CLOSE);
  if(atrHandle==INVALID_HANDLE || emaHandle==INVALID_HANDLE) return INIT_FAILED;
  trade.SetExpertMagicNumber(InpMagic);
  RefreshDaily();
  lastBar=iTime(_Symbol,PERIOD_M5,0);
  EventSetTimer(2);
  return INIT_SUCCEEDED;
}
void OnDeinit(const int reason)
{
  EventKillTimer();
  if(atrHandle!=INVALID_HANDLE) IndicatorRelease(atrHandle);
  if(emaHandle!=INVALID_HANDLE) IndicatorRelease(emaHandle);
  Comment("");
}
void OnTimer()
{
  RefreshDaily();
  Comment("DeepSeek Gold M5 v1.00\n",_Symbol," | ",InpEnableTrading?"AUTO":"OFF","\n",lastStatus,"\nEquity: ",DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)," | Day baseline: ",DoubleToString(dayStartEquity,2));
  datetime current=iTime(_Symbol,PERIOD_M5,0);
  if(current<=0 || current==lastBar) return;
  lastBar=current;
  ProcessClosedBar();
}
