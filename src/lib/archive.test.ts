import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildArchive } from "./archive";
import { createDirectFetcher } from "./fetcher";

const SAVE_URL = "https://factorio.com/galaxy/Sulfur%20II:%20Alpha7-6.G2T1";
const REFERENCE = join(process.cwd(), "reference");

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [full.slice(base.length + 1)];
  });
}

// Hits the live factorio.com via direct fetch (CORS does not apply in Node).
describe("buildArchive (live network)", () => {
  it("reproduces the hand-built reference archive", async () => {
    const result = await buildArchive(SAVE_URL, createDirectFetcher());
    // Optional: dump the produced zip to disk for manual inspection.
    if (process.env.EMIT_ZIP) writeFileSync(process.env.EMIT_ZIP, result.bytes);
    const entries = unzipSync(result.bytes);
    const paths = Object.keys(entries);
    const dec = (p: string) => new TextDecoder().decode(entries[p]!);

    // Required structural files.
    for (const p of [
      "index.html",
      "info.html",
      "planets.html",
      "platforms.html",
      "items.html",
      "energy.html",
      "kills.html",
      "README.md",
      "start-server.command",
      "assets/js/chartbundle.js",
      "assets/js/three.module.js",
      "assets/js/addons/controls/MapControls.js",
      "assets/js/addons/controls/OrbitControls.js",
      "assets/js/zip.js",
      "assets/js/lscache.js",
      "assets/chartbundles/chartbundle.zip",
      "assets/css/main.css",
    ]) {
      expect(paths, `missing ${p}`).toContain(p);
    }

    // Metadata + icon coverage.
    expect(result.meta.title).toBe("SpaceAge2");
    expect(result.iconCount).toBeGreaterThan(300);
    expect(paths.filter((p) => p.startsWith("assets/cdn/icons/")).length).toBeGreaterThan(300);

    // chartbundle.js offline patches applied.
    const cb = dec("assets/js/chartbundle.js");
    expect(cb).toContain("useWebWorkers: false");
    expect(cb).toContain("importBlob");
    expect(cb).not.toContain("importHttpContent");

    // Pages fully localised.
    const planets = dec("planets.html");
    expect(planets).not.toContain("chartbundles.cdn.factorio.com");
    expect(planets).toContain("assets/chartbundles/chartbundle.zip");
    expect(planets).toContain('"./assets/js/three.module.js"');
    expect(planets).toContain('href="planets.html"');
    expect(planets).toContain('href="info.html"');

    // main.css image refs localised.
    expect(dec("assets/css/main.css")).toContain("../img/");

    // The rendered map bundle is the real one.
    expect(entries["assets/chartbundles/chartbundle.zip"]!.length).toBe(985135);

    // Compare against the hand-built reference, if present locally.
    if (existsSync(REFERENCE)) {
      const got = new Set(paths);
      // The only intentional rename vs. the manual build: fontawesome's CSS
      // keeps its real basename instead of the hand-picked "fontawesome-" prefix.
      const normalize = (p: string) => (p === "assets/css/fontawesome-all.min.css" ? "assets/css/all.min.css" : p);
      const missing = walk(REFERENCE)
        .map(normalize)
        .filter((p) => !got.has(p));
      expect(missing, `archive is missing reference files: ${missing.join(", ")}`).toEqual([]);

      const refZip = readFileSync(join(REFERENCE, "assets/chartbundles/chartbundle.zip"));
      expect(entries["assets/chartbundles/chartbundle.zip"]!.length).toBe(refZip.length);
    }
  }, 240_000);
});
