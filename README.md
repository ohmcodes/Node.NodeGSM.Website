# NodeGSM Website

The website of [NodeGSM](https://github.com/ohmcodes/Node.WGSM2026): **Home**, **Features & changelog**, **Plugins** and **Download**. Dark mode, no framework, no dependencies (Node 18+ for the backend).

This repository is independent of the app and of the plugin list:

| | Where |
|---|---|
| The app | https://github.com/ohmcodes/Node.WGSM2026 |
| The plugin list (games) | https://github.com/ohmcodes/Node.NodeGSM.Catalogue (the site only **reads** it) |
| This site, its ratings / comments / community info | here |

## Plugins page
Each plugin is a card with the **image** of the game, **title**, **maker** (and contributor count), **short description** and **rating**. Click a card for more info: full description, README, documentation links, ports, config files, screenshots, download, comments and the community-editable info.

- **Plugin data** (name, maker, summary, image, README, zip) comes from the Catalogue: `index.json` for the list, `plugins/<id>.json` for the detail of the opened plugin. Set the address in `public/config.js` → `CATALOG_URL` (default `https://ohmcodes.github.io/Node.NodeGSM.Catalogue/`).
- **Website data** (ratings, comments, community info, download counts) is stored by this site's backend (`server/`), never in the plugin repository.

## Run it
```
npm start        # site + community API on http://localhost:8080
npm test         # backend tests
npm run sync:app # refresh Features / changelog data from a NodeGSM checkout (default ../Node.WGSM2026)
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

Site config `API_URL`: `'auto'` (default; use `./api` if the server answers, else local-only), an absolute URL (API on another host), or `''` (force local-only).

### API (JSON, all under `/api`)
| Method + path | Body | Notes |
|---|---|---|
| `GET /health` | | `{ ok, service:'nodegsm-community' }` |
| `GET /ratings` | | `{ "<id>": { avg, count, downloads } }` for the plugin list |
| `GET /plugins/:id/community` | | `{ rating:{avg,count,mine}, downloads, comments:[{id,name,text,at}], info:{text,rev,by,at,summary,history} }` |
| `PUT /plugins/:id/rating` | `{ value: 1-5 }` | one rating per `X-Client-Id` (random id the browser generates) |
| `POST /plugins/:id/comments` | `{ text, name }` | max 2000 chars, max 2 links, duplicates rejected |
| `PUT /plugins/:id/info` | `{ text, name, summary }` | Markdown, max 20000 chars; every save is a revision (last 50 kept) |
| `POST /plugins/:id/download` | | download counter, once per IP per plugin per 10 min |
| `DELETE /plugins/:id/comments/:cid` | | admin (`Authorization: Bearer <ADMIN_TOKEN>`) |
| `POST /plugins/:id/info/revert` | `{ rev }` | admin: restore an older info revision |

Protections: per-IP rate limits (comments 5/10 min, info edits 6/10 min, ratings 30/h), 64 KB body limit, control characters stripped, only catalogue plugin ids accepted. All user text is escaped on render; Markdown goes through an allow-list renderer (no raw HTML, http(s) links only).
Not built yet: accounts, per-IP bans, a moderation UI (use the admin endpoints), a stronger spam filter. Ratings are per browser id, so they can be gamed by clearing storage.

## Deploy
- **Full site (recommended):** run `server/server.js` behind a reverse proxy with HTTPS. One process serves pages and API.
- **Static only:** `.github/workflows/site.yml` publishes `public/` to GitHub Pages (enable Pages → GitHub Actions). Pages cannot run the backend, so host the API elsewhere and set `API_URL` in `public/config.js` and `ALLOWED_ORIGINS` on it.

## Files
`public/` (`index.html`, `features.html`, `download.html`, `plugins.html` + `plugins.js`, `layout.js`, `community.js`, `style.css`, `config.js`, `data/site.json`), `server/` (`server.js`, `store.js`, `test.js`), `scripts/sync-app.js`.

## License
MIT. Game names and icons belong to their owners.
