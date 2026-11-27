import { mkdir, readFile, writeFile, rename, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { candles, evaluateBreakout } from './breakout.mjs';
import { model, review } from './go.mjs';

const dir = process.env.OI_Breakout_STATE_DIR || join(homedir(), '.oi-gold-ai-breakout');
const policyPath = join(dir, 'risk.json');
const logPath = join(dir, 'decisions.jsonl');
const defaults = { enabled:false, hedging:false, perTrade:0.5, total:0, daily:0, positions:0 };
const id = () => randomUUID().replaceAll('-', '').slice(0,20);
let lastContact = null;
let bridgeSeenAt = null;
let lastWaitReviewAt = 0;
let busy = false;

async function read(path, fallback) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function policy() { return JSON.parse(await read(policyPath, JSON.stringify(defaults))); }

export async function decisions() {
  return (await read(logPath, '')).split('\n').filter(Boolean).map(line => JSON.parse(line));
}

async function body(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 120000) throw Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function validatedPolicy(p) {
  if (!p || typeof p.enabled !== 'boolean' || typeof p.hedging !== 'boolean' ||
      !Number.isInteger(p.positions) || p.positions < 0 || p.positions > 2147483647 ||
      ![p.perTrade,p.total,p.daily].every(x => Number.isFinite(x) && x >= 0) ||
      (p.total > 0 && p.total < p.perTrade))
    throw Error('Invalid risk limits');
  return Object.fromEntries(Object.keys(defaults).map(key => [key, p[key]]));
}

function authorized(req) {
  const token = process.env.OI_Breakout_BRIDGE_TOKEN;
  if (!token || token.length < 24) return false;
  const actual = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from('Bearer ' + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function accountMatches(data) {
  return typeof data?.login === 'string' && typeof data.server === 'string' && typeof data.symbol === 'string' &&
    data.login === process.env.OI_MT5_LOGIN && data.server === process.env.OI_MT5_SERVER &&
    data.symbol === process.env.OI_MT5_SYMBOL;
}
function validMarket(m) {
  return m.tf === 'M5' &&
    candles(m.m5, 40) && candles(m.m15, 40) &&
    m.m15.at(-1)[0] + 900 <= m.m5.at(-1)[0] + 300 &&
    m.m5.at(-1)[0] + 300 - (m.m15.at(-1)[0] + 900) < 900 &&
    ['atr','point','bid','ask','max_risk_pct','min_rr','max_rr','min_sl_points','min_sl_atr',
     'max_sl_atr','max_drift_points','daily_loss','max_total_pct','max_daily_pct'].every(key => Number.isFinite(m[key]) && (['daily_loss','max_risk_pct','max_total_pct','max_daily_pct'].includes(key) ? m[key] >= 0 : m[key] > 0)) &&
    Number.isInteger(m.count) && m.count >= 0 && typeof m.entry_ready === 'boolean' &&
    m.ask >= m.bid && m.max_rr >= m.min_rr && typeof m.armed === 'boolean' && typeof m.daily_ok === 'boolean';
}

function filteredOptions(oi) {
  if (oi?.status !== 'fresh' || !oi.oi_coverage?.reported) return null;
  return {
    contract: oi.contract, quotes_as_of_utc: oi.quotes_as_of_utc,
    oi_as_of_utc: oi.oi_as_of_utc, futures_price: oi.futures_price,
    atm_iv_pct: oi.atm_iv_pct, expected_move_usd: oi.expected_move_usd,
    levels: oi.rows.flatMap(row => ['call','put'].filter(side => row[side]?.oi > 0)
      .map(side => ({ strike: row.strike, side, oi: row[side].oi, volume: row[side].volume })))
      .sort((a, b) => b.oi - a.oi).slice(0, 12)
  };
}

function chartOverlay(structure, plan) {
  return { regime: structure.regime, zone: structure.zones.at(-1), breakout: structure.markers[0], retest: structure.markers[1], plan };

}

const wait = reason => ({ action: 'WAIT', reason });

export async function demoRoute(req, res, path, readOptions) {
  const send = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  try {
    if (path === '/api/demo/status' && req.method === 'GET') {
      const history = await decisions();
      const reports = new Map(history.filter(d => d.resultFor).map(d => [d.resultFor, d.reason]));
      const recent = history.filter(d => !d.resultFor).slice(-20).reverse()
        .map(d => ({ ...d, execution: reports.get(d.id) || null }));
      return send(200, { policy: await policy(), recent, lastContact, bridgeSeenAt, model });
    }
    if (req.method !== 'POST') return send(405, { error: 'POST required' });
    if (path === '/api/demo/policy') {
      if (!req.dashboardOrigin || req.headers.origin !== req.dashboardOrigin ||
          req.headers['x-oi-dashboard'] !== '1') return send(403, { error: 'Dashboard required' });
      const p = validatedPolicy(await body(req));
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const tmp = policyPath + '.' + id();
      await writeFile(tmp, JSON.stringify(p), { mode: 0o600 });
      await rename(tmp, policyPath);
      return send(200, p);
    }
    if (!authorized(req)) return send(403, { error: 'Bridge credentials required' });
    if (path === '/api/bridge/check') {
      const connection = await body(req);
      if (!accountMatches(connection)) return send(403, { error: 'Account or symbol mismatch' });
      bridgeSeenAt = new Date().toISOString();
      return send(200, { ok: true, service: 'OI Gold Breakout', version: '1.06' });
    }
    if (path !== '/api/demo/decision' && path !== '/api/demo/report') return send(404, { error: 'Not found' });
    if (busy) return send(409, wait('ระบบกำลังประมวลผล'));
    busy = true;
    try {
      const m = await body(req);
      const history = await decisions();
      if (path === '/api/demo/report') {
        if (typeof m?.id !== 'string' || typeof m.status !== 'string' || m.status.length > 300 ||
            !history.some(d => d.id === m.id) || history.some(d => d.resultFor === m.id))
          return send(400, { error: 'Invalid execution report' });
        await appendFile(logPath, JSON.stringify({ resultFor: m.id, reason: m.status }) + '\n', { mode: 0o600 });
        return send(200, { ok: true });
      }
      if (!accountMatches(m)) return send(403, { error: 'Account or symbol mismatch' });
      if (!validMarket(m)) return send(422, { error: 'Invalid M5 or M15 market data' });
      bridgeSeenAt = new Date().toISOString();
      const { plan, reason, next, ...overlay } = evaluateBreakout(m);
      const p = await policy();
      const key = JSON.stringify([m.server,m.login,m.symbol,m.m5.at(-1)[0]]);
      lastContact = {
        at: new Date().toISOString(), symbol: m.symbol, count: m.count, armed: m.armed,
        candles: m.m5.slice(-80), breakout: { ...overlay, plan }, chartPositions: m.chartPositions,
        status: m.execution, maxRisk: m.max_risk_pct, maxTotal: m.max_total_pct, maxDaily: m.max_daily_pct, minRR: m.min_rr, maxRR: m.max_rr
      };
      const chart = chartOverlay(overlay, plan);
      if (history.some(d => d.key === key)) return send(200, { ...wait('วิเคราะห์แท่งนี้แล้ว'), chart });
      const maxRiskPct = Math.min(p.perTrade || Infinity, m.max_risk_pct || Infinity);
      const management = !!m.position;
      const eligible = plan && m.daily_ok && (!p.daily || m.daily_loss < p.daily) && (!p.positions || m.count < p.positions) && m.entry_ready;
      let result = wait(reason);
      let aiExplanation = null;
      let tradeWait = null;
      if (!m.armed || !p.enabled) result = wait('ปิดการส่งคำสั่ง · ' + reason);
      else if (!process.env.OPENCODE_GO_API_KEY) result = wait('รอตั้งค่า OpenCode Go API key · ' + reason);
      else if (!eligible && !management && plan) result = wait('ครบเงื่อนไข Breakout · รอวงเงินหรือเงื่อนไขส่งคำสั่งของ EA');
      else if (eligible || management) {
        try {
          const oi = await Promise.race([
            readOptions().then(filteredOptions).catch(() => null),
            new Promise(resolve => setTimeout(resolve, 900, null).unref())
          ]);
          const answer = await review({
            symbol: m.symbol, setup: eligible ? plan : null, structure: overlay,
            strategyStatus: reason, next, maxRiskPct, position: m.position, atr: m.atr,
            candles: m.m5.slice(-20), gcOptions: oi
          });
          aiExplanation = { reason: answer.reason, waitFor: answer.wait_for?.trim() || null };
          result = wait(answer.reason);
          if ((answer.action === 'HOLD' || answer.action === 'CLOSE') && management)
            result.action = answer.action;
          if (answer.action === 'REDUCE' && management &&
              answer.reduce_pct >= 1 && answer.reduce_pct <= 50) {
            result.action = 'REDUCE';
            result.reduce_pct = answer.reduce_pct;
          }
          if (answer.action === 'ENTER' && eligible &&
              Number.isFinite(answer.risk_pct) && answer.risk_pct > 0 && answer.risk_pct <= maxRiskPct) {
            result = { action: plan.side, reason: answer.reason, risk_pct: answer.risk_pct,
              sl: plan.sl, tp: plan.tp, invalidation: plan.invalidation };
          } else if (!['WAIT','HOLD','CLOSE','REDUCE'].includes(answer.action) || (answer.action !== 'WAIT' && result.action === 'WAIT')) {
            result = wait('ผล AI ไม่ผ่านเงื่อนไขส่งคำสั่ง · ' + answer.reason);
          }
        } catch {
          result = wait('OpenCode Go ตอบไม่สำเร็จ · ' + reason);
        }
      }
      if (result.action === 'WAIT') {
        if (!m.armed || !p.enabled) tradeWait = 'ระบบอยู่ในโหมดดูสัญญาณ';
        else if (!process.env.OPENCODE_GO_API_KEY) tradeWait = 'รอตั้งค่า OpenCode Go API key';
        else if (plan && !eligible && !management) tradeWait = result.reason;
      }
      // Explain quiet bars occasionally. The response here is never used for execution.
      if (!aiExplanation && result.action === 'WAIT' && !(m.armed && p.enabled && (eligible || management)) &&
          process.env.OPENCODE_GO_API_KEY && Date.now() - lastWaitReviewAt >= 15 * 60_000) {
        lastWaitReviewAt = Date.now();
        try {
          const explanation = await review({
            analysisOnly: true, symbol: m.symbol, strategyStatus: reason, structure: overlay, next,
            setup: plan, atr: m.atr, candles: m.m5.slice(-12), mode: tradeWait || 'Market wait'
          });
          if (explanation.action === 'WAIT')
            aiExplanation = { reason: explanation.reason, waitFor: explanation.wait_for?.trim() || null };
        } catch {}
      }
      if (JSON.stringify(await policy()) !== JSON.stringify(p)) {
        result = wait('มีการเปลี่ยนค่าความเสี่ยงระหว่างวิเคราะห์');
        tradeWait = 'รอประเมินใหม่ด้วยค่าความเสี่ยงล่าสุด';
      }
      const explanation = {
        strategyReason: reason, next: next?.text || null, ai: aiExplanation, tradeWait,
        plan: result.action === 'BUY' || result.action === 'SELL' || (result.action === 'WAIT' && plan) ? plan : null,
        position: ['HOLD','CLOSE','REDUCE'].includes(result.action) && m.position ? {
          ...m.position, exitReference: result.action === 'HOLD' ? null : m.position.side === 'BUY' ? m.bid : m.ask
        } : null,
        reducePct: result.action === 'REDUCE' ? result.reduce_pct : null
      };
      const decision = { ...result, explanation, chart, id: id(), limitTotal: p.total, limitDaily: p.daily,
        limitCount: p.positions, hedge: p.hedging ? 1 : 0 };
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await appendFile(logPath, JSON.stringify({ key, id: decision.id, at: new Date().toISOString(),
        action: decision.action, bar: m.m5.at(-1)[0], reason: decision.reason, explanation }) + '\n', { mode: 0o600 });
      return send(200, decision);
    } finally { busy = false; }
  } catch {
    return send(400, { error: 'Invalid request or state unavailable' });
  }
}
