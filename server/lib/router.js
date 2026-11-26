'use strict';
// A tiny router: patterns like '/plugins/:id/comments/:cid', a trailing '*' matches the rest ('/submissions/*'), method '*' matches any.
// Handlers get one context object: { req, res, url, params, ip, parts }.
function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => { routes.push({ method, segs: pattern.split('/').filter(Boolean), handler }); return api; };
  const api = {
    get: (p, h) => add('GET', p, h), post: (p, h) => add('POST', p, h), put: (p, h) => add('PUT', p, h), delete: (p, h) => add('DELETE', p, h), any: (p, h) => add('*', p, h),
    // -> { handler, params, parts } or null
    match(method, pathname) {
      const parts = pathname.split('/').filter(Boolean);
      for (const r of routes) {
        if (r.method !== '*' && r.method !== method) continue;
        const rest = r.segs[r.segs.length - 1] === '*';
        if (rest ? parts.length < r.segs.length - 1 : parts.length !== r.segs.length) continue;
        const params = {}; let hit = true;
        for (let i = 0; i < r.segs.length && hit; i++) {
          const s = r.segs[i];
          if (s === '*') break;
          if (s[0] === ':') { try { params[s.slice(1)] = decodeURIComponent(parts[i]); } catch { hit = false; } } else if (s !== parts[i]) hit = false;
        }
        if (hit) return { handler: r.handler, params, parts };
      }
      return null;
    },
  };
  return api;
}
module.exports = { createRouter };
