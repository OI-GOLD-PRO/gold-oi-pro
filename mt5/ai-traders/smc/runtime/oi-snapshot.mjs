import { liveIV } from './vol.mjs';

const OPTIONS_URL = 'https://gc-yahoo.oigoldpro.workers.dev/opt';
const MAX_QUOTE_AGE_SECONDS = 900;
const MAX_FUTURE_SKEW_SECONDS = 120;
const CACHE_MS = 30_000;
const expiryFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
});

const positive = value => Number.isFinite(value) && value > 0 ? value : null;
const finite = value => Number.isFinite(value) ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

function unix(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 253402300799 ? value : null;
}

const iso = seconds => seconds === null ? null : new Date(seconds * 1000).toISOString();

export function normalizeOptions(data, now = Date.now()) {
  const expiry = unix(data?.expTs);
  const updated = unix(data?.updated);
  const futuresPrice = positive(data?.F);
  const contract = typeof data?.root === 'string' && /^[A-Z0-9]+$/i.test(data.root)
    ? data.root : null;
  if (data?.error || !contract || expiry === null || !futuresPrice || !Array.isArray(data.rows)) {
    throw new Error('Invalid options snapshot');
  }

  const dateParts = Object.fromEntries(expiryFormatter.formatToParts(expiry * 1000)
    .map(({ type, value }) => [type, value]));
  const expiryDate = [dateParts.year, dateParts.month, dateParts.day].join('-');
  if (String(data.exp) !== expiryDate.replaceAll('-', '')) {
    throw new Error('Options expiry does not match expiry timestamp');
  }

  const nowSeconds = now / 1000;
  const age = updated === null ? null : nowSeconds - updated;
  const status = expiry <= nowSeconds ? 'expired'
    : age === null ? 'missing_timestamp'
    : age < -MAX_FUTURE_SKEW_SECONDS ? 'future_timestamp'
    : age >= MAX_QUOTE_AGE_SECONDS ? 'stale'
    : 'fresh';
  const oiTime = unix(data.oiT);
  const oiAsOf = oiTime !== null && oiTime <= nowSeconds ? oiTime : null;

  const byStrike = new Map();
  const optionRows = [];
  const seen = new Set();
  if (status === 'fresh') {
    for (const row of data.rows) {
      if (!Array.isArray(row)) continue;
      const [strike, side, iv, , gamma, bid, ask, , volume, , , oi] = row;
      if (!positive(strike) || !['C', 'P'].includes(side)) continue;
      const key = strike + side;
      if (seen.has(key)) throw new Error('Duplicate option strike and side');
      seen.add(key);

      const item = byStrike.get(strike) ?? { strike, call: null, put: null };
      item[side === 'C' ? 'call' : 'put'] = {
        oi: oiAsOf === null ? null : count(oi),
        volume: count(volume),
        feed_iv: positive(iv),
        feed_gamma: Number.isFinite(gamma) && gamma >= 0 ? gamma : null
      };
      byStrike.set(strike, item);
      optionRows.push([strike, side, null, null, null, positive(bid), positive(ask)]);
    }
  }
  if (status === 'fresh' && !optionRows.length) throw new Error('No valid option rows');

  const atm = optionRows.length ? liveIV({ ...data, rows: optionRows }, now) : null;
  const rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  const oiCount = rows.reduce((total, row) => total + ['call', 'put']
    .filter(side => row[side]?.oi != null).length, 0);
  const expectedMove = atm ? positive(data.em) : null;

  return {
    source: 'oi-gold-pro-worker-opt',
    status,
    contract,
    expiry_date: expiryDate,
    expires_at_utc: iso(expiry),
    quotes_as_of_utc: iso(updated),
    oi_as_of_utc: iso(oiAsOf),
    oi_source: ['cme', 'tv'].includes(data.oiSrc) ? data.oiSrc : null,
    oi_coverage: { reported: oiCount, option_rows: optionRows.length },
    futures_price: status === 'fresh' ? futuresPrice : null,
    atm_iv_pct: atm ? positive(atm.iv * 100) : null,
    expected_move_usd: expectedMove,
    expected_move_source: expectedMove === null ? null : 'worker_opt_em',
    gamma_flip_intraday: status === 'fresh' ? positive(data.itd) : null,
    gex_intraday: status === 'fresh' ? finite(data.gexItd) : null,
    rows
  };
}

export function createOptionsReader({ request = fetch, clock = Date.now } = {}) {
  let cached;
  let inFlight;

  return async function readOptions() {
    if (!cached || clock() - cached.at >= CACHE_MS) {
      inFlight ??= (async () => {
        const response = await request(OPTIONS_URL, {
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(8_000)
        });
        if (!response.ok) throw new Error('Options feed HTTP ' + response.status);
        const data = await response.json();
        const at = clock();
        const snapshot = normalizeOptions(data, at);
        cached = { data, at };
        return snapshot;
      })().finally(() => { inFlight = undefined; });

      return inFlight;
    }

    return normalizeOptions(cached.data, clock());
  };
}
