# Factorio Galaxy Archiver

The Factorio **Galaxy of Fame** keeps only **one uploaded save per player** — upload
a new save and the previous one's online viewer (the per-save Info / Planets /
Platforms / Items / Energy / Kills pages, including the interactive WebGL factory
map) is gone for good.

This is a small web app that turns any Galaxy of Fame link into a **complete,
self-contained offline copy** you can download as a `.zip` and keep forever.

- **SPA** (Vue 3 + Vite + Tailwind) — paste a galaxy URL, watch progress, download.
- **Cloudflare Worker** (`worker/`) — an allowlisted server-side proxy that
  collects the data (the source hosts block cross-origin browser fetches).

> Status: in active development. See `docs`/commit history for stage progress.

## Develop

```sh
npm install            # root SPA deps
cd worker && npm install && cd ..

# two terminals:
npm run dev:worker     # wrangler dev on :8787 (the /proxy data collector)
npm run dev            # vite on :5173, proxies /proxy -> :8787
```

## Build & deploy

```sh
npm run build          # -> dist/
npm run deploy         # builds, then `wrangler deploy` from worker/
```

Deploys the Worker (which serves `../dist` as static assets) to
**factorio-galaxy-archiver.frcy.org**.
