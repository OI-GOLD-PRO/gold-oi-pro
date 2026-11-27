#property strict
#property version "1.00"

string filename;
int OnInit()
{
   string server = AccountInfoString(ACCOUNT_SERVER);
   StringReplace(server, "/", "_");
   StringReplace(server, "\\", "_");
   StringReplace(server, ":", "_");
   filename = "OISMCJournal_" + server + "_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".tsv";
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
   bool ok = FileWrite(file, "OIJournal2", AccountInfoString(ACCOUNT_CURRENCY),
                       TimeToString(start,TIME_DATE), TimeToString(end,TIME_DATE|TIME_SECONDS)) > 0;
   int count = HistoryDealsTotal();
   long ownPositions[];
   ArrayResize(ownPositions,count);
   int owned=0;
   for(int i=0; i<count; i++)
   {
      ulong ticket=HistoryDealGetTicket(i);
      if(ticket && HistoryDealGetInteger(ticket,DEAL_MAGIC)==26112631 &&
         HistoryDealGetInteger(ticket,DEAL_ENTRY)==DEAL_ENTRY_IN)
      {
         long position=HistoryDealGetInteger(ticket,DEAL_POSITION_ID);
         if(position>0)ownPositions[owned++]=position;
      }
   }
   ArrayResize(ownPositions,owned);
   if(owned>0)ArraySort(ownPositions);
   for(int i=0; ok && i<count; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(!ticket) { ok=false; break; }
      long type = HistoryDealGetInteger(ticket,DEAL_TYPE);
      if(type!=DEAL_TYPE_BUY && type!=DEAL_TYPE_SELL) continue;
      long position=HistoryDealGetInteger(ticket,DEAL_POSITION_ID);
      int index=owned>0?ArrayBsearch(ownPositions,position):-1;
      if(HistoryDealGetInteger(ticket,DEAL_MAGIC)!=26112631 &&
         (index<0||ownPositions[index]!=position))continue;
      string note=HistoryDealGetString(ticket,DEAL_COMMENT);
      string id=(StringFind(note,"OI:")==0 ? StringSubstr(note,3,20) : "-");
      StringReplace(id,"\t","");StringReplace(id,"\r","");StringReplace(id,"\n","");
      ok = FileWrite(file, TimeToString((datetime)HistoryDealGetInteger(ticket,DEAL_TIME),TIME_DATE|TIME_SECONDS),
         (string)ticket, HistoryDealGetString(ticket,DEAL_SYMBOL), type==DEAL_TYPE_BUY?"BUY":"SELL",
         EnumToString((ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket,DEAL_ENTRY)),
         HistoryDealGetDouble(ticket,DEAL_VOLUME),HistoryDealGetDouble(ticket,DEAL_PROFIT),
         HistoryDealGetDouble(ticket,DEAL_COMMISSION),HistoryDealGetDouble(ticket,DEAL_SWAP),
         HistoryDealGetDouble(ticket,DEAL_FEE),(string)HistoryDealGetInteger(ticket,DEAL_POSITION_ID),id) > 0;
   }
   FileClose(file);
   if(ok && FileMove(tmp,FILE_COMMON,filename,FILE_COMMON|FILE_REWRITE)) return;
   FileDelete(tmp,FILE_COMMON);
}
