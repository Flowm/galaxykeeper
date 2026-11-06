import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";

const ORIGIN = "https://galaxykeeper.frcy.org";
const ALLOWED = ["factorio.com", "cdn.factorio.com", "webcdn.factorio.com", "chartbundles.cdn.factorio.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"];

/** Call the Worker the way the asset router does: only `/proxy` reaches it. */
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env);
const proxy = (target: string, init?: RequestInit) => call(`/proxy?url=${encodeURIComponent(target)}`, init);

/** Replace the global fetch; any call fails the test unless a response is given. */
function mockUpstream(respond: (request: Request) => Response | Promise<Response> = () => new Response("ok")) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => respond(new Request(input, init)));
}

const errorOf = async (response: Response) => ((await response.json()) as { error: string }).error;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("routing", () => {
  it("answers 404 for any path other than /proxy", async () => {
    const response = await call("/api/anything");
    expect(response.status).toBe(404);
  });
});

describe("request checks", () => {
  it("answers a CORS preflight without fetching", async () => {
    const upstream = mockUpstream();
    const response = await call("/proxy", { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(["POST", "PUT", "DELETE"])("rejects %s with 405", async (method) => {
    const upstream = mockUpstream();
    const response = await proxy("https://factorio.com/", { method });
    expect(response.status).toBe(405);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects a missing ?url= with 400", async () => {
    const response = await call("/proxy");
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe("Missing ?url= parameter");
  });

  it("rejects a value that is not an absolute URL with 400", async () => {
    const response = await proxy("factorio.com/icons/a.png");
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe("Invalid url");
  });

  it.each(["http://factorio.com/", "ftp://factorio.com/", "data:text/plain,hi"])("rejects the non-https URL %s with 400", async (target) => {
    const upstream = mockUpstream();
    const response = await proxy(target);
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("host allowlist", () => {
  it.each([
    ["a look-alike prefix", "https://evil-factorio.com/"],
    ["the allowed host as a subdomain of another", "https://factorio.com.evil.tld/"],
    ["an unlisted subdomain", "https://mods.factorio.com/"],
    ["an unlisted parent domain", "https://jsdelivr.net/"],
    ["the allowed host as userinfo", "https://factorio.com@evil.tld/"],
    ["a loopback address", "https://127.0.0.1/"],
    ["an internal name", "https://localhost/"],
  ])("rejects %s with 403", async (_, target) => {
    const upstream = mockUpstream();
    const response = await proxy(target);
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe(`Host not allowed: ${new URL(target).hostname}`);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(ALLOWED)("forwards a request to %s", async (host) => {
    const upstream = mockUpstream();
    const response = await proxy(`https://${host}/some/file.png`);
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
    expect(new Request(...upstream.mock.calls[0]!).url).toBe(`https://${host}/some/file.png`);
  });

  it("matches the hostname case-insensitively, as URL parsing lowercases it", async () => {
    mockUpstream();
    const response = await proxy("https://CDN.Factorio.COM/a.png");
    expect(response.status).toBe(200);
  });
});

describe("forwarding", () => {
  it("presents as a browser coming from factorio.com", async () => {
    let seen: Request | undefined;
    mockUpstream((request) => {
      seen = request;
      return new Response("ok");
    });
    await proxy("https://cdn.factorio.com/icons/a.png");
    expect(seen?.method).toBe("GET");
    expect(seen?.headers.get("User-Agent")).toMatch(/^Mozilla\/5\.0 /);
    expect(seen?.headers.get("Referer")).toBe("https://factorio.com/");
  });

  it("passes the body and content type through, with CORS and a day of caching", async () => {
    mockUpstream(() => new Response("PNGDATA", { headers: { "Content-Type": "image/png", "Set-Cookie": "session=1" } }));
    const response = await proxy("https://cdn.factorio.com/icons/a.png");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("PNGDATA");
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
    // Only the content type is copied: upstream cookies never reach the browser.
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("maps an upstream 404 to 404", async () => {
    mockUpstream(() => new Response("missing", { status: 404 }));
    const response = await proxy("https://factorio.com/missing");
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe("Upstream responded 404 for factorio.com");
  });

  it("maps any other upstream error to 502", async () => {
    mockUpstream(() => new Response("boom", { status: 500 }));
    const response = await proxy("https://factorio.com/");
    expect(response.status).toBe(502);
  });

  it("answers 502 when the upstream fetch throws", async () => {
    mockUpstream(() => {
      throw new Error("connection reset");
    });
    const response = await proxy("https://factorio.com/");
    expect(response.status).toBe(502);
    expect(await errorOf(response)).toBe("Upstream fetch failed: connection reset");
  });
});
