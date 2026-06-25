import type { GalaxyMeta } from "./types";

function decoded(meta: GalaxyMeta): string {
  try {
    return decodeURIComponent(meta.saveSegment);
  } catch {
    return meta.saveSegment;
  }
}

/** The offline archive's landing page (index.html). */
export function landingHtml(meta: GalaxyMeta, savedDate: string): string {
  const star = decoded(meta);
  const mods = meta.mods.length ? meta.mods.join(", ") : "—";
  const card = (href: string, icon: string, title: string, desc: string) =>
    `        <a class="offline-card" href="${href}"><div class="panel-lighter">
          <h3><i class="fa-solid ${icon}"></i>${title}</h3>
          <p>${desc}</p>
        </div></a>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${meta.title} — Factorio Galaxy (offline copy)</title>
  <meta name="viewport" content="width=device-width">
  <link href="assets/img/favicon.ico" rel="icon" type="image/x-icon"/>
  <link href="assets/css/titillium-web.css" rel="stylesheet">
  <link href="assets/css/all.min.css" rel="stylesheet">
  <link href="assets/css/main.css" rel="stylesheet" type="text/css"/>
  <style>
    .offline-wrap { max-width: 1100px; margin: 32px auto; padding: 0 16px; }
    .offline-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
    .offline-card { flex: 1 1 280px; text-decoration: none; display: block; }
    .offline-card .panel-lighter { height: 100%; }
    .offline-card h3 { margin: 0 0 6px 0; }
    .offline-card i { margin-right: 8px; }
    .offline-card p { margin: 0; opacity: 0.8; }
    .offline-note { opacity: 0.7; font-size: 0.9em; margin-top: 24px; }
    dl.meta { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 0; }
    dl.meta dt { font-weight: 600; opacity: 0.8; }
    dl.meta dd { margin: 0; }
  </style>
</head>
<body>
  <div class="offline-wrap">
    <div class="panel">
      <h1 style="margin-top:0;">${meta.title}</h1>
      <p style="opacity:0.8;margin-top:-8px;">
        Offline copy of the Factorio Galaxy of Fame entry
        <strong>${meta.starName} — ${star}</strong>
      </p>
      <div class="panel-lighter" style="margin-top:8px;">
        <dl class="meta">
          <dt>Factorio version</dt><dd>${meta.version || "—"}</dd>
          <dt>Seed</dt><dd>${meta.seed || "—"}</dd>
          <dt>Time played</dt><dd>${meta.playTime || "—"}</dd>
          <dt>Mods</dt><dd>${mods}</dd>
          <dt>Uploaded</dt><dd>${meta.uploaded || "—"}</dd>
          <dt>Saved offline</dt><dd>${savedDate}</dd>
        </dl>
      </div>

      <div class="offline-grid">
${card("info.html", "fa-circle-info", "Info", "Save metadata, seed, mods, version.")}
${card("planets.html", "fa-globe", "Planets", "Interactive rendered map of each planet's factory.")}
${card("platforms.html", "fa-satellite", "Platforms", "Interactive map of each space platform.")}
${card("items.html", "fa-boxes-stacked", "Items", "Production / consumption statistics per item.")}
${card("energy.html", "fa-bolt", "Energy", "Power generation by source.")}
${card("kills.html", "fa-skull", "Kills", "Enemies killed and losses.")}
      </div>

      <p class="offline-note">
        Fully self-contained offline snapshot. The interactive Planets / Platforms
        maps must be opened through the included local web server (see
        <code>README.md</code>) because browsers block ES modules on
        <code>file://</code>. The Info / Items / Energy / Kills tables also work by
        opening the <code>.html</code> files directly.
      </p>
    </div>
  </div>
</body>
</html>
`;
}

/** README bundled inside the archive. */
export function readmeMd(meta: GalaxyMeta, savedDate: string): string {
  const star = decoded(meta);
  return `# Factorio Galaxy — offline copy of "${meta.title}"

A fully self-contained, offline snapshot of the Factorio *Galaxy of Fame* entry
**${meta.starName} — \`${star}\`** (Factorio ${meta.version || "?"}). Captured
${savedDate} with the Factorio Galaxy Archiver.

The Galaxy of Fame keeps only one upload per player, so this preserves the viewer
locally so it survives a future re-upload. **No internet connection is required.**

## How to open it

### Recommended — start the local server (needed for the interactive maps)

The **Planets** and **Platforms** tabs render the factory map with WebGL + ES
modules, which browsers refuse to load from a bare \`file://\` page.

- **macOS:** make it executable once (\`chmod +x start-server.command\`), then
  double-click **\`start-server.command\`**. It opens your browser at
  \`http://localhost:8777/\`.
- **Windows / Linux / anywhere with Python 3:** run \`python3 -m http.server 8777\`
  in this folder, then open <http://localhost:8777/index.html>.

Press **Ctrl+C** in the terminal to stop the server.

### Quick look — open files directly

\`index.html\`, \`info.html\`, \`items.html\`, \`energy.html\`, and \`kills.html\` are
plain HTML and open fine by double-clicking. Only the **map** tabs need the
local server above.

## What's included

| Page             | Content                                            |
|------------------|----------------------------------------------------|
| \`index.html\`     | Landing page with save summary + links             |
| \`info.html\`      | Save metadata: seed, mods, version, play time      |
| \`planets.html\`   | Interactive rendered map of each planet's factory  |
| \`platforms.html\` | Interactive map of each space platform             |
| \`items.html\`     | Item production / consumption statistics           |
| \`energy.html\`    | Power generation by source                         |
| \`kills.html\`     | Enemies killed and units lost                      |

Everything else (icons, fonts, the three.js map viewer, and the rendered map
data \`assets/chartbundles/chartbundle.zip\`) lives under \`assets/\`.
`;
}

/** macOS double-click launcher bundled inside the archive. */
export function startServerCommand(): string {
  return `#!/bin/bash
# Double-click this file (macOS) to serve the offline copy. It starts a tiny
# local web server and opens your browser. Press Ctrl+C to stop.
cd "$(dirname "$0")" || exit 1

PORT=8777
while lsof -i :"$PORT" >/dev/null 2>&1; do PORT=$((PORT + 1)); done

URL="http://localhost:$PORT/index.html"
echo "Serving offline Factorio Galaxy copy at: $URL"
echo "Press Ctrl+C to stop."

( sleep 1; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) &

exec python3 -m http.server "$PORT"
`;
}
