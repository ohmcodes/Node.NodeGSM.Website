'use strict';
// Wires the website together: settings, data store, services, routes, and the HTTP server (API under /api, the site from public/).
const http = require('http');
const path = require('path');
const { loadConfig } = require('./config');
const { Store } = require('./store');
const { HttpError, send, createCors } = require('./lib/http');
const { createLimiter } = require('./lib/ratelimit');
const { createAuth } = require('./lib/auth');
const { serveStatic } = require('./lib/static');
const { createCatalog } = require('./services/catalog');
const { createCommunity } = require('./services/community');
const { createAppStats } = require('./services/appStats');
const { createStars } = require('./services/stars');
const { createApiRouter } = require('./routes');

function createApp(opts = {}) {
  const o = loadConfig(opts);
  const store = new Store(path.join(o.dataDir, 'community.json'));
  const limiter = createLimiter(o);
  const auth = createAuth(o);
  const catalog = createCatalog({ o, store });
  const community = createCommunity({ store });
  const appStats = createAppStats({ o, store });
  const stars = createStars({ o, store, repoOf: catalog.repoOf });
  const router = createApiRouter({ o, store, limiter, auth, catalog, community, appStats, stars });
  const cors = createCors(o);

  async function api(req, res, url) {
    const pathname = url.pathname.replace(/^\/api\/?/, '/');
    const hit = router.match(req.method, pathname);
    if (!hit) throw new HttpError(404, 'Not found');
    return hit.handler({ req, res, url, params: hit.params, parts: hit.parts, ip: limiter.ipOf(req) });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
      if (isApi) cors(req, res);
      if (req.method === 'OPTIONS') return send(res, 204, '');
      if (isApi) return await api(req, res, url);
      if (o.serveStatic) return serveStatic(req, res, url);
      throw new HttpError(404, 'Not found');
    } catch (e) {
      if (res.headersSent) return res.end();
      const status = e.status || 500; if (status === 500) console.error(e);
      send(res, status, Object.assign({ error: status === 500 ? 'Server error' : e.message }, e.errors ? { errors: e.errors.slice(0, 20) } : {}));
    }
  });
  server.store = store;
  server.on('close', () => store.flush());
  return server;
}

module.exports = { createApp };
