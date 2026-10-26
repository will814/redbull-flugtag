import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const brotliCompress = promisify(zlib.brotliCompress);
const gzipCompress = promisify(zlib.gzip);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg']);
const assetCache = new Map();

async function getAssetEntry(filePath, ext, stat) {
  const resolvedStat = stat || (await fs.stat(filePath));
  const cached = assetCache.get(filePath);
  if (cached && cached.mtimeMs === resolvedStat.mtimeMs) {
    return cached;
  }

  const raw = await fs.readFile(filePath);
  let br = null;
  let gzip = null;
  if (COMPRESSIBLE_EXTS.has(ext) && raw.byteLength > 256) {
    [br, gzip] = await Promise.all([
      brotliCompress(raw, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
      }),
      gzipCompress(raw, { level: 6 }),
    ]);
  }

  const entry = { mtimeMs: resolvedStat.mtimeMs, raw, br, gzip };
  assetCache.set(filePath, entry);
  return entry;
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = (req.url || '/').split('?')[0];
    const safePath = path
      .normalize(decodeURIComponent(reqUrl))
      .replace(/^(\.\.(\/|\\|$))+/, '');
    let relPath = safePath === '/' || safePath === '' ? 'index.html' : safePath.replace(/^[/\\]+/, '');
    let filePath = path.join(DIST_DIR, relPath);

    let stat = null;
    try {
      stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        relPath = 'index.html';
        filePath = path.join(DIST_DIR, 'index.html');
        stat = null;
      }
    } catch {
      relPath = 'index.html';
      filePath = path.join(DIST_DIR, 'index.html');
      stat = null;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const entry = await getAssetEntry(filePath, ext, stat);

    const isHashedAsset = relPath.startsWith('assets/') || relPath.startsWith('assets\\');
    const cacheControl =
      ext === '.html'
        ? 'no-cache'
        : isHashedAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600';

    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    let body = entry.raw;
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Accept-Encoding',
    };

    if (entry.br && /\bbr\b/.test(acceptEncoding)) {
      body = entry.br;
      headers['Content-Encoding'] = 'br';
    } else if (entry.gzip && /\bgzip\b/.test(acceptEncoding)) {
      body = entry.gzip;
      headers['Content-Encoding'] = 'gzip';
    }

    headers['Content-Length'] = body.byteLength;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(body);
    }
  } catch {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Red Bull Flugtag 3D server listening on http://0.0.0.0:${PORT}`);
});

