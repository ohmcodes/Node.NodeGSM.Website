// Community data layer: ratings, comments, editable community info and download counts of each plugin.
// Two backends behind one interface:
//   - api:   the NodeGSM website backend (website/server/server.js): shared by every visitor.
//   - local: stored in this browser's localStorage - fallback when no backend answers; NOT shared.
// Config: API_URL in config.js ('auto' | url | '').
(function () {
  const C = window.NODEGSM_SITE || {};
  const KEY = 'nodegsm.community.v1';
  const MAX = { comment: 2000, info: 20000, name: 40, summary: 120 };
  let base = '';

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked */ } };
  const slot = (d, id) => (d[id] = d[id] || { ratings: {}, comments: [], info: { text: '', rev: 0, history: [] } });
  const me = () => { try { let u = localStorage.getItem('nodegsm.uid'); if (!u) { u = 'u' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36)); localStorage.setItem('nodegsm.uid', u); } return u; } catch { return 'anon' + Math.random().toString(36).slice(2, 10); } };
  const summarize = (s) => { const v = Object.values(s.ratings); return { avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0, count: v.length, mine: s.ratings[me()] || 0 }; };
  const view = (s) => ({ rating: summarize(s), comments: s.comments.slice().sort((a, b) => b.at - a.at), info: s.info, downloads: 0 });

  const api = (p, opt) => fetch(base + p, Object.assign({ headers: { 'Content-Type': 'application/json', 'X-Client-Id': me() } }, opt))
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')'); return j; });
  const enc = encodeURIComponent;

  const Community = window.Community = {
    mode: 'local', max: MAX,
    // resolves once the backend is detected; Community.mode is final afterwards
    ready: (async () => {
      const u = C.API_URL;
      if (!u) return;
      const candidate = u === 'auto' ? new URL('api', location.href).href : u.replace(/\/$/, '');
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
        const r = await fetch(candidate + '/health', { signal: ctl.signal }); clearTimeout(t);
        const j = await r.json();
        if (r.ok && j && j.ok && j.service === 'nodegsm-community') { base = candidate; Community.mode = 'api'; }
      } catch { /* no backend: local mode */ }
    })(),
    async get(id) { await this.ready; if (this.mode === 'api') return api(`/plugins/${enc(id)}/community`); return view(slot(load(), id)); },
    async rate(id, n) {
      await this.ready; n = Math.max(1, Math.min(5, n | 0));
      if (this.mode === 'api') return api(`/plugins/${enc(id)}/rating`, { method: 'PUT', body: JSON.stringify({ value: n }) });
      const d = load(); slot(d, id).ratings[me()] = n; save(d); return view(d[id]);
    },
    async comment(id, text, name) {
      await this.ready;
      text = String(text).trim().slice(0, MAX.comment); name = String(name || 'Anonymous').trim().slice(0, MAX.name) || 'Anonymous';
      if (!text) throw new Error('Write something first');
      if (this.mode === 'api') return api(`/plugins/${enc(id)}/comments`, { method: 'POST', body: JSON.stringify({ text, name }) });
      const d = load(); slot(d, id).comments.push({ id: 'c' + Date.now(), name, text, at: Date.now() }); save(d); return view(d[id]);
    },
    async saveInfo(id, text, name, summary) {
      await this.ready;
      text = String(text).slice(0, MAX.info); name = String(name || 'Anonymous').trim().slice(0, MAX.name) || 'Anonymous'; summary = String(summary || '').slice(0, MAX.summary);
      if (this.mode === 'api') return api(`/plugins/${enc(id)}/info`, { method: 'PUT', body: JSON.stringify({ text, name, summary }) });
      const d = load(); const s = slot(d, id);
      s.info.history = [{ rev: s.info.rev, text: s.info.text, by: s.info.by || '', at: s.info.at || 0, summary: s.info.summary || '' }].concat(s.info.history).slice(0, 20);
      s.info = Object.assign(s.info, { text, rev: s.info.rev + 1, by: name, at: Date.now(), summary });
      save(d); return view(s);
    },
    // fire-and-forget download counter (works with the page navigating away)
    download(id) { if (this.mode !== 'api') return; try { const u = `${base}/plugins/${enc(id)}/download`; if (!(navigator.sendBeacon && navigator.sendBeacon(u))) fetch(u, { method: 'POST', keepalive: true }); } catch { /* ignore */ } },
    // { id: {avg,count,downloads} } for the plugin list
    async summaries() {
      await this.ready;
      if (this.mode === 'api') { try { return await api('/ratings'); } catch { return {}; } }
      const d = load(); const o = {}; for (const id of Object.keys(d)) o[id] = summarize(d[id]); return o;
    },
  };
})();
