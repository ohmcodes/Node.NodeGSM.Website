'use strict';
// Serves public/ (the website). The server folder, dot files and top-level markdown are never exposed.
const fs = require('fs');
const path = require('path');
const { HttpError } = require('./http');
const { SITE } = require('./constants');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.zip': 'application/zip', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp' };

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
  let rel; try { rel = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Bad path'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(SITE, '.' + rel);
  const inside = file.startsWith(SITE + path.sep);
  const top = path.relative(SITE, file).split(path.sep)[0];
  if (!inside || top === 'server' || path.basename(file).startsWith('.') || /\.(md)$/i.test(file) && top === '') throw new HttpError(404, 'Not found');
  let st; try { st = fs.statSync(file); } catch { throw new HttpError(404, 'Not found'); }
  if (!st.isFile()) throw new HttpError(404, 'Not found');
  const ext = path.extname(file).toLowerCase();
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'no-cache' };
  if (ext === '.zip') headers['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}
module.exports = { serveStatic };
