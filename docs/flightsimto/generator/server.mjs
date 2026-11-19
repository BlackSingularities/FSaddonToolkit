// Podgląd UI z angielską atrapą backendu: node server.mjs <ui dir> [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { thumbSvg } from './thumbs.mjs';

const ui = path.resolve(process.argv[2]);
const port = +(process.argv[3] || 5179);
const here = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/__img/')) {
    const [kind, seed, pal, acc] = u.pathname.slice(7).split('/');
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=3600' });
    return res.end(thumbSvg(kind, +seed || 1, pal, acc ? '#' + acc : ''));
  }
  const p = path.join(ui, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!p.startsWith(ui) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(p);
  if (p.endsWith('index.html')) {
    const mock = fs.readFileSync(path.join(here, 'mock-en.js'), 'utf8');
    body = String(body).replace('<html lang="pl"', '<html lang="en"').replace('<script src="vendor/leaflet.js"></script>', `<script src="vendor/leaflet.js"></script><script>${mock}</script>`);
  }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
}).listen(port, () => console.log(`preview on http://localhost:${port}`));
