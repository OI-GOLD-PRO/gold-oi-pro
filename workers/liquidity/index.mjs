const HOUR = 3600000;
const PERIOD = 5000;
const DEPTH = 'https://fapi.binance.com/fapi/v1/depth?symbol=XAUUSDT&limit=1000';

function levels(entries, sign) {
  const totals = new Map();
  for (const [p,q] of entries) {
    const tick = Math.floor(Math.round(Number(p)*100)/50);
    const qty = Number(q);
    if (Number.isFinite(tick) && tick > 0 && Number.isFinite(qty) && qty > 0)
      totals.set(tick,(totals.get(tick) || 0) + sign*qty);
  }
  return [...totals];
}

export class LiquidityBook {
  constructor(state) {
    this.storage = state.storage;
    this.sql = this.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS books (time INTEGER PRIMARY KEY, rows TEXT NOT NULL)');
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/wake') {
      if (await this.storage.getAlarm() === null) await this.storage.setAlarm(Date.now()+1);
      return new Response(null,{status:204});
    }
    const cutoff = Math.max(Date.now()-HOUR, Number(url.searchParams.get('after')) || 0);
    const batch = this.sql.exec('SELECT time,rows FROM books WHERE time > ? ORDER BY time LIMIT 60',cutoff).toArray();
    return Response.json({samples:batch.map(b=>({time:b.time,rows:JSON.parse(b.rows)})),more:batch.length===60},
      {headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
  }

  async alarm() {
    const start = Date.now();
    let delay = PERIOD;
    try {
      this.sql.exec('DELETE FROM books WHERE time <= ?',start-HOUR);
      const response = await fetch(DEPTH,{cache:'no-store',signal:AbortSignal.timeout(7000)});
      if (!response.ok) {
        delay = response.status === 451 ? 3600000 : Math.max(60000,(Number(response.headers.get('Retry-After'))||0)*1000);
        throw Error('Binance HTTP ' + response.status);
      }
      const book = await response.json();
      const time = Number(book.E || book.T);
      if (!Number.isSafeInteger(time) || Math.abs(time-Date.now()) > 30000) throw Error('Stale book');
      const bids = levels(book.bids,1), asks = levels(book.asks,-1);
      if (!bids.length || !asks.length) throw Error('Incomplete book');
      this.sql.exec('INSERT OR IGNORE INTO books VALUES (?,?)',time,JSON.stringify([...bids,...asks]));
    } catch (error) {
      console.warn('Liquidity capture',error.message);
      delay = Math.max(delay,15000);
    } finally {
      await this.storage.setAlarm(Math.max(Date.now()+250,start+delay));
    }
  }
}

const singleton = env => env.BOOK.getByName('binance-xauusdt');
export default {
  async scheduled(event,env,ctx) {
    ctx.waitUntil(singleton(env).fetch('https://internal/wake'));
  },
  fetch(request,env) {
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/history') return new Response(null,{status:404});
    return singleton(env).fetch(request);
  }
};
