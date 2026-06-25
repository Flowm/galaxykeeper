import { handleProxy } from "./proxy";

// Cloudflare Worker entry. `/proxy` is the data-collection endpoint (configured
// as `run_worker_first` in wrangler.jsonc); every other path is served from the
// built SPA via the ASSETS binding.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/proxy") {
      return handleProxy(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
