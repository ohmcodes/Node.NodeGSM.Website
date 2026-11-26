'use strict';
// HTTP plumbing shared by every route: errors, JSON replies, request bodies and CORS.
const { LIMITS } = require('./constants');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const send = (res, status, body, headers) => {
  const b = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, headers));
  res.end(b);
};

// Reads a JSON object body of at most `max` bytes (an empty body is {}).
const readJson = (req, max) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0; max = max || LIMITS.body;
  req.on('data', (c) => { n += c.length; if (n > max) { reject(new HttpError(413, 'Request too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { if (!n) return resolve({}); try { const j = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(j && typeof j === 'object' ? j : {}); } catch { reject(new HttpError(400, 'Invalid JSON')); } });
  req.on('error', reject);
});

// CORS headers for API requests; the allow-list comes from ALLOWED_ORIGINS.
const createCors = (o) => (req, res) => {
  const org = req.headers.origin;
  if (o.origins.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (org && o.origins.includes(org)) { res.setHeader('Access-Control-Allow-Origin', org); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-Id, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  // Chrome asks this before a public https page may call an API on localhost / a LAN address
  if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
};

module.exports = { HttpError, send, readJson, createCors };
