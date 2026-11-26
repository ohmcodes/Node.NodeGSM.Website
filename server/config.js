'use strict';
// Settings: environment variables with defaults; `opts` (used by the tests) wins over the environment.
//
// Env:
//   PORT              default 3013
//   DATA_DIR          default server/data   (community.json lives here - back it up)
//   CATALOG_INDEX     the Catalogue's index.json: https URL (default, refreshed every 10 min) or a local file. Only its plugin ids may receive community data; if it cannot be read, any valid id is accepted
//   ADMIN_TOKEN       enables moderation endpoints (Authorization: Bearer <token>); unset = disabled
//   ALLOWED_ORIGINS   CORS allow-list, comma separated, default * (set it when the site and API are on different origins)
//   TRUST_PROXY=1     read the client IP from X-Forwarded-For (only behind a reverse proxy you control)
//   SERVE_STATIC=0    API only
//   GITHUB_TOKEN      optional: a fine-grained token limited to the Catalogue repo (Contents + Pull requests: read/write). With it, approving a converter
//                     submission opens a DRAFT pull request; without it the owner gets the files and opens the PR by hand. Never logged or returned.
//                     Also used (read only) to fill the plugin star counts faster
//   GITHUB_REPO       owner/name of the Catalogue (default ohmcodes/Node.NodeGSM.Catalogue); GITHUB_BASE_BRANCH (default main)
//   APP_REPO          owner/name of the app whose release downloads are counted on the front page (default ohmcodes/Node.NodeGSM)
//   GITHUB_API_URL    default https://api.github.com (https only; http only for localhost, used by the tests)
const path = require('path');
const { DEFAULT_CATALOG_INDEX } = require('./lib/constants');

function loadConfig(opts = {}) {
  const o = Object.assign({
    dataDir: process.env.DATA_DIR || path.join(__dirname, 'data'),
    catalogIndex: process.env.CATALOG_INDEX || DEFAULT_CATALOG_INDEX,
    adminToken: process.env.ADMIN_TOKEN || '',
    origins: (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: process.env.TRUST_PROXY === '1',
    serveStatic: process.env.SERVE_STATIC !== '0',
    githubToken: process.env.GITHUB_TOKEN || '',
    githubRepo: process.env.GITHUB_REPO || 'ohmcodes/Node.NodeGSM.Catalogue',
    appRepo: process.env.APP_REPO || 'ohmcodes/Node.NodeGSM',
    githubBranch: process.env.GITHUB_BASE_BRANCH || 'main',
    githubApi: process.env.GITHUB_API_URL || 'https://api.github.com',
    starsEvery: 2 * 60e3, // minimum time between two star refresh runs
  }, opts);
  // [max, window ms] per hashed IP. submit: 1 per 10 min and 3 per day (only accepted submissions count); submitTry: every attempt
  o.rate = Object.assign({ comment: [5, 10 * 60e3], info: [6, 10 * 60e3], rating: [30, 3600e3], download: [1, 10 * 60e3], submit: [1, 10 * 60e3], submitDay: [3, 24 * 3600e3], submitTry: [30, 10 * 60e3], submitStatus: [60, 10 * 60e3] }, opts.rate);
  return o;
}
module.exports = { loadConfig };
