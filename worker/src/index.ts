import { handleProxy } from "./proxy";

// Cloudflare Worker entry. `/proxy` is the data-collection endpoint and the only
// path routed here (`run_worker_first` in wrangler.jsonc). Everything else is
// resolved by the asset router before the Worker is invoked — static files
// directly, unmatched paths via not_found_handling: single-page-application —
// so reaching the fallback below means the asset router declined the path.
export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/proxy") {
      return handleProxy(request);
    }
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
