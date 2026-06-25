// Binding types for this Worker, matching worker/wrangler.jsonc.
// Regenerate from the live config with: npm run generate-types
interface Env {
  // Static-assets binding (the built SPA in ../dist).
  ASSETS: Fetcher;
}
