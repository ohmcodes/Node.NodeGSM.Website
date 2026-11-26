'use strict';
// In-memory rate limiter per hashed client IP. IPs are never stored raw.
const crypto = require('crypto');
const { HttpError } = require('./http');

function createLimiter(o) {
  const hits = new Map(); // "kind|ip|extra" -> [count, resetAt]
  setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v[1] < n) hits.delete(k); }, 60e3).unref();
  const bucket = (k, win) => { const n = Date.now(); let h = hits.get(k); if (!h || h[1] < n) { h = [0, n + win]; hits.set(k, h); } return h; };

  // counts one hit and throws 429 when over the limit
  const limit = (kind, ip, extra = '') => {
    const [max, win] = o.rate[kind];
    if (++bucket(kind + '|' + ip + '|' + extra, win)[0] > max) throw new HttpError(429, 'Too many requests, please try again later');
  };
  // check without counting / count without checking (submissions: a rejected attempt must not burn the quota)
  const limitCheck = (kind, ip) => { const [max] = o.rate[kind]; const h = hits.get(kind + '|' + ip + '|'); if (h && h[1] >= Date.now() && h[0] >= max) throw new HttpError(429, 'Too many submissions, please try again later'); };
  const limitHit = (kind, ip) => { bucket(kind + '|' + ip + '|', o.rate[kind][1])[0]++; };

  const ipOf = (req) => {
    let ip = req.socket.remoteAddress || '';
    if (o.trustProxy && req.headers['x-forwarded-for']) ip = String(req.headers['x-forwarded-for']).split(',')[0].trim();
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16); // never store raw IPs
  };
  return { limit, limitCheck, limitHit, ipOf };
}
module.exports = { createLimiter };
