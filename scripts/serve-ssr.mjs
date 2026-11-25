// Sert le build de production en local, rendu serveur compris : `npm run build && npm run serve:ssr`.
// En production c'est Netlify qui joue ce rôle ; ce script sert aux tests de bout en bout,
// à Lighthouse et aux vérifications avant déploiement.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const browserDir = join(root, 'dist/football-gh/browser');
const port = Number(process.env.PORT) || 4000;

const TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const { reqHandler } = await import(
  pathToFileURL(join(root, 'dist/football-gh/server/server.mjs')).href
);
const { handle: geocode } = await import('../netlify/functions/geocode.mjs');

async function staticFile(pathname) {
  const file = normalize(join(browserDir, decodeURIComponent(pathname)));
  if (!file.startsWith(browserDir) || !extname(file)) return null;
  try {
    return (await stat(file)).isFile() ? file : null;
  } catch {
    return null;
  }
}

function toWebRequest(req) {
  const url = new URL(req.url, `http://${req.headers.host ?? `localhost:${port}`}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return new Request(url, { method: req.method, headers });
}

async function send(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (response.body) Readable.fromWeb(response.body).pipe(res);
  else res.end();
}

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const file = await staticFile(pathname);
    if (file) {
      res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
      // Les fichiers au nom haché ne changent jamais.
      const hashed = /-[A-Z0-9]{8}\./.test(file);
      res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      createReadStream(file).pipe(res);
      return;
    }
    const request = toWebRequest(req);
    await send(
      res,
      pathname === '/.netlify/functions/geocode'
        ? await geocode(request)
        : await reqHandler(request),
    );
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end('Erreur serveur');
  }
}).listen(port, () => {
  process.stdout.write(`Spot the Game (rendu serveur) : http://localhost:${port}\n`);
});
