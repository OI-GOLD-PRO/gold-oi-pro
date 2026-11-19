const assert = require('node:assert/strict');
const test = require('node:test');
const { marker } = require('../opposite-delta-diamonds.js');

test('orange is negative delta on a green candle; green is the reverse', () => {
  const thresholds = [0, 15, 30, 50];
  assert.deepEqual(marker(4000, 4002, -35, 100, thresholds), { below: false, tier: 2 });
  assert.deepEqual(marker(4002, 4000, 60, 100, thresholds), { below: true, tier: 3 });
  assert.equal(marker(4000, 4002, 35, 100, thresholds), null);
  assert.equal(marker(4000, 4002, -10, 100, [15, 30, 50, 70]), null);
  assert.equal(marker(4000, 4000, -35, 100, thresholds), null);
});

const t = 1800000000;
const origin = 'https://price.example';
const flow = (open, buy) => [open * 1000, 0, 0, 0, 0, '100', (open + 300) * 1000 - 1, 0, 0, String(buy)];
const prices = (open, close) => [[t - 300, open, 4100, 3900, close], [t, close, 4100, 3900, close]];
const fixture = (open, close, buy) => async url =>
  Response.json(url.startsWith(origin) ? { bars: prices(open, close) } : [flow(t - 300, buy), flow(t, 51)]);

test('server derives both sides and neutral, requires matched closed data', async () => {
  const { calculate } = await import('../workers/opposite-delta/index.mjs');
  assert.deepEqual(await calculate('gold', '5m', t + 4, origin, fixture(3990, 4000, 40)),
    { opened: t - 300, closed: t, side: 'BUY', delta: -20, total: 100, source: 'binance' });
  assert.equal((await calculate('gold', '5m', t + 4, origin, fixture(4000, 3990, 60))).side, 'SELL');
  assert.equal((await calculate('gold', '5m', t + 4, origin, fixture(3990, 4000, 60))).side, 'NONE');
  assert.equal(await calculate('gold', '5m', t + 60, origin, fixture(3990, 4000, 40)), null);
  assert.equal(await calculate('gold', '5m', t + 2, origin, fixture(3990, 4000, 40)), null);
  const incomplete = async url => url.startsWith(origin) ? Response.json({ bars: prices(3990, 4000) })
    : Response.json([flow(t - 300, 40)]);
  assert.equal(await calculate('gold', '5m', t + 4, origin, incomplete), null);
  const badClose = async url => url.startsWith(origin) ? Response.json({ bars: prices(3990, 4000) })
    : Response.json([flow(t - 299, 40), flow(t, 51)]);
  assert.equal(await calculate('gold', '5m', t + 4, origin, badClose), null);
});

test('Yahoo hybrid uses XAUTUSDT for candle body and XAUUSDT for delta', async () => {
  const { calculate } = await import('../workers/opposite-delta/index.mjs');
  const upstream = async url => {
    if (url.startsWith(origin)) return Response.json({ bars: { '5m': [[t - 600, 4000, 4002, 3999, 4001]] } });
    if (url.includes('api.bybit.com')) return Response.json({ result: { list: [
      [t * 1000, 4003, 4004, 4002, 4004], [(t - 300) * 1000, 4000, 4004, 3999, 4003],
      [(t - 600) * 1000, 3997, 4001, 3996, 4000]
    ] } });
    if (url.includes('symbol=XAUUSDT')) return Response.json([flow(t - 300, 40), flow(t, 51)]);
    return Response.json(null, { status: 503 });
  };
  assert.equal((await calculate('gcy', '5m', t + 4, origin, upstream)).side, 'BUY');
});

test('worker computes once for simultaneous readers and serves one canonical result', async test => {
  const { default: worker, DeltaStream } = await import('../workers/opposite-delta/index.mjs');
  const history = new Map();
  let calls = 0;
  test.mock.method(Date, 'now', () => (t + 4) * 1000);
  const data = fixture(3990, 4000, 40);
  test.mock.method(global, 'fetch', url => { calls++; return data(url); });
  const stream = new DeltaStream({ storage: {
    get: async key => history.get(key), put: async (key, value) => history.set(key, value)
  } }, { PRICE_ORIGIN: origin });
  const env = { STREAM: { getByName: () => stream } };
  const endpoint = 'https://worker.example/odd/v1/gold/5m';
  const request = (url, method = 'GET') => worker.fetch(new Request(url, { method }), env);
  const [terminal, web] = await Promise.all([request(endpoint), request(endpoint + '?format=json')]);
  assert.equal(calls, 2);
  assert.equal((await web.json()).bars[0].side, 'BUY');
  assert.equal(web.headers.get('access-control-allow-origin'), '*');
  assert.equal((await terminal.text()).trim(), ['ODD1', t, 'BUY', -20, 100, 'binance'].join('\t'));
  assert.equal((await request(endpoint, 'POST')).status, 405);
});
