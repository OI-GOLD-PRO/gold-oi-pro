#property strict
#property version "1.00"

string filename;
int OnInit()
{
   string server = AccountInfoString(ACCOUNT_SERVER);
   StringReplace(server, "/", "_");
   StringReplace(server, "\\", "_");
   StringReplace(server, ":", "_");
   filename = "OIJournal_" + server + "_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".tsv";
   if(!EventSetTimer(30)) return INIT_FAILED;
   Print("Journal path: ", TerminalInfoString(TERMINAL_COMMONDATA_PATH), "\\Files\\", filename);
   OnTimer();
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer()
{
   if(!TerminalInfoInteger(TERMINAL_CONNECTED)) return;
   datetime end = TimeTradeServer();
   datetime start = StringToTime(TimeToString(end, TIME_DATE)) - 29 * 86400;
   if(end <= 0 || !HistorySelect(start, end)) return;
   string tmp = filename + "." + IntegerToString(ChartID()) + ".tmp";
   int file = FileOpen(tmp, FILE_WRITE | FILE_CSV | FILE_UNICODE | FILE_COMMON, '\t');
   if(file == INVALID_HANDLE) return;
   bool ok = FileWrite(file, "OIJournal1", AccountInfoString(ACCOUNT_CURRENCY),
                       TimeToString(start,TIME_DATE), TimeToString(end,TIME_DATE|TIME_SECONDS)) > 0;
   int count = HistoryDealsTotal();
   for(int i=0; ok && i<count; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(!ticket) { ok=false; break; }
      long type = HistoryDealGetInteger(ticket,DEAL_TYPE);
      if(type!=DEAL_TYPE_BUY && type!=DEAL_TYPE_SELL) continue;
      ok = FileWrite(file, TimeToString((datetime)HistoryDealGetInteger(ticket,DEAL_TIME),TIME_DATE|TIME_SECONDS),
         (string)ticket, HistoryDealGetString(ticket,DEAL_SYMBOL), type==DEAL_TYPE_BUY?"BUY":"SELL",
         EnumToString((ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket,DEAL_ENTRY)),
         HistoryDealGetDouble(ticket,DEAL_VOLUME),HistoryDealGetDouble(ticket,DEAL_PROFIT),
         HistoryDealGetDouble(ticket,DEAL_COMMISSION),HistoryDealGetDouble(ticket,DEAL_SWAP),
         HistoryDealGetDouble(ticket,DEAL_FEE)) > 0;
   }
   FileClose(file);
   if(ok && FileMove(tmp,FILE_COMMON,filename,FILE_COMMON|FILE_REWRITE)) return;
   FileDelete(tmp,FILE_COMMON);
}
