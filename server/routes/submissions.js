'use strict';
// Plugin submissions: the website converter sends a converted WindowsGSM plugin here, the owners approve it, and (optionally)
// the server opens a DRAFT pull request in the Catalogue repository through the GitHub REST API (node https, no dependencies).
//
// Only plugin.json + README.md can ever be submitted. There is no way to submit a plugin.js: the route has no field for it,
// plugin.json is validated against a strict allow-list (validatePluginJson) and the PR contains exactly those two files.
// Submission content is untrusted text: it is stored as text, returned as JSON and must be rendered with textContent.
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { convertCs, checkSource, validatePluginJson, buildReadme, buildPrBody, LIMITS: CONV, ID_RE } = require('../../public/convert-cs.js');

const SID_RE = /^sub_[0-9a-f]{12}$/;
const LIMITS = { source: CONV.source, json: CONV.json, readme: CONV.readme, body: 640 * 1024, contact: 100, name: 100, reason: 300, pending: 200 };
const STATUSES = ['pending', 'approved', 'rejected', 'pr-opened'];

// minimal GitHub REST client. The token only ever goes into the Authorization header.
function ghRequest(base, token, method, path, body) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(base.replace(/\/+$/, '') + path); } catch { return reject(new Error('GITHUB_API_URL is not a valid URL')); }
    const loop = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loop)) return reject(new Error('GITHUB_API_URL must be https (http is only allowed for localhost)'));
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = (u.protocol === 'https:' ? https : http).request(u, {
      method, timeout: 15000,
      headers: Object.assign({ Accept: 'application/vnd.github+json', 'User-Agent': 'nodegsm-website-converter', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token }, data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
    }, (res) => {
      const chunks = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n > 1024 * 1024) { req.destroy(new Error('GitHub answered with too much data')); } else chunks.push(c); });
      res.on('end', () => { let json = {}; try { json = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { /* not JSON */ } resolve({ status: res.statusCode, json }); });
    });
    req.on('timeout', () => req.destroy(new Error('GitHub request timed out')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function create(ctx) {
  const { o, store, knownIds, HttpError, send, readJson, limit, limitCheck, limitHit, ipOf, isAdmin, clean } = ctx;
  const subs = () => store.data.submissions;
  const taken = (exceptSid) => {
    const set = new Set(knownIds() || []);
    for (const s of store.submissions()) if (s.status !== 'rejected' && s.id !== exceptSid) set.add(s.pluginId);
    return set;
  };
  const publicView = (s) => ({ id: s.id, status: s.status, prUrl: s.status === 'pr-opened' ? s.prUrl : undefined, reason: s.status === 'rejected' ? s.reason : undefined, updatedAt: s.updatedAt });
  const adminView = (s) => ({ id: s.id, pluginId: s.pluginId, name: s.name, status: s.status, createdAt: s.createdAt, updatedAt: s.updatedAt, contact: s.contact, via: s.via, sourceSha256: s.sourceSha256, sourceBytes: s.sourceBytes, warnings: s.warnings, todos: s.todos, pluginJsonText: s.pluginJsonText, readmeText: s.readmeText, prBody: s.prBody, prUrl: s.prUrl, reason: s.reason, lastError: s.lastError });
  const redact = (s) => (o.githubToken ? String(s).split(o.githubToken).join('[redacted]') : String(s));

  async function submit(req, res) {
    const ip = ipOf(req);
    limit('submitTry', ip);        // coarse guard against floods (counts every attempt)
    limitCheck('submit', ip); limitCheck('submitDay', ip); // 1 per 10 min, 3 per day: only successful submissions count
    const b = await readJson(req, LIMITS.body);
    if (b.consent !== true) throw new HttpError(400, 'You must agree that the plugin may be published under the repository licence (consent: true)');
    const contact = clean(b.contact, LIMITS.contact);
    const edits = b.edits && typeof b.edits === 'object' ? b.edits : {};
    const idIn = b.id === undefined || b.id === null || b.id === '' ? '' : String(b.id);
    if (idIn && !ID_RE.test(idIn)) throw new HttpError(400, 'Invalid plugin id (2-32 chars of a-z 0-9 _ -)');
    const existing = taken();
    if (idIn && existing.has(idIn)) throw new HttpError(409, `A plugin or pending submission with the id "${idIn}" already exists`);
    if (store.submissions().filter((s) => s.status === 'pending').length >= LIMITS.pending) throw new HttpError(503, 'The review queue is full, please try again later');

    let out, via, sourceSha256, sourceBytes;
    if (b.source !== undefined && b.source !== null) {
      if (typeof b.source !== 'string') throw new HttpError(400, 'source must be text');
      if (b.source.length > LIMITS.source) throw new HttpError(413, 'The C# source is larger than ' + LIMITS.source / 1024 + ' KB');
      const bad = checkSource(b.source); if (bad) throw new HttpError(400, bad);
      const r = convertCs(b.source, { id: idIn, name: clean(edits.name, LIMITS.name), author: clean(edits.author, LIMITS.name), exe: clean(edits.exe, 200), existingIds: existing, automated: true });
      if (!r.ok) { const e = new HttpError(400, 'The plugin could not be converted: ' + r.errors[0]); e.errors = r.errors; throw e; }
      out = { id: r.id, pj: r.pluginJson, readme: r.readmeText, prBody: r.prBody, warnings: r.warnings, todos: r.todos };
      via = 'source'; sourceSha256 = crypto.createHash('sha256').update(b.source).digest('hex'); sourceBytes = Buffer.byteLength(b.source);
    } else if (b.pluginJson && typeof b.pluginJson === 'object' && !Array.isArray(b.pluginJson)) {
      const text = JSON.stringify(b.pluginJson);
      if (text.length > LIMITS.json) throw new HttpError(413, 'plugin.json is larger than ' + LIMITS.json / 1024 + ' KB');
      const errs = validatePluginJson(b.pluginJson);
      if (errs.length) { const e = new HttpError(400, 'plugin.json is not valid: ' + errs[0]); e.errors = errs; throw e; }
      if (idIn && idIn !== b.pluginJson.id) throw new HttpError(400, 'id does not match plugin.json');
      if (existing.has(b.pluginJson.id)) throw new HttpError(409, `A plugin or pending submission with the id "${b.pluginJson.id}" already exists`);
      const pj = JSON.parse(text);
      const todos = ['Add icon.png (square PNG, 64-256 px).', 'Add "docs" links.'];
      out = { id: pj.id, pj, readme: buildReadme(pj, { todos }), prBody: buildPrBody(pj, { todos, warnings: ['Submitted as plugin.json without the C# source: not checked against the original.'], automated: true }), warnings: ['Submitted as plugin.json without the C# source.'], todos };
      via = 'json';
    } else throw new HttpError(400, 'Send "source" (the C# file text) or "pluginJson"');

    const pluginJsonText = JSON.stringify(out.pj, null, 2) + '\n';
    if (pluginJsonText.length > LIMITS.json) throw new HttpError(413, 'plugin.json is larger than ' + LIMITS.json / 1024 + ' KB');
    if (out.readme.length > LIMITS.readme) throw new HttpError(413, 'README.md is too large');
    const sid = 'sub_' + crypto.randomBytes(6).toString('hex');
    const now = Date.now();
    subs()[sid] = { id: sid, pluginId: out.id, name: String(out.pj.name), status: 'pending', createdAt: now, updatedAt: now, contact, by: ip, via, sourceSha256, sourceBytes, pluginJsonText, readmeText: out.readme, prBody: out.prBody, warnings: out.warnings.slice(0, 50), todos: out.todos.slice(0, 50) };
    store.touch();
    limitHit('submit', ip); limitHit('submitDay', ip);
    return send(res, 201, { id: sid, status: 'pending' });
  }

  async function approve(s) {
    if (s.status === 'pr-opened' || s.status === 'rejected') throw new HttpError(409, 'This submission is already ' + s.status);
    if (taken(s.id).has(s.pluginId)) throw new HttpError(409, `The id "${s.pluginId}" now exists in the catalogue or in another submission`);
    const files = { [`plugins/${s.pluginId}/plugin.json`]: s.pluginJsonText, [`plugins/${s.pluginId}/README.md`]: s.readmeText };
    const title = `Add ${s.name} plugin (converted from WindowsGSM)`;
    if (!o.githubToken) {
      s.status = 'approved'; s.updatedAt = Date.now(); delete s.lastError; store.touch();
      return { id: s.id, status: s.status, mode: 'manual', note: 'No GITHUB_TOKEN is configured: open the pull request yourself with these two files (and an icon.png).', title, files, prBody: s.prBody };
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(o.githubRepo)) throw new HttpError(500, 'GITHUB_REPO must look like owner/name');
    const repo = o.githubRepo, base = o.githubBranch || 'main'; const api = (m, p, body) => ghRequest(o.githubApi, o.githubToken, m, p, body);
    const branch = `submit/${s.pluginId}-${crypto.randomBytes(3).toString('hex')}`;
    let created = false;
    try {
      const ref = await api('GET', `/repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
      const sha = ref.json && ref.json.object && ref.json.object.sha;
      if (ref.status !== 200 || !sha) throw new Error(`could not read the ${base} branch (HTTP ${ref.status})`);
      const mk = await api('POST', `/repos/${repo}/git/refs`, { ref: 'refs/heads/' + branch, sha });
      if (mk.status !== 201) throw new Error(`could not create the branch (HTTP ${mk.status}: ${String(mk.json.message || '').slice(0, 120)})`);
      created = true;
      for (const [file, content] of Object.entries(files)) {
        const put = await api('PUT', `/repos/${repo}/contents/${file}`, { message: `Add ${file} (converted from WindowsGSM)`, content: Buffer.from(content, 'utf8').toString('base64'), branch });
        if (put.status !== 201 && put.status !== 200) throw new Error(`could not commit ${file} (HTTP ${put.status}: ${String(put.json.message || '').slice(0, 120)})`);
      }
      const pr = await api('POST', `/repos/${repo}/pulls`, { title, head: branch, base, body: s.prBody, draft: true, maintainer_can_modify: true });
      const url = pr.json && pr.json.html_url;
      if (pr.status !== 201 || typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new Error(`could not open the pull request (HTTP ${pr.status}: ${String(pr.json.message || '').slice(0, 120)})`);
      s.status = 'pr-opened'; s.prUrl = url; s.branch = branch; s.updatedAt = Date.now(); delete s.lastError; store.touch();
      return { id: s.id, status: s.status, mode: 'github', prUrl: url, branch };
    } catch (e) {
      if (created) { try { await api('DELETE', `/repos/${repo}/git/refs/heads/${branch}`); } catch { /* best effort */ } }
      s.status = 'approved'; s.lastError = redact(e.message).slice(0, 300); s.updatedAt = Date.now(); store.touch();
      const err = new HttpError(502, 'GitHub: ' + s.lastError + '. The submission stays approved, retry the approval or open the PR by hand.'); err.files = files;
      throw err;
    }
  }

  // returns true when the request was handled
  async function handle(req, res, parts) {
    const m = req.method; const sid = parts[1];
    if (!sid) {
      if (m === 'POST') { await submit(req, res); return; }
      if (m === 'GET') {
        if (!isAdmin(req)) throw new HttpError(403, 'Admin only');
        const list = store.submissions().sort((a, b) => b.createdAt - a.createdAt).map(adminView);
        return send(res, 200, { submissions: list, pending: list.filter((x) => x.status === 'pending').length, github: !!o.githubToken, repo: o.githubRepo });
      }
      throw new HttpError(405, 'Method not allowed');
    }
    if (!SID_RE.test(sid)) throw new HttpError(404, 'Not found');
    const s = store.submission(sid);
    if (!parts[2] && m === 'GET') { limit('submitStatus', ipOf(req)); if (!s) throw new HttpError(404, 'Unknown submission'); return send(res, 200, publicView(s)); }
    if (parts[2] === 'reject' && m === 'POST') {
      if (!isAdmin(req)) throw new HttpError(403, 'Admin only');
      if (!s) throw new HttpError(404, 'Unknown submission');
      if (s.status === 'pr-opened' || s.status === 'rejected') throw new HttpError(409, 'This submission is already ' + s.status);
      s.status = 'rejected'; s.reason = clean((await readJson(req)).reason, LIMITS.reason); s.updatedAt = Date.now(); store.touch();
      return send(res, 200, adminView(s));
    }
    if (parts[2] === 'approve' && m === 'POST') {
      if (!isAdmin(req)) throw new HttpError(403, 'Admin only');
      if (!s) throw new HttpError(404, 'Unknown submission');
      try { return send(res, 200, await approve(s)); }
      catch (e) { if (e.files) return send(res, e.status, { error: e.message, files: e.files }); throw e; }
    }
    throw new HttpError(404, 'Not found');
  }

  return { handle, LIMITS, STATUSES };
}

module.exports = { create, ghRequest, LIMITS, SID_RE };
