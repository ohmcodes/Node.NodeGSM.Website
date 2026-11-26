'use strict';
// Who is calling: the admin (Bearer ADMIN_TOKEN) and the anonymous browser id (X-Client-Id).
const crypto = require('crypto');
const { HttpError } = require('./http');
const { CLIENT_RE } = require('./constants');

function createAuth(o) {
  const isAdmin = (req) => {
    if (!o.adminToken) return false;
    const a = String(req.headers.authorization || ''); const t = a.startsWith('Bearer ') ? a.slice(7) : '';
    const A = Buffer.from(t), B = Buffer.from(o.adminToken);
    return A.length === B.length && crypto.timingSafeEqual(A, B);
  };
  const requireAdmin = (req) => { if (!isAdmin(req)) throw new HttpError(403, 'Admin only'); };
  const clientOf = (req) => { const c = String(req.headers['x-client-id'] || ''); if (!CLIENT_RE.test(c)) throw new HttpError(400, 'Missing or invalid X-Client-Id'); return c; };
  const optionalClient = (req) => { const c = String(req.headers['x-client-id'] || ''); return CLIENT_RE.test(c) ? c : ''; };
  return { isAdmin, requireAdmin, clientOf, optionalClient };
}
module.exports = { createAuth };
