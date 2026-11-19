const FRAMES = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
const BYBIT = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D' };
const BITGET = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1D' };
const response = (body, status = 200, headers = {}) => new Response(body, {
  status, headers: { 'Cache-Control': 'no-store', ...headers }
});

async function json(url, request) {
  const result = await request(url, { signal: AbortSignal.timeout(3500) });
  if (!result.ok) throw new Error('Upstream HTTP ' + result.status);
  return result.json();
}

async function yahooPrice(tf, priceOrigin, request) {
  const step = FRAMES[tf];
  // Match the chart's Yahoo + XAUTUSDT tail, including its overlap/offset guard.
  const sources = [
    ['https://api.bybit.com/v5/market/kline?category=linear&symbol=XAUTUSDT&limit=300&interval=' + BYBIT[tf], j => j.result?.list],
    ['https://api.bitget.com/api/v2/mix/market/candles?symbol=XAUTUSDT&productType=usdt-futures&limit=300&granularity=' + BITGET[tf], j => j.data],
    ['https://fapi.binance.com/fapi/v1/klines?symbol=XAUTUSDT&limit=300&interval=' + tf, j => j]
  ];
  const [data, ...perpCandidates] = await Promise.all([
    json(priceOrigin + '/?tf=' + tf, request),
    ...sources.map(async ([url, unpack]) => {
      try { return unpack(await json(url, request)); } catch (_) { return null; }
    })
  ]);
  const yahoo = data.bars?.[tf];
  if (!Array.isArray(yahoo) || !yahoo.length) return [];
  const rows = new Map();
  for (const row of yahoo) {
    const time = Math.floor(Number(row[0]) / step) * step;
    rows.set(time, [time, rows.get(time)?.[1] ?? Number(row[1]), 0, 0, Number(row[4])]);
  }

  for (const perp of perpCandidates) {
    if (!Array.isArray(perp) || !perp.length) continue;
    const prices = new Map(perp.map(k => [Number(k[0]) / 1000, k]));
    const overlap = [...rows.keys()].sort((a, b) => a - b).slice(-5).reverse().find(time => prices.has(time));
    if (overlap === undefined) return [...rows.values()];
    const offset = Math.round((rows.get(overlap)[1] - Number(prices.get(overlap)[1])) * 100) / 100;
    if (!Number.isFinite(offset) || Math.abs(offset) > 40) return [...rows.values()];
    rows.get(overlap)[4] = Number(prices.get(overlap)[4]) + offset;
    for (const [time, k] of prices) {
      if (time > overlap) rows.set(time, [time, Number(k[1]) + offset, 0, 0, Number(k[4]) + offset]);
    }
    return [...rows.values()];
  }
  return [...rows.values()];
}

export async function calculate(chart, tf, now, priceOrigin, request = fetch) {
  const step = FRAMES[tf];
  const prices = chart === 'gold'
    ? json(priceOrigin + '/mix?tf=' + tf + '&n=5', request).then(j => j.bars)
    : yahooPrice(tf, priceOrigin, request);
  const binance = 'https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval=' + tf + '&limit=5';
  const [candles, deltaRows] = await Promise.all([prices, json(binance, request)]);
  if (!Array.isArray(candles) || !Array.isArray(deltaRows)) return null;
  const priceByOpen = new Map(candles.map(row => [Number(row[0]), row]));
  const deltaByOpen = new Map(deltaRows.map(row => [Number(row[0]) / 1000, row]));

  // Both feeds must have rolled to the next candle. Use exactly the same UTC interval.
  const closed = [...priceByOpen.keys()].filter(time => time <= now && priceByOpen.has(time - step) &&
    deltaByOpen.has(time) && deltaByOpen.has(time - step)).sort((a, b) => b - a)[0];
  if (!Number.isSafeInteger(closed) || now - closed < 3 || now - closed >= 60) return null;
  const opened = closed - step;
  const candle = priceByOpen.get(opened);
  const flow = deltaByOpen.get(opened);
  if (Number(flow[6]) !== closed * 1000 - 1 || flow[5] == null || flow[5] === '' || flow[9] == null || flow[9] === '') return null;
  const [open, close, total, takerBuy] = [candle[1], candle[4], flow[5], flow[9]].map(Number);
  if (![open, close, total, takerBuy].every(Number.isFinite) || open <= 0 || close <= 0 ||
      total <= 0 || takerBuy < 0 || takerBuy > total) return null;
  const delta = takerBuy - (total - takerBuy);
  const side = close > open && delta < 0 ? 'BUY' : close < open && delta > 0 ? 'SELL' : 'NONE';
  return { opened, closed, side, delta, total, source: 'binance' };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = /^\/odd\/v1\/(gold|gcy)\/(1m|5m|15m|30m|1h|4h|1d)$/.exec(url.pathname);
    if (!match) return response(null, 404);
    if (request.method !== 'GET') return response(null, 405, { Allow: 'GET' });
    return env.STREAM.getByName(url.pathname).fetch(request);
  }
};

export class DeltaStream {
  constructor(state, env) {
    this.storage = state.storage;
    this.priceOrigin = env.PRICE_ORIGIN;
    this.nextAttempt = 0;
    this.inFlight = null;
  }

  async refresh(chart, tf, now) {
    const history = await this.storage.get('serverBars') ?? [];
    const age = now % FRAMES[tf];
    if (age < 3 || age >= 60) return history;
    if (history.at(-1)?.closed >= now - 59 || now < this.nextAttempt) return history;
    this.nextAttempt = now + 5;
    try {
      const bar = await calculate(chart, tf, now, this.priceOrigin);
      if (!bar || bar.closed <= (history.at(-1)?.closed ?? 0)) return history;
      const next = [...history, bar].slice(-256);
      await this.storage.put('serverBars', next);
      return next;
    } catch (error) {
      console.warn('Opposite Delta upstream/storage unavailable', chart, tf, error.message);
      return history;
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const [, , , chart, tf] = url.pathname.split('/');
    const now = Math.floor(Date.now() / 1000);
    // All clients for this chart/TF share one refresh and one canonical snapshot.
    if (!this.inFlight) {
      this.inFlight = this.refresh(chart, tf, now).finally(() => { this.inFlight = null; });
    }
    const history = await this.inFlight;
    const bar = history.at(-1);
    if (url.searchParams.get('format') === 'json') {
      return response(JSON.stringify({ bars: history }), 200, {
        'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*'
      });
    }
    if (!bar || now - bar.closed >= 60) return response(null, 204);
    return response(['ODD1', bar.closed, bar.side, bar.delta, bar.total, bar.source].join('\t') + '\n', 200, {
      'Content-Type': 'text/plain; charset=utf-8'
    });
  }
}
