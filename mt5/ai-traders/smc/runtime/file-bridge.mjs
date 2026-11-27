import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REQUEST = /^[0-9-]{8,90}\.req$/;
const OUTPUT = /^[0-9-]{8,90}\.(?:res|res\.tmp|req\.tmp)$/;
const ALLOWED = new Set(['/api/bridge/check', '/api/bridge/market', '/api/bridge/poll', '/api/demo/report']);
const MAX_REQUEST_BYTES = 150_000;

export async function startFileBridge(directory, port, token) {
  await mkdir(directory, { recursive: true });
  const remove = file => unlink(file).catch(() => {});
  let running = false;
  let nextCleanup = 0;
  const loop = async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      const files = await readdir(directory);
      const cleanup = now >= nextCleanup;
      if (cleanup) nextCleanup = now + 30_000;
      for (const name of files) {
        if (!REQUEST.test(name)) {
          if (cleanup && OUTPUT.test(name)) {
            const output = join(directory, name);
            const info = await stat(output).catch(() => null);
            if (info?.isFile() && now - info.mtimeMs > 90_000) await remove(output);
          }
          continue;
        }
        const input = join(directory, name);
        const info = await stat(input).catch(() => null);
        if (!info?.isFile()) continue;
        if (now - info.mtimeMs > 10_000 || info.size > MAX_REQUEST_BYTES) {
          await remove(input);
          continue;
        }
        let contents;
        try {
          contents = await readFile(input, 'utf8');
          await unlink(input);
        } catch { continue; }
        let result;
        try {
          const request = JSON.parse(contents);
          if (!ALLOWED.has(request?.route) || typeof request.token !== 'string' ||
              request.token.length > 256 || request.token !== token) {
            result = { status: 403, body: { error: 'Bridge credentials required' } };
          } else {
            const response = await fetch('http://127.0.0.1:' + port + request.route, {
              method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000),
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
              body: JSON.stringify(request.body ?? null)
            });
            result = { status: response.status, body: await response.json() };
          }
        } catch {
          result = { status: 503, body: { error: 'File bridge request failed' } };
        }
        const reply = join(directory, name.slice(0, -4) + '.res');
        try {
          await writeFile(reply + '.tmp', JSON.stringify(result), { flag: 'wx' });
          await rename(reply + '.tmp', reply);
        } catch {
          await remove(reply + '.tmp');
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('SMC file bridge:', error.code || 'I/O error');
    } finally { running = false; }
  };
  const timer = setInterval(() => void loop(), 125);
  timer.unref();
  return () => clearInterval(timer);
}
