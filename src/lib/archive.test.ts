import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildArchive } from "./archive";
import { createDirectFetcher } from "./fetcher";

const SAVE_URL = "https://factorio.com/galaxy/Sulfur%20II:%20Alpha7-6.G2T1";
const REFERENCE = join(process.cwd(), "reference");
// Built by the `pretest` hook (npm run build:viewer).
const VIEWER_JS = new Uint8Array(readFileSync(join(process.cwd(), "public/viewer.js")));

// Reference files the classic build intentionally drops (the ESM viewer + raw
// zip + macOS launcher are replaced by the bundled viewer.js + embedded data).
const DROPPED = new Set([
  "assets/js/three.module.js",
  "assets/js/zip.js",
  "assets/js/lscache.js",
  "assets/js/chartbundle.js",
  "assets/chartbundles/chartbundle.zip",
  "start-server.command",
]);

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [full.slice(base.length + 1)];
  });
}

// Hits the live factorio.com via direct fetch (CORS does not apply in Node).
describe("buildArchive (live network)", () => {
  it("produces a file://-openable archive covering the reference content", async () => {
    const result = await buildArchive(SAVE_URL, createDirectFetcher(), { viewerJs: VIEWER_JS });
    if (process.env.EMIT_ZIP) writeFileSync(process.env.EMIT_ZIP, result.bytes);
    const entries = unzipSync(result.bytes);
    const paths = Object.keys(entries);
    const dec = (p: string) => new TextDecoder().decode(entries[p]!);

    // Required structural files (classic, server-free layout).
    for (const p of [
      "index.html",
      "info.html",
      "planets.html",
      "platforms.html",
      "items.html",
      "energy.html",
      "kills.html",
      "README.md",
      "assets/js/viewer.js",
      "assets/chartbundles/chartbundle-data.js",
      "assets/css/main.css",
    ]) {
      expect(paths, `missing ${p}`).toContain(p);
    }
    // ES-module viewer + raw zip must be gone.
    for (const p of DROPPED) expect(paths, `should not ship ${p}`).not.toContain(p);

    // Metadata + icon coverage.
    expect(result.meta.title).toBe("SpaceAge2");
    expect(result.iconCount).toBeGreaterThan(300);
    expect(paths.filter((p) => p.startsWith("assets/cdn/icons/")).length).toBeGreaterThan(300);

    // Map pages are classic: no ES modules, no importmap, no fetch.
    const planets = dec("planets.html");
    expect(planets).not.toContain('type="module"');
    expect(planets).not.toContain('type="importmap"');
    expect(planets).not.toContain("chartbundles.cdn.factorio.com");
    expect(planets).toContain('<script src="assets/js/viewer.js">');
    expect(planets).toContain('<script src="assets/chartbundles/chartbundle-data.js">');
    expect(planets).toContain("initChartbundleViewer(");
    expect(planets).toContain('href="planets.html"');
    expect(planets).toContain('href="info.html"');

    // main.css image refs localised.
    expect(dec("assets/css/main.css")).toContain("../img/");

    // Embedded map data decodes to the real bundle.
    const dataJs = dec("assets/chartbundles/chartbundle-data.js");
    const b64 = /window\.__CHARTBUNDLE_DATA__=("[\s\S]*")/.exec(dataJs)![1]!;
    expect(Buffer.from(JSON.parse(b64) as string, "base64").length).toBe(985135);

    // Compare coverage against the hand-built reference, if present locally.
    if (existsSync(REFERENCE)) {
      const got = new Set(paths);
      const normalize = (p: string) => (p === "assets/css/fontawesome-all.min.css" ? "assets/css/all.min.css" : p);
      const missing = walk(REFERENCE)
        .filter((p) => !DROPPED.has(p) && !p.startsWith("assets/js/addons/"))
        .map(normalize)
        .filter((p) => !got.has(p));
      expect(missing, `archive is missing reference files: ${missing.join(", ")}`).toEqual([]);
    }
  }, 240_000);
});
