/// <reference types="vitest/config" />
import { execSync } from "node:child_process";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const port = process.env.PORT ? Number(process.env.PORT) : undefined;

// The app's dark page background (`--color-bg` in src/style.css). Used for the
// manifest theme/background and to pad the maskable/apple icons.
const backgroundColor = "#0a0d12";

const buildDate = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const buildSha = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // PWA covers the main SPA only. The archiver's separate viewer IIFE build
    // (viewer/, vite.viewer.config.ts → public/viewer.js) is not part of the PWA
    // machinery, though viewer.js is precached via the glob patterns below,
    // which just helps the archiver work offline.
    VitePWA({
      // Prompt, not autoUpdate: an archive build can be in flight, and a silent
      // reload would discard the user's work. Let the user choose when to update.
      registerType: "prompt",
      manifest: {
        name: "Galaxy Keeper",
        short_name: "Galaxy Keeper",
        description:
          "The Factorio Galaxy of Fame keeps only one upload per player. Paste your galaxy link to download a complete, self-contained offline copy before you re-upload.",
        theme_color: backgroundColor,
        background_color: backgroundColor,
        display: "standalone",
        start_url: "/",
        scope: "/",
        id: "galaxy-keeper",
      },
      workbox: {
        // Precache the built app shell. The proxied Factorio data (/proxy) is
        // deliberately never cached — no runtimeCaching for it — so users always
        // archive live data.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
      },
      pwaAssets: {
        htmlPreset: "2023",
        preset: {
          transparent: { sizes: [64, 192, 512], favicons: [[48, "favicon.ico"]] },
          maskable: { sizes: [512], padding: 0.15, resizeOptions: { background: backgroundColor } },
          apple: { sizes: [180], padding: 0.15, resizeOptions: { background: backgroundColor } },
        },
        image: "public/logo.svg",
      },
      devOptions: {
        type: "module",
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  server: {
    port,
    strictPort: port !== undefined,
    // In dev (`vite` on :5173) the Worker isn't bundled in, so forward the
    // data-collection endpoint to a locally-running `wrangler dev` (:8787).
    proxy: {
      "/proxy": "http://localhost:8787",
    },
  },
  preview: {
    port,
    strictPort: port !== undefined,
  },
  test: {
    // jsdom gives the archiving lib a real DOMParser in Node test runs.
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    testTimeout: 180_000,
  },
});
