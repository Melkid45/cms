// Custom domains: name validation, rooted links and the DNS verdict with a fake resolver,
// plus one live read-only DNS-over-HTTPS query (example.com). Node loads the .ts files directly
// (type stripping); they only have type imports. Run: npm run test:domains (OFFLINE=1 skips DoH).
import assert from "node:assert/strict";
import { domainToASCII } from "node:url";
import { normalizeDomain, isApex, registrable, relativeName, rootedHref, isAdminHost } from "../src/lib/builder/domains/names.ts";
import { checkNameservers, checkRecords, cloudflareIp, dohResolver, scanRecords } from "../src/lib/builder/domains/dns.ts";

// ---- names
const ok = (input, domain) => assert.deepEqual(normalizeDomain(input), { domain }, input);
const bad = (input) => assert.ok("error" in normalizeDomain(input), `rejects ${input}`);
ok("zcena.com", "zcena.com");
ok("  ZCENA.com. ", "zcena.com");
ok("www.zcena.com", "zcena.com");
ok("shop.zcena.lv", "shop.zcena.lv");
ok("rīga.lv", domainToASCII("rīga.lv"));
ok("пример.рф", "xn--e1afmkfd.xn--p1ai");
assert.match(normalizeDomain("rīga.lv").domain, /^xn--/);
for (const input of ["", "https://zcena.com", "zcena.com/ru", "zcena.com:443", "zcena", "user@zcena.com", "zc ena.com", "-zcena.com", "127.0.0.1", "foo.trycloudflare.com", "x.vercel.app", "a..com"])
  bad(input);
assert.equal(isApex("zcena.com"), true);
assert.equal(isApex("zcena.co.uk"), true);
assert.equal(isApex("shop.zcena.com"), false);
assert.equal(registrable("shop.zcena.co.uk"), "zcena.co.uk");
assert.equal(relativeName("zcena.com", "zcena.com"), "@");
assert.equal(relativeName("_harbstone-verify.shop.zcena.com", "zcena.com"), "_harbstone-verify.shop");
assert.ok(isAdminHost("127.0.0.1:3001") && isAdminHost("abc.trycloudflare.com") && isAdminHost("[::1]"));
assert.ok(!isAdminHost("zcena.com") && isAdminHost("admin.example.com", ["admin.example.com"]));
const project = {
  pages: [{ id: "h", slug: "sakums", locale: "lv" }, { id: "r", slug: "glavnaya", locale: "ru" }],
  layout: { homePageId: "h" },
  languages: { default: "lv", enabled: ["lv", "ru"] },
};
assert.equal(rootedHref(project, "zcena", "/site/zcena/sakums"), "/");
assert.equal(rootedHref(project, "zcena", "/site/zcena/sakums#form"), "/#form");
assert.equal(rootedHref(project, "zcena", "/site/zcena"), "/");
assert.equal(rootedHref(project, "zcena", "/site/zcena/ru/glavnaya"), "/ru/glavnaya");
assert.equal(rootedHref(project, "zcena", "/site/zcena/datori?x=1"), "/datori?x=1");
assert.equal(rootedHref(project, "zcena", "/site/zcena-old/x"), "/site/zcena-old/x");
assert.equal(rootedHref(project, "zcena", "/site/datori"), "/site/datori", "legacy link to a page that is not ours");
assert.equal(rootedHref({ ...project, pages: [...project.pages, { id: "d", slug: "datori", locale: "lv" }] }, "zcena", "/site/datori#x"), "/datori#x");
assert.equal(rootedHref(project, "zcena", "/api/builder/media/a/b"), "/api/builder/media/a/b");
assert.equal(rootedHref(project, "zcena", "https://other.lv/"), "https://other.lv/");

// ---- DNS verdict with a fake resolver
const records = [
  { type: "A", name: "@", host: "zcena.com", value: "76.76.21.21", purpose: "routing" },
  { type: "CNAME", name: "www", host: "www.zcena.com", value: "cname.vercel-dns.com", purpose: "www" },
  { type: "TXT", name: "_harbstone-verify", host: "_harbstone-verify.zcena.com", value: "harbstone-verify=abc", purpose: "ownership" },
];
const fake = (zone) => async (name, type) => zone[`${type} ${name}`] ?? [];
const run = (zone, options = { ownership: "txt" }) => checkRecords(records, fake(zone), options);

