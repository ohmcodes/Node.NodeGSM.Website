'use strict';
// GitHub stars of each plugin's source repository (the Catalogue index "repo" field).
// Filled slowly in the background: a few repositories per run, oldest answer first, and it stops when GitHub's rate limit runs low, so the
// 60 requests per hour of the unauthenticated API are shared fairly with the download counter. A GITHUB_TOKEN (public read) makes it instant.
// Numbers are kept in the data file and refreshed every 12 hours; a failure just keeps the old number.
const TTL = 12 * 3600e3;

function createStars({ o, store, repoOf }) {
  const run = { at: 0, busy: false };

  async function refresh() {
    if (run.busy || Date.now() - run.at < o.starsEvery || !repoOf.size) return; // (repoOf is empty until the catalogue was read)
    run.busy = true; run.at = Date.now();
    try {
      const stars = store.data.stars || (store.data.stars = {});
      const stale = [...new Set(repoOf.values())].filter((r) => !stars[r] || Date.now() - stars[r].at > TTL).sort((a, b) => ((stars[a] && stars[a].at) || 0) - ((stars[b] && stars[b].at) || 0));
      const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'nodegsm-website', 'X-GitHub-Api-Version': '2022-11-28' };
      if (o.githubToken) headers.Authorization = 'Bearer ' + o.githubToken;
      for (const r of stale.slice(0, o.githubToken ? 60 : 10)) {
        const res = await fetch(`${o.githubApi}/repos/${r}`, { headers, signal: AbortSignal.timeout(8000) });
        if (res.status === 404 || res.status === 451) { stars[r] = { n: -1, at: Date.now() }; store.touch(); continue; } // gone / blocked: do not ask again for 12 hours
        if (!res.ok) break; // rate limited or GitHub trouble: try again next run
        const j = await res.json();
        stars[r] = { n: Number(j.stargazers_count) || 0, at: Date.now() }; store.touch();
        const left = res.headers.get('x-ratelimit-remaining');
        if (left !== null && Number(left) <= 12) break; // keep some budget for the download counter
      }
    } catch { /* keep what we have */ }
    run.busy = false;
  }

  // { pluginId: { stars, repo } } for plugins whose count is known
  const current = () => {
    const st = store.data.stars || {}, out = {};
    for (const [id, r] of repoOf) if (st[r] && st[r].n >= 0) out[id] = { stars: st[r].n, repo: r };
    return out;
  };
  return { refresh, current };
}
module.exports = { createStars };
