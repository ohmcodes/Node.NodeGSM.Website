'use strict';
// Builds the API router (everything under /api). To add an endpoint: put its logic in services/, its HTTP handler in a routes/ file, and register it here.
const { createRouter } = require('../lib/router');
const { HttpError, send, readJson } = require('../lib/http');
const { clean } = require('../lib/text');
const submissions = require('./submissions');

function createApiRouter(ctx) {
  const router = createRouter();
  require('./site')(router, ctx);
  require('./plugins')(router, ctx);

  // converter submissions keep their own sub-routing (see routes/submissions.js)
  const { o, store, catalog, limiter, auth } = ctx;
  const subs = submissions.create({ o, store, knownIds: catalog.knownIds, HttpError, send, readJson, clean, isAdmin: auth.isAdmin, ...limiter });
  router.any('/submissions/*', ({ req, res, parts }) => subs.handle(req, res, parts));
  return router;
}
module.exports = { createApiRouter };
