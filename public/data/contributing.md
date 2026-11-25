# Contributing - add or fix a game with a pull request

Every game is a **plugin**: one folder in [`plugins/`](plugins). Adding a game or fixing an outdated one is a pull request that only touches that folder. No app code, no compiling.

> Coming from WindowsGSM? See the section **Migrating a WindowsGSM C# plugin** below.
>
> Can't or don't want to code? Open a **[Game request](../../issues/new?template=game-request.md)** issue instead.

## 1. Before you start
- Check [`plugins/`](plugins) so the game isn't already there.
- You need Git, Node.js 18+ and the game's dedicated-server info (Steam app id, executable, start parameters, ports). [SteamDB](https://steamdb.info) shows the app id and install folder; the game's wiki lists launch options.

## 2. Add a new game

```powershell
git clone https://github.com/<you>/Node.NodeGSM.Catalogue.git
cd Node.NodeGSM.Catalogue
npm install
git checkout -b add-mygame
Copy-Item -Recurse plugins\_template plugins\mygame     # folder name = plugin id (a-z 0-9 _ -)
```

1. **Edit `plugins/mygame/plugin.json`.** Every field is explained in [PLUGINS.md](PLUGINS.md). Minimum: `id`, `name`, `description`, `author`, `version`, `docs`, `install`, `run.exe`, `defaults`.
   - `author` is the **maker** shown on the catalogue card. Add `contributors: ["Name"]` when you improve someone else's plugin.
   - `summary` (optional, max 140 characters) is the one-liner on the card.
   - `docs`: official guides first, then unofficial; only links you opened.
2. **Add the media** next to it: `icon.png` (square PNG 64-256 px, required), `README.md` (required), optional `banner.png` and `screenshots/*.png` (list them under `media`).
3. **Validate:** `npm run validate mygame`, then `npm test`.
4. **Test it in NodeGSM** (please do and say what you tested): in the app, *Games → Install plugin (folder)* → pick your folder → *Add Server* → install → start/stop. Check the Config Files and Logs tabs.
5. **Open the pull request** against `main`. CI runs the same checks. Do not commit `public/`.

## Migrating a WindowsGSM C# plugin
Coming from [WindowsGSM](https://github.com/WindowsGSM/WindowsGSM)? The NodeGSM website has a **converter** that reads the C# file of a WindowsGSM plugin and writes the NodeGSM `plugin.json` and a README for you: **https://github.com/ohmcodes/Node.NodeGSM.Website** (page `/convert.html`, shown as *Convert* in the site menu). It is plain text parsing in the browser: the C# is never compiled or run, and nothing is sent anywhere unless you choose the automated option.

**Three ways to use the result:**
1. **Convert only**: copy / download `plugin.json`, `README.md` (or a zip of the folder) and continue with section 2 above by hand.
2. **Guided pull request**: the page walks you through forking this repository, adding the two files (with pre-filled GitHub links) and opening the pull request; the PR description is generated from the template in [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).
3. **Automated**: no GitHub account needed. You send the converted plugin to the owners, who review it; once approved a **draft** pull request is opened for you. Only `plugin.json` and `README.md` are accepted this way (never `plugin.js`); this option needs the website's backend and is not available on the static GitHub Pages copy.

**What converts and what does not**

| WindowsGSM C# | NodeGSM | Converted? |
|---|---|---|
| `Plugin { name, author, description, version, url, color }` (initialiser or `Plugin.x = ...`) | `name` (the `FullName` is preferred), `author`, `description`, `version` (made semver), `url`, `color` | yes |
| class name / `FullName` | `id` (slug, 2-32 chars, collision-safe suggestion, editable) | yes |
| `: SteamCMDAgent` or a numeric `AppId` | `install: { "type": "steamcmd", "appId" }` | yes |
| no AppId | `install: { "type": "manual" }` | yes, plus a TODO |
| `StartPath` | `run.exe` (`/` separators, leading `.\` removed) | yes |
| `AllowsEmbedConsole` | `run.stdin` | yes |
| `Stop()` with `StandardInput.WriteLine("stop")` | `run.stopCommand` | only an obvious literal |
| `Port`, `QueryPort`, `Defaultmap`, `Maxplayers`, `Additional`, `PortIncrements` | `defaults.port`, `queryPort`, `map`, `maxPlayers`, `additional`, `portIncrement` | yes (plain values) |
| `QueryMethod = new A2S() / UT3() / FIVEM()` | `query: "a2s" / "ut3" / "fivem"` | yes |
| `Start()` command line (`$"..."`, `+`, `StringBuilder`, `param += ...`) with `_serverData.ServerPort / ServerQueryPort / ServerMap / ServerMaxPlayer / ServerName / ServerIP / ServerParam / ServerGSLT` | `run.args` using `{port} {queryPort} {map} {maxPlayers} {name} {ip} {param} {gslt}` ([argument templates](PLUGINS.md#argument-templates-runargs)) | best effort, with warnings; pieces that are C# code are left out and listed |
| `string.IsNullOrWhiteSpace(x) ? "" : "..."` in the command line | optional parts / groups (an argument is dropped when its value is empty) | yes |
| Java started through `JavaHelper` | `run.command: "java"` | yes, plus a warning (NodeGSM does not install Java) |
| `ServerGSLT` used in `Start()` | `gslt: true` | yes |
| `loginAnonymous => false` | (no equivalent: NodeGSM installs anonymously) | warning only |
| custom `Install()` / `Update()` (HTTP download, file writes, EULA prompt) | install steps (`download`, `extract`, `write`) or a `plugin.js` `install(h)` hook | **no**: a TODO lists what the C# did and the URLs it used |
| `GetLocalBuild()` / `GetRemoteBuild()` of non-SteamCMD plugins | `plugin.js` `local(dir)` / `latest(h)` | **no**: TODO |
| `CreateServerCFG()` | install `write` step or `configs[]` with a `templates/` file | **no**: TODO with the file names it writes |
| RCON, registry, firewall, any other logic | `consoles[]` of type `rcon`, `plugin.js` | **no**: warning |

**What you still do by hand** (the generated PR description lists it as unchecked boxes): add `icon.png` (square PNG, 64-256 px), add `docs` links (official first, then unofficial), review the README, write the `plugin.js` hooks for the TODO items, bump nothing (new plugins start at their own `version`), and **test it in NodeGSM** (*Games → Install plugin (folder)* → install → start → stop). The converter checks its output against the same rules as `npm run validate`, but a plugin that validates is not yet a plugin that works.

You can also run the converter yourself: it is `public/convert-cs.js` in the website repository (`require('./convert-cs').convertCs(source)` in Node, no dependencies).

## 3. Fix an outdated game
Edit the existing `plugins/<id>/plugin.json`, **bump `version`**, add yourself to `contributors`, validate, test, and describe **what changed in the game** with a link (patch notes / SteamDB / wiki).

You can also fix a game **locally without a PR**: put the edited folder in NodeGSM's plugins folder with the same id; it overrides the catalogue copy.

## 4. Rules
- Folder name equals `id`. Unique ids.
- `plugin.js` only when JSON cannot do it, and it runs with full access to the user's PC, so keep it small and readable. Plugins with a script are flagged in the catalogue.
- No binaries, no secrets. Downloads come from the official source.
- Paths are relative to the server folder, no `..`.
- Game names and icons belong to their owners; use official icons only for identification.

## 5. When the plugin format changes
The format is owned by NodeGSM (`src/main/plugins.js`). `scripts/lib/validate.js` here is a copy of its validator; when NodeGSM adds or changes a rule, port it and note the NodeGSM version in the commit message.
