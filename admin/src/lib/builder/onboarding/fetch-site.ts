import "server-only";
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { StoreError } from "../server";

// Reads a client's old public website for the consultation: up to 4 pages of the same
// host (start page + likely about/menu/services/contact links), visible text and image
// URLs. Server-side fetch hardening: http(s) on ports 80/443 only, every hop resolved
// to public IPv4 addresses and the connection pinned to the checked address (no DNS
// rebinding), 1.5 MB / 10 s per page, at most 3 redirects, HTML only.
const privateV4 = (address: string) => {
  const [a, b, c] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
};
async function publicAddress(host: string) {
  if (isIP(host)) throw new StoreError("Use the website's domain name, not an IP address.");
  if (!host.includes(".") || /\.(local|internal|localhost)$/i.test(host))
    throw new StoreError("Use a public website address.");
  const records = await lookup(host, { family: 4, all: true }).catch(() => []);
  if (!records.length) throw new StoreError("This website could not be found.");
  if (records.some(({ address }) => privateV4(address)))
    throw new StoreError("Use a public website address.");
  return records[0].address;
}
function getOnce(url: URL, address: string): Promise<{ status: number; location?: string; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: "GET",
        servername: url.hostname,
        // Pinned: the socket connects to the address that was checked above.
        lookup: (_host, options, callback) => {
          if ((options as { all?: boolean }).all) callback(null, [{ address, family: 4 }] as never);
          else callback(null, address, 4);
        },
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; HarbstoneOnboarding/1.0)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "lv,en;q=0.8,ru;q=0.6",
        },
        timeout: 10000,
      },
      (response) => {
        const type = String(response.headers["content-type"] || "");
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400) {
          response.resume();
          return resolve({ status, location: String(response.headers.location || ""), type, body: "" });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1.5 * 1024 * 1024) {
            request.destroy();
            return resolve({ status, type, body: Buffer.concat(chunks).toString("utf8") });
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, type, body: Buffer.concat(chunks).toString("utf8") }));
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.end();
  });
}
export function normalizeUrl(value: string) {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
  } catch {
    throw new StoreError("Paste a website address like https://example.lv.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new StoreError("Paste a website address like https://example.lv.");
  if (url.port && !["80", "443"].includes(url.port)) throw new StoreError("Use a normal website address.");
  url.hash = "";
  return url;
}
async function fetchPage(start: URL) {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const address = await publicAddress(url.hostname);
    const result = await getOnce(url, address).catch(() => {
      throw new StoreError("The website did not answer.");
    });
    if (result.location) {
      url = normalizeUrl(new URL(result.location, url).toString());
      continue;
    }
    if (result.status >= 400) throw new StoreError(`The website answered with an error (${result.status}).`);
    if (!/html/i.test(result.type)) throw new StoreError("This address is not a web page.");
    return { url, html: result.body };
  }
  throw new StoreError("Too many redirects.");
}
const decode = (text: string) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
export function readHtml(html: string, base: URL) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = decode(
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)/i)?.[1] ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)/i)?.[1] ||
      "",
  );
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = decode(
    body
      .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/section|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 1)
      .join(" | "),
  );
  const images = [...body.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)/gi)]
    .map(([, src]) => {
      try {
        return new URL(src, base).toString();
      } catch {
        return "";
      }
    })
    .filter((src) => /^https?:/.test(src) && !/\.svg(\?|$)|sprite|pixel|logo-?icon/i.test(src));
  const links = [...body.matchAll(/<a[^>]+href=["']([^"'#]+)/gi)]
    .map(([, href]) => {
      try {
        return new URL(href, base);
      } catch {
        return null;
      }
    })
    .filter((url): url is URL => !!url && url.hostname === base.hostname && /^https?:$/.test(url.protocol));
  return { title, description, text, images, links };
}
const usefulPage = /about|par-mums|o-nas|menu|edien|services|pakalpoj|uslug|price|cenas|cen|contact|kontakt/i;
export async function readOldSite(value: string) {
  const start = normalizeUrl(value);
  const first = await fetchPage(start);
  const home = readHtml(first.html, first.url);
  const seen = new Set([first.url.toString()]);
  const extra = [
    ...new Map(home.links.filter((l) => usefulPage.test(l.pathname)).map((l) => [l.pathname, l])).values(),
  ].slice(0, 3);
  const pages = [{ url: first.url.toString(), title: home.title, description: home.description, text: home.text }];
  const images = [...home.images];
  for (const link of extra) {
    link.hash = "";
    if (seen.has(link.toString())) continue;
    seen.add(link.toString());
    try {
      const page = await fetchPage(link);
      const read = readHtml(page.html, page.url);
      pages.push({ url: page.url.toString(), title: read.title, description: read.description, text: read.text });
      images.push(...read.images);
    } catch {
      // A sub-page that fails is skipped; the start page is enough.
    }
  }
  return {
    url: first.url.toString(),
    pages: pages.map((p) => ({ ...p, text: p.text.slice(0, 4000) })),
    images: [...new Set(images)].slice(0, 40),
  };
}
