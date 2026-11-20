import { readFile } from 'node:fs/promises';

export async function dailyJournal(path, day, decisions = []) {
  const text = (await readFile(path, 'utf16le')).replace(/^\uFEFF/, '').trimEnd();
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
