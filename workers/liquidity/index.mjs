const HOUR = 3600000;
const PERIOD = 30000;
const HEADERS = {'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
const reply = (data,status=200) => Response.json(data,{status,headers:HEADERS});

function valid(s, now) {
  if (!s || !Number.isSafeInteger(s.time) || s.time < now-HOUR || s.time > now+5000 ||
      !Number.isFinite(s.offset) || s.step !== 1 || !Array.isArray(s.rows) ||
      !s.rows.length || s.rows.length > 20) return false;
  const bids = new Set(), asks = new Set();
  for (const entry of s.rows) {
    if (!Array.isArray(entry) || entry.length !== 2) return false;
    const [p,q] = entry, side = q>0 ? bids : asks;
    if (!Number.isSafeInteger(p) || p<=0 || !Number.isFinite(q) || q===0 || side.has(p)) return false;
    side.add(p);
  }
  return bids.size>0 && bids.size<=10 && asks.size>0 && asks.size<=10;
}

export class LiquidityBook {
  constructor(state) {
    this.storage = state.storage;
    this.sql = state.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS captures (slot INTEGER PRIMARY KEY,time INTEGER NOT NULL,body TEXT NOT NULL)');
  }
  prune() { this.sql.exec('DELETE FROM captures WHERE time <= ?',Date.now()-HOUR); }
  async alarm() {
    this.prune();
    if (this.sql.exec('SELECT slot FROM captures LIMIT 1').toArray().length)
      await this.storage.setAlarm(Date.now()+HOUR);
  }
  async fetch(request) {
    this.prune();
    if (request.method === 'POST') {
      let batch;
      try { batch = await request.json(); } catch { return reply({error:'Invalid JSON'},400); }
      const now = Date.now();
      if (!Array.isArray(batch) || batch.length>20 || !batch.every(s=>valid(s,now))) return reply({error:'Invalid snapshot'},400);
      for (const {time,step,rows,offset} of batch) {
        this.sql.exec('INSERT INTO captures VALUES (?,?,?) ON CONFLICT(slot) DO UPDATE SET time=excluded.time,body=excluded.body WHERE excluded.time>captures.time',
          Math.floor(time/PERIOD),time,JSON.stringify({time,step,rows,offset}));
      }
      if (batch.length && await this.storage.getAlarm()===null) await this.storage.setAlarm(now+HOUR);
      return reply({saved:true});
    }
    const after=Number(new URL(request.url).searchParams.get('after'))||0;
    const samples=this.sql.exec('SELECT body FROM captures WHERE time>? ORDER BY slot',after).toArray().map(r=>JSON.parse(r.body));
    return reply({samples});
  }
}

export default {
  async fetch(request,env) {
    if (new URL(request.url).pathname!=='/history') return reply({},404);
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:{...HEADERS,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'86400'}});
    if (!['GET','POST'].includes(request.method)) return reply({},405);
    const key=/^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization')||'');
    if (!key) return reply({error:'App sync key required'},401);
    if (request.method==='POST' && (!request.headers.has('Content-Length') || Number(request.headers.get('Content-Length'))>64000))
      return reply({error:'Invalid batch size'},413);
    return env.BOOK.getByName('browser-history:'+key[1]).fetch(request);
  }
};
