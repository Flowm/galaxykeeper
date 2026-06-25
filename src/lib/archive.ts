import { zip, type AsyncZippable } from "fflate";

import { collect } from "./collect";
import type { Fetcher } from "./fetcher";
import { patchChartbundleJs, rewriteCss, rewriteFactorioJs, rewritePage } from "./rewrite";
import { landingHtml, readmeMd, startServerCommand } from "./templates";
import { TABS, type ArchiveResult, type OnProgress } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Already-compressed payloads are stored (level 0); text is deflated.
const STORE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "zip", "woff", "woff2", "ttf", "otf"]);

function zipAsync(files: AsyncZippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

/** Build the complete offline archive for a galaxy save URL. */
export async function buildArchive(input: string, fetcher: Fetcher, onProgress?: OnProgress): Promise<ArchiveResult> {
  const collected = await collect(input, fetcher, onProgress);
  const { meta, pages, files, sources, importmap, chartbundleOpts, chartbundleJsImport, iconCount } = collected;

  onProgress?.({ step: "Building archive", loaded: 0, total: 1 });

  const tree = new Map<string, Uint8Array>(files);

  // Patch the map viewer for offline use.
  const cb = tree.get("assets/js/chartbundle.js");
  if (cb) tree.set("assets/js/chartbundle.js", encoder.encode(patchChartbundleJs(decoder.decode(cb))));

  // Local-ise factorio.js' rocket image.
  const fj = tree.get("assets/js/factorio.js");
  if (fj) tree.set("assets/js/factorio.js", encoder.encode(rewriteFactorioJs(decoder.decode(fj))));

  // Rewrite url() refs in every stylesheet.
  for (const [local, absUrl] of sources) {
    if (local.startsWith("assets/css/") && local.endsWith(".css")) {
      tree.set(local, encoder.encode(rewriteCss(decoder.decode(tree.get(local)!), local, absUrl)));
    }
  }

  // Rewrite each tab page.
  const ctx = { saveSegment: meta.saveSegment, importmap, chartbundleOpts, chartbundleJsImport };
  for (const tab of TABS) {
    const html = pages.get(tab);
    if (html) tree.set(`${tab}.html`, encoder.encode(rewritePage(html, ctx)));
  }

  // Generated landing page, README, and launcher.
  const savedDate = new Date().toISOString().slice(0, 10);
  tree.set("index.html", encoder.encode(landingHtml(meta, savedDate)));
  tree.set("README.md", encoder.encode(readmeMd(meta, savedDate)));
  tree.set("start-server.command", encoder.encode(startServerCommand()));

  // Zip it.
  const zippable: AsyncZippable = {};
  for (const [path, data] of tree) {
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    zippable[path] = [data, { level: STORE_EXT.has(ext) ? 0 : 6 }];
  }
  const bytes = await zipAsync(zippable);

  onProgress?.({ step: "Done", loaded: 1, total: 1 });

  const safeTitle = (meta.title || "galaxy").replace(/[^\w.-]+/g, "_");
  return { bytes, filename: `${savedDate}-factorio-${safeTitle}.zip`, meta, fileCount: tree.size, iconCount };
}
