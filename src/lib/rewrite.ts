import { mapUrlToLocal, relativeFrom } from "./paths";
import type { ChartbundleOpts } from "./types";

export interface RewriteCtx {
  saveSegment: string;
  importmap: Record<string, string>;
  chartbundleOpts: ChartbundleOpts;
  chartbundleJsImport: string;
}

const SUB_TABS = ["planets", "platforms", "items", "energy", "kills"];

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Rewrite one galaxy page so every reference points at the local archive. */
export function rewritePage(html: string, ctx: RewriteCtx): string {
  const { saveSegment, importmap, chartbundleOpts, chartbundleJsImport } = ctx;
  let s = html;

  // 1. interactive viewer module import (bare specifier -> ./-relative).
  s = s.split(chartbundleJsImport).join("./assets/js/chartbundle.js");

  // 2/3. viewer config -> local zip + local icon mirror (key-qualified so the
  // blanket icon replace below can't corrupt the bundle URL).
  s = s.split(`"cdn": "${chartbundleOpts.cdn}"`).join('"cdn": "assets/cdn"');
  s = s.split(`"url": "${chartbundleOpts.url}"`).join('"url": "assets/chartbundles/chartbundle.zip"');

  // 4. every icon (and any residual chartbundles reference).
  s = s.split("https://chartbundles.cdn.factorio.com/").join("assets/cdn/");

  // 5. ES module importmap -> local modules, ./-prefixed so they stay relative.
  for (const val of Object.values(importmap)) {
    const local = mapUrlToLocal(val);
    if (local) s = s.split(val).join(`./${local}`);
  }

  // 6. cdn.factorio.com CSS / JS / image libs.
  s = s.replace(/https:\/\/cdn\.factorio\.com\/assets\/[^"')\s]*?\/([\w.@-]+\.css)/g, "assets/css/$1");
  s = s.replace(/https:\/\/cdn\.factorio\.com\/assets\/[^"')\s]*?\/([\w.@-]+\.js)/g, "assets/js/$1");
  s = s.replace(/https:\/\/cdn\.factorio\.com\/assets\/[^"')\s]*?\/([\w.@-]+\.(?:png|jpe?g|gif|svg|webp|ico))/g, "assets/img/$1");

  // 7. htmx (drop SRI/crossorigin, point local).
  s = s.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/[^"]*htmx[^"]*"[^>]*><\/script>/g, '<script src="assets/js/htmx.min.js"></script>');

  // 8. local /static assets (tolerating any cache-busting query).
  s = s.replace(/\/static\/css\/([\w.-]+\.css)(?:\?[^"'\s)]*)?/g, "assets/css/$1");
  s = s.replace(/\/static\/js\/([\w.@-]+\.js)(?:\?[^"'\s)]*)?/g, "assets/js/$1");
  s = s.replace(/\/static\/chartbundle\/([\w.-]+\.js)(?:\?[^"'\s)]*)?/g, "assets/js/$1");
  s = s.replace(/\/static\/img\/([\w.-]+)/g, "assets/img/$1");

  // 9. "View Star" -> live galaxy (external; re-encode the hash target).
  s = s.split(`/galaxy#${safeDecode(saveSegment)}`).join(`https://factorio.com/galaxy#${saveSegment}`);

  // 10. inter-tab navigation (sub-tabs before the bare Info tab).
  for (const tab of SUB_TABS) s = s.split(`/galaxy/${saveSegment}/${tab}`).join(`${tab}.html`);
  s = s.split(`/galaxy/${saveSegment}`).join("info.html");

  // 11. remaining root-relative site links -> absolute factorio.com.
  s = s.replace(/(href|src)="\/(?!\/)/g, '$1="https://factorio.com/');

  return s;
}

/** Rewrite url() references in a stylesheet to point at local files. */
export function rewriteCss(css: string, cssLocal: string, cssAbsUrl: string): string {
  let s = css;

  // Drop obsolete IE-era font fallbacks we don't bundle (titillium only).
  if (cssLocal === "assets/css/titillium-web.css") {
    s = s.replace(/\s*url\('titillium-web\/[^']*\.eot[^']*'\)\s*format\('embedded-opentype'\),?/g, "");
    s = s.replace(/,?\s*url\('titillium-web\/[^']*\.svg[^']*'\)\s*format\('svg'\)/g, "");
    s = s.replace(/\s*src:\s*url\('titillium-web\/[^']*\.eot'\);/g, "");
  }

  return s.replace(/url\(\s*(['"]?)([^'")]+?)\1\s*\)/g, (whole, quote: string, ref: string) => {
    if (ref.startsWith("data:")) return whole;
    let abs: string;
    try {
      abs = new URL(ref, cssAbsUrl).href;
    } catch {
      return whole;
    }
    const local = mapUrlToLocal(abs);
    if (!local) return whole;
    return `url(${quote}${relativeFrom(cssLocal, local)}${quote})`;
  });
}

/** Apply the two offline patches to the chartbundle map viewer. */
export function patchChartbundleJs(src: string): string {
  let s = src;

  const lscacheAnchor = "lscache.default.setExpiryMilliseconds(3600000); // 1 hour";
  if (!s.includes(lscacheAnchor)) throw new Error("chartbundle.js: lscache anchor not found (site may have changed)");
  s = s.replace(lscacheAnchor, `${lscacheAnchor}\n\n// OFFLINE PATCH: decompress on the main thread (no separate worker script needed).\nzip.configure({ useWebWorkers: false });`);

  const rangeAnchor = "await zipFs.importHttpContent(chartbundleOpts.url, { useRangeHeader: true, forceRangeRequests: true });";
  if (!s.includes(rangeAnchor)) throw new Error("chartbundle.js: importHttpContent anchor not found (site may have changed)");
  s = s.replace(
    rangeAnchor,
    [
      "// OFFLINE PATCH: fetch the whole bundle once and import it as a blob,",
      "  // instead of HTTP range requests against the CDN.",
      "  const __bundleResp = await fetch(chartbundleOpts.url);",
      "  if (!__bundleResp.ok) {",
      "    loadingInfo.textContent = `Failed to load map bundle (${__bundleResp.status}).`;",
      "    return;",
      "  }",
      "  await zipFs.importBlob(await __bundleResp.blob());",
    ].join("\n"),
  );

  return s;
}

/** Point factorio.js' rocket image at the local copy. */
export function rewriteFactorioJs(src: string): string {
  return src.replace(/https:\/\/(?:cdn|webcdn)\.factorio\.com\/[^\s"')]+?\.(?:png|jpe?g|gif|webp)/g, (u) => mapUrlToLocal(u) ?? u);
}
