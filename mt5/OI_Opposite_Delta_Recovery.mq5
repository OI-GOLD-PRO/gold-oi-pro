#property copyright "OI Gold Pro"
#property version "1.00"
#property strict

#include <Trade\Trade.mqh>

input string          WorkerURL       = "";
input string          AppChart        = "gold";  // gold or gcy, as selected in OI Gold Pro
input ENUM_TIMEFRAMES SignalTF        = PERIOD_M5;
input bool            TradeEnabled    = false;
input ulong           Magic           = 26111901;
input double          Lots            = 0.01;
input double          RecoveryLots    = 0.01;
input int             SingleTPPoints  = 300;
input int             RecoveryAtPoints = 500;
input int             BasketTPPoints  = 100;
input int             MaxSignalAgeSec = 55;
input int             PollSeconds     = 3;
input ulong           DeviationPoints = 35;

CTrade trade;
string endpoint, stateKey, streamKey, lockKey;
double tickSize, pointSize;
int digits;
bool ownsLock = false;
datetime started;

struct Basket
{
   ulong tickets[];
   double lots;
   double weighted;
   long recoverySignal;
   bool adverse;
};

string SideKey(const int side, const string field)
{
   return stateKey + (side > 0 ? ".B." : ".S.") + field;
}

double Saved(const string key)
{
   double value = 0;
   GlobalVariableGet(key, value);
   return value;
}

bool Persist(const string key, const double value)
{
   if(GlobalVariableSet(key,value) == 0)
   {
      Print("Cannot save EA state ",key," error=",GetLastError());
      return false;
   }
   GlobalVariablesFlush();
   return true;
}

string TimeframeName()
{
   switch(SignalTF)
   {
      case PERIOD_M1:  return "1m";
      case PERIOD_M5:  return "5m";
      case PERIOD_M15: return "15m";
      case PERIOD_M30: return "30m";
      case PERIOD_H1:  return "1h";
      case PERIOD_H4:  return "4h";
      case PERIOD_D1:  return "1d";
      default:        return "";
   }
}

bool ValidLots(const double volume)
{
   const double step = SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   if(step <= 0 || volume < SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN) ||
      volume > SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX)) return false;
   return MathAbs(volume / step - MathRound(volume / step)) < 0.000001;
}

int OnInit()
{
   const string frame = TimeframeName();
   if((AppChart != "gold" && AppChart != "gcy") || frame == "" ||
      StringFind(WorkerURL,"https://") != 0 || StringLen(WorkerURL) <= 8 ||
      Magic == 0 || SingleTPPoints <= 0 || RecoveryAtPoints <= 0 ||
      BasketTPPoints <= 0 || MaxSignalAgeSec < 5 || MaxSignalAgeSec > 59 ||
      PollSeconds < 1 || PollSeconds >= MaxSignalAgeSec ||
      !ValidLots(Lots) || !ValidLots(RecoveryLots)) return INIT_PARAMETERS_INCORRECT;
   if(MQLInfoInteger(MQL_TESTER) ||
      (TradeEnabled && AccountInfoInteger(ACCOUNT_MARGIN_MODE) != ACCOUNT_MARGIN_MODE_RETAIL_HEDGING))
   {
      Print("Live feed requires a regular MT5 chart. Trading requires a hedging account.");
      return INIT_FAILED;
   }

   string base = WorkerURL;
   while(StringLen(base) > 8 && StringSubstr(base,StringLen(base)-1) == "/")
      base = StringSubstr(base,0,StringLen(base)-1);
   endpoint = base + "/odd/v1/" + AppChart + "/" + frame;
   stateKey = "ODD." + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) +
              "." + (string)Magic + "." + _Symbol;
   streamKey = stateKey + "." + AppChart + "." + frame;
   lockKey = stateKey + ".lock";
   if(StringLen(streamKey) + 5 > 63) return INIT_PARAMETERS_INCORRECT;

   pointSize = SymbolInfoDouble(_Symbol,SYMBOL_POINT);
   tickSize = SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   digits = (int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   if(pointSize <= 0 || tickSize <= 0) return INIT_FAILED;

   if(TradeEnabled)
   {
      // Claim the symbol/magic in this terminal. The compare-and-set is atomic.
      GlobalVariableTemp(lockKey);
      ownsLock = GlobalVariableSetOnCondition(lockKey,1,0);
      if(!ownsLock)
      {
         Print("Another trading instance uses this symbol and Magic.");
         return INIT_FAILED;
      }
   }
   trade.SetExpertMagicNumber(Magic);
   trade.SetDeviationInPoints(DeviationPoints);
   if(!trade.SetTypeFillingBySymbol(_Symbol)) return INIT_FAILED;
   started = TimeGMT();
   if(!EventSetTimer(PollSeconds)) return INIT_FAILED;
   Print("Opposite Delta stream ",endpoint,"  Trading enabled: ",TradeEnabled);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   if(ownsLock) GlobalVariableDel(lockKey);
}

