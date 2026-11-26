// Screenshots of the app (copied from the app repository, docs/screenshots/ -> public/assets/screens/).
// Used by the landing page (the ones marked home) and by the Features page (all of them).
(function () {
  var S = [
    { f: '01-server-list', t: 'Servers', d: 'Server list, details, live console and quick settings in one screen.', home: 1 },
    { f: '12-system-metrics', t: 'System metrics', d: 'CPU, memory, disk and players, with a history chart and the server table.', home: 1 },
    { f: '07-server-table', t: 'Table view', d: 'A WindowsGSM-style table with multi-select and bulk Start, Stop, Restart, Update and Backup.', home: 1 },
    { f: '04-server-backups', t: 'Backups and schedules', d: 'Full or Neat pick backups, cron schedules, retention and restore.', home: 1 },
    { f: '06-server-config-files', t: 'Config editor', d: 'Edit a game\'s config files Structured (key / value) or Raw; comments are kept.', home: 1 },
    { f: '11-clusters', t: 'Clusters', d: 'Group servers of the same game to update, sync configs and clear folders together.', home: 1 },
    { f: '18-discord-embed-editor', t: 'Discord alerts', d: 'Webhook alerts as embeds, with an editor and live preview.', home: 1 },
    { f: '13-games-plugins', t: 'Games are plugins', d: 'Every game is a plugin with README, documentation links, defaults, configs and logs.', home: 1 },
    { f: '21-web-login', t: 'Web access', d: 'Run NodeGSM in a browser with real accounts, roles and two-factor sign-in.', home: 1 },
    { f: '02-server-settings', t: 'Server settings', d: 'Ports, map, players, start parameters, CPU priority and the firewall helper.' },
    { f: '03-server-automation', t: 'Automation', d: 'Auto start, restart on crash, auto update, restart crontab and per-event Discord overrides.' },
    { f: '05-server-files', t: 'File browser', d: 'Browse and edit the files of a server.' },
    { f: '08-configs', t: 'Configs', d: 'Pick any server and edit its config files in one place.' },
    { f: '09-logs', t: 'NodeGSM log', d: 'Start, stop, crash, update and backup events with filters, export and clear.' },
    { f: '10-backups', t: 'All backups', d: 'Every backup of every server, restore or restore as a new server.' },
    { f: '14-add-server', t: 'Add a server', d: 'Install a new server or import an existing folder.' },
    { f: '15-settings-appearance', t: 'Settings', d: 'Theme, accent colour, animation and the header info bar.' },
    { f: '16-settings-web-access', t: 'Web access settings', d: 'Accounts, roles and signed-in sessions.' },
    { f: '17-discord-webhook', t: 'Discord webhook', d: 'Per-event toggles for the global webhook.' },
    { f: '19-discord-bot', t: 'Discord bot', d: 'Slash commands with per-user, per-server permissions.' },
    { f: '20-web-setup', t: 'Web: first start', d: 'Create the owner account; the access token is only needed once.' },
    { f: '22-web-account', t: 'Web: my account', d: 'Change password, set up two-factor authentication, sign out other sessions.' }
  ];
  var BASE = 'assets/screens/';
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var lb, idx = 0, list = [];
  function show(i) {
    idx = (i + list.length) % list.length;
    var s = list[idx];
    lb.querySelector('img').src = BASE + s.f + '.png';
    lb.querySelector('img').alt = s.t;
    lb.querySelector('b').textContent = s.t;
    lb.querySelector('span').textContent = s.d;
  }
  function open(i) {
    if (!lb) {
      lb = document.createElement('div');
      lb.className = 'lb';
      lb.hidden = true;
      lb.innerHTML = '<button class="x" aria-label="Close">&times;</button><button class="p" aria-label="Previous">&#8249;</button><button class="n" aria-label="Next">&#8250;</button><figure><img alt=""><figcaption><b></b> <span></span></figcaption></figure>';
      document.body.appendChild(lb);
      lb.addEventListener('click', function (e) {
        if (e.target.classList.contains('p')) show(idx - 1);
        else if (e.target.classList.contains('n')) show(idx + 1);
        else if (e.target.tagName !== 'IMG') lb.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        if (lb.hidden) return;
        if (e.key === 'Escape') lb.hidden = true; else if (e.key === 'ArrowLeft') show(idx - 1); else if (e.key === 'ArrowRight') show(idx + 1);
      });
    }
    show(i);
    lb.hidden = false;
  }

  /** Fill `el` with a gallery. opts.home: only the landing-page selection. */
  function render(el, opts) {
    list = (opts && opts.home) ? S.filter(function (s) { return s.home; }) : S.slice();
    el.innerHTML = list.map(function (s, i) {
      return '<button class="gal-i reveal" data-i="' + i + '" type="button"><img loading="lazy" width="1440" height="900" src="' + BASE + s.f + '.png" alt="' + esc(s.t) + '"><span><b>' + esc(s.t) + '</b>' + esc(s.d) + '</span></button>';
    }).join('');
    el.onclick = function (e) {
      var b = e.target.closest('.gal-i');
      if (b) open(+b.dataset.i);
    };
    if (window.$reveal) window.$reveal();
  }
  window.Screens = { list: S, render: render };
})();
