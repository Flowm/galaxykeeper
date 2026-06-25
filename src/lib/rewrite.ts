import { mapUrlToLocal, relativeFrom } from "./paths";

export interface RewriteCtx {
  saveSegment: string;
  /** JSON opts for the classic initChartbundleViewer() call (map pages only). */
  viewerInit: string;
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
  const { saveSegment, viewerInit } = ctx;
  let s = html;

  // 1. Map pages: replace the ES-module viewer (importmap + module script) with
  // the bundled classic viewer + the embedded map data, so the page runs from
  // file:// with no modules and no fetch.
  if (s.includes('<script type="importmap">')) {
    s = s.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, "");
    s = s.replace(
      /<script type="module">[\s\S]*?initChartbundleViewer[\s\S]*?<\/script>/,
      [
        '<script src="assets/chartbundles/chartbundle-data.js"></script>',
        '<script src="assets/js/viewer.js"></script>',
        `<script>addEventListener("DOMContentLoaded", function () { initChartbundleViewer(${viewerInit}); });</script>`,
      ].join("\n"),
    );
  }

  // 2. every icon (and any residual chartbundles reference).
  s = s.split("https://chartbundles.cdn.factorio.com/").join("assets/cdn/");

  // 3. cdn.factorio.com CSS / JS / image libs.
  s = s.replace(/https:\/\/cdn\.factorio\.com\/assets\/[^"')\s]*?\/([\w.@-]+\.css)/g, "assets/css/$1");
  s = s.replace(/https:\/\/cdn\.factorio\.com\/assets\/[^"')\s]*?\/([\w.@-]+\.js)/g, "assets/js/$1");
  s = s.replace(/https:\/\/cdn\.factorio\.com\/assets\/[^"')\s]*?\/([\w.@-]+\.(?:png|jpe?g|gif|svg|webp|ico))/g, "assets/img/$1");

  // 4. htmx (drop SRI/crossorigin, point local).
  s = s.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/[^"]*htmx[^"]*"[^>]*><\/script>/g, '<script src="assets/js/htmx.min.js"></script>');

  // 5. local /static assets (tolerating any cache-busting query).
  s = s.replace(/\/static\/css\/([\w.-]+\.css)(?:\?[^"'\s)]*)?/g, "assets/css/$1");
  s = s.replace(/\/static\/js\/([\w.@-]+\.js)(?:\?[^"'\s)]*)?/g, "assets/js/$1");
  s = s.replace(/\/static\/img\/([\w.-]+)/g, "assets/img/$1");

  // 6. "View Star" -> live galaxy (external; re-encode the hash target).
  s = s.split(`/galaxy#${safeDecode(saveSegment)}`).join(`https://factorio.com/galaxy#${saveSegment}`);

  // 7. inter-tab navigation (sub-tabs before the bare Info tab).
  for (const tab of SUB_TABS) s = s.split(`/galaxy/${saveSegment}/${tab}`).join(`${tab}.html`);
  s = s.split(`/galaxy/${saveSegment}`).join("info.html");

  // 8. remaining root-relative site links -> absolute factorio.com.
  s = s.replace(/(href|src)="\/(?!\/)/g, '$1="https://factorio.com/');

  // 9. de-module the remaining classic scripts (e.g. factorio.js) so they run
  // from file:// too.
  s = s.split(' type="module"').join("");

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

/** Point factorio.js' rocket image at the local copy. */
export function rewriteFactorioJs(src: string): string {
  return src.replace(/https:\/\/(?:cdn|webcdn)\.factorio\.com\/[^\s"')]+?\.(?:png|jpe?g|gif|webp)/g, (u) => mapUrlToLocal(u) ?? u);
}
