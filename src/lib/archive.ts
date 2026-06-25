import { zip, type AsyncZippable } from "fflate";

import { collect } from "./collect";
import type { Fetcher } from "./fetcher";
import { rewriteCss, rewriteFactorioJs, rewritePage } from "./rewrite";
import { landingHtml, readmeMd } from "./templates";
import { TABS, type ArchiveResult, type OnProgress } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Already-compressed payloads are stored (level 0); text is deflated.
const STORE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "zip", "woff", "woff2", "ttf", "otf"]);

export interface BuildOptions {
  /** The bundled classic map viewer (public/viewer.js), embedded in the archive. */
  viewerJs: Uint8Array;
  onProgress?: OnProgress;
}

function zipAsync(files: AsyncZippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Build the complete, file://-openable offline archive for a galaxy save URL. */
export async function buildArchive(input: string, fetcher: Fetcher, options: BuildOptions): Promise<ArchiveResult> {
  const { viewerJs, onProgress } = options;
  const collected = await collect(input, fetcher, onProgress);
  const { meta, pages, files, sources, chartbundleOpts, iconCount } = collected;

  onProgress?.({ step: "Building archive", loaded: 0, total: 1 });

  const tree = new Map<string, Uint8Array>(files);

  // Replace the live ES-module map viewer with the bundled classic one, and
  // embed the map bundle as base64 so nothing is fetched at view time.
  const zipBytes = tree.get("assets/chartbundles/chartbundle.zip");
  if (zipBytes) {
    tree.delete("assets/chartbundles/chartbundle.zip");
    const dataJs = `window.__CHARTBUNDLE_DATA__=${JSON.stringify(uint8ToBase64(zipBytes))};`;
    tree.set("assets/chartbundles/chartbundle-data.js", encoder.encode(dataJs));
  }
  tree.set("assets/js/viewer.js", viewerJs);

  // Local-ise factorio.js' rocket image.
  const fj = tree.get("assets/js/factorio.js");
  if (fj) tree.set("assets/js/factorio.js", encoder.encode(rewriteFactorioJs(decoder.decode(fj))));

  // Rewrite url() refs in every stylesheet.
  for (const [local, absUrl] of sources) {
    if (local.startsWith("assets/css/") && local.endsWith(".css")) {
      tree.set(local, encoder.encode(rewriteCss(decoder.decode(tree.get(local)!), local, absUrl)));
    }
  }

  // The viewer config for the classic init call: local icon mirror, no fetch URL.
  const initOpts = { ...chartbundleOpts, cdn: "assets/cdn" };
  delete (initOpts as { url?: string }).url;
  const ctx = { saveSegment: meta.saveSegment, viewerInit: JSON.stringify(initOpts) };

  for (const tab of TABS) {
    const html = pages.get(tab);
    if (html) tree.set(`${tab}.html`, encoder.encode(rewritePage(html, ctx)));
  }

  // Generated landing page + README.
  const savedDate = new Date().toISOString().slice(0, 10);
  tree.set("index.html", encoder.encode(landingHtml(meta, savedDate)));
  tree.set("README.md", encoder.encode(readmeMd(meta, savedDate)));

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
