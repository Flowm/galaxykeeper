import type { Fetcher } from "./fetcher";
import { parseGalaxyUrl } from "./galaxyUrl";
import { absolutize, mapUrlToLocal } from "./paths";
import { pool } from "./pool";
import { TABS, type ChartbundleOpts, type Collected, type GalaxyMeta, type OnProgress, type TabName } from "./types";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function txt(el: Element | null): string {
  return (el?.textContent ?? "").trim();
}

/** Extract the balanced `{...}` object literal starting at/after `from`. */
function balancedObject(text: string, from: number): string {
  const start = text.indexOf("{", from);
  if (start < 0) throw new Error("viewer config not found");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced viewer config");
}

interface ViewerConfig {
  opts: ChartbundleOpts;
  importmap: Record<string, string>;
  chartbundleJsImport: string;
}

function parseViewer(html: string): ViewerConfig {
  const idx = html.indexOf("initChartbundleViewer(");
  if (idx < 0) throw new Error("No interactive map found on this save — is the link a Galaxy of Fame page?");
  const obj = JSON.parse(balancedObject(html, idx)) as { cdn: string; url: string; icons?: Record<string, string> };

  const imMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  const importmap = imMatch ? ((JSON.parse(imMatch[1]!) as { imports?: Record<string, string> }).imports ?? {}) : {};

  const cbMatch = html.match(/from\s*["']([^"']*\/chartbundle\.js[^"']*)["']/);
  const chartbundleJsImport = cbMatch?.[1] ?? "/static/chartbundle/chartbundle.js";

  return { opts: { cdn: obj.cdn, url: obj.url, icons: obj.icons ?? {} }, importmap, chartbundleJsImport };
}

function parseMeta(html: string, saveSegment: string): GalaxyMeta {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const dl = new Map<string, string>();
  let uploadedDd: Element | null = null;
  for (const dt of doc.querySelectorAll("dt")) {
    const dd = dt.nextElementSibling;
    if (dd?.tagName === "DD") {
      const key = txt(dt).replace(/:$/, "");
      dl.set(key, txt(dd));
      if (key.startsWith("Uploaded")) uploadedDd = dd;
    }
  }
  const mods = [...doc.querySelectorAll("dd ul li")].map((li) => txt(li)).filter(Boolean);
  const uploadedIso = uploadedDd?.getAttribute("title") ?? "";
  const starName = txt(doc.querySelector("#tabs-header h2 span")) || txt(doc.querySelector("h2 span")) || decodeURIComponent(saveSegment);

  return {
    starName,
    saveSegment,
    title: dl.get("Title") || decodeURIComponent(saveSegment),
    version: dl.get("Factorio version") || "",
    seed: dl.get("Seed") || "",
    playTime: dl.get("Time played") || "",
    uploaded: uploadedIso ? uploadedIso.slice(0, 10) : (dl.get("Uploaded") ?? ""),
    players: dl.get("Player count") || "",
    mods,
  };
}

const FONT_IMG_EXT = /\.(?:woff2?|ttf|otf|png|jpe?g|gif|webp)$/i;

/** Fetch every queued (localPath -> sourceUrl) pair not already present. */
async function drain(
  queue: Map<string, string>,
  files: Map<string, Uint8Array>,
  sources: Map<string, string>,
  fetcher: Fetcher,
  onProgress: OnProgress | undefined,
  label: string,
): Promise<void> {
  const entries = [...queue.entries()];
  queue.clear();
  if (entries.length === 0) return;
  let done = 0;
  await pool(entries, 8, async ([local, absUrl]) => {
    try {
      const data = await fetcher.bytes(absUrl);
      files.set(local, data);
      sources.set(local, absUrl);
    } catch (err) {
      // Tolerate optional assets (e.g. a font variant that 404s) rather than
      // failing the whole archive.
      console.warn(`skipping ${absUrl}: ${(err as Error).message}`);
    }
    onProgress?.({ step: label, loaded: ++done, total: entries.length });
  });
}

/** Walk three.js addon modules, following relative + three/addons imports. */
async function crawlAddons(importmap: Record<string, string>, infoUrl: string, files: Map<string, Uint8Array>, sources: Map<string, string>, fetcher: Fetcher): Promise<void> {
  const prefix = importmap["three/addons/"];
  if (!prefix) return;
  const absBase = absolutize(prefix, infoUrl);

  const seen = new Set<string>();
  const toVisit: string[] = [];
  const addSpec = (spec: string, fromUrl: string) => {
    let abs: string | null = null;
    if (spec.startsWith("three/addons/")) abs = absBase + spec.slice("three/addons/".length);
    else if (spec.startsWith("./") || spec.startsWith("../")) abs = new URL(spec, fromUrl).href;
    if (abs && !seen.has(abs)) {
      seen.add(abs);
      toVisit.push(abs);
    }
  };

  const cb = files.get("assets/js/chartbundle.js");
  if (cb) for (const m of decoder.decode(cb).matchAll(/from\s*["']([^"']+)["']/g)) addSpec(m[1]!, absBase);

  while (toVisit.length > 0) {
    const url = toVisit.pop()!;
    const local = mapUrlToLocal(url);
    if (!local || files.has(local)) continue;
    let text: string;
    try {
      text = await fetcher.text(url);
    } catch {
      continue;
    }
    files.set(local, encoder.encode(text));
    sources.set(local, url);
    for (const m of text.matchAll(/from\s*["']([^"']+)["']/g)) addSpec(m[1]!, url);
  }
}

export async function collect(input: string, fetcher: Fetcher, onProgress?: OnProgress): Promise<Collected> {
  const { tabUrls, saveSegment } = parseGalaxyUrl(input);

  // 1. The six tab pages.
  const pages = new Map<TabName, string>();
  let pagesDone = 0;
  await pool([...TABS], 4, async (tab) => {
    pages.set(tab, await fetcher.text(tabUrls[tab]));
    onProgress?.({ step: "Fetching galaxy pages", loaded: ++pagesDone, total: TABS.length });
  });

  const meta = parseMeta(pages.get("info")!, saveSegment);
  const viewerSrc = pages.get("planets") ?? pages.get("platforms");
  if (!viewerSrc) throw new Error("Galaxy pages are incomplete.");
  const { opts: chartbundleOpts, importmap, chartbundleJsImport } = parseViewer(viewerSrc);

  const files = new Map<string, Uint8Array>();
  const sources = new Map<string, string>();
  const queue = new Map<string, string>();
  const enqueue = (absUrl: string) => {
    const local = mapUrlToLocal(absUrl);
    if (!local || files.has(local) || queue.has(local)) return;
    queue.set(local, absUrl);
  };

  // Icons: every chartbundles PNG in the pages + the viewer's icon manifest.
  const iconUrls = new Set<string>();
  for (const html of pages.values()) {
    for (const m of html.matchAll(/https:\/\/chartbundles\.cdn\.factorio\.com\/[^\s"'()<>]+?\.png/g)) iconUrls.add(m[0]);
  }
  const cdnBase = chartbundleOpts.cdn.replace(/\/+$/, "");
  for (const v of Object.values(chartbundleOpts.icons)) iconUrls.add(`${cdnBase}/${v.replace(/^\/+/, "")}`);
  for (const u of iconUrls) enqueue(u);
  const iconCount = iconUrls.size;

  // The rendered map bundle.
  enqueue(chartbundleOpts.url);

  // Stylesheets / scripts / images referenced across the pages.
  for (const html of pages.values()) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const el of doc.querySelectorAll("link[href]")) enqueue(absolutize(el.getAttribute("href")!, tabUrls.info));
    for (const el of doc.querySelectorAll("script[src]")) enqueue(absolutize(el.getAttribute("src")!, tabUrls.info));
    for (const el of doc.querySelectorAll("img[src]")) enqueue(absolutize(el.getAttribute("src")!, tabUrls.info));
  }
  // Importmap leaf modules (skip the "three/addons/" prefix — crawled below).
  for (const [key, val] of Object.entries(importmap)) {
    if (!key.endsWith("/")) enqueue(absolutize(val, tabUrls.info));
  }
  enqueue(absolutize(chartbundleJsImport, tabUrls.info));

  await drain(queue, files, sources, fetcher, onProgress, "Downloading icons & assets");

  // three.js addon modules (MapControls -> OrbitControls, lil-gui, CSS2DRenderer).
  await crawlAddons(importmap, tabUrls.info, files, sources, fetcher);

  // Fonts + images referenced from inside the fetched CSS, and the rocket image
  // referenced from factorio.js.
  for (const [local, absUrl] of sources) {
    if (local.startsWith("assets/css/") && local.endsWith(".css")) {
      const css = decoder.decode(files.get(local)!);
      for (const m of css.matchAll(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g)) {
        const ref = m[1]!.trim();
        if (ref.startsWith("data:")) continue;
        let abs: string;
        try {
          abs = new URL(ref, absUrl).href;
        } catch {
          continue;
        }
        if (FONT_IMG_EXT.test(abs.split("?")[0]!)) enqueue(abs);
      }
    }
  }
  const fjs = files.get("assets/js/factorio.js");
  if (fjs) {
    for (const m of decoder.decode(fjs).matchAll(/https:\/\/(?:cdn|webcdn)\.factorio\.com\/[^\s"')]+?\.(?:png|jpe?g|gif|webp)/g)) enqueue(m[0]);
  }

  await drain(queue, files, sources, fetcher, onProgress, "Downloading fonts & images");

  return { meta, pages, files, sources, importmap, chartbundleOpts, chartbundleJsImport, iconCount };
}