bool IsOurPosition(const int side)
{
   return PositionGetString(POSITION_SYMBOL) == _Symbol &&
          (ulong)PositionGetInteger(POSITION_MAGIC) == Magic &&
          PositionGetInteger(POSITION_TYPE) == (side > 0 ? POSITION_TYPE_BUY : POSITION_TYPE_SELL);
}

void ReadBasket(const int side, const MqlTick &quote, Basket &basket)
{
   ArrayResize(basket.tickets,0);
   basket.lots = basket.weighted = 0;
   basket.recoverySignal = 0;
   basket.adverse = false;
   const double exitPrice = side > 0 ? quote.bid : quote.ask;
   for(int i = PositionsTotal()-1; i >= 0; --i)
   {
      const ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !IsOurPosition(side)) continue;
      const int size = ArraySize(basket.tickets);
      if(ArrayResize(basket.tickets,size+1) != size+1) continue;
      basket.tickets[size] = ticket;
      const double price = PositionGetDouble(POSITION_PRICE_OPEN);
      const double volume = PositionGetDouble(POSITION_VOLUME);
      basket.lots += volume;
      basket.weighted += price * volume;
      if(side * (price - exitPrice) >= RecoveryAtPoints * pointSize) basket.adverse = true;
      const string note = PositionGetString(POSITION_COMMENT);
      if(StringFind(note,"ODDR:") == 0)
      {
         const long signal = StringToInteger(StringSubstr(note,5));
         if(signal > basket.recoverySignal) basket.recoverySignal = signal;
      }
   }
}

double RoundTarget(const int side, const double price)
{
   const double units = price / tickSize;
   return NormalizeDouble((side > 0 ? MathCeil(units - 1e-8) : MathFloor(units + 1e-8)) * tickSize,digits);
}

double MinDistance()
{
   return MathMax(SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL),
                  SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL)) * pointSize;
}

bool Done()
{
   const uint result = trade.ResultRetcode();
   return result == TRADE_RETCODE_DONE || result == TRADE_RETCODE_DONE_PARTIAL ||
          result == TRADE_RETCODE_NO_CHANGES;
}

void ProtectTicket(const ulong ticket, const int side, const double target, const MqlTick &quote)
{
   if(!PositionSelectByTicket(ticket) || !IsOurPosition(side)) return;
   const double remaining = side * (target - (side > 0 ? quote.bid : quote.ask));
   if(remaining <= 0)
   {
      if(!trade.PositionClose(ticket,DeviationPoints) || !Done())
         Print("Close failed #",ticket," ",trade.ResultRetcodeDescription());
      return;
   }
   if(MathAbs(PositionGetDouble(POSITION_TP) - target) < tickSize * 0.5 || remaining < MinDistance()) return;
   if(!trade.PositionModify(ticket,0.0,target) || !Done())
      Print("TP update failed #",ticket," ",trade.ResultRetcodeDescription());
}

void ManageSide(const int side, const MqlTick &quote)
{
   Basket basket;
   ReadBasket(side,quote,basket);
   const string armedKey = SideKey(side,"armed");
   const string recoveryKey = SideKey(side,"recovery");
   const string targetKey = SideKey(side,"target");
   const string closeKey = SideKey(side,"close");
   const double previousRecovery = Saved(recoveryKey);
   double target = Saved(targetKey);

   if(basket.lots <= 0)
   {
      GlobalVariableDel(armedKey);
      GlobalVariableDel(recoveryKey);
      GlobalVariableDel(targetKey);
      GlobalVariableDel(closeKey);
      return;
   }
   if(basket.adverse && Saved(armedKey) == 0) Persist(armedKey,1);
   if(basket.recoverySignal > previousRecovery)
   {
      target = RoundTarget(side,basket.weighted / basket.lots + side * BasketTPPoints * pointSize);
      if(Persist(targetKey,target)) Persist(recoveryKey,(double)basket.recoverySignal);
   }
   const bool reached = target > 0 && side * (target - (side > 0 ? quote.bid : quote.ask)) <= 0;
   if(reached && Saved(closeKey) == 0) Persist(closeKey,1);
   const bool closing = reached || Saved(closeKey) != 0;
   for(int i = 0; i < ArraySize(basket.tickets); ++i)
   {
      const ulong ticket = basket.tickets[i];
      if(!PositionSelectByTicket(ticket) || !IsOurPosition(side)) continue;
      if(closing)
      {
         if(!trade.PositionClose(ticket,DeviationPoints) || !Done())
            Print("Basket close failed #",ticket," ",trade.ResultRetcodeDescription());
         continue;
      }
      const double single = RoundTarget(side,PositionGetDouble(POSITION_PRICE_OPEN) + side * SingleTPPoints * pointSize);
      ProtectTicket(ticket,side,target > 0 ? target : single,quote);
   }
}

