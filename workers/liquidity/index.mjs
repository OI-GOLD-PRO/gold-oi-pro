import { rankBook } from '../../liquidity-levels.mjs';

const HOUR = 3600000;
const PERIOD = 30000;
const DEPTH = 'https://fapi.binance.com/fapi/v1/depth?symbol=XAUUSDT&limit=1000';

export class LiquidityBook {
  constructor(state) {
    this.storage = state.storage;
    this.sql = this.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS ranked_books (time INTEGER PRIMARY KEY, rows TEXT NOT NULL)');
  }

  async fetch(request) {
    const url = new URL(request.url);
    let nextAttempt = await this.storage.getAlarm();
    if (nextAttempt === null) {
      nextAttempt = Date.now()+1;
      await this.storage.setAlarm(nextAttempt);
    }
    if (url.pathname === '/wake') {
      return new Response(null,{status:204});
    }
    const cutoff = Math.max(Date.now()-HOUR, Number(url.searchParams.get('after')) || 0);
    const batch = this.sql.exec('SELECT time,rows FROM ranked_books WHERE time > ? ORDER BY time LIMIT 60',cutoff).toArray();
    return Response.json({samples:batch.map(b=>({time:b.time,...JSON.parse(b.rows)})),more:batch.length===60,nextAttempt,lastAttempt:await this.storage.get('lastAttempt') ?? null},
      {headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
  }

  async alarm() {
    const start = Date.now();
    let delay = PERIOD;
    let outcome = 'ok';
    try {
      this.sql.exec('DELETE FROM ranked_books WHERE time <= ?',start-HOUR);
      const response = await fetch(DEPTH,{cache:'no-store',signal:AbortSignal.timeout(7000)});
      if (!response.ok) {
        delay = response.status === 451 ? 3600000 : Math.max(60000,(Number(response.headers.get('Retry-After'))||0)*1000);
        throw Error('Binance HTTP ' + response.status);
      }
      const book = await response.json();
      const time = Number(book.E || book.T);
      if (!Number.isSafeInteger(time) || Math.abs(time-Date.now()) > 30000) throw Error('Stale book');
      const snapshot = rankBook(book);
      this.sql.exec('INSERT OR IGNORE INTO ranked_books VALUES (?,?)',time,JSON.stringify(snapshot));
    } catch (error) {
      outcome = error.message;
      console.warn('Liquidity capture',outcome);
      delay = Math.max(delay,15000);
    } finally {
      await this.storage.setAlarm(Math.max(Date.now()+250,start+delay));
      await this.storage.put('lastAttempt',{time:start,outcome});
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
