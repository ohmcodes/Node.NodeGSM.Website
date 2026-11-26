'use strict';
// App download counter: the sum of GitHub's per-file download counts over the app's releases (the Download button points there, so this also
// counts people who download straight from GitHub). Cached 10 minutes (the unauthenticated GitHub API allows 60 requests per hour); the last good
// answer is kept in the data file, so a GitHub outage or a restart never shows 0. Only public release data is read, no token is sent.
const ASSET_SKIP = /\.(blockmap|ya?ml|txt|sha\d*|sig|asc)$/i; // update metadata and checksums are not downloads of the app

function createAppStats({ o, store }) {
  const state = { at: 0, failAt: 0, busy: null };
  const unavailable = () => ({ total: 0, releases: 0, latest: null, repo: o.appRepo, at: 0, unavailable: true });

  async function fetchReleases() {
    const r = await fetch(`${o.githubApi}/repos/${o.appRepo}/releases?per_page=100`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'nodegsm-website', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    return (await r.json()).filter((x) => !x.draft).map((x) => {
      const files = (x.assets || []).filter((a) => !ASSET_SKIP.test(a.name)).map((a) => ({ name: a.name, downloads: a.download_count || 0 }));
      return { tag: x.tag_name, name: x.name || x.tag_name, at: x.published_at, prerelease: !!x.prerelease, downloads: files.reduce((t, a) => t + a.downloads, 0), files };
    });
  }

  // -> { total, releases, latest, repo, at, unavailable? }
  return function appStats() {
    const snap = store.data.app;
    if (snap && Date.now() - state.at < 10 * 60e3) return Promise.resolve(snap);
    if (!snap && Date.now() - state.failAt < 60e3) return Promise.resolve(unavailable());
    if (state.busy) return state.busy;
    state.busy = (async () => {
      try {
        const rel = await fetchReleases();
        store.data.app = { total: rel.reduce((t, x) => t + x.downloads, 0), releases: rel.length, latest: rel.find((x) => !x.prerelease) || rel[0] || null, repo: o.appRepo, at: Date.now() };
        store.touch(); state.at = Date.now();
      } catch { state.failAt = Date.now(); state.at = Date.now() - 9 * 60e3; /* retry in a minute, keep the last good numbers */ }
      state.busy = null;
      return store.data.app || unavailable();
    })();
    return state.busy;
  };
}
module.exports = { createAppStats };
