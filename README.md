# Galaxy Keeper

The Factorio **Galaxy of Fame** keeps only **one uploaded save per player** — upload
a new save and the previous one's online viewer (the per-save Info / Planets /
Platforms / Items / Energy / Kills pages, including the interactive WebGL factory
map) is gone for good.

This web app turns any Galaxy of Fame link into a **complete, self-contained
offline copy** you can download as a `.zip` and keep forever. Paste a galaxy URL,
watch it collect the pages, ~370 icons, fonts, the three.js map viewer and the
rendered map bundle, and download the result.

Live at **[galaxykeeper.frcy.org](https://galaxykeeper.frcy.org)**.

## How it works

```
browser SPA  ──fetch /proxy?url=…──▶  Cloudflare Worker  ──▶  factorio.com / CDNs
   │  parse pages, rewrite URLs,         (allowlisted server-side fetch)
   │  zip with fflate, download
   ▼
SpaceAge2-galaxy-offline.zip
```

A **pure browser SPA can't build this** — `factorio.com` sends no CORS headers,
and `chartbundles.cdn.factorio.com` (the map tiles + icons) only allows
`https://factorio.com` as an origin, so the browser blocks every cross-origin
read. The fetching therefore happens in a **Cloudflare Worker** (`worker/`), which
acts as an allowlisted proxy where CORS doesn't apply. The Worker is deliberately
a thin per-asset proxy rather than a fetch-and-zip endpoint: that keeps each call
to a single subrequest (well within the free-tier limit even for ~400 assets) and
does the zipping client-side.

The SPA (this repo's root) does the heavy lifting: it parses the pages, discovers
every asset (icons, libraries, fonts, and the `chartbundle.zip` map data),
rewrites every reference to a local path, and packs it all with
[`fflate`](https://github.com/101arrowz/fflate).

### Opens straight from `file://` — no server

The generated archive runs by double-clicking `index.html`; the interactive maps
work too. Browsers block ES modules and `fetch()` on `file://`, so instead of the
site's ES-module map viewer the archive ships a **single classic (non-module)
bundle** of the viewer (`viewer/` → `assets/js/viewer.js`, three.js + zip.js +
the ported chartbundle logic) and **embeds the map data as base64**
(`assets/chartbundles/chartbundle-data.js`) so nothing is fetched at view time.
The viewer bundle is built by `npm run build:viewer` and the SPA fetches it
(`/viewer.js`) to drop into each archive.

### What's in the downloaded archive

`index.html` (a landing page) + the six rewritten tab pages + `README.md`, plus
everything under `assets/` (icons, fonts, CSS, the bundled `js/viewer.js`, and the
embedded `chartbundles/chartbundle-data.js`).

## Develop

```sh
npm install                # root SPA deps
cd worker && npm install && cd ..

# Two terminals (HMR + the proxy):
npm run dev:worker         # wrangler dev on :8787 (the /proxy data collector)
npm run dev                # vite on :5173, proxies /proxy -> :8787
```

Or run a single prod-like server (no HMR) — build first so the Worker has assets:

```sh
npm run build && (cd worker && npm run dev)   # serves dist/ + /proxy on :8787
```

`npm run lint` runs oxlint + oxfmt + `vue-tsc`. `npm test` runs a live integration
test that builds the sample archive end-to-end and checks it against the committed
reference (network + the local `reference/` fixture; not run in CI).

## Build & deploy

```sh
npm run deploy             # builds the SPA, then `wrangler deploy` from worker/
```

The Worker serves the built `dist/` as static assets and handles `/proxy`; it's
configured (`worker/wrangler.jsonc`) to deploy to the custom domain
**galaxykeeper.frcy.org**.

## Project layout

```
.                     Vue 3 + Vite + Tailwind v4 SPA (root)
  src/App.vue         UI: landing, progress, download
  src/lib/            framework-agnostic archiving core (also unit-tested in Node)
  worker/             Cloudflare Worker: allowlisted CORS proxy + static assets
```

## Notes

- Only public Galaxy of Fame data is fetched; the proxy is restricted to a fixed
  host allowlist (factorio.com + its CDNs) to avoid being an open relay.
- Not affiliated with Wube Software.
