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

test('the bridge accepts authenticated bars and keeps streams and bar IDs isolated', async () => {
  const { default: worker, DeltaStream } = await import('../workers/opposite-delta/index.mjs');
  const streams = new Map();
  const env = {
    APP_ORIGIN: 'https://app.example', PUBLISH_TOKEN: 'test-token',
    STREAM: {
      getByName(name) {
        if (!streams.has(name)) {
          let record;
          const storage = {
            get: async () => record,
            put: async (_key, next) => { record = next; },
            transaction: async run => run(storage)
          };
          streams.set(name, new DeltaStream({ storage }));
        }
        return { fetch: (url, options) => streams.get(name).fetch(new Request(url, options)) };
      }
    }
  };
  const url = 'https://worker.example/odd/v1/gold/5m';
  const closed = Math.floor(Date.now() / 60000) * 60;
  const buy = { closed, side: 'BUY', delta: -20, total: 100, source: 'binance' };
  const get = (endpoint = url) => worker.fetch(new Request(endpoint), env);
  const post = (bar, token = env.PUBLISH_TOKEN, origin = env.APP_ORIGIN) =>
    worker.fetch(new Request(url, {
      method: 'POST', headers: { Origin: origin, Authorization: 'Bearer ' + token },
      body: JSON.stringify(bar)
    }), env);
  assert.equal((await get()).status, 204);
  assert.equal((await post(buy, 'wrong')).status, 401);
  assert.equal((await post(buy, env.PUBLISH_TOKEN, 'https://other.example')).status, 403);
  assert.equal((await post({ ...buy, closed: closed - 60 })).status, 422);
  assert.equal((await post({ ...buy, side: 'SELL' })).status, 422);
  assert.equal((await post(buy)).status, 204);
  assert.equal((await post({ ...buy, delta: -30 })).status, 204);
  const latest = await get();
  assert.equal(latest.headers.get('cache-control'), 'no-store');
  assert.equal(await latest.text(), ['ODD1', closed, 'BUY', -20, 100, 'binance'].join('\t') + '\n');
  assert.equal((await get(url.replace('5m', '1m'))).status, 204);
});
