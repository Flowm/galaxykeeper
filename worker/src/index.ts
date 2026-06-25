// Cloudflare Worker entry. For now it just serves the built SPA from the ASSETS
// binding; the /proxy data-collection endpoint is added in stage 1.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
