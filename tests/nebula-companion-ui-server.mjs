import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const routes = new Map([
  ['/', ['tests/nebula-companion-ui-fixture.html', 'text/html; charset=utf-8']],
  ['/src/nebula-companion.js', ['src/nebula-companion.js', 'text/javascript; charset=utf-8']],
  ['/src/nebula-companion.css', ['src/nebula-companion.css', 'text/css; charset=utf-8']],
  ['/icon.svg', ['public/icon.svg', 'image/svg+xml']],
]);

/** Deliberately serves only synthetic fixture assets; never app, API, SW or data routes. */
export async function startCompanionFixture({ port = 4188 } = {}) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    let route = routes.get(url.pathname);
    if (/^\/nebula-companion\/[a-zA-Z0-9_-]+\.(svg|png|webp)$/.test(url.pathname)) {
      const extension = path.extname(url.pathname).slice(1);
      route = [`public${url.pathname}`, extension === 'svg' ? 'image/svg+xml' : `image/${extension}`];
    }
    if (request.method !== 'GET' || !route) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Not part of the isolated companion fixture.');
      return;
    }
    try {
      const bytes = await readFile(path.join(root, route[0]));
      response.writeHead(200, {
        'Content-Type': route[1], 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'",
      });
      response.end(bytes);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Fixture asset not found.');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = await startCompanionFixture();
  console.log(`Synthetic companion fixture: ${fixture.origin}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await fixture.close(); process.exit(0); });
}
