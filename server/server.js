'use strict';
// NodeGSM website server: serves the static site AND the community API (ratings, comments, editable plugin info, download counts).
// No dependencies. Run:  npm start   (PORT=8080 ADMIN_TOKEN=secret node server/server.js)
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
//                     submission opens a DRAFT pull request; without it the owner gets the files and opens the PR by hand. Never logged or returned
//   GITHUB_REPO       owner/name of the Catalogue (default ohmcodes/Node.NodeGSM.Catalogue); GITHUB_BASE_BRANCH (default main)
//   APP_REPO          owner/name of the app whose release downloads are counted on the front page (default ohmcodes/Node.NodeGSM)
//   GITHUB_API_URL    default https://api.github.com (https only; http only for localhost, used by the tests)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./store');
const submissions = require('./submissions');

const SITE = path.join(__dirname, '..', 'public');
const DEFAULT_CATALOG_INDEX = 'https://ohmcodes.github.io/Node.NodeGSM.Catalogue/index.json';
const LIMITS = { body: 64 * 1024, comment: 2000, info: 20000, name: 40, summary: 120, comments: 300, history: 50 };
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const CLIENT_RE = /^[A-Za-z0-9_-]{6,64}$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.zip': 'application/zip', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp' };

// ---- helpers
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const clean = (s, max, multiline) => String(s == null ? '' : s).replace(multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '').replace(multiline ? /\n{4,}/g : /\s+/g, multiline ? '\n\n\n' : ' ').trim().slice(0, max);
const linkCount = (s) => (s.match(/https?:\/\/|www\./gi) || []).length;

