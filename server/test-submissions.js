'use strict';
// Tests of the converter submissions API (POST /api/submissions ...). Run from server/test.js with its helpers.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { convertCs } = require('../public/convert-cs.js');

const FIX = path.join(__dirname, '..', 'test', 'fixtures');
const readFix = (n) => fs.readFileSync(path.join(FIX, n), 'utf8');

async function run({ boot, call, ok }) {
  const TOKEN = 'ghp_TESTTOKEN_do_not_leak_123';
  const ADMIN = { Authorization: 'Bearer adm1n-secret' };
  const src = readFix('Example-SteamCMD.cs');
  const concat = readFix('Example-Concat.cs');
  const free = { submit: [100, 60e3], submitDay: [100, 60e3], submitTry: [1000, 60e3], submitStatus: [1000, 60e3] };
  const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ngsm-subs-'));
  const post = (base, body, h) => call(base, 'POST', '/api/submissions', body, h);
  const close = (s) => new Promise((x) => s.close(x));

  // ---- fake GitHub (local only, never the real one)
  const gh = { reqs: [], failOn: '' };
  const ghServer = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8'); gh.reqs.push({ method: req.method, url: req.url, headers: req.headers, body });
      const out = (st, j) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (gh.failOn && (req.method + ' ' + req.url).includes(gh.failOn)) return out(500, { message: 'boom ' + TOKEN });
      if (req.method === 'GET' && req.url === '/repos/own/cat/git/ref/heads/main') return out(200, { object: { sha: 'abc123' } });
      if (req.method === 'POST' && req.url === '/repos/own/cat/git/refs') return out(201, {});
      if (req.method === 'PUT' && req.url.startsWith('/repos/own/cat/contents/')) return out(201, {});
      if (req.method === 'DELETE' && req.url.startsWith('/repos/own/cat/git/refs/heads/')) { res.writeHead(204); return res.end(); }
      if (req.method === 'POST' && req.url === '/repos/own/cat/pulls') return out(201, { html_url: 'https://github.com/own/cat/pull/7' });
      out(404, { message: 'not found' });
    });
  });
  await new Promise((r) => ghServer.listen(0, '127.0.0.1', r));
  const ghUrl = 'http://127.0.0.1:' + ghServer.address().port;
  const bootSubs = (extra) => boot(Object.assign({ dataDir: fresh(), rate: free }, extra));

  // ---- validation, consent, size limits
  let { s, base } = await bootSubs();
  let r = await post(base, { source: src });
  assert.strictEqual(r.status, 400); assert.ok(/agree|consent/i.test(r.json.error)); ok('submission needs the consent flag');
  assert.strictEqual((await post(base, { source: src, consent: 'yes' })).status, 400);
  assert.strictEqual((await post(base, { consent: true })).status, 400);
  assert.strictEqual((await post(base, { source: 'not csharp', consent: true })).status, 400);
  r = await post(base, { source: readFix('Skeleton.cs'), consent: true }); assert.strictEqual(r.status, 400); assert.ok(/executable/.test(r.json.error)); assert.ok(Array.isArray(r.json.errors));
  assert.strictEqual((await post(base, { source: 'ab\u0000cd class A {}', consent: true })).status, 400);
  assert.strictEqual((await post(base, { source: src, consent: true, id: 'Bad Id' })).status, 400);
  assert.strictEqual((await post(base, { source: 5, consent: true })).status, 400);
  assert.strictEqual((await post(base, { source: 'x'.repeat(210 * 1024), consent: true })).status, 413);
  r = await fetch(base + '/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'x'.repeat(900 * 1024), consent: true }) }).catch(() => ({ status: 413 }));
  assert.strictEqual(r.status, 413);
  assert.strictEqual((await post(base, { pluginJson: { id: 'xxxxx' }, consent: true })).status, 400);
  ok('submission validation: bad source / id / binary / sizes rejected');

  // ---- plugin.json route is as strict as the converter: no scripts, nothing outside the allow-list
  const goodJson = convertCs(src).pluginJson;
  r = await post(base, { pluginJson: Object.assign({}, goodJson, { install: { steps: [{ type: 'script' }] } }), consent: true }); assert.strictEqual(r.status, 400);
  r = await post(base, { pluginJson: Object.assign({}, goodJson, { 'plugin.js': 'x' }), consent: true }); assert.strictEqual(r.status, 400);
  r = await post(base, { pluginJson: goodJson, plugin_js: 'require("child_process")', consent: true, contact: 'a@b.c' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.json)); const jsonSid = r.json.id;
  r = await call(base, 'GET', '/api/submissions', null, ADMIN);
  const stored = r.json.submissions.find((x) => x.id === jsonSid); assert.strictEqual(stored.via, 'json'); assert.ok(!JSON.stringify(stored).includes('child_process'), 'unknown fields are dropped, never stored');
  ok('submission via plugin.json: allow-list enforced, plugin.js impossible');

  // ---- create + public status
  r = await post(base, { source: src, consent: true, contact: '  me@example.com  ', edits: { name: 'My Palgame', author: 'Me' }, id: 'pal-one' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.json)); assert.strictEqual(r.json.status, 'pending'); assert.ok(/^sub_[0-9a-f]{12}$/.test(r.json.id));
  const sid = r.json.id;
  r = await call(base, 'GET', '/api/submissions/' + sid); assert.deepStrictEqual(Object.keys(r.json).sort(), ['id', 'status', 'updatedAt'].sort()); assert.strictEqual(r.json.status, 'pending');
  assert.ok(!JSON.stringify(r.json).includes('palgame') && !JSON.stringify(r.json).includes('me@example.com'), 'status has no contents and no contact');
  assert.strictEqual((await call(base, 'GET', '/api/submissions/sub_000000000000')).status, 404); assert.strictEqual((await call(base, 'GET', '/api/submissions/..%2Fx')).status, 404);
  ok('submission stored as pending; public status shows no contents');

  // ---- admin only
  assert.strictEqual((await call(base, 'GET', '/api/submissions')).status, 403);
  assert.strictEqual((await call(base, 'GET', '/api/submissions', null, { Authorization: 'Bearer wrong' })).status, 403);
  assert.strictEqual((await call(base, 'POST', '/api/submissions/' + sid + '/approve')).status, 403);
  assert.strictEqual((await call(base, 'POST', '/api/submissions/' + sid + '/reject', { reason: 'x' })).status, 403);
  r = await call(base, 'GET', '/api/submissions', null, ADMIN); assert.strictEqual(r.status, 200);
  const rec = r.json.submissions.find((x) => x.id === sid);
  assert.strictEqual(rec.contact, 'me@example.com'); assert.strictEqual(rec.pluginId, 'pal-one'); assert.strictEqual(JSON.parse(rec.pluginJsonText).name, 'My Palgame'); assert.strictEqual(JSON.parse(rec.pluginJsonText).author, 'Me');
  assert.ok(rec.readmeText.includes('# My Palgame') && rec.prBody.includes('plugins/pal-one') && rec.prBody.includes('automated submission'));
  assert.ok(!JSON.stringify(r.json).includes('"by"'), 'no IP data in the admin list');
  ok('admin endpoints need the token; list shows contents');
  await close(s);
  ({ s, base } = await boot({ dataDir: fresh(), adminToken: '' }));
  assert.strictEqual((await call(base, 'GET', '/api/submissions', null, { Authorization: 'Bearer ' })).status, 403); ok('no ADMIN_TOKEN: admin disabled');
  await close(s);

  // ---- duplicates
  ({ s, base } = await bootSubs());
  assert.strictEqual((await post(base, { source: src, consent: true, id: 'rust' })).status, 409); ok('id already in the catalogue -> 409');
  r = await post(base, { source: concat, consent: true, id: 'dupe-one' }); assert.strictEqual(r.status, 201);
  assert.strictEqual((await post(base, { source: src, consent: true, id: 'dupe-one' })).status, 409);
  assert.strictEqual((await post(base, { source: concat, consent: true })).status, 201);
  assert.strictEqual((await post(base, { source: concat, consent: true })).status, 201);
  const ids = (await call(base, 'GET', '/api/submissions', null, ADMIN)).json.submissions.map((x) => x.pluginId);
  assert.ok(ids.includes('concat') && ids.includes('concat-2'), 'unnamed duplicate gets a collision-safe id: ' + ids);
  const clash = await post(base, { source: src.replace('class Palgame', 'class Rust'), consent: true }); assert.strictEqual(clash.status, 201);
  assert.strictEqual((await call(base, 'GET', '/api/submissions', null, ADMIN)).json.submissions.find((x) => x.id === clash.json.id).pluginId, 'rust-2', 'catalogue ids are avoided');
  ok('pending duplicate id -> 409, suggestion is collision-safe');
  await close(s);

  // ---- rate limits: 1 per 10 minutes, 3 per day, failed attempts do not count
  ({ s, base } = await boot({ dataDir: fresh(), rate: { submit: [1, 600e3], submitDay: [3, 86400e3], submitTry: [1000, 60e3] } }));
  assert.strictEqual((await post(base, { source: 'junk', consent: true })).status, 400);
  assert.strictEqual((await post(base, { source: src, consent: true })).status, 201, 'a rejected attempt did not use the quota');
  assert.strictEqual((await post(base, { source: concat, consent: true })).status, 429); ok('rate limit: 1 per 10 minutes per hashed IP');
  await close(s);
  ({ s, base } = await boot({ dataDir: fresh(), rate: { submit: [100, 600e3], submitDay: [3, 86400e3], submitTry: [1000, 60e3] } }));
  for (const n of ['A', 'B', 'C']) assert.strictEqual((await post(base, { source: src.replace('class Palgame', 'class Game' + n), consent: true })).status, 201);
  assert.strictEqual((await post(base, { source: src.replace('class Palgame', 'class GameD'), consent: true })).status, 429); ok('rate limit: 3 per day per hashed IP');
  r = await call(base, 'GET', '/api/health'); assert.strictEqual(r.json.submissions, true);
  s.store.flush(); assert.ok(!fs.readFileSync(s.store.file, 'utf8').includes('127.0.0.1'), 'raw IPs are not stored');
  ok('health advertises submissions; no raw IP on disk');
  await close(s);
  ({ s, base } = await boot({ dataDir: fresh(), rate: { submit: [100, 600e3], submitDay: [100, 86400e3], submitTry: [2, 600e3] } }));
  await post(base, { source: 'x', consent: true }); await post(base, { source: 'x', consent: true });
  assert.strictEqual((await post(base, { source: 'x', consent: true })).status, 429); ok('flood guard counts every attempt');
  await close(s);

  // ---- pending cap
  ({ s, base } = await bootSubs());
  const now = Date.now();
  for (let i = 0; i < 200; i++) { const id = 'sub_' + String(i).padStart(12, '0'); s.store.data.submissions[id] = { id, pluginId: 'fill-' + i, status: 'pending', createdAt: now, updatedAt: now }; }
  assert.strictEqual((await post(base, { source: src, consent: true })).status, 503); ok('pending queue capped at 200');
  await close(s);

  // ---- approve without a token: manual mode (files returned, nothing sent anywhere)
  ({ s, base } = await bootSubs({ githubToken: '', githubApi: ghUrl }));
  r = await post(base, { source: src, consent: true }); const s1 = r.json.id;
  gh.reqs.length = 0;
  r = await call(base, 'POST', '/api/submissions/' + s1 + '/approve', null, ADMIN);
  assert.strictEqual(r.status, 200); assert.strictEqual(r.json.mode, 'manual'); assert.strictEqual(r.json.status, 'approved');
  assert.deepStrictEqual(Object.keys(r.json.files).sort(), ['plugins/palgame/README.md', 'plugins/palgame/plugin.json']); assert.ok(r.json.prBody.includes('## Checklist'));
  assert.strictEqual(gh.reqs.length, 0, 'no token: GitHub is never contacted');
  assert.strictEqual((await call(base, 'GET', '/api/submissions/' + s1)).json.status, 'approved');
  assert.strictEqual((await call(base, 'POST', '/api/submissions/' + s1 + '/approve', null, ADMIN)).status, 200, 'approving again is harmless');
  ok('approve without GITHUB_TOKEN: manual mode returns the files');
  r = await post(base, { source: concat, consent: true }); const s2 = r.json.id;
  r = await call(base, 'POST', '/api/submissions/' + s2 + '/reject', { reason: 'Duplicate of an existing plugin\u0000.' + 'x'.repeat(400) }, ADMIN);
  assert.strictEqual(r.status, 200); assert.strictEqual(r.json.status, 'rejected'); assert.ok(r.json.reason.length <= 300 && !r.json.reason.includes('\u0000'));
  r = await call(base, 'GET', '/api/submissions/' + s2); assert.strictEqual(r.json.status, 'rejected'); assert.ok(r.json.reason.startsWith('Duplicate'));
  assert.strictEqual((await call(base, 'POST', '/api/submissions/' + s2 + '/approve', null, ADMIN)).status, 409, 'a rejected submission cannot be approved');
  assert.strictEqual((await call(base, 'POST', '/api/submissions/' + s2 + '/reject', {}, ADMIN)).status, 409);
  assert.strictEqual((await call(base, 'POST', '/api/submissions/sub_ffffffffffff/reject', {}, ADMIN)).status, 404);
  assert.strictEqual((await post(base, { source: concat, consent: true, id: 'concat' })).status, 201, 'a rejected id can be submitted again');
  ok('reject flow: reason shown publicly, final state');
  await close(s);

  // ---- approve with a token: branch, two files, draft PR; the token only travels in the Authorization header
  ({ s, base } = await bootSubs({ githubToken: TOKEN, githubRepo: 'own/cat', githubApi: ghUrl }));
  r = await post(base, { source: src, consent: true, contact: 'secret-contact' }); const s3 = r.json.id;
  gh.reqs.length = 0;
  r = await call(base, 'POST', '/api/submissions/' + s3 + '/approve', null, ADMIN);
  assert.strictEqual(r.status, 200, JSON.stringify(r.json)); assert.strictEqual(r.json.status, 'pr-opened'); assert.strictEqual(r.json.prUrl, 'https://github.com/own/cat/pull/7');
  assert.ok(/^submit\/palgame-[0-9a-f]{6}$/.test(r.json.branch));
  assert.deepStrictEqual(gh.reqs.map((q) => q.method + ' ' + q.url), [
    'GET /repos/own/cat/git/ref/heads/main', 'POST /repos/own/cat/git/refs', 'PUT /repos/own/cat/contents/plugins/palgame/plugin.json', 'PUT /repos/own/cat/contents/plugins/palgame/README.md', 'POST /repos/own/cat/pulls']);
  const refBody = JSON.parse(gh.reqs[1].body); assert.strictEqual(refBody.ref, 'refs/heads/' + r.json.branch); assert.strictEqual(refBody.sha, 'abc123');
  const put1 = JSON.parse(gh.reqs[2].body), put2 = JSON.parse(gh.reqs[3].body);
  assert.strictEqual(put1.branch, r.json.branch); assert.strictEqual(JSON.parse(Buffer.from(put1.content, 'base64').toString()).id, 'palgame'); assert.ok(Buffer.from(put2.content, 'base64').toString().startsWith('# Palgame'));
  const pr = JSON.parse(gh.reqs[4].body);
  assert.strictEqual(pr.draft, true); assert.strictEqual(pr.title, 'Add Palgame Dedicated Server plugin (converted from WindowsGSM)'); assert.strictEqual(pr.head, r.json.branch); assert.strictEqual(pr.base, 'main');
  assert.ok(pr.body.includes('website converter') && pr.body.includes('icon') && !pr.body.includes('secret-contact'), 'PR body: generated text, no contact data');
  for (const q of gh.reqs) {
    assert.strictEqual(q.headers.authorization, 'Bearer ' + TOKEN); assert.ok(/nodegsm/.test(q.headers['user-agent']));
    assert.ok(!q.url.includes(TOKEN) && !q.body.includes(TOKEN), 'token never in URL or body');
    assert.ok(Object.entries(q.headers).every(([k, v]) => k === 'authorization' || !String(v).includes(TOKEN)), 'token only in the Authorization header');
  }
  r = await call(base, 'GET', '/api/submissions/' + s3); assert.strictEqual(r.json.status, 'pr-opened'); assert.strictEqual(r.json.prUrl, 'https://github.com/own/cat/pull/7');
  assert.ok(!JSON.stringify((await call(base, 'GET', '/api/submissions', null, ADMIN)).json).includes(TOKEN) && !JSON.stringify((await call(base, 'GET', '/api/health')).json).includes(TOKEN));
  assert.strictEqual((await call(base, 'POST', '/api/submissions/' + s3 + '/approve', null, ADMIN)).status, 409, 'pr-opened is final');
  assert.strictEqual((await call(base, 'POST', '/api/submissions/' + s3 + '/reject', {}, ADMIN)).status, 409);
  ok('approve with GITHUB_TOKEN: branch + plugin.json + README.md + draft PR, token only in the Authorization header');

  // ---- GitHub failure: branch removed, submission stays approved, no token in the answer
  r = await post(base, { source: concat, consent: true }); const s4 = r.json.id; gh.reqs.length = 0; gh.failOn = 'README.md';
  r = await call(base, 'POST', '/api/submissions/' + s4 + '/approve', null, ADMIN);
  assert.strictEqual(r.status, 502); assert.ok(!JSON.stringify(r.json).includes(TOKEN), 'token redacted from errors'); assert.ok(r.json.files && Object.keys(r.json.files).length === 2, 'files still returned for a manual PR');
  assert.ok(gh.reqs.some((q) => q.method === 'DELETE' && q.url.startsWith('/repos/own/cat/git/refs/heads/submit/')), 'half-made branch cleaned up');
  assert.strictEqual((await call(base, 'GET', '/api/submissions/' + s4)).json.status, 'approved');
  assert.ok(!JSON.stringify((await call(base, 'GET', '/api/submissions', null, ADMIN)).json).includes(TOKEN));
  gh.failOn = ''; r = await call(base, 'POST', '/api/submissions/' + s4 + '/approve', null, ADMIN); assert.strictEqual(r.status, 200); assert.strictEqual(r.json.status, 'pr-opened');
  ok('GitHub failure: cleaned up, token redacted, retry works');
  await close(s);

  // ---- the token is never sent over plain http (except localhost)
  ({ s, base } = await bootSubs({ githubToken: TOKEN, githubRepo: 'own/cat', githubApi: 'http://example.com' }));
  r = await post(base, { source: src, consent: true }); r = await call(base, 'POST', '/api/submissions/' + r.json.id + '/approve', null, ADMIN);
  assert.strictEqual(r.status, 502); assert.ok(/https/.test(r.json.error)); ok('the token is never sent over plain http (except localhost)');
  await close(s);

  // ---- persistence + static pages
  const d = fresh(); ({ s, base } = await bootSubs({ dataDir: d })); r = await post(base, { source: src, consent: true }); const keep = r.json.id; s.store.flush(); await close(s);
  ({ s, base } = await bootSubs({ dataDir: d })); assert.strictEqual((await call(base, 'GET', '/api/submissions/' + keep)).json.status, 'pending'); ok('submissions survive a restart');
  for (const p of ['/convert.html', '/convert.js', '/convert-cs.js', '/admin-submissions.html', '/admin-submissions.js']) assert.strictEqual((await call(base, 'GET', p)).status, 200, p);
  ok('converter pages are served');
  await close(s);
  await new Promise((x) => ghServer.close(x));
}

module.exports = { run };
