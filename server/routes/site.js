'use strict';
// Site-wide routes: health, plugin summaries, GitHub stars, counters and the activity feed.
const { send } = require('../lib/http');

module.exports = function siteRoutes(router, { o, catalog, community, stars, appStats }) {
  router.get('/health', ({ res }) => send(res, 200, { ok: true, service: 'nodegsm-community', admin: !!o.adminToken, submissions: true }));

  // { pluginId: { avg, count, downloads } } for the plugin list
  router.get('/ratings', ({ res }) => send(res, 200, community.summaries()));

  // GitHub stars per plugin: answers with what is known now; the refresh runs in the background
  router.get('/stars', ({ res }) => {
    catalog.knownIds(); stars.refresh();
    send(res, 200, stars.current(), { 'Cache-Control': 'public, max-age=300' });
  });

  // front page numbers: the app's downloads (GitHub releases) and the plugin community totals
  router.get('/stats', async ({ res }) => {
    const a = await appStats();
    send(res, 200, { app: { downloads: a.total, releases: a.releases, latest: a.latest, updatedAt: a.at, unavailable: !!a.unavailable }, plugins: community.totals() });
  });

  router.get('/feed', ({ res, url }) => {
    catalog.knownIds(); // makes sure the catalogue was read, so new / updated plugins are noticed
    const n = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    send(res, 200, community.feed(url.searchParams.get('type') || '', n));
  });
};
