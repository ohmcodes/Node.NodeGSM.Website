'use strict';
// Per-plugin routes: community data, download count, rating, comments, editable info, and the moderation routes (ADMIN_TOKEN).
// Each handler checks the request (who, how often), calls one action of services/community.js and sends the new view.
const { send, readJson } = require('../lib/http');

module.exports = function pluginRoutes(router, { catalog, community, auth, limiter }) {
  const { limit } = limiter;
  // wraps a handler: validates :id against the catalogue first (400 malformed, 404 unknown), then passes it as the second argument
  const plugin = (fn) => (c) => fn(c, catalog.pluginId(c.params.id));

  router.get('/plugins/:id', plugin(({ res }, id) => send(res, 200, community.viewOf(id))));
  router.get('/plugins/:id/community', plugin(({ req, res }, id) => send(res, 200, community.viewOf(id, auth.optionalClient(req)))));

  router.post('/plugins/:id/download', plugin(({ res, ip }, id) => {
    try { limit('download', ip, id); community.countDownload(id); } catch { /* repeat downloads within the window are not counted */ }
    send(res, 204, '');
  }));

  router.put('/plugins/:id/rating', plugin(async ({ req, res, ip }, id) => {
    const client = auth.clientOf(req); limit('rating', ip);
    const body = await readJson(req);
    send(res, 200, community.view(community.setRating(id, client, body.value), client));
  }));

  router.post('/plugins/:id/comments', plugin(async ({ req, res, ip }, id) => {
    const client = auth.clientOf(req); limit('comment', ip);
    const body = await readJson(req);
    send(res, 201, community.view(community.addComment(id, ip, body), client));
  }));

  router.put('/plugins/:id/info', plugin(async ({ req, res, ip }, id) => {
    const client = auth.clientOf(req); limit('info', ip);
    const body = await readJson(req);
    send(res, 200, community.view(community.saveInfo(id, body), client));
  }));

  // ---- moderation
  router.delete('/plugins/:id/comments/:cid', plugin(({ req, res, params }, id) => {
    auth.requireAdmin(req);
    send(res, 200, community.view(community.deleteComment(id, params.cid)));
  }));

  router.post('/plugins/:id/info/revert', plugin(async ({ req, res }, id) => {
    auth.requireAdmin(req);
    const body = await readJson(req);
    send(res, 200, community.view(community.revertInfo(id, body.rev)));
  }));
};
