'use strict';
// Regenerates public/data/site.json (version, feature tables, changelog) from a NodeGSM checkout.
// The website does not need the app to run; this is only for refreshing the Features / Download pages.
//   node scripts/sync-app.js [path-to-NodeGSM-checkout]      default: ../Node.NodeGSM (or ../Node.WGSM2026, the old checkout name)
const fs = require('fs');
const path = require('path');

const SIBLINGS = ['Node.NodeGSM', 'Node.WGSM2026'].map(n => path.join(__dirname, '..', '..', n));
const APP = path.resolve(process.argv[2] || SIBLINGS.find(p => fs.existsSync(p)) || SIBLINGS[0]);
const OUT = path.join(__dirname, '..', 'public', 'data', 'site.json');

function parseFeatures(md) {
  const groups = []; const changelog = [];
  let section = null, group = null, entry = null;
  for (const line of md.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^## (.+)/))) { section = m[1].trim(); group = null; entry = null; if (section !== 'Changelog') { group = { group: section, rows: [] }; groups.push(group); } continue; }
    if (section === 'Changelog') {
      if ((m = line.match(/^### (.+)/))) { entry = { title: m[1].trim(), items: [] }; changelog.push(entry); }
      else if (entry && (m = line.match(/^- (.+)/))) entry.items.push(m[1].trim());
      continue;
    }
    if (group && line.startsWith('|')) {
      const c = line.split('|').slice(1, -1).map((s) => s.trim());
      if (c.length >= 2 && c[0] && c[0] !== 'Feature' && !/^-+$/.test(c[0])) group.rows.push({ feature: c[0], status: c[1], notes: c[2] || '' });
    }
  }
  return { groups, changelog };
}

if (!fs.existsSync(path.join(APP, 'FEATURES.md'))) { console.error(`No NodeGSM checkout at ${APP} (FEATURES.md not found). Pass its path as the first argument.`); process.exit(1); }
const pkg = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
const { groups, changelog } = parseFeatures(fs.readFileSync(path.join(APP, 'FEATURES.md'), 'utf8'));
const all = groups.flatMap((g) => g.rows);
const count = (s) => all.filter((r) => r.status.includes(s)).length;
let prev = {}; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  version: pkg.version, name: 'NodeGSM', pluginCount: prev.pluginCount || 0,
  featureCounts: { done: count('✅'), untested: count('🧪'), planned: count('⏳') },
  groups, changelog, repo: 'https://github.com/ohmcodes/Node.NodeGSM',
}, null, 1));
// contributing guide page: copy of the Catalogue repo's CONTRIBUTING.md (public/contributing.html renders it)
const CG = path.resolve(process.argv[3] || path.join(__dirname, '..', '..', 'Node.NodeGSM.Catalogue', 'CONTRIBUTING.md'));
if (fs.existsSync(CG)) { fs.copyFileSync(CG, path.join(path.dirname(OUT), 'contributing.md')); console.log('contributing guide updated'); }
console.log(`site data updated: v${pkg.version}, ${groups.length} feature groups, ${changelog.length} changelog entries`);
