// Minimal moderation page for converter submissions. Everything from the server is untrusted text: only textContent is used.
(function () {
  const C = window.NODEGSM_SITE || {};
  const $ = (id) => document.getElementById(id);
  const base = !C.API_URL ? '' : (C.API_URL === 'auto' ? new URL('api', location.href).href : String(C.API_URL).replace(/\/$/, ''));
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const msg = (t, bad) => { const m = $('msg'); m.textContent = t || ''; m.classList.toggle('err', !!bad); };
  async function call(method, path, body) {
    const r = await fetch(base + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + $('tok').value }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'HTTP ' + r.status); e.json = j; throw e; }
    return j;
  }
  const pre = (t) => el('pre', t, 'cv-out');
  function card(s) {
    const d = el('details', undefined, 'card'); const sum = el('summary'); sum.textContent = `${s.status.toUpperCase()}  ${s.pluginId || ''}  "${s.name || ''}"  ${new Date(s.createdAt).toLocaleString()}  (${s.id})`; d.appendChild(sum);
    d.appendChild(el('p', 'Contact: ' + (s.contact || '(none)') + ' | via ' + (s.via || '?') + (s.prUrl ? ' | PR: ' + s.prUrl : '') + (s.lastError ? ' | last error: ' + s.lastError : '') + (s.reason ? ' | reason: ' + s.reason : ''), 'mute cv-small'));
    if (s.warnings && s.warnings.length) { d.appendChild(el('h3', 'Warnings')); const u = el('ul', undefined, 'cv-list'); s.warnings.forEach((w) => u.appendChild(el('li', w))); d.appendChild(u); }
    if (s.todos && s.todos.length) { d.appendChild(el('h3', 'TODO')); const u = el('ul', undefined, 'cv-list'); s.todos.forEach((w) => u.appendChild(el('li', w))); d.appendChild(u); }
    d.appendChild(el('h3', 'plugin.json')); d.appendChild(pre(s.pluginJsonText)); d.appendChild(el('h3', 'README.md')); d.appendChild(pre(s.readmeText)); d.appendChild(el('h3', 'PR body')); d.appendChild(pre(s.prBody));
    if (s.status === 'pending' || s.status === 'approved') {
      const row = el('div', undefined, 'cv-row'); const reason = el('input'); reason.className = 'in'; reason.maxLength = 300; reason.placeholder = 'Reason (shown to the submitter)'; reason.setAttribute('aria-label', 'Rejection reason');
      const ok = el('button', s.status === 'approved' ? 'Retry approval / open PR' : 'Approve', 'btn sm primary'); ok.type = 'button';
      const no = el('button', 'Reject', 'btn sm'); no.type = 'button';
      ok.addEventListener('click', async () => { try { const j = await call('POST', '/submissions/' + s.id + '/approve'); msg(j.mode === 'manual' ? 'Approved (no GITHUB_TOKEN): open the PR by hand with the files shown below.' : 'Pull request opened: ' + j.prUrl); if (j.files) d.appendChild(pre(JSON.stringify(j.files, null, 2))); if (j.mode !== 'manual') load(); } catch (e) { msg(e.message, true); if (e.json && e.json.files) d.appendChild(pre(JSON.stringify(e.json.files, null, 2))); } });
      no.addEventListener('click', async () => { try { await call('POST', '/submissions/' + s.id + '/reject', { reason: reason.value }); msg('Rejected.'); load(); } catch (e) { msg(e.message, true); } });
      row.append(reason, ok, no); d.appendChild(row);
    }
    return d;
  }
  async function load() {
    const list = $('list'); list.textContent = '';
    try { const j = await call('GET', '/submissions'); msg(`${j.submissions.length} submissions, ${j.pending} pending. GitHub bot: ${j.github ? 'configured for ' + j.repo : 'not configured (manual mode)'}.`); j.submissions.forEach((s) => list.appendChild(card(s))); }
    catch (e) { msg(e.message, true); }
  }
  $('load').addEventListener('click', load);
})();