void Manage()
{
   if(!TradeEnabled || !TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ||
      !MQLInfoInteger(MQL_TRADE_ALLOWED)) return;
   MqlTick quote;
   if(!SymbolInfoTick(_Symbol,quote) || quote.bid <= 0 || quote.ask <= 0) return;
   ManageSide(1,quote);
   ManageSide(-1,quote);
}

void OnTick()
{
   Manage();
}

void Enter(const int side, const long signal)
{
   MqlTick quote;
   if(!SymbolInfoTick(_Symbol,quote) || quote.bid <= 0 || quote.ask <= 0 ||
      !TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) return;

   ManageSide(side,quote);
   Basket basket;
   ReadBasket(side,quote,basket);
   if(Saved(SideKey(side,"close")) != 0) return;
   const bool recovery = basket.lots > 0 &&
      (basket.adverse || Saved(SideKey(side,"armed")) > 0 || basket.recoverySignal > 0 ||
       Saved(SideKey(side,"recovery")) > 0);
   const double volume = recovery ? RecoveryLots : Lots;
   const double estimate = side > 0 ? quote.ask : quote.bid;
   // Attach a broker-valid TP on submission. ManageSide reconciles after the fill.
   const double exitPrice = side > 0 ? quote.bid : quote.ask;
   const double distance = MathMax(SingleTPPoints * pointSize,MinDistance() + tickSize);
   const double tp = RoundTarget(side,estimate + side * distance);
   const string note = (recovery ? "ODDR:" : "ODDS:") + (string)signal;
   if(side * (tp - exitPrice) <= 0) return;
   // Persist before sending to prevent duplicate market orders after a terminal restart.
   if(!Persist(streamKey + ".last",(double)signal)) return;
   const bool submitted = side > 0 ? trade.Buy(volume,_Symbol,0.0,0.0,tp,note) :
                                      trade.Sell(volume,_Symbol,0.0,0.0,tp,note);
   if(!submitted || !Done())
      Print("Entry response at ",signal,": ",trade.ResultRetcodeDescription());
   if(SymbolInfoTick(_Symbol,quote)) ManageSide(side,quote);
}

void OnTimer()
{
   Manage();
   char body[], result[];
   string headers;
   const int status = WebRequest("GET",endpoint,"",2200,body,result,headers);
   if(status != 200)
   {
      if(status != 204) Comment("OI Opposite Delta: feed error ",status," / ",GetLastError());
      return;
   }
   string payload = CharArrayToString(result,0,ArraySize(result),CP_UTF8);
   StringTrimRight(payload);
   string parts[];
   if(StringSplit(payload,9,parts) != 6 || parts[0] != "ODD1") return;
   const long signal = StringToInteger(parts[1]);
   const long age = (long)TimeGMT() - signal;
   const double delta = StringToDouble(parts[3]), total = StringToDouble(parts[4]);
   if(signal <= 0 || total <= 0 || MathAbs(delta) > total ||
      (parts[5] != "binance" && parts[5] != "bitget")) return;
   Comment("OI Opposite Delta · ",AppChart," ",TimeframeName()," · ",parts[2],
           "\nDelta ",parts[3]," / Volume ",parts[4]," · ",parts[5]," · ",age,"s",
           "\n",TradeEnabled ? "Trading enabled" : "Monitor only");
   if(!TradeEnabled || age < 0 || age > MaxSignalAgeSec || signal <= started ||
      signal <= Saved(streamKey + ".last")) return;
   if(parts[2] == "BUY" && delta < 0) Enter(1,signal);
   if(parts[2] == "SELL" && delta > 0) Enter(-1,signal);
}
