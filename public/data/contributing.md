# Contributing - add or fix a game with a pull request

Every game is a **plugin**: one folder in [`plugins/`](plugins). Adding a game or fixing an outdated one is a pull request that only touches that folder. No app code, no compiling.

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
