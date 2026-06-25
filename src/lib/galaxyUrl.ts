import type { TabName } from "./types";

export interface ParsedGalaxyUrl {
  origin: string;
  saveSegment: string;
  tabUrls: Record<TabName, string>;
}

/**
 * Accept any `https://factorio.com/galaxy/<save>[/tab]` link and derive the six
 * per-save tab URLs. `saveSegment` is kept URL-encoded (as it appears in the
 * page's own links), so it round-trips through the proxy and matches the
 * inter-tab hrefs we rewrite later.
 */
export function parseGalaxyUrl(input: string): ParsedGalaxyUrl {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new Error("Please paste a full link, e.g. https://factorio.com/galaxy/<save name>");
  }
  if (u.hostname !== "factorio.com" && u.hostname !== "www.factorio.com") {
    throw new Error("That doesn't look like a factorio.com galaxy link.");
  }
  const segs = u.pathname.split("/").filter(Boolean); // ["galaxy", "<save>", maybe "<tab>"]
  if (segs[0] !== "galaxy" || !segs[1]) {
    throw new Error("Expected a link like https://factorio.com/galaxy/<save name>");
  }

  const origin = "https://factorio.com";
  const saveSegment = segs[1];
  const base = `${origin}/galaxy/${saveSegment}`;
  const tabUrls: Record<TabName, string> = {
    info: base,
    planets: `${base}/planets`,
    platforms: `${base}/platforms`,
    items: `${base}/items`,
    energy: `${base}/energy`,
    kills: `${base}/kills`,
  };
  return { origin, saveSegment, tabUrls };
}
