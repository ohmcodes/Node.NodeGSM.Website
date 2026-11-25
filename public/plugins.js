// Plugins page: search, filter, sort, detail drawer with README, download, rating, comments and editable community info.
(async function () {
  const C = window.NODEGSM_SITE || {};
  const $ = (s) => document.querySelector(s);
  let data, ratings = {}, state = { q: '', tag: '', sort: 'name', cur: null, tab: 'info' };

  // ---- forgiving search: "7daytodie", "7 days to die", "7dtd", "rst" and small typos all find 7 Days to Die / Rust
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const subseq = (q, h) => { let i = 0, first = -1, last = -1; for (let j = 0; j < h.length && i < q.length; j++) if (h[j] === q[i]) { if (first < 0) first = j; last = j; i++; } return i === q.length && last - first + 1 <= q.length * 2 + 2; };
  const lev = (a, b) => { const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; };
  // score of one query token against a plugin; 0 = no match
  function tokenScore(t, p) {
    if (!t) return 1;
    if (p._n === t || p.id === t) return 100;
    if (p._n.startsWith(t)) return 80;
    if (p._n.includes(t)) return 60;
    if (t.length >= 5 && lev(t, p._n) <= 2) return 50;
    if (p._x.includes(t)) return 30;
    if (t.length >= 3 && subseq(t, p._n)) return 20;
    return 0;
  }
  function score(q, p) {
    const toks = q.split(/\s+/).map(norm).filter(Boolean); if (!toks.length) return 1;
    let total = 0;
    // whole query as one token ("7daytodie") or every word separately ("7 days die")
    const whole = tokenScore(toks.join(''), p);
    if (whole) return whole + 5;
    for (const t of toks) { const s = tokenScore(t, p); if (!s) return 0; total += s; }
    return total / toks.length;
  }
  const CAT = new URL((C.CATALOG_URL || 'catalog').replace(/\/?$/, '/'), location.href);
  try { data = await $json(new URL('index.json', CAT).href); } catch (e) { $('#list').innerHTML = '<div class="empty">Could not load the plugin catalogue (' + $esc(CAT.href) + '). It is published by the Catalogue repository; check <code>CATALOG_URL</code> in <code>config.js</code>.</div>'; return; }
  const abs = (r) => (r ? new URL(r, CAT).href : '');
  data.plugins.forEach((p) => { p.icon = abs(p.icon); p.banner = abs(p.banner); p.zip = abs(p.zip); p.contributors = p.contributors || []; p._n = norm(p.name + p.fullName + p.id + p.maker); p._x = norm([p.summary, p.steamAppId, p.maker, ...p.contributors, ...p.tags].join(' ')); });
  ratings = await Community.summaries();
  $('#total').textContent = data.count;
  $('#chips').innerHTML = ['All'].concat(data.tags).map((t) => `<button class="chip ${t === 'All' ? 'on' : ''}" data-t="${$esc(t === 'All' ? '' : t)}">${$esc(t)}</button>`).join('');
  $('#chips').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; state.tag = b.dataset.t; [...$('#chips').children].forEach((c) => c.classList.toggle('on', c === b)); render(); };
  $('#q').oninput = (e) => { state.q = e.target.value; render(); };
  $('#sort').onchange = (e) => { state.sort = e.target.value; render(); };

  function render() {
    const q = state.q;
    const sc = new Map();
    let l = data.plugins.filter((p) => { if (state.tag && !p.tags.includes(state.tag)) return false; const s = score(q, p); sc.set(p.id, s); return s > 0; });
    const r = (p) => (ratings[p.id] || {}).avg || 0, dl = (p) => (ratings[p.id] || {}).downloads || 0;
    const byName = (a, b) => a.name.localeCompare(b.name);
    l.sort(state.sort === 'rating' ? (a, b) => r(b) - r(a) || byName(a, b) : state.sort === 'downloads' ? (a, b) => dl(b) - dl(a) || byName(a, b) : state.sort === 'players' ? (a, b) => (+b.maxPlayers || 0) - (+a.maxPlayers || 0) : q.trim() ? (a, b) => sc.get(b.id) - sc.get(a.id) || byName(a, b) : byName);
    $('#shown').textContent = l.length;
    $('#list').innerHTML = l.length ? l.map((p) => {
      const rt = ratings[p.id] || { avg: 0, count: 0 }; const dls = rt.downloads ? ` · ⬇ ${rt.downloads}` : '';
      return `<button class="card pcard reveal" data-id="${$esc(p.id)}">${p.banner ? `<img class="cover" loading="lazy" src="${$esc(p.banner)}" alt="">` : ''}<div class="top"><img loading="lazy" src="${$esc(p.icon)}" alt="${$esc(p.name)}"><div><h3>${$esc(p.name)}</h3><span class="by">by ${$esc(p.maker || 'unknown')}${p.contributors.length ? ' +' + p.contributors.length : ''}</span><span class="mute" style="font-size:.78rem;display:block">v${$esc(p.version)} · ${$esc(p.install)}${dls}${p.hasScript ? ' · script' : ''}</span></div></div>
      <p class="d">${$esc(p.summary)}</p><div class="foot"><span>${p.tags.slice(0, 3).map((t) => `<span class="tag">${$esc(t)}</span>`).join('')}</span><span title="${rt.count} ratings">${rt.count ? $stars(rt.avg) + ' <small class="mute">' + rt.count + '</small>' : '<small class="mute">Not rated</small>'}</span></div></button>`;
    }).join('') : '<div class="empty" style="grid-column:1/-1">No plugins match your search. <a href="' + C.CATALOGUE_REPO + '/issues/new?template=game-request.md" target="_blank" rel="noopener">Request this game</a>.</div>';
    $reveal();
  }
  $('#list').onclick = (e) => { const c = e.target.closest('.pcard'); if (c) open(c.dataset.id); };

  // ---- drawer
  const dr = $('#drawer');
  const close = () => { dr.classList.remove('open'); document.body.style.overflow = ''; history.replaceState(null, '', location.pathname + location.search); };
  dr.querySelector('.bk').onclick = close; dr.querySelector('.x').onclick = close;
  addEventListener('keydown', (e) => e.key === 'Escape' && close());

  async function open(id, tab) {
    const p = data.plugins.find((x) => x.id === id); if (!p) return;
    state.cur = p; state.tab = tab || 'info'; history.replaceState(null, '', '#' + id);
    dr.classList.add('open'); document.body.style.overflow = 'hidden';
    state.com = null; state.comErr = null; drawer();
    const loadDetail = p.readme !== undefined ? Promise.resolve() : $json(abs(p.detail)).then((d) => { Object.assign(p, d, { icon: p.icon, banner: p.banner, zip: p.zip, screenshots: (d.screenshots || []).map(abs) }); }).catch((e) => { state.comErr = 'Plugin details unavailable: ' + e.message; });
    await Promise.all([loadDetail, Community.get(id).then((c) => { state.com = c; }).catch((e) => { state.comErr = e.message; })]);
    if (state.cur === p) drawer();
  }
  function kv(k, v) { return v ? `<div><span>${k}</span>${$esc(v)}</div>` : ''; }

  function drawer() {
    const p = state.cur, c = state.com, tab = state.tab; const body = dr.querySelector('.pn .in-body');
    const rt = c ? c.rating : { avg: 0, count: 0, mine: 0 };
    let h = `<div class="dh"><img src="${$esc(p.icon)}" alt=""><div><h2>${$esc(p.fullName)}</h2><div class="by">by <b>${$esc(p.maker || 'unknown')}</b>${p.contributors.length ? ' · contributors: ' + p.contributors.map($esc).join(', ') : ''}</div>
      <div>${rt.count ? $stars(rt.avg) + ` <span class="mute">${rt.avg.toFixed(1)} · ${rt.count} rating${rt.count > 1 ? 's' : ''}</span>` : '<span class="mute">No ratings yet</span>'}</div></div></div>
      ${p.banner ? `<img class="banner" src="${$esc(p.banner)}" alt="">` : ''}<p class="mute" style="margin-top:0">${$esc(p.description || p.summary)}</p>
      <div class="cta" style="justify-content:flex-start"><a class="btn primary" id="dlzip" href="${$esc(p.zip)}" download>⬇ Download plugin (.zip)</a>${p.source ? `<a class="btn" href="${$esc(p.source)}" target="_blank" rel="noopener">Source / edit on GitHub ↗</a>` : ''}</div>
      <div class="kv">${kv('Version', p.version)}${kv('Install', p.install + (p.steamAppId ? ' · app ' + p.steamAppId : ''))}${kv('Game port', (p.ports || {}).game)}${kv('Query port', (p.ports || {}).query)}${kv('Max players', p.maxPlayers)}${kv('Query', p.query)}</div>
      <div class="tabs">${[['info', 'Community info'], ['readme', 'Details'], ['comments', 'Comments' + (c ? ` (${c.comments.length})` : '')], ['install', 'How to install']].map(([k, t]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    if (p.hasScript) h += `<div class="note">This plugin includes a <code>plugin.js</code> script that runs with full access to your PC. Only install it if you trust the source, and read the code first.</div>`;
    h = h.replace('<div class="kv">', `<div class="kv">${kv('Downloads', c && c.downloads ? String(c.downloads) : '')}${kv('Size', p.size ? (p.size / 1024).toFixed(1) + ' KB' : '')}`);
    if (Community.mode === 'local') h += `<div class="note">The community server is not reachable: ratings, comments and edits are saved <b>only in this browser</b> for now. See the website <code>README.md</code>.</div>`;
    if (state.comErr) h += `<div class="note">Community data unavailable: ${$esc(state.comErr)}</div>`;

    if (tab === 'info') {
      const i = c && c.info;
      h += `<p class="mute">Games change often. This page is written and kept up to date by the community: fix a port, add a tip, note a known issue.</p>
        <div class="md" id="infoView">${i && i.text ? $md(i.text) : '<p class="mute">Nothing here yet. Be the first to add setup tips, known issues and recommended settings.</p>'}</div>
        ${i && i.rev ? `<div class="hist">Revision ${i.rev}${i.by ? ' by ' + $esc(i.by) : ''}${i.at ? ' · ' + new Date(i.at).toLocaleString() : ''}</div>` : ''}
        <div style="margin-top:14px"><button class="btn sm" id="editInfo">✎ Edit community info</button></div>
        <div id="editor" hidden><textarea class="in" id="infoText" maxlength="${Community.max.info}" style="min-height:220px;margin-top:12px"></textarea>
          <div class="search" style="margin-top:10px"><input class="in" id="infoName" placeholder="Your name" maxlength="${Community.max.name}" style="flex:1 1 140px"><input class="in" id="infoSum" placeholder="What did you change?" maxlength="120" style="flex:2 1 200px"></div>
          <p class="mute" style="font-size:.8rem">Markdown supported: headings, lists, tables, <code>code</code>, **bold**, links.</p>
          <button class="btn primary sm" id="saveInfo">Save changes</button> <button class="btn sm" id="cancelInfo">Cancel</button></div>`;
    } else if (tab === 'readme') {
      if (p.readme === undefined) { h += '<p class="mute">Loading details...</p>'; } else {
      const docs = (p.docs || []).filter((d) => /^https?:\/\//.test(d.url));
      const docGroup = (type, title) => { const l = docs.filter((d) => (d.type || 'unofficial') === type); return l.length ? `<h3>${title}</h3><ul>${l.map((d) => `<li><a href="${$esc(d.url)}" target="_blank" rel="noopener noreferrer">${$esc(d.title)}</a>${d.description ? ` <span class="mute">- ${$esc(d.description)}</span>` : ''}</li>`).join('')}</ul>` : ''; };
      h += `<div class="md">${$md(p.readme)}</div>` + docGroup('official', 'Official documentation') + docGroup('unofficial', 'Guides and community links') +((p.configs || []).length ? `<h3>Config files</h3><ul>${p.configs.map((x) => `<li><code>${$esc(x.path)}</code> <span class="mute">(${$esc(x.format)})</span></li>`).join('')}</ul>` : '') + ((p.logs || []).length ? `<h3>Logs</h3><ul>${p.logs.map((x) => `<li>${$esc(x.name)}: <code>${$esc(x.path)}</code></li>`).join('')}</ul>` : '') + `<div>${p.tags.map((t) => `<span class="tag">${$esc(t)}</span>`).join('')}</div>${p.url ? `<p><a href="${$esc(p.url)}" target="_blank" rel="noopener noreferrer">Game / server info ↗</a></p>` : ''}${(p.screenshots || []).length ? `<h3>Screenshots</h3><div class="shots">${p.screenshots.map((s) => `<img loading="lazy" src="${$esc(s)}" alt="">`).join('')}</div>` : ''}`; }
    } else if (tab === 'comments') {
      h += `<h3>Your rating</h3><div class="rate" id="rate">${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" class="${n <= rt.mine ? 'on' : ''}" aria-label="${n} stars">★</button>`).join('')}</div>${rt.mine ? '<p class="mute" style="margin:4px 0 0"><small>Click your rating again, or <a href="#" id="unrate">remove it</a>.</small></p>' : ''}
        <h3 style="margin-top:22px">Comments</h3>
        <div class="search" style="margin-bottom:10px"><input class="in" id="cName" placeholder="Your name (optional)" maxlength="${Community.max.name}" style="flex:1 1 140px"></div>
        <textarea class="in" id="cText" placeholder="Share a tip, a bug, or whether this plugin works for you..." maxlength="${Community.max.comment}"></textarea>
        <p><button class="btn primary sm" id="post">Post comment</button> <span id="msg" class="mute"></span></p>
        ${c && c.comments.length ? c.comments.map((m) => `<div class="cm"><b>${$esc(m.name)}</b> <small>${new Date(m.at).toLocaleString()}</small><p>${$esc(m.text)}</p></div>`).join('') : '<p class="mute">No comments yet.</p>'}`;
    } else {
      h += `<div class="steps" style="grid-template-columns:1fr"><div class="card"><h3>From inside NodeGSM</h3><p>Open <b>Games → Catalogue</b>, find this plugin and press <b>Install</b>. NodeGSM downloads the list once and keeps it, so it also works offline afterwards.</p></div>
        <div class="card"><h3>Manual install</h3><p>Download the zip, then in NodeGSM click <b>Games → Install plugin (ZIP)</b> and choose it.</p></div>
        <div class="card"><h3>Improve it for everyone</h3><p>Edit <code>plugin.json</code> in the Catalogue repository and open a pull request. See the <a href="contributing.html">PR guide</a>.</p></div></div>`;
    }
    body.innerHTML = h;
    body.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; drawer(); }));
    const dz = body.querySelector('#dlzip'); if (dz) dz.onclick = () => Community.download(p.id);
    const on = (id, fn) => { const el = body.querySelector('#' + id); if (el) el.onclick = fn; };
    on('editInfo', () => { body.querySelector('#editor').hidden = false; body.querySelector('#infoText').value = (c && c.info.text) || ''; try { body.querySelector('#infoName').value = localStorage.getItem('nodegsm.name') || ''; } catch { /* */ } });
    on('cancelInfo', () => (body.querySelector('#editor').hidden = true));
    on('saveInfo', async () => { const n = body.querySelector('#infoName').value; try { localStorage.setItem('nodegsm.name', n); } catch { /* */ } try { state.com = await Community.saveInfo(p.id, body.querySelector('#infoText').value, n, body.querySelector('#infoSum').value); drawer(); } catch (e) { alert(e.message); } });
    on('post', async () => { const m = body.querySelector('#msg'); try { state.com = await Community.comment(p.id, body.querySelector('#cText').value, body.querySelector('#cName').value); ratings = await Community.summaries(); drawer(); } catch (e) { m.textContent = e.message; } });
    const rate = body.querySelector('#rate');
    if (rate) rate.onclick = async (e) => { const b = e.target.closest('button'); if (!b) return; try { const n = +b.dataset.n; state.com = await Community.rate(p.id, n === (state.com && state.com.rating ? state.com.rating.mine : 0) ? 0 : n); ratings = await Community.summaries(); drawer(); render(); } catch (er) { alert(er.message); } };
    const unrate = body.querySelector('#unrate');
    if (unrate) unrate.onclick = async (e) => { e.preventDefault(); try { state.com = await Community.rate(p.id, 0); ratings = await Community.summaries(); drawer(); render(); } catch (er) { alert(er.message); } };
  }
  dr.querySelector('.pn').insertAdjacentHTML('beforeend', '<div class="in-body"></div>');

  render();
  if (location.hash.length > 1) open(decodeURIComponent(location.hash.slice(1)));
})();
