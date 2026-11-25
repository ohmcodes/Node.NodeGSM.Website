// Activity feed: recent community activity (from the site server) and the most downloaded plugins. Names/icons come from the Catalogue.
(async function () {
  const C = window.NODEGSM_SITE || {};
  const $ = (s) => document.querySelector(s);
  const CAT = new URL((C.CATALOG_URL || 'catalog').replace(/\/?$/, '/'), location.href);
  const TYPES = [['', 'All'], ['new', 'New plugins'], ['update', 'Updates'], ['rating', 'Ratings'], ['comment', 'Comments'], ['info', 'Community edits'], ['download', 'Downloads']];
  const ICON = { new: '🆕', update: '⬆️', rating: '⭐', comment: '💬', info: '✏️', download: '⬇️' };
  const plugins = {};
  let type = '';
  try { const d = await $json(new URL('index.json', CAT).href); d.plugins.forEach((p) => { plugins[p.id] = p; }); } catch { /* names fall back to ids */ }
  const name = (id) => (plugins[id] ? plugins[id].name : id);
  const link = (id) => `<a href="plugins.html#${encodeURIComponent(id)}">${$esc(name(id))}</a>`;
  const ago = (t) => {
    const s = Math.max(0, ((Date.now() - t) / 1000) | 0); if (s < 60) return 'just now';
    const m = (s / 60) | 0; if (m < 60) return m + ' min ago';
    const h = (m / 60) | 0; if (h < 24) return h + ' h ago';
    const d = (h / 24) | 0; return d < 30 ? d + ' d ago' : new Date(t).toLocaleDateString();
  };
  const text = (e) => {
    switch (e.t) {
      case 'new': return `New plugin ${link(e.id)}${e.v ? ' <span class="mute">v' + $esc(e.v) + '</span>' : ''}`;
      case 'update': return `${link(e.id)} updated ${e.from ? 'from v' + $esc(e.from) + ' ' : ''}to <b>v${$esc(e.v)}</b>`;
      case 'rating': return `${link(e.id)} was rated ${$stars(e.value)}`;
      case 'comment': return `<b>${$esc(e.name)}</b> commented on ${link(e.id)}<p class="q">“${$esc(e.text)}”</p>`;
      case 'info': return `<b>${$esc(e.name)}</b> edited the community info of ${link(e.id)}${e.summary ? '<p class="q">' + $esc(e.summary) + '</p>' : ''}`;
      case 'download': return `${link(e.id)} was downloaded`;
      default: return '';
    }
  };
  $('#chips').innerHTML = TYPES.map(([k, l]) => `<button class="chip ${k === type ? 'on' : ''}" data-t="${k}">${l}</button>`).join('');
  $('#chips').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    type = b.dataset.t; [...$('#chips').children].forEach((c) => c.classList.toggle('on', c === b)); load();
  };

  async function load() {
    let f;
    try { f = await Community.feed(type); } catch (e) { $('#feed').innerHTML = `<li class="mute">Could not load the feed (${$esc(e.message)}).</li>`; return; }
    if (f.local) {
      $('#feed').innerHTML = '<li class="mute">The activity feed needs the NodeGSM site server (it collects activity from every visitor). Run <code>npm start</code> or set <code>API_URL</code> in config.js.</li>';
      $('#top').innerHTML = ''; return;
    }
    $('#totals').innerHTML = `<b>${f.totals.downloads}</b> downloads · <b>${f.totals.ratings}</b> ratings · <b>${f.totals.comments}</b> comments`;
    $('#feed').innerHTML = f.events.length
      ? f.events.map((e) => `<li><div class="ic">${ICON[e.t] || '•'}</div><div class="tx">${text(e)}<div class="when">${ago(e.at)}</div></div></li>`).join('')
      : '<li class="mute">Nothing here yet. Rate a plugin, leave a comment or improve its community info and it shows up here.</li>';
    $('#top').innerHTML = f.topDownloads.length
      ? f.topDownloads.map((t) => `<li>${plugins[t.id] && plugins[t.id].icon ? `<img src="${$esc(new URL(plugins[t.id].icon, CAT).href)}" alt="">` : ''}${link(t.id)}<span>${t.downloads} ⬇</span></li>`).join('')
      : '<li class="mute">No downloads yet.</li>';
  }
  await load();
  setInterval(load, 60e3);
})();
