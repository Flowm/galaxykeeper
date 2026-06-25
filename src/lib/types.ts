export const TABS = ["info", "planets", "platforms", "items", "energy", "kills"] as const;
export type TabName = (typeof TABS)[number];

/** Metadata scraped from the save's Info page, used for templates + filename. */
export interface GalaxyMeta {
  starName: string; // breadcrumb name, e.g. "Tdb"
  saveSegment: string; // URL-encoded path segment, e.g. "Sulfur%20II:%20Alpha7-6.G2T1"
  title: string; // save title, e.g. "SpaceAge2"
  version: string; // Factorio version
  seed: string;
  playTime: string;
  uploaded: string;
  players: string;
  mods: string[];
}

/** Parsed config from the interactive map's initChartbundleViewer({...}) call. */
export interface ChartbundleOpts {
  cdn: string;
  url: string;
  icons: Record<string, string>;
  [key: string]: unknown;
}

export interface ArchiveProgress {
  step: string;
  loaded: number;
  total: number;
}
export type OnProgress = (p: ArchiveProgress) => void;

/** Everything fetched + parsed for one save, before rewriting/zipping. */
export interface Collected {
  meta: GalaxyMeta;
  pages: Map<TabName, string>;
  files: Map<string, Uint8Array>; // archive path -> raw bytes
  sources: Map<string, string>; // archive path -> source URL (for CSS url() resolution)
  chartbundleOpts: ChartbundleOpts;
  iconCount: number;
}

export interface ArchiveResult {
  bytes: Uint8Array;
  filename: string;
  meta: GalaxyMeta;
  fileCount: number;
  iconCount: number;
}
