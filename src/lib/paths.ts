const IMG_EXT = /\.(?:png|jpe?g|gif|webp|ico|bmp)$/i;

export function basename(pathname: string): string {
  const clean = pathname.split("?")[0]!.split("#")[0]!;
  return clean.slice(clean.lastIndexOf("/") + 1);
}

export function absolutize(ref: string, base: string): string {
  return new URL(ref, base).href;
}

/**
 * Map a source asset URL to its path inside the offline archive. Returns null
 * for things we deliberately don't bundle (e.g. commented-out lightbox, or
 * hosts outside the known set). This is the single source of truth shared by
 * the collector (where to store bytes) and the rewriter (what to point at).
 */
export function mapUrlToLocal(absUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(absUrl);
  } catch {
    return null;
  }
  const host = u.hostname;
  const path = u.pathname;
  const base = basename(path);

  if (host === "chartbundles.cdn.factorio.com") {
    if (path.includes("/chartbundles/")) return "assets/chartbundles/chartbundle.zip";
    return "assets/cdn" + path; // e.g. /icons/7fa0/xx.png -> assets/cdn/icons/7fa0/xx.png
  }
  if (host === "cdn.jsdelivr.net") {
    if (path.includes("/build/three.module.js")) return "assets/js/three.module.js";
    const jsm = path.indexOf("/examples/jsm/");
    if (jsm >= 0) return "assets/js/addons/" + path.slice(jsm + "/examples/jsm/".length);
    if (path.includes("@zip.js/zip.js")) return "assets/js/zip.js";
    if (path.includes("lscache")) return "assets/js/lscache.js";
    return "assets/js/" + base;
  }
  if (host === "cdnjs.cloudflare.com") return "assets/js/" + base;
  if (host === "factorio.com") {
    if (path.startsWith("/static/css/")) return "assets/css/" + base;
    if (path.startsWith("/static/js/")) return "assets/js/" + base;
    if (path.startsWith("/static/chartbundle/")) return "assets/js/" + base;
    if (path.startsWith("/static/img/")) return "assets/img/" + base;
    return null;
  }
  if (host === "cdn.factorio.com") {
    if (path.includes("/assets/fonts/titillium-web/")) return "assets/css/titillium-web/" + base;
    if (path.includes("/fontawesome/webfonts/")) return "assets/webfonts/" + base;
    if (path.endsWith(".css")) return "assets/css/" + base;
    if (path.endsWith(".js")) return "assets/js/" + base;
    if (IMG_EXT.test(path)) return "assets/img/" + base;
    return null;
  }
  if (host === "webcdn.factorio.com") {
    if (IMG_EXT.test(path)) return "assets/img/" + base;
    return null;
  }
  return null;
}

/** Path of `targetLocal` relative to the directory containing `fromLocal`. */
export function relativeFrom(fromLocal: string, targetLocal: string): string {
  const fromDir = fromLocal.split("/").slice(0, -1);
  const target = targetLocal.split("/");
  let i = 0;
  while (i < fromDir.length && i < target.length && fromDir[i] === target[i]) i++;
  const up = Array.from({ length: fromDir.length - i }, () => "..");
  return [...up, ...target.slice(i)].join("/") || ".";
}
