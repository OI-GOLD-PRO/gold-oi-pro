import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createOptionsReader } from './oi-snapshot.mjs';

const readOptions = createOptionsReader();
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);

function reply(response, status, contentType, body) {
  response.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return reply(response, 405, 'text/plain', 'Method not allowed');
  }

  const path = request.url.split('?', 1)[0];
  if (path === '/api/oi-snapshot') {
    try {
      return reply(response, 200, 'application/json', JSON.stringify(await readOptions()));
    } catch (error) {
      console.error('OI snapshot unavailable:', error.message);
      return reply(response, 502, 'application/json', JSON.stringify({ status: 'unavailable' }));
    }
  }

  const asset = assets.get(path);
  if (!asset) return reply(response, 404, 'text/plain', 'Not found');
  try {
    const [file, type] = asset;
    return reply(response, 200, type, await readFile(new URL(file, import.meta.url)));
  } catch {
    return reply(response, 500, 'text/plain', 'Could not load dashboard');
  }
});

server.listen(Number(process.env.OI_TRADER_PORT ?? 4173), '127.0.0.1', () => {
  console.log('OI Gold AI Trader dashboard at http://127.0.0.1:' + server.address().port);
});