function createApp(opts = {}) {
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
  const store = new Store(path.join(o.dataDir, 'community.json'));

  // feed events "new plugin" / "plugin updated": the Catalogue has no dates, so the site notices changes between two reads of index.json.
  // The first read only records a baseline (no events), otherwise every existing plugin would show up as new.
  const onCatalog = (j) => {
    const snap = {}; for (const p of j.plugins) {
      snap[p.id] = { n: String(p.name || p.id), v: String(p.version || '') };
      // the Catalogue's lean index carries "repo" (owner/name); a plain github.com "url" is accepted too
      const g = /^([\w.-]+)\/([\w.-]+)$/.exec(String(p.repo || '')) || /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(p.url || '')); if (g) repoOf.set(p.id, g[1] + '/' + g[2]); else repoOf.delete(p.id);
    }
    const old = store.data.catalog;
    if (old) {
      for (const [id, c] of Object.entries(snap)) {
        if (!old[id]) store.event({ t: 'new', id, name: c.n, v: c.v });
        else if (c.v && old[id].v !== c.v) store.event({ t: 'update', id, name: c.n, from: old[id].v, v: c.v });
      }
    }
    if (!old || JSON.stringify(old) !== JSON.stringify(snap)) { store.data.catalog = snap; store.touch(); }
  };

  // known plugin ids (refreshed at most every 10 minutes)
  let known = null, knownAt = 0;
  const knownIds = () => {
    if (Date.now() - knownAt < 10 * 60e3) return known;
    knownAt = Date.now();
    const set = (j) => { known = new Set(j.plugins.map((p) => p.id)); onCatalog(j); };
    if (/^https?:\/\//i.test(o.catalogIndex)) {
      // refresh in the background; until the first answer (or when the catalogue is down) any valid id is accepted
      fetch(o.catalogIndex, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).then(set).catch(() => {});
    } else { try { set(JSON.parse(fs.readFileSync(o.catalogIndex, 'utf8'))); } catch { known = null; } }
    return known;
  };
  const pluginId = (raw) => {
    const id = decodeURIComponent(raw);
    if (!ID_RE.test(id)) throw new HttpError(400, 'Invalid plugin id');
    const k = knownIds(); if (k && !k.has(id)) throw new HttpError(404, 'Unknown plugin');
    return id;
  };

  // in-memory rate limiter: key -> [count, resetAt]
  const hits = new Map();
  setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v[1] < n) hits.delete(k); }, 60e3).unref();
  const limit = (kind, ip, extra = '') => {
    const [max, win] = o.rate[kind]; const k = kind + '|' + ip + '|' + extra; const n = Date.now();
    let h = hits.get(k); if (!h || h[1] < n) { h = [0, n + win]; hits.set(k, h); }
    if (++h[0] > max) throw new HttpError(429, 'Too many requests, please try again later');
  };
  // check without counting / count without checking (used for submissions: a rejected attempt must not burn the quota)
  const limitCheck = (kind, ip) => { const [max] = o.rate[kind]; const h = hits.get(kind + '|' + ip + '|'); if (h && h[1] >= Date.now() && h[0] >= max) throw new HttpError(429, 'Too many submissions, please try again later'); };
  const limitHit = (kind, ip) => { const [, win] = o.rate[kind]; const k = kind + '|' + ip + '|'; const n = Date.now(); let h = hits.get(k); if (!h || h[1] < n) { h = [0, n + win]; hits.set(k, h); } h[0]++; };
  const ipOf = (req) => {
    let ip = req.socket.remoteAddress || '';
    if (o.trustProxy && req.headers['x-forwarded-for']) ip = String(req.headers['x-forwarded-for']).split(',')[0].trim();
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16); // never store raw IPs
  };
  const clientOf = (req) => { const c = String(req.headers['x-client-id'] || ''); if (!CLIENT_RE.test(c)) throw new HttpError(400, 'Missing or invalid X-Client-Id'); return c; };
  const isAdmin = (req) => { if (!o.adminToken) return false; const a = String(req.headers.authorization || ''); const t = a.startsWith('Bearer ') ? a.slice(7) : ''; const A = Buffer.from(t), B = Buffer.from(o.adminToken); return A.length === B.length && crypto.timingSafeEqual(A, B); };

  // ---- app download counter: the sum of GitHub's per-file download counts over the app's releases (the Download button points there, so this also
  // counts people who download straight from GitHub). Cached 10 minutes (the unauthenticated GitHub API allows 60 requests per hour); the last good
  // answer is kept in the data file, so a GitHub outage or a restart never shows 0. Only public release data is read, no token is sent.
  const ASSET_SKIP = /\.(blockmap|ya?ml|txt|sha\d*|sig|asc)$/i; // update metadata and checksums are not downloads of the app
  const app = { at: 0, failAt: 0, busy: null };
  const unavailable = () => ({ total: 0, releases: 0, latest: null, repo: o.appRepo, at: 0, unavailable: true });
  const appStats = () => {
    const snap = store.data.app;
    if (snap && Date.now() - app.at < 10 * 60e3) return Promise.resolve(snap);
    if (!snap && Date.now() - app.failAt < 60e3) return Promise.resolve(unavailable());
    if (app.busy) return app.busy;
    app.busy = (async () => {
      try {
        const r = await fetch(`${o.githubApi}/repos/${o.appRepo}/releases?per_page=100`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'nodegsm-website', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error('GitHub ' + r.status);
        const rel = (await r.json()).filter((x) => !x.draft).map((x) => {
          const files = (x.assets || []).filter((a) => !ASSET_SKIP.test(a.name)).map((a) => ({ name: a.name, downloads: a.download_count || 0 }));
          return { tag: x.tag_name, name: x.name || x.tag_name, at: x.published_at, prerelease: !!x.prerelease, downloads: files.reduce((t, a) => t + a.downloads, 0), files };
        });
        store.data.app = { total: rel.reduce((t, x) => t + x.downloads, 0), releases: rel.length, latest: rel.find((x) => !x.prerelease) || rel[0] || null, repo: o.appRepo, at: Date.now() };
        store.touch(); app.at = Date.now();
      } catch { app.failAt = Date.now(); app.at = Date.now() - 9 * 60e3; /* retry in a minute, keep the last good numbers */ }
      app.busy = null;
      return store.data.app || unavailable();
    })();
    return app.busy;
  };

  // ---- GitHub stars of each plugin's source repository (the plugin's "url", when it is a github.com repository).
  // Filled slowly in the background: a few repositories per run, oldest answer first, and it stops when GitHub's rate limit runs low, so the
  // 60 requests per hour of the unauthenticated API are shared fairly with the download counter. A GITHUB_TOKEN (public read) makes it instant.
  // Numbers are kept in the data file and refreshed every 12 hours; a failure just keeps the old number.
  const repoOf = new Map(); // plugin id -> "owner/name"
  const starsRun = { at: 0, busy: false };
  const STAR_TTL = 12 * 3600e3;
  async function refreshStars() {
    if (starsRun.busy || Date.now() - starsRun.at < o.starsEvery || !repoOf.size) return; // (repoOf is empty until the catalogue was read)
    starsRun.busy = true; starsRun.at = Date.now();
    try {
      const stars = store.data.stars || (store.data.stars = {});
      const repos = [...new Set(repoOf.values())].filter((r) => !stars[r] || Date.now() - stars[r].at > STAR_TTL).sort((a, b) => ((stars[a] && stars[a].at) || 0) - ((stars[b] && stars[b].at) || 0));
      const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'nodegsm-website', 'X-GitHub-Api-Version': '2022-11-28' };
      if (o.githubToken) headers.Authorization = 'Bearer ' + o.githubToken;
      for (const r of repos.slice(0, o.githubToken ? 60 : 10)) {
        const res = await fetch(`${o.githubApi}/repos/${r}`, { headers, signal: AbortSignal.timeout(8000) });
        if (res.status === 404 || res.status === 451) { stars[r] = { n: -1, at: Date.now() }; store.touch(); continue; } // gone / blocked: do not ask again for 12 hours
        if (!res.ok) break; // rate limited or GitHub trouble: try again next run
        const j = await res.json();
        stars[r] = { n: Number(j.stargazers_count) || 0, at: Date.now() }; store.touch();
        if (Number(res.headers.get('x-ratelimit-remaining')) <= 12 && res.headers.get('x-ratelimit-remaining') !== null) break; // keep some budget for the download counter
      }
    } catch { /* keep what we have */ }
    starsRun.busy = false;
  }

  // ---- views
  const rating =(p, client) => { const v = Object.values(p.ratings); return { avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0, count: v.length, mine: (client && p.ratings[client]) || 0 }; };
  const view = (p, client) => ({
    rating: rating(p, client), downloads: p.downloads,
    comments: p.comments.slice(-200).reverse().map((c) => ({ id: c.id, name: c.name, text: c.text, at: c.at })),
    info: { text: p.info.text, rev: p.info.rev, by: p.info.by, at: p.info.at, summary: p.info.summary, history: p.info.history.map((h) => ({ rev: h.rev, by: h.by, at: h.at, summary: h.summary })) },
  });

  // ---- http plumbing
  const readJson = (req, max) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0; max = max || LIMITS.body;
    req.on('data', (c) => { n += c.length; if (n > max) { reject(new HttpError(413, 'Request too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!n) return resolve({}); try { const j = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(j && typeof j === 'object' ? j : {}); } catch { reject(new HttpError(400, 'Invalid JSON')); } });
    req.on('error', reject);
  });
  const cors = (req, res) => {
    const org = req.headers.origin;
    if (o.origins.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
    else if (org && o.origins.includes(org)) { res.setHeader('Access-Control-Allow-Origin', org); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-Id, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
    // Chrome asks this before a public https page (GitHub Pages) may call an API on localhost / a LAN address
    if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
  };
  const send = (res, status, body, headers) => {
    const b = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, headers));
    res.end(b);
  };

  const subs = submissions.create({ o, store, knownIds, HttpError, send, readJson, limit, limitCheck, limitHit, ipOf, isAdmin, clean });

  // ---- API
  async function api(req, res, url) {
    const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const m = req.method;
    if (parts[0] === 'health' && m === 'GET') return send(res, 200, { ok: true, service: 'nodegsm-community', admin: !!o.adminToken, submissions: true });
    if (parts[0] === 'ratings' && m === 'GET') {
      const out = {}; for (const [id, p] of Object.entries(store.data.plugins)) { const r = rating(p); if (r.count || p.downloads) out[id] = { avg: r.avg, count: r.count, downloads: p.downloads }; }
      return send(res, 200, out);
    }
    if (parts[0] === 'stars' && m === 'GET') {
      knownIds(); refreshStars(); // answers with what is known now; the refresh runs in the background
      const st = store.data.stars || {}, out = {};
      for (const [id, r] of repoOf) if (st[r] && st[r].n >= 0) out[id] = { stars: st[r].n, repo: r };
      return send(res, 200, out, { 'Cache-Control': 'public, max-age=300' });
    }
    if (parts[0] === 'stats' && m === 'GET') {
      const a = await appStats(); const all = Object.values(store.data.plugins); const sum = (f) => all.reduce((t, p) => t + f(p), 0);
      return send(res, 200, {
        app: { downloads: a.total, releases: a.releases, latest: a.latest, updatedAt: a.at, unavailable: !!a.unavailable },
        plugins: { downloads: sum((p) => p.downloads), ratings: sum((p) => Object.keys(p.ratings).length), comments: sum((p) => p.comments.length) },
      });
    }
    if (parts[0] === 'feed' && m === 'GET') {
      knownIds(); // makes sure the catalogue was read, so new / updated plugins are noticed
      const type = url.searchParams.get('type') || ''; const n = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const events = store.data.events.filter((e) => !type || e.t === type).slice(0, n);
      const all = Object.entries(store.data.plugins);
      const topDownloads = all.filter(([, p]) => p.downloads > 0).sort((a, b) => b[1].downloads - a[1].downloads).slice(0, 10).map(([id, p]) => ({ id, downloads: p.downloads }));
      const sum = (f) => all.reduce((t, [, p]) => t + f(p), 0);
      return send(res, 200, { events, topDownloads, totals: { downloads: sum((p) => p.downloads), ratings: sum((p) => Object.keys(p.ratings).length), comments: sum((p) => p.comments.length) } });
    }
    if (parts[0] === 'submissions') return subs.handle(req, res, parts);
    if (parts[0] !== 'plugins' || !parts[1]) throw new HttpError(404, 'Not found');
    const id = pluginId(parts[1]); const what = parts[2]; const ip = ipOf(req);

    if (!what && m === 'GET') return send(res, 200, view(store.peek(id) || store.plugin(id)));
    if (what === 'community' && m === 'GET') return send(res, 200, view(store.peek(id) || store.plugin(id), CLIENT_RE.test(String(req.headers['x-client-id'] || '')) ? String(req.headers['x-client-id']) : ''));

    if (what === 'download' && m === 'POST') {
      try { limit('download', ip, id); store.plugin(id).downloads++; store.event({ t: 'download', id }); } catch { /* repeat downloads within the window are not counted */ }
      return send(res, 204, '');
    }
    if (what === 'rating' && m === 'PUT') {
      const client = clientOf(req); limit('rating', ip);
      const v = Math.round(Number((await readJson(req)).value)); if (!(v >= 0 && v <= 5)) throw new HttpError(400, 'Rating must be 1-5 (0 removes your rating)');
      const p = store.plugin(id); if (v === 0) delete p.ratings[client]; else { p.ratings[client] = v; store.event({ t: 'rating', id, value: v }); } store.touch(); return send(res, 200, view(p, client));
    }
    if (what === 'comments' && m === 'POST') {
      const client = clientOf(req); limit('comment', ip);
      const b = await readJson(req); const text = clean(b.text, LIMITS.comment, true); const name = clean(b.name, LIMITS.name) || 'Anonymous';
      if (text.length < 2) throw new HttpError(400, 'Comment is empty');
      if (linkCount(text) > 2) throw new HttpError(400, 'Too many links');
      const p = store.plugin(id);
      if (p.comments.some((c) => c.by === ip && c.text === text)) throw new HttpError(409, 'Duplicate comment');
      p.comments.push({ id: 'c' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), name, text, at: Date.now(), by: ip });
      if (p.comments.length > LIMITS.comments) p.comments.splice(0, p.comments.length - LIMITS.comments);
      store.event({ t: 'comment', id, cid: p.comments[p.comments.length - 1].id, name, text: text.slice(0, 140) });
      store.touch(); return send(res, 201, view(p, client));
    }
    if (what === 'info' && m === 'PUT') {
      const client = clientOf(req); limit('info', ip);
      const b = await readJson(req); const text = clean(b.text, LIMITS.info, true); const name = clean(b.name, LIMITS.name) || 'Anonymous'; const summary = clean(b.summary, LIMITS.summary);
      const p = store.plugin(id); const i = p.info;
      if (text === i.text) throw new HttpError(400, 'No changes to save');
      if (linkCount(text) > 20) throw new HttpError(400, 'Too many links');
      i.history.unshift({ rev: i.rev, text: i.text, by: i.by, at: i.at, summary: i.summary }); i.history.length = Math.min(i.history.length, LIMITS.history);
      Object.assign(i, { text, rev: i.rev + 1, by: name, at: Date.now(), summary });
      store.event({ t: 'info', id, name, rev: i.rev, summary });
      store.touch(); return send(res, 200, view(p, client));
    }

    // ---- moderation (needs ADMIN_TOKEN)
    if (what === 'comments' && m === 'DELETE' && parts[3]) {
      if (!isAdmin(req)) throw new HttpError(403, 'Admin only');
      const p = store.plugin(id); const n = p.comments.length; p.comments = p.comments.filter((c) => c.id !== parts[3]);
      if (p.comments.length === n) throw new HttpError(404, 'Comment not found');
      store.data.events = store.data.events.filter((e) => e.cid !== parts[3]);
      store.touch(); return send(res, 200, view(p));
    }
    if (what === 'info' && parts[3] === 'revert' && m === 'POST') {
      if (!isAdmin(req)) throw new HttpError(403, 'Admin only');
      const rev = Number((await readJson(req)).rev); const p = store.plugin(id); const i = p.info; const h = i.history.find((x) => x.rev === rev);
      if (!h) throw new HttpError(404, 'Revision not found');
      i.history.unshift({ rev: i.rev, text: i.text, by: i.by, at: i.at, summary: i.summary });
      Object.assign(i, { text: h.text, rev: i.rev + 1, by: 'moderator', at: Date.now(), summary: 'Reverted to revision ' + rev });
      store.touch(); return send(res, 200, view(p));
    }
    throw new HttpError(404, 'Not found');
  }

  // ---- static files
  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    let rel; try { rel = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Bad path'); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(SITE, '.' + rel);
    const inside = file.startsWith(SITE + path.sep);
    const top = path.relative(SITE, file).split(path.sep)[0];
    if (!inside || top === 'server' || path.basename(file).startsWith('.') || /\.(md)$/i.test(file) && top === '') throw new HttpError(404, 'Not found');
    let st; try { st = fs.statSync(file); } catch { throw new HttpError(404, 'Not found'); }
    if (!st.isFile()) throw new HttpError(404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'no-cache' };
    if (ext === '.zip') headers['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
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

if (require.main === module) {
  const port = Number(process.env.PORT) || 3013;
  const s = createApp();
  s.listen(port, () => console.log(`NodeGSM site + community API on http://localhost:${port}  (admin ${process.env.ADMIN_TOKEN ? 'enabled' : 'disabled'})`));
  const bye = () => { s.store.flush(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
