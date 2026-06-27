/// <reference types="vitest/config" />
import { execSync } from "node:child_process";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const buildDate = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const buildSha = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  server: {
    // In dev (`vite` on :5173) the Worker isn't bundled in, so forward the
    // data-collection endpoint to a locally-running `wrangler dev` (:8787).
    proxy: {
      "/proxy": "http://localhost:8787",
    },
  },
  test: {
    // jsdom gives the archiving lib a real DOMParser in Node test runs.
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    testTimeout: 180_000,
  },
});
