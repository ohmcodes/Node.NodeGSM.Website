# NodeGSM Website

The website of [NodeGSM](https://ohmcodes.github.io/Node.NodeGSM.Website/): **Home**, **Features & changelog**, **Plugins** and **Download**. Dark mode, no framework, no dependencies (Node 18+ for the backend).

This repository is independent of the app and of the plugin list:

| | Where |
|---|---|
| The app | https://github.com/ohmcodes/Node.NodeGSM |
| The plugin list (games) | https://github.com/ohmcodes/Node.NodeGSM.Catalogue (the site only **reads** it) |
| This site, its ratings / comments / community info | here |

## Activity feed
`/feed.html` lists recent activity (new and updated plugins, ratings, comments, community info edits, downloads) with type filters, plus a **Most downloaded** list. It needs the site server, because activity comes from every visitor (in local-only mode the page says so). Events live in `community.json`; the page refreshes every minute.

## Issue templates
`.github/ISSUE_TEMPLATE/report-issues.md` is a guided template for website problems (page, steps, expected vs actual, browser); `config.yml` points app problems to the app repository and game requests to the Catalogue. The footer's "Report an issue" link opens the app repository's `report-issues.md` template.

## Contributing page
`public/contributing.html` renders `public/data/contributing.md`, a copy of the Catalogue repository's `CONTRIBUTING.md` (links in it are rewritten to the Catalogue repo). `npm run sync:app` refreshes the copy from `../Node.NodeGSM.Catalogue`.

## Plugins page
The list is paginated: a **Per page** select (10, 20, 50 or 100; remembered in the browser, default 20) and page buttons under the cards; searching, filtering or sorting goes back to page 1.

Each plugin is a card with the **image** of the game, **title**, **maker** (and contributor count), **short description** and **rating**. Click a card for more info: full description, README, documentation links, ports, config files, screenshots, download, comments and the community-editable info.

- **Plugin data** (name, maker, summary, image, README, zip) comes from the Catalogue: `index.json` for the list, `plugins/<id>.json` for the detail of the opened plugin. Set the address in `public/config.js` → `CATALOG_URL` (default `https://ohmcodes.github.io/Node.NodeGSM.Catalogue/`).
- **Website data** (ratings, comments, community info, download counts) is stored by this site's backend (`server/`), never in the plugin repository.

## Run it
```
npm start        # site + community API on http://localhost:8080
npm test         # backend + converter tests (converter output is validated with a sibling ..\Node.NodeGSM.Catalogue checkout or NODEGSM_CATALOGUE; skipped with a message when absent)
npm run sync:app # refresh Features / changelog data from a NodeGSM checkout (default ../Node.NodeGSM, falling back to the old ../Node.WGSM2026 folder name)
```
`python -m http.server --directory public` also works for the static part, but then ratings and comments stay in the visitor's browser (no backend).

To try an unpublished catalogue: build it in the Catalogue repo (`npm run build`), serve `public/` there with CORS (or copy it into this repo's `public/catalogue/`) and set `CATALOG_URL` accordingly.

## Community backend (`server/`)
`server.js` serves the static site **and** the API, with no dependencies. Data is one JSON file (`server/data/community.json`, atomic writes, gitignored): back it up. IPs are only stored hashed.

```
PORT=8080 ADMIN_TOKEN=<long random> node server/server.js
```
| Env | |
|---|---|
| `PORT`, `DATA_DIR` | listen port; where `community.json` lives |
| `CATALOG_INDEX` | the Catalogue's `index.json` (https URL, refreshed every 10 min, or a local file). Only its plugin ids can receive community data; if it cannot be read any valid id is accepted. Default: the official catalogue |
| `ADMIN_TOKEN` | enables moderation; unset = disabled |
| `ALLOWED_ORIGINS` | CORS allow-list when the API is on another origin (default `*`) |
| `TRUST_PROXY=1` | take the client IP from `X-Forwarded-For` (only behind your own reverse proxy) |
| `SERVE_STATIC=0` | API only |
| `GITHUB_TOKEN` | optional, enables the **automated pull request** of approved converter submissions (see below). Never logged, never returned |
| `GITHUB_REPO` | `owner/name` of the Catalogue, default `ohmcodes/Node.NodeGSM.Catalogue` (`GITHUB_BASE_BRANCH`, default `main`) |
| `GITHUB_API_URL` | default `https://api.github.com` (https only; plain http is accepted for localhost, which the tests use with a fake GitHub) |

Site config `API_URL`: `'auto'` (default; use `./api` if the server answers, else local-only), an absolute URL (API on another host), or `''` (force local-only).

### API (JSON, all under `/api`)
| Method + path | Body | Notes |
|---|---|---|
| `GET /health` | | `{ ok, service:'nodegsm-community', admin, submissions }` |
| `GET /ratings` | | `{ "<id>": { avg, count, downloads } }` for the plugin list |
| `GET /feed?type=&limit=` | | activity feed: `{ events:[{t,at,id,...}], topDownloads:[{id,downloads}], totals }`, newest first (`t` = `new`, `update`, `rating`, `comment`, `info`, `download`; `type` filters, `limit` max 100). Holds the last 300 events and never contains client ids or IP hashes. New / updated plugins are detected by comparing two reads of the Catalogue `index.json` (the first read is only a baseline) |
| `GET /feed?type=&limit=` | | activity feed: `{ events:[{t,at,id,...}], topDownloads:[{id,downloads}], totals }`, newest first (`t` = `new`, `update`, `rating`, `comment`, `info`, `download`; `type` filters, `limit` max 100). Keeps the last 300 events; never contains client ids or IP hashes. New / updated plugins are detected by comparing two reads of the Catalogue `index.json` (the first read is only a baseline, so it creates no events) |
| `GET /plugins/:id/community` | | `{ rating:{avg,count,mine}, downloads, comments:[{id,name,text,at}], info:{text,rev,by,at,summary,history} }` |
| `PUT /plugins/:id/rating` | `{ value: 0-5 }` | one rating per `X-Client-Id` (random id the browser generates); `0` removes it (in the drawer: click your star again or "remove it") |
| `POST /plugins/:id/comments` | `{ text, name }` | max 2000 chars, max 2 links, duplicates rejected |
| `PUT /plugins/:id/info` | `{ text, name, summary }` | Markdown, max 20000 chars; every save is a revision (last 50 kept) |
| `POST /plugins/:id/download` | | download counter, once per IP per plugin per 10 min |
| `DELETE /plugins/:id/comments/:cid` | | admin (`Authorization: Bearer <ADMIN_TOKEN>`) |
| `POST /plugins/:id/info/revert` | `{ rev }` | admin: restore an older info revision |
| `POST /submissions` | `{ source` or `pluginJson, id?, edits?, contact?, consent:true }` | converter submission, see below |
| `GET /submissions/:id` | | public status `{ id, status, prUrl?, reason?, updatedAt }` |
| `GET /submissions` | | admin: all submissions with contents and warnings |
| `POST /submissions/:id/approve` or `/reject` | `{ reason }` (reject) | admin |

Protections: per-IP rate limits (comments 5/10 min, info edits 6/10 min, ratings 30/h), 64 KB body limit, control characters stripped, only catalogue plugin ids accepted. All user text is escaped on render; Markdown goes through an allow-list renderer (no raw HTML, http(s) links only).
Not built yet: accounts, per-IP bans, a moderation UI (use the admin endpoints), a stronger spam filter. Ratings are per browser id, so they can be gamed by clearing storage.

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
`POST /api/submissions` takes the C# `source` (the server **converts it again**, the browser result is not trusted) or a `pluginJson`, the `id`, optional `edits` `{ name, author, exe }`, optional `contact` and `consent: true`. Rules: source max 200 KB, `plugin.json` max 64 KB, text only (control characters / invalid UTF-8 rejected), `id` must match `^[a-z0-9][a-z0-9_-]{1,31}$` and must exist neither in the catalogue index nor in another non-rejected submission (409), at most **200 pending** submissions (503), and per hashed IP **1 per 10 minutes and 3 per day** (only accepted submissions use the quota; every attempt also counts against a coarse flood guard).

**Only `plugin.json` + `README.md` are ever accepted.** There is no field for a `plugin.js`, and `plugin.json` is checked against a strict allow-list: install must be `steamcmd` or `manual` (no `steps`, `script`, `download`, `run`), no `env`, no unknown keys, `run.exe` relative without `..`, `run.command` a plain program name, docs links `http(s)` only. Anything richer needs a normal pull request to the Catalogue where it is reviewed by hand.

Status flow: `pending` -> `approved` (manual mode) or `pr-opened` (automatic) or `rejected`. `GET /api/submissions/:id` is public by id (random `sub_<12 hex>`, only the submitter knows it) and returns the status, the PR link and the rejection reason, **never the contents or the contact**.

**Moderation workflow** (admin = `Authorization: Bearer <ADMIN_TOKEN>`):
1. `GET /api/submissions` (or the simple page `/admin-submissions.html`, which renders everything with `textContent`) lists submissions with the generated `plugin.json`, README, PR body, warnings and TODOs. Read them as untrusted text.
2. `POST /api/submissions/<id>/reject` with `{ "reason": "..." }`, or `POST /api/submissions/<id>/approve`.
3. **With `GITHUB_TOKEN`** approval creates the branch `submit/<id>-<random>` from `main`, commits **only** `plugins/<id>/plugin.json` and `plugins/<id>/README.md` and opens a **draft** pull request titled *Add <name> plugin (converted from WindowsGSM)* whose body says it came from the website converter and still needs an `icon.png` and docs / README review. The status becomes `pr-opened`. If GitHub fails halfway the half-made branch is deleted, the submission stays `approved` (with `lastError`) and approving again retries.
4. **Without a token** approval marks it `approved` and returns the two files and the PR body so you can open the PR yourself.

```
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://site/api/submissions
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://site/api/submissions/sub_0123456789ab/approve
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"reason":"duplicate"}' https://site/api/submissions/sub_0123456789ab/reject
```
Use a **fine-grained token limited to the Catalogue repository** with *Contents* and *Pull requests* read/write and nothing else. The token only travels in the `Authorization` header of requests to `GITHUB_API_URL`, is redacted from error messages and is never returned by any route.

**Hosting note:** option 3 needs this Node server (`server/server.js`) running. The production site on GitHub Pages is static, so there the option is disabled automatically (the page asks `/api/health`; set `API_URL` in `public/config.js` to a backend on another host, with `ALLOWED_ORIGINS` there, to enable it).

**Privacy:** the contact is optional, stored as plain text with the submission and visible only to the owners (never in the status route, never in the pull request). The IP address is stored only hashed (the same 16-character SHA-256 prefix as for comments) for rate limits. The submitted C# is **not stored**, only its SHA-256 and size; the generated `plugin.json` / README / PR body are kept until the data file is cleaned. To delete a submission remove it from `submissions` in `server/data/community.json` while the server is stopped.

**Security notes:** submission content is untrusted (it comes from strangers): it is only ever stored and returned as text and rendered with `textContent`; the converter parses text and never runs it; the PR body never contains the contact; the admin and status routes are separate; the GitHub address must be `https` (except localhost) so the token cannot go out in clear text. Not built: captcha, e-mail notification, a submission edit flow.

## Deploy
- **Full site (recommended):** run `server/server.js` behind a reverse proxy with HTTPS. One process serves pages and API.
- **Static only:** `.github/workflows/site.yml` publishes `public/` to GitHub Pages (enable Pages → GitHub Actions). Pages cannot run the backend, so host the API elsewhere and set `API_URL` in `public/config.js` and `ALLOWED_ORIGINS` on it.

## Files
`public/` (`index.html`, `features.html`, `download.html`, `plugins.html` + `plugins.js`, `feed.html` + `feed.js`, `feed.html` + `feed.js`, `contributing.html`, `convert.html` + `convert.js` + `convert-cs.js`, `admin-submissions.html` + `.js`, `layout.js`, `community.js`, `style.css`, `config.js`, `data/site.json`, `data/contributing.md`), `server/` (`server.js`, `store.js`, `submissions.js`, `test.js`, `test-convert.js`, `test-submissions.js`), `test/fixtures/` (C# samples), `scripts/sync-app.js`.

## License
MIT. Game names and icons belong to their owners.
