// Shared nav + footer + helpers. Every page sets <body data-page="home|download|plugins|feed|features|convert">.
(function () {
  const C = window.NODEGSM_SITE || {};
  const page = document.body.dataset.page;
  // donation links (icons in the header, a Support column in the footer)
  const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">${d}</svg>`;
  const DONATE = [
    ['Buy Me a Coffee', 'https://www.buymeacoffee.com/ohmcodes', svg('<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8zm13 1h1.5a2.5 2.5 0 0 1 0 5H17v-1.5h1.5a1 1 0 0 0 0-2H17V9zM6 3h2v3H6V3zm4 0h2v3h-2V3zm4 0h2v3h-2V3zM5 20h12v2H5v-2z"/>')],
    ['PayPal', 'https://www.paypal.com/donate/?business=8389QZ23QRDPE&no_recurring=0&item_name=Game+Server%2FTools+Community+Donations&currency_code=CAD', svg('<path d="M7.5 3h6.2c3 0 4.8 1.6 4.3 4.3-.6 3.3-2.8 4.9-6 4.9H9.8L9 17H6L7.5 3zm2.6 2.4-.6 4.3h1.7c1.7 0 2.8-.8 3.1-2.5.2-1.3-.6-1.8-1.9-1.8h-2.3zM6.4 18h2.7l-.4 2.6c-.1.3-.3.4-.6.4H5.2L6.4 18z"/>')],
    ['Patreon', 'https://www.patreon.com/cw/ohmcodes', svg('<circle cx="14.5" cy="9.5" r="6.5"/><rect x="2" y="3" width="3.6" height="18" rx="1"/>')],
  ];
  const donateIcons = DONATE.map(([t, h, i]) => `<a class="don" href="${h}" target="_blank" rel="noopener noreferrer" title="Support NodeGSM: ${t}" aria-label="Support NodeGSM on ${t}">${i}</a>`).join('');
  const link = (h, t, k) => `<a href="${h}" class="${page === k ? 'on' : ''}">${t}</a>`;
  document.body.insertAdjacentHTML('afterbegin', `
  <header class="nav"><div class="wrap">
    <a class="brand" href="index.html"><img src="assets/logo.png" alt="">NodeGSM</a>
    <button class="menu" aria-label="Menu" onclick="this.nextElementSibling.classList.toggle('open')">☰</button>
    <nav>${link('index.html', 'Home', 'home')}${link('features.html', 'Features', 'features')}${link('plugins.html', 'Plugins', 'plugins')}${link('feed.html', 'Feed', 'feed')}${link('convert.html', 'Convert', 'convert')}${link('download.html', 'Download', 'download')}
      <a href="${C.REPO}" target="_blank" rel="noopener">GitHub ↗</a><span class="donate">${donateIcons}</span></nav>
  </div></header>`);
  document.body.insertAdjacentHTML('beforeend', `
  <footer><div class="wrap">
    <div class="cols">
      <div><a class="brand" href="index.html"><img src="assets/logo.png" alt="">NodeGSM</a>
        <p class="mute" style="font-size:.9rem;max-width:300px">Node Game Server Manager. Install, run and automate game servers with one click. Free and open source.</p></div>
      <div><h4>Product</h4><a href="download.html">Download</a><a href="features.html">Features &amp; changelog</a><a href="plugins.html">Plugins</a><a href="feed.html">Activity feed</a></div>
      <div><h4>Develop</h4><a href="${C.REPO}" target="_blank" rel="noopener">GitHub</a><a href="contributing.html">Add a game (PR guide)</a><a href="convert.html">Convert a WindowsGSM plugin</a><a href="${C.CATALOGUE_REPO}/blob/main/PLUGINS.md" target="_blank" rel="noopener">Plugin format</a></div>
      <div><h4>Community</h4>${C.DISCORD ? `<a href="${C.DISCORD}" target="_blank" rel="noopener">Discord</a>` : ''}<a href="${C.REPO}/issues/new?template=report-issues.md" target="_blank" rel="noopener">Report an issue</a><a href="${C.CATALOGUE_REPO}/issues/new?template=game-request.md" target="_blank" rel="noopener">Request a game</a></div>
      <div><h4>Support</h4><p class="mute" style="font-size:.88rem;margin:0 0 6px">NodeGSM is free. Donations keep it going.</p>${DONATE.map(([t, h, i]) => `<a href="${h}" target="_blank" rel="noopener noreferrer" class="dl">${i}<span>${t}</span></a>`).join('')}</div>
    </div>
    <p class="legal">© ${new Date().getFullYear()} NodeGSM · MIT licensed · An Electron rewrite inspired by WindowsGSM. Not affiliated with WindowsGSM, Valve or any game publisher; game names and icons belong to their owners.</p>
  </div></footer>`);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in-v'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
  window.$reveal = () => document.querySelectorAll('.reveal:not(.in-v)').forEach((el) => (io ? io.observe(el) : el.classList.add('in-v')));
  window.$reveal();
})();

window.$esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// tiny safe inline markdown: `code`, **bold**, [text](http-link)
window.$inline = (s) => $esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
// block markdown: headings, tables, lists, code, paragraphs (all output escaped)
window.$md = (src) => {
  const out = []; const lines = String(src || '').split(/\r?\n/); let i = 0;
  while (i < lines.length) {
    const l = lines[i]; let m;
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('```')) { const b = []; i++; while (i < lines.length && !lines[i].startsWith('```')) b.push(lines[i++]); i++; out.push(`<pre><code>${$esc(b.join('\n'))}</code></pre>`); continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { out.push(`<h${m[1].length}>${$inline(m[2])}</h${m[1].length}>`); i++; continue; }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) { if (!/^\|[\s:|-]+\|?$/.test(lines[i])) rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim())); i++; }
      out.push('<table>' + rows.map((r, k) => '<tr>' + r.map((c) => `<${k ? 'td' : 'th'}>${$inline(c)}</${k ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>'); continue;
    }
    if (/^\s*[-*]\s/.test(l)) { const it = []; while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) it.push(`<li>${$inline(lines[i++].replace(/^\s*[-*]\s/, ''))}</li>`); out.push(`<ul>${it.join('')}</ul>`); continue; }
    if (/^\d+\.\s/.test(l)) { const it = []; while (i < lines.length && (/^\d+\.\s/.test(lines[i]) || /^\s+[-*]\s/.test(lines[i]))) { const x = lines[i++]; it.push(/^\s/.test(x) ? `<li style="margin-left:18px;list-style:circle">${$inline(x.replace(/^\s*[-*]\s/, ''))}</li>` : `<li>${$inline(x.replace(/^\d+\.\s/, ''))}</li>`); } out.push(`<ol>${it.join('')}</ol>`); continue; }
    if (l.startsWith('>')) { const q = []; while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${$inline(q.join(' '))}</blockquote>`); continue; }
    const p = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\||\s*[-*]\s|\d+\.\s|>|```)/.test(lines[i])) p.push(lines[i++]); out.push(`<p>${$inline(p.join(' '))}</p>`);
  }
  return out.join('');
};
window.$json = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
window.$stars = (n) => { const r = Math.round(n || 0); return `<span class="stars">${'★'.repeat(r)}<span class="off">${'★'.repeat(5 - r)}</span></span>`; };
