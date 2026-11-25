// WindowsGSM plugin converter page. Conversion runs in the browser (convert-cs.js); nothing is sent anywhere
// until the user presses "Submit" in the "Automated" option. No inline scripts, all text is set with textContent.
(function () {
  const C = window.NODEGSM_SITE || {};
  const X = window.NodeGsmConvert;
  const $ = (id) => document.getElementById(id);
  const MAX = X.LIMITS.source;
  const SAMPLE = [
    'using System.Diagnostics;', 'using System.Threading.Tasks;', 'using WindowsGSM.Functions;', 'using WindowsGSM.GameServer.Engine;', 'using WindowsGSM.GameServer.Query;', '',
    'namespace WindowsGSM.Plugins', '{', '    public class Palgame : SteamCMDAgent', '    {',
    '        public Plugin Plugin = new Plugin { name = "WindowsGSM.Palgame", author = "ExampleAuthor", description = "Example dedicated server", version = "1.0", url = "https://example.com/palgame", color = "#1e8449" };',
    '        public Palgame(ServerConfig serverData) : base(serverData) => base.serverData = _serverData = serverData;',
    '        private readonly ServerConfig _serverData;', '',
    '        public override bool loginAnonymous => true;', '        public override string AppId => "123456";',
    '        public override string StartPath => @".\\Pal\\Binaries\\Win64\\PalServer.exe";',
    '        public string FullName = "Palgame Dedicated Server";', '        public bool AllowsEmbedConsole = true;', '        public int PortIncrements = 2;', '        public object QueryMethod = new A2S();',
    '        public string Port = "8211"; public string QueryPort = "8212"; public string Defaultmap = "MainWorld"; public string Maxplayers = "32"; public string Additional = "-log";', '',
    '        public async Task<Process> Start()', '        {',
    '            string param = $"-port={_serverData.ServerPort} -queryport={_serverData.ServerQueryPort} -players={_serverData.ServerMaxPlayer}";',
    '            param += string.IsNullOrWhiteSpace(_serverData.ServerIP) ? string.Empty : $" -publicip={_serverData.ServerIP}";',
    '            param += $" -servername=\\"{_serverData.ServerName}\\" {_serverData.ServerParam}";',
    '            Process p = new Process { StartInfo = { FileName = StartPath, Arguments = param } };', '            p.Start();', '            return p;', '        }', '',
    '        public async Task Stop(Process p) { p.StandardInput.WriteLine("quit"); }', '    }', '}', '',
  ].join('\n');

  let mode = 'convert', tab = 'json', edits = {}, res = null, source = '', existing = new Set(), api = null, timer = 0, lastSource = null;

  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const setList = (ul, items) => { ul.textContent = ''; items.forEach((t) => ul.appendChild(el('li', t))); };
  const msg = (id, text, kind) => { const e = $(id); e.textContent = text || ''; e.classList.toggle('err', kind === 'err'); e.classList.toggle('good', kind === 'ok'); };
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  const safe = (fn) => { try { return fn(); } catch { return undefined; } };

  // ---- known catalogue ids (best effort): a clashing id is flagged while editing
  (async function () {
    try {
      const base = String(C.CATALOG_URL || '').replace(/\/?$/, '/');
      const j = await fetch(base + 'index.json').then((r) => r.json());
      existing = new Set((j.plugins || []).map((p) => p.id));
      if (source) convert();
    } catch { /* offline or no catalogue: the server checks again on submit */ }
  })();

  // ---- backend detection for option 3 (same health route the community features use)
  const apiReady = (async function () {
    const u = C.API_URL; if (!u) return null;
    const cand = u === 'auto' ? new URL('api', location.href).href : String(u).replace(/\/$/, '');
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(cand + '/health', { signal: ctl.signal }); clearTimeout(t);
      const j = await r.json();
      if (r.ok && j && j.ok && j.service === 'nodegsm-community' && j.submissions === true) return cand;
    } catch { /* unreachable */ }
    return null;
  })();
  apiReady.then((b) => {
    api = b;
    const radio = document.querySelector('input[name=mode][value=auto]');
    if (b) { $('autoWhy').textContent = 'The owners review it and a draft pull request is opened for you. No GitHub account needed.'; }
    else {
      radio.disabled = true; $('autoOpt').classList.add('off');
      $('autoWhy').textContent = 'Not available here: this site has no submission service (for example it is hosted as static pages). Use one of the other two options.';
    }
    refresh();
  });

  // ---- conversion
  function convert() {
    if (!source.trim()) { res = null; render(); return; }
    const o = { existingIds: existing };
    ['id', 'name', 'author', 'exe'].forEach((k) => { if (edits[k]) o[k] = edits[k]; });
    res = safe(() => X.convertCs(source, o)) || { ok: false, errors: ['The converter failed on this file.'], warnings: [], todos: [], detected: {}, pluginJson: null };
    render();
  }

  function row(tb, k, v) { const tr = el('tr'); tr.appendChild(el('th', k)); tr.appendChild(el('td', v)); tb.appendChild(tr); }
  function render() {
    const has = !!res;
    $('detCard').hidden = !has || !res.pluginJson && !res.errors.length;
    $('msgCard').hidden = !has || !res.pluginJson;
    $('outCard').hidden = !has || !res.pluginJson;
    $('actCard').hidden = !has || !res.pluginJson;
    if (!has) { msg('srcMsg', ''); return; }
    const pj = res.pluginJson, d = res.detected || {};
    msg('srcMsg', res.ok ? 'Converted. Review the result below.' : (pj ? 'Converted with problems: fix the highlighted fields.' : res.errors[0]), res.ok ? 'ok' : 'err');
    if (!pj) { $('detCard').hidden = true; return; }
    $('detCard').hidden = false;
    const set = (id, v) => { const f = $(id); if (document.activeElement !== f) f.value = v || ''; };
    set('fId', edits.id !== undefined ? edits.id : res.id); set('fName', pj.name); set('fAuthor', pj.author); set('fExe', pj.run && pj.run.exe);
    msg('errMsg', res.ok ? '' : res.errors.join(' '), 'err');
    const tb = $('det').querySelector('tbody'); tb.textContent = '';
    row(tb, 'Class', (d.namespace ? d.namespace + '.' : '') + d.className + (d.baseClass ? ' : ' + d.baseClass : ''));
    row(tb, 'Install', pj.install ? (pj.install.type === 'steamcmd' ? 'SteamCMD, app id ' + pj.install.appId : 'manual (not converted)') : '');
    row(tb, 'Start arguments', pj.run && pj.run.args ? JSON.stringify(pj.run.args) : '(none detected)');
    if (pj.run && pj.run.command) row(tb, 'Started through', pj.run.command);
    row(tb, 'Console', (pj.run && pj.run.stdin !== undefined ? 'stdin ' + (pj.run.stdin ? 'on' : 'off') : 'not detected') + (pj.run && pj.run.stopCommand ? ', stop command "' + pj.run.stopCommand + '"' : ''));
    row(tb, 'Defaults', pj.defaults ? Object.keys(pj.defaults).map((k) => k + '=' + pj.defaults[k]).join('  ') : '(none detected)');
    row(tb, 'Query', pj.query || 'none');
    row(tb, 'Version', pj.version + (d.versionNormalised ? ' (' + d.versionNormalised + ')' : ''));
    row(tb, 'Not converted', (d.customMethods && d.customMethods.length ? d.customMethods.join(', ') : 'nothing found'));
    $('wCount').textContent = res.warnings.length; $('tCount').textContent = res.todos.length;
    setList($('warnings'), res.warnings.length ? res.warnings : ['No warnings.']); setList($('todos'), res.todos.length ? res.todos : ['Nothing.']);
    renderOut(); refresh();
  }

  const current = () => (!res || !res.pluginJson ? '' : tab === 'json' ? res.pluginJsonText : tab === 'readme' ? res.readmeText : res.prBody);
  const fileName = () => (tab === 'json' ? 'plugin.json' : tab === 'readme' ? 'README.md' : 'pull-request.md');
  function renderOut() {
    $('outPre').textContent = current();
    document.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); $('outPre').setAttribute('aria-labelledby', 'tab-' + tab); });
    guidedLinks();
  }

  // ---- option panels
  function guidedLinks() {
    if (!res || !res.pluginJson) return;
    const repo = String(C.CATALOGUE_REPO || '').replace(/\/$/, ''); const id = res.id;
    $('g-repo').href = repo;
    const nf = (file, content, a, note) => {
      const base = `${repo}/new/main?filename=${encodeURIComponent('plugins/' + id + '/' + file).replace(/%2F/g, '/')}`;
      const withValue = base + '&value=' + encodeURIComponent(content);
      const prefill = withValue.length <= 3500;
      $(a).href = prefill ? withValue : base; $(note).textContent = prefill ? '(the text is pre-filled)' : '(too long to pre-fill: press Copy on the ' + file + ' tab above and paste it)';
    };
    nf('plugin.json', res.pluginJsonText, 'g-json', 'g-json-note'); nf('README.md', res.readmeText, 'g-readme', 'g-readme-note');
  }
  function refresh() {
    ['convert', 'guided', 'auto'].forEach((m) => { $('p-' + m).hidden = m !== mode; });
    const ok = !!(res && res.ok) && !!api && $('consent').checked;
    $('submit').disabled = !ok;
    $('submitHint').textContent = !api ? '' : !(res && res.ok) ? 'Fix the problems above first.' : !$('consent').checked ? 'Tick the consent box to enable.' : '';
    $('autoOff').hidden = !!api;
    if (!api) { $('autoOff').textContent = 'The submission service is not reachable from this site. Use "Convert only" or the guided pull request.'; $('autoForm').hidden = true; $('statusBox').hidden = true; } else { $('autoForm').hidden = false; $('statusBox').hidden = false; }
  }

  // ---- clipboard / downloads
  async function copy(text, out) {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } finally { t.remove(); } }
    msg(out, 'Copied.'); setTimeout(() => msg(out, ''), 2000);
  }
  function save(name, blob) { const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

  // ---- source input
  function setSource(text, how) {
    if (text.length > MAX) { msg('srcMsg', `That is ${kb(text.length)}; the limit is ${kb(MAX)}. A plugin file is normally a few KB: is this the right file?`, 'err'); return false; }
    source = text; $('size').textContent = text ? kb(text.length) : '';
    if (how !== 'typing') $('src').value = text;
    if (lastSource !== null && lastSource !== text) edits = {};
    lastSource = text; convert(); return true;
  }
  $('src').addEventListener('input', () => { clearTimeout(timer); const v = $('src').value; timer = setTimeout(() => { if (!setSource(v, 'typing')) { /* too big: keep what is shown */ } }, 250); });
  $('file').addEventListener('change', () => {
    const f = $('file').files[0]; if (!f) return;
    if (f.size > MAX) { msg('srcMsg', `${f.name} is ${kb(f.size)}; the limit is ${kb(MAX)}.`, 'err'); $('file').value = ''; return; }
    const r = new FileReader();
    r.onload = () => { setSource(String(r.result || '')); $('file').value = ''; };
    r.onerror = () => msg('srcMsg', 'Could not read that file.', 'err');
    r.readAsText(f);
  });
  $('sample').addEventListener('click', () => setSource(SAMPLE));
  $('clear').addEventListener('click', () => { edits = {}; lastSource = null; setSource(''); msg('srcMsg', ''); $('detCard').hidden = $('msgCard').hidden = $('outCard').hidden = $('actCard').hidden = true; });

  const field = (id, key) => $(id).addEventListener('input', () => { edits[key] = $(id).value.trim() || undefined; clearTimeout(timer); timer = setTimeout(convert, 200); });
  field('fId', 'id'); field('fName', 'name'); field('fAuthor', 'author'); field('fExe', 'exe');

  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderOut(); }));
  $('copy').addEventListener('click', () => copy(current(), 'copyMsg'));
  $('download').addEventListener('click', () => save(fileName(), new Blob([current()], { type: 'text/plain;charset=utf-8' })));
  $('zip').addEventListener('click', () => { if (!res || !res.pluginJson) return; const z = X.makeZip({ [res.id + '/plugin.json']: res.pluginJsonText, [res.id + '/README.md']: res.readmeText }); save(res.id + '-plugin.zip', new Blob([z], { type: 'application/zip' })); });
  $('g-copy-pr').addEventListener('click', () => copy(res ? res.prBody : '', 'g-msg'));
  document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => { mode = r.value; refresh(); }));
  $('consent').addEventListener('change', refresh);
  $('pluginsDoc').href = String(C.CATALOGUE_REPO || '') + '/blob/main/PLUGINS.md';
  $('licence').href = String(C.CATALOGUE_REPO || '') + '/blob/main/LICENSE';

  // ---- option 3: submit + status (the only code that sends anything)
  const KEY = 'nodegsm.submissions.v1';
  const remember = (id) => { try { const l = JSON.parse(localStorage.getItem(KEY) || '[]'); l.unshift(id); localStorage.setItem(KEY, JSON.stringify(l.slice(0, 10))); } catch { /* storage blocked */ } };
  const lastId = () => { try { return (JSON.parse(localStorage.getItem(KEY) || '[]'))[0] || ''; } catch { return ''; } };
  $('sid').value = lastId();
  async function request(path, init) {
    const r = await fetch(api + path, init); const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Request failed (' + r.status + ')'); e.errors = j.errors; throw e; }
    return j;
  }
  $('submit').addEventListener('click', async () => {
    if (!api || !res || !res.ok || !$('consent').checked) return;
    const btn = $('submit'); btn.disabled = true; msg('subMsg', 'Sending...');
    try {
      const body = { source, id: res.id, consent: true, contact: $('contact').value.trim() || undefined, edits: { name: res.pluginJson.name, author: res.pluginJson.author, exe: res.pluginJson.run.exe } };
      const j = await request('/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      remember(j.id); $('sid').value = j.id; msg('subMsg', 'Submitted. Your submission id is ' + j.id + ' (keep it): status "' + j.status + '". The owners will review it.', 'ok');
    } catch (e) { msg('subMsg', e.message + (e.errors ? ' ' + e.errors.slice(0, 3).join(' ') : ''), 'err'); }
    refresh();
  });
  $('check').addEventListener('click', async () => {
    const id = $('sid').value.trim();
    if (!/^sub_[0-9a-f]{12}$/.test(id)) return msg('stMsg', 'That does not look like a submission id (sub_ and 12 characters).', 'err');
    msg('stMsg', 'Checking...');
    try {
      const j = await request('/submissions/' + encodeURIComponent(id));
      const t = $('stMsg'); t.textContent = ''; t.classList.remove('err'); t.classList.add('good');
      t.appendChild(document.createTextNode('Status: ' + j.status + (j.reason ? ' (' + j.reason + ')' : '') + '. '));
      if (j.prUrl && /^https:\/\//.test(j.prUrl)) { const a = el('a', 'Open the pull request'); a.href = j.prUrl; a.target = '_blank'; a.rel = 'noopener'; t.appendChild(a); }
    } catch (e) { msg('stMsg', e.message, 'err'); }
  });
})();
