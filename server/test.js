'use strict';
// Tests for the community API + static serving.  node server/test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('./server');
const converterTests = require('./test-convert');
const submissionTests = require('./test-submissions');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngsm-site-'));
const index = path.join(dir, 'index.json');
fs.writeFileSync(index, JSON.stringify({ plugins: [{ id: 'rust' }, { id: 'mc' }] }));
let pass = 0;
const ok = (name) => { pass++; console.log('  ok ' + name); };

function boot(extra) {
  return new Promise((resolve) => {
    const s = createApp(Object.assign({ dataDir: dir, catalogIndex: index, adminToken: 'adm1n-secret' }, extra));
    s.listen(0, '127.0.0.1', () => resolve({ s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}
const call = async (base, method, p, body, headers) => {
  const r = await fetch(base + p, { method, headers: Object.assign(body ? { 'Content-Type': 'application/json' } : {}, headers), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, json: j, headers: r.headers };
};
const A = { 'X-Client-Id': 'client-aaaaaa' }, B = { 'X-Client-Id': 'client-bbbbbb' };

(async () => {
  converterTests.run(ok);
  let { s, base } = await boot();
  let r = await call(base, 'GET', '/api/health');
  assert.strictEqual(r.json.service, 'nodegsm-community'); ok('health');
  assert.strictEqual(r.headers.get('access-control-allow-origin'), '*'); ok('cors header');
  assert.strictEqual((await call(base, 'OPTIONS', '/api/plugins/rust/rating')).status, 204); ok('preflight');

  // ratings
  r = await call(base, 'PUT', '/api/plugins/rust/rating', { value: 4 }, A); assert.strictEqual(r.json.rating.mine, 4);
  r = await call(base, 'PUT', '/api/plugins/rust/rating', { value: 2 }, B); assert.strictEqual(r.json.rating.avg, 3);
  r = await call(base, 'PUT', '/api/plugins/rust/rating', { value: 5 }, A); assert.strictEqual(r.json.rating.count, 2); assert.strictEqual(r.json.rating.avg, 3.5); ok('one rating per client, average');
  assert.strictEqual((await call(base, 'PUT', '/api/plugins/rust/rating', { value: 9 }, A)).status, 400);
  assert.strictEqual((await call(base, 'PUT', '/api/plugins/rust/rating', { value: 3 })).status, 400); ok('rating validation / client id required');
  assert.strictEqual((await call(base, 'PUT', '/api/plugins/nope/rating', { value: 3 }, A)).status, 404);
  assert.strictEqual((await call(base, 'PUT', '/api/plugins/..%2Fx/rating', { value: 3 }, A)).status, 400); ok('unknown / invalid plugin id');

  // comments
  r = await call(base, 'POST', '/api/plugins/rust/comments', { text: '<script>alert(1)</script> works', name: 'Bob' }, A);
  assert.strictEqual(r.status, 201); assert.strictEqual(r.json.comments[0].name, 'Bob'); assert.ok(r.json.comments[0].text.includes('<script>')); ok('comment stored raw (the site escapes on render)');
  assert.strictEqual((await call(base, 'POST', '/api/plugins/rust/comments', { text: '<script>alert(1)</script> works' }, A)).status, 409); ok('duplicate comment rejected');
  assert.strictEqual((await call(base, 'POST', '/api/plugins/rust/comments', { text: ' ' }, A)).status, 400);
  assert.strictEqual((await call(base, 'POST', '/api/plugins/rust/comments', { text: 'http://a.io http://b.io http://c.io' }, A)).status, 400); ok('empty / link spam rejected');
  const big = await fetch(base + '/api/plugins/rust/comments', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, A), body: JSON.stringify({ text: 'x'.repeat(200000) }) }).catch(() => ({ status: 413 }));
  assert.strictEqual(big.status, 413); ok('oversized body rejected');

  // community info + history
  r = await call(base, 'PUT', '/api/plugins/rust/info', { text: '## Ports\n- 28015', name: 'Ann', summary: 'first' }, A); assert.strictEqual(r.json.info.rev, 1);
  r = await call(base, 'PUT', '/api/plugins/rust/info', { text: '## Ports\n- 28016', name: 'Cy', summary: 'fix' }, B); assert.strictEqual(r.json.info.rev, 2); assert.strictEqual(r.json.info.history.length, 2);
  assert.strictEqual((await call(base, 'PUT', '/api/plugins/rust/info', { text: '## Ports\n- 28016' }, B)).status, 400); ok('info edit, revisions, no-op rejected');

  // downloads
  await call(base, 'POST', '/api/plugins/rust/download'); await call(base, 'POST', '/api/plugins/rust/download');
  r = await call(base, 'GET', '/api/plugins/rust/community', null, A); assert.strictEqual(r.json.downloads, 1); ok('download counted once per window');
  r = await call(base, 'GET', '/api/ratings'); assert.strictEqual(r.json.rust.count, 2); assert.strictEqual(r.json.rust.downloads, 1); ok('ratings summary');

  // rating removal + activity feed
  r = await call(base, 'PUT', '/api/plugins/mc/rating', { value: 3 }, B); assert.strictEqual(r.json.rating.count, 1);
  r = await call(base, 'PUT', '/api/plugins/mc/rating', { value: 0 }, B); assert.strictEqual(r.json.rating.count, 0); assert.strictEqual(r.json.rating.mine, 0); ok('rating can be removed (value 0)');
  r = await call(base, 'GET', '/api/feed');
  assert.strictEqual(r.status, 200);
  const kinds = new Set(r.json.events.map((e) => e.t)); for (const k of ['rating', 'comment', 'info', 'download']) assert.ok(kinds.has(k), 'feed has ' + k);
  assert.ok(r.json.events.every((e, i, a) => !i || a[i - 1].at >= e.at), 'newest first');
  assert.ok(!JSON.stringify(r.json).includes('client-aaaaaa') && !JSON.stringify(r.json).includes('"by"'), 'no client ids / ip hashes in the feed');
  assert.deepStrictEqual(r.json.topDownloads, [{ id: 'rust', downloads: 1 }]); assert.strictEqual(r.json.totals.downloads, 1);
  assert.ok((await call(base, 'GET', '/api/feed?type=comment')).json.events.every((e) => e.t === 'comment')); ok('feed: events, type filter, most downloaded, nothing private');

  // moderation
  const cid =(await call(base, 'GET', '/api/plugins/rust/community')).json.comments[0].id;
  assert.strictEqual((await call(base, 'DELETE', '/api/plugins/rust/comments/' + cid)).status, 403);
  assert.strictEqual((await call(base, 'DELETE', '/api/plugins/rust/comments/' + cid, null, { Authorization: 'Bearer wrong' })).status, 403);
  r = await call(base, 'DELETE', '/api/plugins/rust/comments/' + cid, null, { Authorization: 'Bearer adm1n-secret' }); assert.strictEqual(r.json.comments.length, 0);
  r = await call(base, 'POST', '/api/plugins/rust/info/revert', { rev: 1 }, { Authorization: 'Bearer adm1n-secret' }); assert.ok(r.json.info.text.includes('28015')); assert.strictEqual(r.json.info.rev, 3); ok('admin delete comment / revert info, others blocked');

  assert.ok(!(await call(base, 'GET', '/api/feed?type=comment')).json.events.some((e) => e.cid === cid)); ok('deleted comment disappears from the feed');

  // persistence
  s.store.flush(); await new Promise((x) => s.close(x));
  ({ s, base } = await boot());
  r = await call(base, 'GET', '/api/plugins/rust/community', null, A); assert.strictEqual(r.json.rating.mine, 5); assert.strictEqual(r.json.info.rev, 3); ok('data survives restart');

  // static
  r = await call(base, 'GET', '/'); assert.strictEqual(r.status, 200); assert.ok(String(r.json).includes('NodeGSM'));
  for (const p of ['/server/server.js', '/server/data/community.json', '/..%2fpackage.json', '/%2e%2e/package.json', '/.git/config']) assert.ok([400, 404].includes((await call(base, 'GET', p)).status), p);
  ok('static served, server/ and traversal blocked');
  await new Promise((x) => s.close(x));

  // feed: new / updated plugins are noticed between two reads of the catalogue (the first read is only a baseline)
  {
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ngsm-feed-')); const idx2 = path.join(d2, 'index.json');
    fs.writeFileSync(idx2, JSON.stringify({ plugins: [{ id: 'rust', name: 'Rust', version: '1.0.0' }] }));
    let b = await boot({ dataDir: d2, catalogIndex: idx2 });
    assert.strictEqual((await call(b.base, 'GET', '/api/feed')).json.events.length, 0); ok('feed: first catalogue read creates no events');
    b.s.store.flush(); await new Promise((x) => b.s.close(x));
    fs.writeFileSync(idx2, JSON.stringify({ plugins: [{ id: 'rust', name: 'Rust', version: '1.1.0' }, { id: 'mc', name: 'Minecraft', version: '2.0.0' }] }));
    b = await boot({ dataDir: d2, catalogIndex: idx2 });
    const ev = (await call(b.base, 'GET', '/api/feed')).json.events;
    assert.ok(ev.some((e) => e.t === 'new' && e.id === 'mc' && e.name === 'Minecraft')); assert.ok(ev.some((e) => e.t === 'update' && e.id === 'rust' && e.from === '1.0.0' && e.v === '1.1.0')); ok('feed: new plugin and version update detected');
    await new Promise((x) => b.s.close(x));
  }

  // app download counter: summed from the GitHub release assets (a fake GitHub here)
  {
    const http = require('http');
    const releases = [
      { tag_name: 'v0.3.0-beta.1', name: 'beta', prerelease: true, draft: false, published_at: '2026-11-20T00:00:00Z', assets: [{ name: 'NodeGSM-Setup-0.3.0-beta.1.exe', download_count: 7 }] },
      { tag_name: 'v0.2.0', name: 'v0.2.0', prerelease: false, draft: false, published_at: '2026-11-10T00:00:00Z', assets: [
        { name: 'NodeGSM-Setup-0.2.0.exe', download_count: 100 }, { name: 'NodeGSM-0.2.0-portable.exe', download_count: 20 },
        { name: 'NodeGSM-Setup-0.2.0.exe.blockmap', download_count: 900 }, { name: 'latest.yml', download_count: 5000 }] },
      { tag_name: 'v0.1.0', name: 'v0.1.0', prerelease: false, draft: false, published_at: '2026-10-01T00:00:00Z', assets: [{ name: 'NodeGSM-Setup-0.1.0.exe', download_count: 3 }] },
      { tag_name: 'v9.9.9', name: 'draft', prerelease: false, draft: true, published_at: null, assets: [{ name: 'x.exe', download_count: 999999 }] },
    ];
    let hits = 0, status = 200;
    const gh = http.createServer((req, res) => { hits++; assert.ok(/^\/repos\/ohmcodes\/Node\.NodeGSM\/releases/.test(req.url), req.url); assert.ok(!req.headers.authorization, 'no token is sent'); res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(status === 200 ? releases : { message: 'rate limited' })); });
    await new Promise((x) => gh.listen(0, '127.0.0.1', x));
    const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'ngsm-stats-'));
    let b = await boot({ dataDir: d3, githubApi: `http://127.0.0.1:${gh.address().port}`, githubToken: 'must-not-be-sent' });
    let st = (await call(b.base, 'GET', '/api/stats')).json;
    assert.strictEqual(st.app.downloads, 100 + 20 + 7 + 3, 'only the app files of published releases are summed (no blockmap, no yml, no draft)');
    assert.strictEqual(st.app.releases, 3); assert.strictEqual(st.app.latest.tag, 'v0.2.0'); assert.strictEqual(st.app.latest.downloads, 120); assert.strictEqual(st.app.unavailable, false);
    assert.deepStrictEqual(Object.keys(st.plugins).sort(), ['comments', 'downloads', 'ratings']);
    await call(b.base, 'GET', '/api/stats'); assert.strictEqual(hits, 1, 'GitHub is asked at most once per 10 minutes'); ok('app downloads: summed from release assets, cached');
    b.s.store.flush(); await new Promise((x) => b.s.close(x)); status = 403;
    b = await boot({ dataDir: d3, githubApi: `http://127.0.0.1:${gh.address().port}` });
    st = (await call(b.base, 'GET', '/api/stats')).json; assert.strictEqual(st.app.downloads, 130); assert.strictEqual(st.app.unavailable, false); ok('app downloads: last good number survives a restart while GitHub fails');
    await new Promise((x) => b.s.close(x));
    b = await boot({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ngsm-stats-')), githubApi: `http://127.0.0.1:${gh.address().port}` });
    st = (await call(b.base, 'GET', '/api/stats')).json; assert.strictEqual(st.app.downloads, 0); assert.strictEqual(st.app.unavailable, true); ok('app downloads: reported as unavailable (never an error) when GitHub fails and nothing is known');
    await new Promise((x) => b.s.close(x)); await new Promise((x) => gh.close(x));
  }

  // repository stars: read from GitHub in the background, kept in the data file
  {
    const http = require('http');
    const asked = []; let down = false;
    const gh = http.createServer((req, res) => {
      asked.push(req.url); if (down) { res.writeHead(403); return res.end('{}'); }
      const stars = { '/repos/alice/rust-plugin': 42, '/repos/bob/mc-plugin': 7 };
      if (!(req.url in stars)) { res.writeHead(404); return res.end('{}'); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'x-ratelimit-remaining': '50' }); res.end(JSON.stringify({ stargazers_count: stars[req.url] }));
    });
    await new Promise((x) => gh.listen(0, '127.0.0.1', x));
    const d4 = fs.mkdtempSync(path.join(os.tmpdir(), 'ngsm-stars-')); const idx4 = path.join(d4, 'index.json');
    fs.writeFileSync(idx4, JSON.stringify({ plugins: [
      { id: 'rust', url: 'https://github.com/alice/rust-plugin' }, { id: 'mc', repo: 'bob/mc-plugin' },
      { id: 'gone', url: 'https://github.com/nobody/deleted' }, { id: 'steam', url: 'https://steamdb.info/app/1/info/' }] }));
    let b = await boot({ dataDir: d4, catalogIndex: idx4, githubApi: `http://127.0.0.1:${gh.address().port}`, starsEvery: 0 });
    await call(b.base, 'GET', '/api/stars'); // starts the background fill
    let st = {}; for (let i = 0; i < 40 && !(st.rust && st.mc); i++) { await new Promise((x) => setTimeout(x, 50)); st = (await call(b.base, 'GET', '/api/stars')).json; }
    assert.deepStrictEqual(st.rust, { stars: 42, repo: 'alice/rust-plugin' }); assert.strictEqual(st.mc.stars, 7);
    assert.ok(!st.gone && !st.steam, 'deleted repositories and non-GitHub plugins have no stars');
    assert.ok(!asked.some((u) => /steamdb/.test(u))); ok('stars: read from GitHub for plugins with a GitHub url');
    b.s.store.flush(); await new Promise((x) => b.s.close(x)); down = true; const before = asked.length;
    b = await boot({ dataDir: d4, catalogIndex: idx4, githubApi: `http://127.0.0.1:${gh.address().port}`, starsEvery: 0 });
    st = (await call(b.base, 'GET', '/api/stars')).json; assert.strictEqual(st.rust.stars, 42); assert.strictEqual(asked.length, before, 'fresh numbers are not asked again'); ok('stars: kept in the data file, not re-requested while fresh');
    await new Promise((x) => b.s.close(x)); await new Promise((x) => gh.close(x));
  }

  // rate limit
  ({ s, base } = await boot({ rate: { comment: [2, 60e3], info: [6, 60e3], rating: [30, 60e3], download: [1, 60e3] } }));
  await call(base, 'POST', '/api/plugins/mc/comments', { text: 'one one' }, A); await call(base, 'POST', '/api/plugins/mc/comments', { text: 'two two' }, A);
  assert.strictEqual((await call(base, 'POST', '/api/plugins/mc/comments', { text: 'three three' }, A)).status, 429); ok('rate limit');
  await new Promise((x) => s.close(x));

  await submissionTests.run({ boot, call, ok });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} checks passed`);
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
