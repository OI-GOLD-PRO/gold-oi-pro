import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const COOKIE = '__Host-smc_session';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const routes = new Set(['/api/demo/status', '/api/oi-snapshot', '/api/journal', '/dashboard.js']);

function validPassword(value) {
  return typeof value === 'string' && value.length >= 15 && value.length <= 128 &&
    !/[\x00-\x1f\x7f]/.test(value);
}

function passwordHash(value) {
  return createHash('sha256').update(value.normalize('NFC'), 'utf8').digest();
}

function sessionId(req) {
  const match = (req.headers.cookie || '').match(/(?:^|;\s*)__Host-smc_session=([a-f0-9]{64})(?=;|$)/);
  return match?.[1];
}

function cookie(value, maxAge) {
  const persistence = maxAge === undefined ? '' : '; Max-Age=' + maxAge;
  return COOKIE + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax' + persistence;
}

async function readLogin(req) {
  if (req.headers['content-type']?.split(';', 1)[0] !== 'application/x-www-form-urlencoded') return null;
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 4096) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function landing(res, cookieValue) {
  if(cookieValue) res.setHeader('Set-Cookie',cookieValue);
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/"><title>เปิดแดชบอร์ด</title><p><a href="/">เปิดหน้าแดชบอร์ด</a></p></html>');
}
function originError(res) {
  res.writeHead(403,{'Content-Type':'text/html; charset=utf-8'});
  res.end('<!doctype html><meta charset="utf-8"><p>กรุณาเปิดลิงก์มือถือปัจจุบันใน Safari แล้วเข้าสู่ระบบใหม่</p><a href="/">กลับหน้าเข้าสู่ระบบ</a>');
}
export function startViewer(dashboard, password, port = 4184) {
  if (!validPassword(password)) throw Error('Invalid viewer password');
  const owner = process.env.OI_PHONE_OWNER_PASSWORD?.normalize('NFC');
  if (owner !== undefined && (!validPassword(owner) || owner === password.normalize('NFC')))
    throw Error('Invalid or duplicate owner password');

  const credentials = new Map([['viewer', passwordHash(password)]]);
  if (owner !== undefined) credentials.set('owner', passwordHash(owner));
  const sessions = new Map();
  const failures = new Map();

  async function loginPage(res, status, message = '') {
    const template = await readFile(new URL('login.html', import.meta.url), 'utf8');
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"
    });
    res.end(template.replace('<!--LOGIN_ERROR-->', message));
  }

  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && req.url === '/_smc_ready') {
      const probe = process.env.OI_SMC_MOBILE_PROBE;
      if (!/^[a-f0-9]{32}$/.test(probe || '')) { res.writeHead(404); return res.end(); }
      res.writeHead(204, { 'X-OI-SMC-Ready': probe });
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/mobile-signin.js') {
      try {
        const script = await readFile(new URL('mobile-signin.js', import.meta.url));
        res.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8'});
        return res.end(script);
      } catch { res.writeHead(500); return res.end(); }
    }
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const now = Date.now();
    const path = req.url.split('?', 1)[0];
    const origin = /^[a-z0-9-]+\.trycloudflare\.com$/i.test(req.headers.host || '') ? 'https://' + req.headers.host : null;
    const id = sessionId(req);
    const session = sessions.get(id);
    const role = session?.expires > now && session.origin === origin ? session.role : null;
    if (session?.expires <= now) sessions.delete(id);

    try {
      if(req.method==='GET' && ['/session','/session/logout'].includes(path))return landing(res);
      if (req.method === 'POST' && (path === '/session' || path === '/session/logout')) {
        if (!origin || req.headers.origin !== origin) { return originError(res); }
        if (path === '/session/logout') {
          if (role) sessions.delete(id);
          return landing(res, cookie('', 0));
        }
        const forwardedIp = req.headers['cf-connecting-ip'];
        const client = typeof forwardedIp === 'string' && isIP(forwardedIp) ? forwardedIp : 'local';
        for (const [key, value] of failures) {
          if (value.until <= now) failures.delete(key);
        }
        const form = await readLogin(req);
        if (!form) return await loginPage(res, 400, 'เปิดหน้าเข้าสู่ระบบใหม่แล้วลองอีกครั้ง');
        const attempt = failures.get(client);
        if (attempt?.count >= 12 || (!attempt && failures.size >= 1024)) {
          res.setHeader('Retry-After', '60');
          return await loginPage(res, 429, 'ลองเข้าสู่ระบบอีกครั้งใน 1 นาที');
        }
        const username = form.get('username')?.trim().toLowerCase();
        const typed = form.get('password');
        const expected = credentials.get(username);
        if (!expected || !validPassword(typed) || !timingSafeEqual(passwordHash(typed), expected)) {
          failures.set(client, { count: (attempt?.count || 0) + 1, until: attempt?.until || now + 60_000 });
          return await loginPage(res, 401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }

        failures.delete(client);
        if (role) sessions.delete(id);
        for (const [key, value] of sessions) {
          if (value.expires <= now) sessions.delete(key);
        }
        if (sessions.size >= 256) sessions.delete(sessions.keys().next().value);
        const remember = form.get('remember') === '1';
        const token = randomBytes(32).toString('hex');
        sessions.set(token, { role: username, origin, expires: now + (remember ? 30 * DAY : 12 * HOUR) });
        res.setHeader('X-OI-Login','ok');
        return landing(res, cookie(token, remember ? 30 * DAY / 1000 : undefined));
      }
      if (!role) {
        if (req.method === 'GET' && path === '/') return await loginPage(res, 200);
        res.writeHead(401);
        return res.end();
      }
      if (role === 'owner' && req.method === 'POST' && path === '/api/demo/policy') {
        if (!origin || req.headers.origin !== origin || req.headers['x-oi-dashboard'] !== '1') {
          res.writeHead(403);
          return res.end();
        }
        req.dashboardOrigin = origin;
        return dashboard(req, res);
      }
      if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); return res.end(); }
      if (routes.has(path)) return dashboard(req, res);
      if (path !== '/') { res.writeHead(404); return res.end(); }
      res.setHeader('X-OI-Dashboard','1');
      const data = await readFile(new URL(role === 'owner' ? 'owner.html' : 'viewer.html', import.meta.url), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(data.replace('<!--MOBILE_LOGOUT-->',
        '<form method="post" action="/session/logout"><button type="submit">ออกจากระบบ</button></form>'));
    } catch {
      if (!res.headersSent) res.writeHead(500);
      return res.end();
    }
  }).listen(port, '127.0.0.1');
}
