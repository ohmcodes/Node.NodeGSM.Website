'use strict';
// The Catalogue's index.json: which plugin ids exist, which GitHub repository each one comes from, and what changed since the last read.
const fs = require('fs');
const { HttpError } = require('../lib/http');
const { ID_RE } = require('../lib/constants');

const GITHUB_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;
const REPO = /^([\w.-]+)\/([\w.-]+)$/;

function createCatalog({ o, store }) {
  const repoOf = new Map(); // plugin id -> "owner/name"

  // Feed events "new plugin" / "plugin updated": the Catalogue has no dates, so the site notices changes between two reads of index.json.
  // The first read only records a baseline (no events), otherwise every existing plugin would show up as new.
  const onCatalog = (j) => {
    const snap = {};
    for (const p of j.plugins) {
      snap[p.id] = { n: String(p.name || p.id), v: String(p.version || '') };
      // the Catalogue's lean index carries "repo" (owner/name); a plain github.com "url" is accepted too
      const g = REPO.exec(String(p.repo || '')) || GITHUB_URL.exec(String(p.url || ''));
      if (g) repoOf.set(p.id, g[1] + '/' + g[2]); else repoOf.delete(p.id);
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

  // known plugin ids (refreshed at most every 10 minutes); null = the catalogue could not be read, any valid id is accepted
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

  // validates a plugin id from a URL: 400 when malformed, 404 when the catalogue does not list it
  const pluginId = (raw) => {
    const id = String(raw);
    if (!ID_RE.test(id)) throw new HttpError(400, 'Invalid plugin id');
    const k = knownIds(); if (k && !k.has(id)) throw new HttpError(404, 'Unknown plugin');
    return id;
  };

  return { knownIds, pluginId, repoOf };
}
module.exports = { createCatalog };