let r = await run({});
assert.equal(r.status, "pending", "nothing set yet");
r = await run({ "A zcena.com": ["76.76.21.21"] });
assert.equal(r.status, "verifying", "A ok, TXT missing");
assert.ok(r.warnings.some((w) => /www/.test(w)), "www missing is a warning");
r = await run({ "A zcena.com": ["76.76.21.21"], "TXT _harbstone-verify.zcena.com": ["harbstone-verify=abc"], "CNAME www.zcena.com": ["cname.vercel-dns.com"] });
assert.equal(r.status, "active");
assert.ok(r.records.every((x) => x.ok));
assert.deepEqual(r.warnings, []);
r = await run({ "A zcena.com": ["76.76.21.21", "185.1.2.3"], "TXT _harbstone-verify.zcena.com": ["harbstone-verify=abc"] });
assert.equal(r.status, "error");
assert.match(r.error, /Remove the other A records/);
r = await run({ "A zcena.com": ["185.1.2.3"] });
assert.equal(r.status, "error");
assert.match(r.error, /points to 185\.1\.2\.3/);
r = await run({ "A zcena.com": ["104.21.3.4"], "TXT _harbstone-verify.zcena.com": ["harbstone-verify=abc"] });
assert.equal(r.status, "error", "Cloudflare proxy before activation");
assert.match(r.error, /DNS only/);
r = await run({ "A zcena.com": ["104.21.3.4"], "TXT _harbstone-verify.zcena.com": ["harbstone-verify=abc"] }, { ownership: "txt", alreadyVerified: true });
assert.equal(r.status, "active", "proxied after activation stays active");
assert.ok(r.warnings.some((w) => /Full \(strict\)/.test(w)));
r = await run({ "A zcena.com": ["76.76.21.21"], "AAAA zcena.com": ["2606::1"], "TXT _harbstone-verify.zcena.com": ["harbstone-verify=abc"] });
assert.equal(r.status, "active");
assert.ok(r.warnings.some((w) => /AAAA/.test(w)));
r = await run({ "A zcena.com": ["76.76.21.21"], "TXT _harbstone-verify.zcena.com": ["harbstone-verify=zzz"] });
assert.equal(r.status, "error");
assert.match(r.error, /different value/);
r = await run({ "A zcena.com": ["76.76.21.21"] }, { ownership: true });
assert.equal(r.status, "active", "Vercel verified: no own TXT needed");
r = await checkRecords(
  [{ type: "CNAME", name: "shop", host: "shop.zcena.com", value: "cname.vercel-dns.com", purpose: "routing" }],
  fake({ "CNAME shop.zcena.com": ["other.host.net"] }),
  { ownership: true },
);
assert.equal(r.status, "error");
assert.equal(cloudflareIp("172.67.1.1"), true);
assert.equal(cloudflareIp("76.76.21.21"), false);

// DoH answer parsing with a fake fetch (quoted, split TXT chunks; NXDOMAIN = empty).
const fakeFetch = async (url) => {
  const u = new URL(url);
  const name = u.searchParams.get("name");
  if (name === "missing.zcena.com") return Response.json({ Status: 3 });
  if (u.searchParams.get("type") === "TXT")
    return Response.json({ Status: 0, Answer: [{ type: 16, data: '"harbstone-verify=" "abc"' }] });
  return Response.json({ Status: 0, Answer: [{ type: 5, data: "cname.vercel-dns.com." }, { type: 1, data: "76.76.21.21" }] });
};
const doh = dohResolver(fakeFetch);
assert.deepEqual(await doh("zcena.com", "TXT"), ["harbstone-verify=abc"]);
assert.deepEqual(await doh("www.zcena.com", "CNAME"), ["cname.vercel-dns.com"]);
assert.deepEqual(await doh("www.zcena.com", "A"), ["76.76.21.21"]);
assert.deepEqual(await doh("missing.zcena.com", "A"), []);
// ---- nameservers mode
const vercelNs = ["ns1.vercel-dns.com", "ns2.vercel-dns.com"];
assert.deepEqual(checkNameservers(vercelNs, ["NS1.Vercel-DNS.com.", "ns2.vercel-dns.com"]), { found: vercelNs, ok: true, mixed: false });
let n = checkNameservers(vercelNs, ["dns1.registrar-servers.com", "dns2.registrar-servers.com"]);
assert.equal(n.ok, false);
assert.equal(n.mixed, false);
n = checkNameservers(vercelNs, ["ns1.vercel-dns.com", "dns2.registrar-servers.com"]);
assert.equal(n.ok, false);
assert.equal(n.mixed, true, "old + new nameservers together");
assert.equal(checkNameservers(vercelNs, []).ok, false);

