import { readFile } from 'node:fs/promises';

function rawJournal(snapshot, day, decisions, symbolFilter) {
  const text = snapshot.replace(/^\uFEFF/, '').trimEnd();
  const [header, ...lines] = text.split(/\r?\n/);
  const [version, currency, first, last] = header.replaceAll('.', '-').split('\t');
  if (!['OIJournal1','OIJournal2'].includes(version) || !currency || !/^\d{4}-\d\d-\d\d$/.test(first) ||
      !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(last)) throw Error('Invalid journal header');
  const selected = day || last.slice(0, 10);
  const rows = [];
  const tickets = new Set();
  const reasons = new Map(decisions.map(d=>[d.id,d.reason]));
  const positions = new Map();
  if(version==='OIJournal2') for(const line of lines){
    const fields=line.split('\t');
    if(fields[4]==='DEAL_ENTRY_IN' && reasons.has(fields[11])) positions.set(fields[10],fields[11]);
  }
  for (const line of lines) {
    const [time, ticket, symbol, side, entry, ...values] = line.split('\t');
    const [position,id]=values.splice(5);
    if (symbolFilter && symbol !== symbolFilter) continue;
    const reason=reasons.get(id)||reasons.get(positions.get(position))||null;
    if (time.slice(0, 10).replaceAll('.', '-') !== selected) continue;
    if (!/^\d+$/.test(ticket) || tickets.has(ticket) || values.length !== 5 ||
        !values.every(v => v.trim() && Number.isFinite(Number(v)))) throw Error('Invalid journal row');
    tickets.add(ticket);
    const [volume, profit, commission, swap, fee] = values.map(Number);
    rows.push({ time: time.slice(11), ticket, symbol, side, entry, volume, reason,
      net: profit + commission + swap + fee });
  }
  return { currency, first, last, day: selected, rows, net: rows.reduce((sum, row) => sum + row.net, 0) };
}
export async function dailyJournal(path, day, decisions = [], symbolFilter) {
  const snapshot = await readFile(path, 'utf16le');
  const report = rawJournal(snapshot, day, decisions, symbolFilter);
  const visible = new Map(report.rows.map(row => [String(row.ticket), row]));
  const reasons = new Map(decisions.map(decision => [decision.id, decision.reason]));
  const lines = snapshot.split(/\r?\n/).slice(1);
  // oi-dashboard-positions
  const opened = [];
  const histories = new Map();
  const seen = new Set();
  for (const line of lines) {
    const [stamp,ticket,symbol,side,kind,qty,profit,commission,swap,fee,pos,id] = line.split('\t');
    if ((symbolFilter && symbol !== symbolFilter) || !/^\d+$/.test(ticket) || seen.has(ticket)) continue;
    seen.add(ticket);
    const time = stamp.replaceAll('.', '-');
    const position = /^\d+$/.test(pos || '') && pos !== '0' ? pos : null;
    const leg = {time,ticket,side,kind,volume:Number(qty),net:[profit,commission,swap,fee].reduce((s,n)=>s+Number(n),0)};
    if (position) {
      if (!histories.has(position)) histories.set(position,[]);
      histories.get(position).push(leg);
    }
    if (visible.has(ticket) && kind === 'DEAL_ENTRY_IN') {
      opened.push({symbol,position,...leg,reason:visible.get(ticket)?.reason || reasons.get(id)||null});
    }
  }
  for (const trade of opened) {
    trade.exits = (histories.get(trade.position)||[]).filter(d=>['DEAL_ENTRY_OUT','DEAL_ENTRY_OUT_BY'].includes(d.kind));
  }
  return {...report, opened};
}
