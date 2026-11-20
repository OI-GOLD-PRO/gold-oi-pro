import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOptionsReader, normalizeOptions } from './oi-snapshot.mjs';

const now = Date.parse('2026-11-20T03:30:00Z');
const data = {
  root: 'OG3', exp: 20261120, expTs: Date.parse('2026-11-20T18:30:00Z') / 1000,
  F: 3525, updated: now / 1000 - 870, oiT: now / 1000 - 36000, oiSrc: 'cme',
  em: 4, gexItd: -5,
  oiFb: { root: 'OG4', rows: [[3525, 'P', 99]] },
  rows: [
    [3530, 'P', null, null, 0, null, null, null, 0, null, null, 0],
    [3525, 'C', .3, .5, .003, null, null, null, 2, null, null, 9],
    [3525, 'P', .3, -.5, .003, null, null, null, null, null, null, null]
  ]
};

test('maps worker rows and preserves null, zero, and separate OI timestamps', () => {
  const result = normalizeOptions(data, now);
  assert.equal(result.status, 'fresh');
  assert.equal(result.expiry_date, '2026-11-20');
  assert.notEqual(result.quotes_as_of_utc, result.oi_as_of_utc);
  assert.deepEqual(result.oi_coverage, { reported: 2, option_rows: 3 });
  assert.equal(result.rows[0].call.oi, 9);
  assert.equal(result.rows[0].put.oi, null);
  assert.equal(result.rows[0].call.volume, 2);
  assert.equal(result.rows[1].put.oi, 0);
  assert.equal(result.rows[1].put.volume, 0);
  assert.equal(result.rows[1].put.feed_gamma, 0);
  assert.equal(result.rows[1].call, null);
  assert.equal(result.atm_iv_pct, null);
  assert.equal(result.expected_move_usd, null);
  assert.equal(result.gex_intraday, -5);
});

test('hides unusable quote rows and withholds OI when its timestamp is absent', () => {
  for (const [input, time, status] of [
    [data, now + 30_000, 'stale'],
    [data, data.expTs * 1000, 'expired'],
    [{ ...data, updated: null }, now, 'missing_timestamp'],
    [{ ...data, updated: now / 1000 + 121 }, now, 'future_timestamp']
  ]) {
    const result = normalizeOptions(input, time);
    assert.equal(result.status, status);
    assert.equal(result.futures_price, null);
    assert.deepEqual(result.rows, []);
  }
  assert.equal(normalizeOptions({ ...data, oiT: null }, now).rows[0].call.oi, null);
  assert.throws(() => normalizeOptions({ ...data, exp: 20261121 }, now), /expiry/);
  assert.throws(() => normalizeOptions({ ...data, rows: [data.rows[0], data.rows[0]] }, now), /Duplicate/);
});

test('shares concurrent reads and refreshes the source after cache expiry', async () => {
  let time = now;
  let requests = 0;
  const read = createOptionsReader({
    clock: () => time,
    request: async (url, options) => {
      assert.equal(url, 'https://gc-yahoo.oigoldpro.workers.dev/opt');
      assert.equal(options.redirect, 'error');
      requests++;
      return Response.json(data);
    }
  });
  await Promise.all([read(), read()]);
  time += 29_000;
  assert.equal((await read()).status, 'fresh');
  assert.equal(requests, 1);
  time += 1_000;
  assert.equal((await read()).status, 'stale');
  assert.equal(requests, 2);
});