// ---- email records found before the switch
const mailZone = {
  "MX zcena.com": ["10 aspmx.l.google.com", "20 alt1.aspmx.l.google.com"],
  "TXT zcena.com": ["v=spf1 include:_spf.google.com ~all", "google-site-verification=abc", "harbstone-verify=xyz"],
  "TXT _dmarc.zcena.com": ["v=DMARC1; p=none"],
  "TXT google._domainkey.zcena.com": ["v=DKIM1; k=rsa; p=MIIB"],
  "CNAME selector1._domainkey.zcena.com": ["selector1-zcena-com._domainkey.zcena.onmicrosoft.com"],
  "TXT selector1._domainkey.zcena.com": ["v=DKIM1; p=should-not-be-used-because-cname"],
  "CNAME autodiscover.zcena.com": ["autodiscover.outlook.com"],
  "A mail.zcena.com": ["185.10.10.10"],
  "A zcena.com": ["185.1.2.3"],
  "CNAME www.zcena.com": ["zcena.com"],
};
const found = await scanRecords("zcena.com", fake(mailZone));
const show = found.map((r) => `${r.type} ${r.name || "@"} ${r.priority ?? ""} ${r.value}`.replace(/\s+/g, " "));
assert.deepEqual(show, [
  "MX @ 10 aspmx.l.google.com",
  "MX @ 20 alt1.aspmx.l.google.com",
  "TXT @ v=spf1 include:_spf.google.com ~all",
  "TXT @ google-site-verification=abc",
  "TXT _dmarc v=DMARC1; p=none",
  "TXT google._domainkey v=DKIM1; k=rsa; p=MIIB",
  "CNAME selector1._domainkey selector1-zcena-com._domainkey.zcena.onmicrosoft.com",
  "CNAME autodiscover autodiscover.outlook.com",
  "A mail 185.10.10.10",
], "mail records found; the site's own A/www and our TXT are not copied");
assert.ok(found.every((r) => r.selected && r.state === "pending"), "ticked by default");
assert.equal(found.find((r) => r.value.startsWith("v=spf1")).label.startsWith("SPF"), true);
assert.deepEqual(await scanRecords("empty.com", fake({})), []);
// A broken resolver for one name does not stop the scan.
const flaky = async (name, type) => { if (name.startsWith("mail.")) throw new Error("timeout"); return fake(mailZone)(name, type); };
assert.equal((await scanRecords("zcena.com", flaky)).length, found.length - 1);

console.log("PASS: domain names, rooted links, DNS verdicts (fake resolver), DoH parsing, nameservers, email record scan.");

// ---- one live, read-only DoH query
if (!process.env.OFFLINE) {
  const live = dohResolver();
  const a = await live("example.com", "A");
  assert.ok(a.length > 0 && a.every((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)), "example.com has A records");
  const none = await live("no-such-name-harbstone-check.example.com", "A");
  assert.deepEqual(none, []);
  const ns = await live("gmail.com", "NS");
  assert.ok(ns.some((x) => x.endsWith(".google.com")), `gmail.com NS: ${ns}`);
  const mx = await live("gmail.com", "MX");
  assert.ok(mx.some((x) => /^\d+ gmail-smtp-in\.l\.google\.com$/.test(x)), `gmail.com MX: ${mx}`);
  const scan = await scanRecords("gmail.com", live);
  assert.ok(scan.some((r) => r.type === "MX") && scan.some((r) => r.label.startsWith("SPF")), "live scan finds MX + SPF");
  console.log(`PASS: live DoH example.com A = ${a.join(", ")}; gmail.com NS = ${ns.join(", ")}; MX = ${mx.length}; live scan = ${scan.length} records; unknown name = no records.`);
}
