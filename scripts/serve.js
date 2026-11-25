'use strict';
// Tiny static server to preview the site locally (no dependencies). The community data comes from the API in
// Node.NodeGSM.WebsiteServer: set API_URL in public/config.js (e.g. 'http://localhost:3013/api').
//   npm start            http://localhost:8080
//   PORT=9000 npm start
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.zip': 'application/zip', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp' };

const server = http.createServer((req, res) => {
  const fail = (code, msg) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(msg); };
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, 'Method not allowed');
  let rel; try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return fail(400, 'Bad path'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep) || path.basename(file).startsWith('.')) return fail(404, 'Not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return fail(404, 'Not found');
    // no-cache: edits show up on a normal reload while you work on the site
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});
module.exports = { server };
if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  server.listen(port, () => console.log(`NodeGSM website (static preview) on http://localhost:${port}`));
}
