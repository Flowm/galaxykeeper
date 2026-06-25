// A small fetch abstraction so the archiving core runs both in the browser
// (through the Cloudflare /proxy Worker) and in Node tests (direct fetch, where
// CORS does not apply).
export interface Fetcher {
  text(url: string): Promise<string>;
  bytes(url: string): Promise<Uint8Array>;
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://factorio.com/",
};

/** Browser fetcher: routes every request through the Worker proxy. */
export function createProxyFetcher(proxyBase = "/proxy"): Fetcher {
  const wrap = (url: string) => `${proxyBase}?url=${encodeURIComponent(url)}`;
  return {
    async text(url) {
      const res = await fetch(wrap(url));
      if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
      return res.text();
    },
    async bytes(url) {
      const res = await fetch(wrap(url));
      if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

/** Node/test fetcher: fetches directly with a browser-like UA. */
export function createDirectFetcher(): Fetcher {
  return {
    async text(url) {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
      return res.text();
    },
    async bytes(url) {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
