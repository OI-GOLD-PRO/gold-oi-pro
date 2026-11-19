const response = (body, status = 200, headers = {}) => new Response(body, {
  status, headers: { 'Cache-Control': 'no-store', ...headers }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = /^\/odd\/v1\/(gold|gcy)\/(1m|5m|15m|30m|1h|4h|1d)$/.exec(url.pathname);
    if (!match) return response(null, 404);
    if (request.method === 'GET') {
      return env.STREAM.getByName(url.pathname).fetch('https://stream/latest');
    }
    const origin = request.headers.get('Origin');
    if (!origin || origin !== env.APP_ORIGIN) return response(null, 403);
    const cors = {
      'Access-Control-Allow-Origin': origin, Vary: 'Origin',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    if (request.method === 'OPTIONS') return response(null, 204, cors);
    if (request.method !== 'POST') return response(null, 405, cors);
    const authorization = request.headers.get('Authorization');
    if (!env.PUBLISH_TOKEN || authorization !== 'Bearer ' + env.PUBLISH_TOKEN) {
      return response(null, 401, cors);
    }
    let bar;
    try {
      const body = await request.text();
      if (body.length > 1024) return response(null, 413, cors);
      bar = JSON.parse(body);
    } catch (_) { return response(null, 400, cors); }
    const now = Math.floor(Date.now() / 1000);
    const { closed, delta, total, side, source } = bar || {};
    if (!Number.isSafeInteger(closed) || closed % 60 !== 0 ||
        closed > now || now - closed >= 60 ||
        !Number.isFinite(delta) || !Number.isFinite(total) || total <= 0 || Math.abs(delta) > total ||
        !['BUY', 'SELL', 'NONE'].includes(side) || (side === 'BUY' && delta >= 0) ||
        (side === 'SELL' && delta <= 0) || !['binance', 'bitget'].includes(source)) {
      return response(null, 422, cors);
    }
    const stored = await env.STREAM.getByName(url.pathname).fetch('https://stream/latest', {
      method: 'POST', body: JSON.stringify({ closed, delta, total, side, source })
    });
    return response(null, stored.status, cors);
  }
};

export class DeltaStream {
  constructor(state) { this.storage = state.storage; }
  async fetch(request) {
    if (request.method === 'POST') {
      const next = await request.json();
      await this.storage.transaction(async tx => {
        const previous = await tx.get('latest');
        if (!previous || next.closed > previous.closed) await tx.put('latest', next);
      });
      return response(null, 204);
    }
    const bar = await this.storage.get('latest');
    if (!bar) return response(null, 204);
    return response(['ODD1', bar.closed, bar.side, bar.delta, bar.total, bar.source].join('\t') + '\n', 200, {
      'Content-Type': 'text/plain; charset=utf-8'
    });
  }
}
