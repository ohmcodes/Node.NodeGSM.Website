# NodeGSM Website

The website of [NodeGSM](https://ohmcodes.github.io/Node.NodeGSM.Website/): **Home**, **Features & changelog**, **Plugins** and **Download**. Dark mode, no framework, no dependencies (Node 18+ for the backend).

This repository is independent of the app and of the plugin list:

| | Where |
|---|---|
| The app | https://github.com/ohmcodes/Node.NodeGSM |
| The plugin list (games) | https://github.com/ohmcodes/Node.NodeGSM.Catalogue (the site only **reads** it) |
| The pages (this repository) | here: static files, hosted on GitHub Pages or any static host |
| The API that **stores** the site's data (ratings, comments, community info, activity feed, downloads, converter submissions) | https://github.com/ohmcodes/Node.NodeGSM.WebsiteServer |

## Activity feed
`/feed.html` lists recent activity (new and updated plugins, ratings, comments, community info edits, downloads) with type filters, plus a **Most downloaded** list. It needs the WebsiteServer API, because activity comes from every visitor (without it the page says so). The page refreshes every minute.

## Issue templates
`.github/ISSUE_TEMPLATE/report-issues.md` is a guided template for website problems (page, steps, expected vs actual, browser); `config.yml` points app problems to the app repository and game requests to the Catalogue. The footer's "Report an issue" link opens the app repository's `report-issues.md` template.

## Contributing page
`public/contributing.html` renders `public/data/contributing.md`, a copy of the Catalogue repository's `CONTRIBUTING.md` (links in it are rewritten to the Catalogue repo). `npm run sync:app` refreshes the copy from `../Node.NodeGSM.Catalogue`.

## Plugins page
The list is paginated: a **Per page** select (10, 20, 50 or 100; remembered in the browser, default 20) and page buttons under the cards; searching, filtering or sorting goes back to page 1.

Each plugin is a card with the **image** of the game, **title**, **maker** (and contributor count), **short description** and **rating**. Click a card for more info: full description, README, documentation links, ports, config files, screenshots, download, comments and the community-editable info.

- **Plugin data** (name, maker, summary, image, README, zip) comes from the Catalogue: `index.json` for the list, `plugins/<id>.json` for the detail of the opened plugin. Set the address in `public/config.js` → `CATALOG_URL` (default `https://ohmcodes.github.io/Node.NodeGSM.Catalogue/`).
- **Website data** (ratings, comments, community info, download counts, activity feed) is stored by the WebsiteServer API (https://github.com/ohmcodes/Node.NodeGSM.WebsiteServer), never in the plugin repository.

## Run it
```
npm start        # static preview on http://localhost:8080 (scripts/serve.js, no cache)
npm test         # converter tests (output is validated with a sibling ..\Node.NodeGSM.Catalogue checkout or NODEGSM_CATALOGUE; skipped with a message when absent)
npm run sync:app # refresh Features / changelog data from a NodeGSM checkout (default ../Node.NodeGSM, falling back to the old ../Node.WGSM2026 folder name)
```
`python -m http.server --directory public` works too. Ratings, comments, the feed and submissions need the API (below); without it the pages still work and ratings / comments stay in the visitor's own browser.

To try an unpublished catalogue: build it in the Catalogue repo (`npm run build`), serve `public/` there with CORS (or copy it into this repo's `public/catalogue/`) and set `CATALOG_URL` accordingly.

## Community data (the API)
Ratings, comments, community info, download counts, the activity feed and converter submissions are stored by the **API in [Node.NodeGSM.WebsiteServer](https://github.com/ohmcodes/Node.NodeGSM.WebsiteServer)** (Docker, port 3013, persistent volume). This repository has no backend. Its endpoints, settings, moderation and backup are documented there.

Connect the site to it in `public/config.js`:

| `API_URL` | |
|---|---|
| `'https://api.example.com/api'` | the API on another host (set `ALLOWED_ORIGINS` there to this site's origin, e.g. `https://ohmcodes.github.io`). The site is https, so the API must be https too |
| `'http://localhost:3013/api'` | the API on your own machine, for trying things out (works in your browser only) |
| `'auto'` (default) | `./api` on the same origin, for a reverse proxy that forwards `/api` to the API; falls back to local-only mode when nothing answers |
| `''` | force local-only mode (data stays in the visitor's browser) |

To check the connection, type `Community.mode` in the browser console: `"api"` = shared data, `"local"` = the API was not reachable (wrong URL, origin not allowed, mixed content).

## WindowsGSM plugin converter (`convert.html`)
People migrating from WindowsGSM paste (or upload, max 200 KB) the C# file of a plugin on **`/convert.html`** and get a NodeGSM `plugin.json`, a `README.md` and a pull request description. The converter is `public/convert-cs.js` (pure JavaScript, zero dependencies, UMD: it runs in the browser and in Node, and it **only reads text, it never compiles or executes the C#**). The format it writes is described in the Catalogue's [PLUGINS.md](https://github.com/ohmcodes/Node.NodeGSM.Catalogue/blob/main/PLUGINS.md); what converts and what does not is in the Catalogue's [CONTRIBUTING.md](https://github.com/ohmcodes/Node.NodeGSM.Catalogue/blob/main/CONTRIBUTING.md#migrating-a-windowsgsm-c-plugin).

The page shows what was detected (editable `id`, name, author, executable), the warnings / TODOs (real C# code such as a custom `Install()` is **never guessed**: it is listed so a human can write the `plugin.js` hook) and the three files with Copy / Download buttons and a dependency-free `.zip` of the plugin folder. A radio choice then says what to do with the result:

| Option | What happens |
|---|---|
| **1. Convert only** | Copy / download. Nothing leaves the browser. |
| **2. Convert + guided pull request** | Step list: fork the Catalogue, a pre-filled GitHub *new file* link for `plugins/<id>/plugin.json` and `README.md` (the text goes in the link only when it stays short, otherwise copy and paste), the PR body to copy, a checklist for `icon.png`, `docs` links and the README. Needs a GitHub account. |
| **3. Automated: send to the owners** | No GitHub account. Optional contact (plain text, max 100 characters), a consent checkbox (*"I agree this plugin may be published under the repository licence"*: the Catalogue is MIT), **Submit**, then a submission id and a status check. Disabled with an explanation when the site has no backend (see Hosting). |

Nothing is sent anywhere before the user presses **Submit** in option 3.

### Submissions backend (option 3)
`POST /api/submissions` is handled by the WebsiteServer API: it converts the C# again (the browser result is not trusted), accepts only `plugin.json` + `README.md`, rate limits per hashed IP, and lets the owners approve or reject (approval can open a draft pull request on the Catalogue when the API has a `GITHUB_TOKEN`). The rules, the moderation workflow and the privacy notes are in its README. `public/admin-submissions.html` is the simple moderation page (it asks for the admin token and renders everything with `textContent`).

**Converter copy:** the API keeps a copy of `public/convert-cs.js` (`server/lib/convert-cs.js`). After changing the converter here, run `npm run sync:converter` in the WebsiteServer repo (its CI fails when the copy is out of date).

## Deploy
- **The site:** `.github/workflows/site.yml` tests and publishes `public/` to GitHub Pages (enable Pages -> GitHub Actions). Any static host works too.
- **The data:** run the API from [Node.NodeGSM.WebsiteServer](https://github.com/ohmcodes/Node.NodeGSM.WebsiteServer) (`docker compose up -d --build`, port 3013, data in a persistent volume) and point `API_URL` at it. GitHub Pages cannot store data.

## Files
`public/` (`index.html`, `features.html`, `download.html`, `plugins.html` + `plugins.js`, `feed.html` + `feed.js`, `contributing.html`, `convert.html` + `convert.js` + `convert-cs.js`, `admin-submissions.html` + `.js`, `layout.js`, `community.js`, `style.css`, `config.js`, `data/site.json`, `data/contributing.md`), `test/` (`test-convert.js`, `fixtures/` C# samples), `scripts/` (`serve.js` preview server, `sync-app.js`).

## License
MIT. Game names and icons belong to their owners.
