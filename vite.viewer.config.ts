import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

// Builds the map viewer (three.js + zip.js + the ported chartbundle logic) into
// a single classic IIFE at public/viewer.js. The archiver embeds this in each
// generated archive so the interactive map runs from file:// with no ES
// modules and no dev server. Kept separate from the SPA build (different format).
export default defineConfig({
  // This build only emits viewer.js into public/; without this, Vite would
  // try to copy public/ into itself (outDir === publicDir).
  publicDir: false,
  build: {
    lib: {
      entry: fileURLToPath(new URL("./viewer/main.ts", import.meta.url)),
      formats: ["iife"],
      name: "FctrViewer",
      fileName: () => "viewer.js",
    },
    outDir: "public",
    emptyOutDir: false,
    target: "es2020",
    minify: true,
  },
});
