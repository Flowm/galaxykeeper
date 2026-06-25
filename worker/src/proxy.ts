import { corsPreflight, CORS_HEADERS, errorResponse } from "./utils";

// Hosts the archiver is allowed to fetch. Exact hostname match only — no suffix
// matching — so look-alikes like "evil-factorio.com" or "factorio.com.evil.tld"
// are rejected. This keeps the public proxy from becoming an open relay (SSRF).
const ALLOWED_HOSTS = new Set(["factorio.com", "cdn.factorio.com", "webcdn.factorio.com", "chartbundles.cdn.factorio.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"]);

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * GET /proxy?url=<absolute https URL on an allowed host>
 *
 * Fetches the target server-side (CORS does not apply server-to-server) and
 * returns the bytes verbatim with permissive CORS headers, so the browser SPA
 * can read responses from hosts that otherwise block cross-origin reads.
 */
export async function handleProxy(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return corsPreflight();
  if (request.method !== "GET") return errorResponse("Method not allowed", 405);

  const target = new URL(request.url).searchParams.get("url");
  if (!target) return errorResponse("Missing ?url= parameter", 400);

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return errorResponse("Invalid url", 400);
  }

  if (parsed.protocol !== "https:") return errorResponse("Only https URLs are allowed", 400);
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return errorResponse(`Host not allowed: ${parsed.hostname}`, 403);

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      headers: {
        // Present as a normal browser coming from factorio.com; avoids bot
        // blocks. (The worker reads the body regardless of upstream CORS.)
        "User-Agent": BROWSER_UA,
        Referer: "https://factorio.com/",
        Accept: "*/*",
      },
      redirect: "follow",
    });
  } catch (err) {
    return errorResponse(`Upstream fetch failed: ${(err as Error).message}`, 502);
  }

  if (!upstream.ok) {
    return errorResponse(`Upstream responded ${upstream.status} for ${parsed.hostname}`, upstream.status === 404 ? 404 : 502);
  }

  // Pass the body through, preserving content-type and adding permissive CORS.
  // The targets are content-addressed (icons/zip/fonts) so a day of caching at
  // the edge is safe and cuts repeat load on factorio.com.
  const headers = new Headers(CORS_HEADERS);
  const contentType = upstream.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "public, max-age=86400");

  return new Response(upstream.body, { status: 200, headers });
}
