import {smtpSink} from "./smtp-test-server.mjs";
import { checkShopInventory } from "./check-shop-inventory.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  randomBytes,
  generateKeyPairSync,
  sign,
  createHash,
} from "node:crypto";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  open,
  mkdir,
  copyFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import http from "node:http";
import { checkProductWorkflows } from "./check-product-workflows.mjs";
const directory = await mkdtemp(join(tmpdir(), "harbstone-role-check-"));
// Simulate a process interruption after a journal was committed, before document writes.
await writeFile(join(directory,".doc-transaction.json"),JSON.stringify({"recovery-check":{completed:true}}));
const port = Number(process.env.CMS_ROLE_TEST_PORT || 3101),
  base = `http://localhost:${port}`;
const ownerPassword = randomBytes(24).toString("hex"),
  clientPassword = randomBytes(24).toString("hex");
const cronSecret = randomBytes(32).toString("hex");
const ownerEmail = "owner@example.test",
  clientEmail = "client@example.test";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const log = await open(join(directory, "server.log"), "w");
const mailSink=await smtpSink();
const server = spawn(
  process.execPath,
  ["--import",new URL("./payment-test-fetch.mjs",import.meta.url).pathname,"node_modules/next/dist/bin/next", "start", "-p", String(port)],
  {
    cwd: resolve(import.meta.dirname, ".."),
    stdio: ["ignore", log.fd, log.fd],
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "",
      BLOB_READ_WRITE_TOKEN: "",
      VERCEL: "",
      CRON_SECRET: cronSecret,
      SMTP_HOST: "127.0.0.1",
      SMTP_FROM: "shop@example.test",
      SMTP_PORT: String(mailSink.port),
      SMTP_SECURE: "false",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      CMS_DATA_DIRECTORY: directory,
      CMS_ADMIN_EMAIL: ownerEmail,
      CMS_ADMIN_PASSWORD: ownerPassword,
      CMS_AUTH_SECRET: randomBytes(40).toString("hex"),
      CMS_BOT_PUBLIC_KEY: publicKey
        .export({ type: "spki", format: "der" })
        .toString("base64"),
    },
  },
);
let keep = false;
const request = (path, method = "GET", body, cookie) =>
  fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
async function login(email, password) {
  const r = await request("/api/builder/session", "POST", { email, password });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
const get = async (cookie) => {
  const r = await request("/api/builder", "GET", null, cookie);
  assert.equal(r.status, 200);
  return r.json();
};
const put = (data, cookie, path = "/api/builder") =>
  request(path, "PUT", data, cookie);
async function botPut(data, role, resource, method = "PUT", site) {
  const params = new URLSearchParams();
  if (role) params.set("actor", role);
  if (resource) params.set("resource", resource);
  if (site) params.set("site", site);
  const query = params.size ? `?${params}` : "";
  const path = "/api/builder/bot" + query,
    body = method === "GET" ? "" : JSON.stringify(data),
    time = String(Date.now()),
    nonce = randomBytes(18).toString("base64url");
  const signature = sign(
    null,
    Buffer.from(
      `${time}\n${nonce}\n${method}\n${path}\n${createHash("sha256").update(body).digest("hex")}`,
    ),
    privateKey,
  ).toString("base64");
  return fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-harbstone-time": time,
      "x-harbstone-nonce": nonce,
      "x-harbstone-signature": signature,
    },
    body: method === "GET" ? undefined : body,
  });
}
try {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(base + "/login")).ok) break;
    } catch {}
    if (i === 89) throw Error("Isolated test server did not start.");
    await delay(500);
  }
  assert.equal((await request("/api/builder")).status, 401);
  const owner = await login(ownerEmail, ownerPassword);
  let r = await request(
    "/api/builder/accounts",
    "POST",
    {
      name: "Demo client",
      email: clientEmail,
      password: clientPassword,
      role: "super-admin",
    },
    owner,
  );
  assert.equal(r.status, 400, "Role escalation during account creation");
  r = await request(
    "/api/builder/accounts",
    "POST",
    { name: "Demo client", email: clientEmail, password: clientPassword },
    owner,
  );
  assert.equal(r.status, 201);
  const account = await r.json();
  assert.equal(account.role, "client");
  assert(!("hash" in account));
  assert(!("salt" in account));
  const client = await login(clientEmail, clientPassword);
  const provision = {
    name: "Provisioned client",
    email: "provisioned@example.test",
    password: randomBytes(24).toString("hex"),
  };
  assert.equal(
    (await botPut(provision, "client", "accounts", "POST")).status,
    403,
    "Signed client cannot provision accounts",
  );
  assert.equal(
    (
      await botPut(
        { ...provision, role: "super-admin" },
        "super-admin",
        "accounts",
        "POST",
      )
    ).status,
    400,
    "Provisioning cannot grant a super-admin role",
  );
  r = await botPut(provision, "super-admin", "accounts", "POST");
  assert.equal(r.status, 201);
  const provisioned = await r.json();
  assert.equal(provisioned.role, "client");
  assert.equal(
    (
      await botPut(
        { id: provisioned.id, disabled: true },
        "client",
        "accounts",
        "PATCH",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await botPut(
        { id: provisioned.id, disabled: true },
        "super-admin",
        "accounts",
        "PATCH",
      )
    ).status,
    200,
  );
  assert(!("hash" in provisioned));
  assert.equal((await request("/api/builder/smtp")).status, 401);
  let smtp = await (
    await request("/api/builder/smtp", "GET", null, client)
  ).json();
  const secret = randomBytes(24).toString("hex");
  const smtpFields = ({
    passwordConfigured: _secret,
    ready: _ready,
    ...fields
  }) => {
    void _secret;
    void _ready;
    return fields;
  };
  r = await request(
    "/api/builder/smtp",
    "PUT",
    {
      ...smtpFields(smtp),
      source: "custom",
      host: "127.0.0.1",
      port: 587,
      username: "demo@example.test",
      fromEmail: "demo@example.test",
      fromName: "Demo website",
      password: secret,
    },
    client,
  );
  assert.equal(r.status, 200);
  smtp = await r.json();
  assert(smtp.passwordConfigured);
  assert(!JSON.stringify(smtp).includes(secret));
  const stored = JSON.parse(
    await readFile(join(directory, "smtp.json"), "utf8"),
  );
  assert(stored.encryptedPassword);
  assert(
    !JSON.stringify(stored).includes(secret),
    "SMTP password must be encrypted at rest",
  );
  assert(
    !JSON.stringify(await get(client)).includes(stored.encryptedPassword),
    "Project exports must not include SMTP credentials",
  );
  r = await request(
    "/api/builder/smtp",
    "PUT",
    { ...smtpFields(smtp), password: "" },
    client,
  );
  assert.equal(r.status, 200);
  const stale = smtp;
  smtp = await r.json();
  assert.equal(
    JSON.parse(await readFile(join(directory, "smtp.json"), "utf8"))
      .encryptedPassword,
    stored.encryptedPassword,
    "Blank password preserves existing secret",
  );
  assert.equal(
    (await request("/api/builder/smtp", "PUT", smtpFields(stale), client))
      .status,
    409,
  );
  assert.equal(
    (
      await request(
        "/api/builder/smtp",
        "PUT",
        { ...smtpFields(smtp), host: "another.example.test" },
        client,
      )
    ).status,
    400,
    "Credentials cannot be forwarded to a new host without re-entry",
  );
  assert.equal(
    (
      await request(
        "/api/builder/smtp",
        "PUT",
        { ...smtpFields(smtp), port: 25 },
        client,
      )
    ).status,
    400,
    "TLS ports only",
  );
  r = await request("/api/builder/smtp", "POST", null, client);
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /publicly reachable/);
  const enquiryProject = await get(client);
  enquiryProject.forms.recipient = "inbox@example.test";
  assert.equal((await put(enquiryProject, client)).status, 200);
  const enquiryPage = enquiryProject.pages.find((page) =>
    page.sections.some((section) => section.variant === "contact-v7"),
  );
  const enquirySection = enquiryPage.sections.find(
    (section) => section.variant === "contact-v7",
  );
  const { token } = await (
    await request(`/api/forms/token?pageId=${enquiryPage.id}`)
  ).json();
  await delay(1100);
  r = await request("/api/forms", "POST", {
    pageId: enquiryPage.id,
    sectionId: enquirySection.id,
    token,
    website: "",
    values: {
      name: "Demo delivery check",
      email: "demo@example.test",
      message: "This is an isolated local test enquiry.",
    },
  });
  assert.equal(r.status, 200, "Failed email delivery must not lose an enquiry");
  const enquiries = await (
    await request("/api/builder/submissions", "GET", null, client)
  ).json();
  assert(
    enquiries.some(
      (item) =>
        item.values.name === "Demo delivery check" &&
        item.delivery === "failed",
    ),
    "Enquiry remains in Inbox when SMTP is rejected",
  );
  assert(
    !JSON.stringify(
      await (await request("/api/builder/smtp", "GET", null, client)).json(),
    ).includes(secret),
  );
  r = await request(
    "/api/builder/smtp",
    "PUT",
    { ...smtpFields(smtp), source: "disabled" },
    client,
  );
  assert.equal(r.status, 200);
  assert.equal(
    (await request("/api/builder/accounts", "GET", null, client)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/builder/accounts",
        "PATCH",
        { id: account.id, disabled: true },
        client,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/builder/hosting", "GET", null, client)).status,
    403,
  );
  for (const path of [
    "/dashboard/team",
    "/dashboard/layout",
    "/dashboard/content",
    "/dashboard/pages/new",
    "/dashboard/settings/setup",
    "/dashboard/settings/project",
  ]) {
    r = await request(path, "GET", null, client);
    const html = await r.text();
    assert(
      r.status === 307 ||
        (r.status === 200 &&
          html.includes("NEXT_REDIRECT") &&
          html.includes("/dashboard")),
      `Protected dashboard route ${path}`,
    );
  }
  for (const path of [
    "/dashboard",
    "/dashboard/pages",
    "/dashboard/settings",
    "/dashboard/settings/client",
  ])
    assert.equal((await request(path, "GET", null, client)).status, 200);
  let project = await get(client);
  const contacts = structuredClone(project);
  contacts.brand.name = "Demo website";
  contacts.website = {
    url: "https://example.test",
    contactEmail: "hello@example.test",
    phone: "+44 20 7946 0000",
    address: "Demo street, London",
    timeZone: "Europe/London",
  };
  r = await put(contacts, client);
  assert.equal(r.status, 200);
  project = await r.json();
  assert.equal(project.website.timeZone, "Europe/London");
  const { current: firstSite } = await (
    await request("/api/builder/sites", "GET", null, client)
  ).json();
  assert.equal(firstSite.id, "default", "Existing data becomes the first site");
  // Legacy /site/{slug} redirects (fetch follows) to /site/{site-key}/{slug}.
  const live = await (await fetch(base + "/site/home")).text();
  assert(
    live.includes("hello@example.test"),
    "Shared layout email uses website settings",
  );
  assert(
    live.includes(`https://example.test/site/${firstSite.key}/home`),
    "Public canonical URL uses website URL",
  );
  const reject = async (label, change) => {
    const next = structuredClone(project);
    change(next);
    const response = await put(next, client);
    assert.equal(response.status, 403, label);
  };
  await reject("Form definitions", (p) => {p.formDefinitions=[{id:"forged-form",title:"Form",description:"",buttonLabel:"Send",layout:"compact",image:"",fields:[{id:"name",type:"text",name:"name",label:"Name",placeholder:"",required:true,width:"full",options:[]}]}];});
  await reject("Service definitions", (p) => {p.services=[{id:"forged-service",title:"Service",slug:"service",summary:"",body:"",image:"",imageAlt:"",mode:"modal",status:"Draft",formId:""}];});
  await reject("Brand colours", (p) => {
    p.brand.primary = "#abcdef";
  });
  await reject("Change home page", (p) => {
    p.layout.homePageId = p.pages.find((x) => x.id !== p.layout.homePageId).id;
  });
  await reject("New page", (p) =>
    p.pages.push({
      ...structuredClone(p.pages[0]),
      id: "forged",
      slug: "forged",
    }),
  );
  await reject("Page removal", (p) => {
    p.pages = p.pages.slice(1);
    p.layout.homePageId = p.pages[0].id;
  });
  await reject("Page URL", (p) => {
    p.pages[0].slug = "new-url";
  });
  await reject("SEO configuration", (p) => {
    p.pages[0].seo.noindex = !p.pages[0].seo.noindex;
  });
  await reject("Section removal", (p) => p.pages[0].sections.pop());
  await reject("Section duplicate", (p) =>
    p.pages[0].sections.push({ ...p.pages[0].sections[0], id: "duplicate" }),
  );
  await reject("Section hide", (p) => {
    p.pages[0].sections[0].hidden = true;
  });
  await reject("Section variation", (p) => {
    p.pages[0].sections[0].variant = "hero-v1";
  });
  await reject("Unknown content key", (p) => {
    p.pages[0].sections[0].values["--color-bg"] = "pink";
  });
  await reject("Published snapshot tampering", (p) => {
    p.pages[0].published.title = "forged";
  });
  await reject("History tampering", (p) => {
    p.pages[0].history = [
      { ...p.pages[0].published, id: "fake", kind: "Published" },
    ];
  });
  if (project.menus.length)
    await reject("Navigation", (p) => {
      p.menus[0].title = "Changed";
    });
  const next = structuredClone(project);
  const target = next.pages[0];
  const key = Object.keys(target.sections[0].values)[0];
  target.sections[0].values[key] = "Client content check";
  target.sections.reverse();
  r = await put(next, client);
  assert.equal(r.status, 200, await r.text());
  project = await get(client);
  assert.equal(
    project.pages[0].sections.at(-1).values[key],
    "Client content check",
  );
  r = await put(project, client, `/api/builder?publish=${target.id}`);
  assert.equal(r.status, 200);
  project = await r.json();
  assert.deepEqual(
    project.pages[0].published.sections,
    project.pages[0].sections,
  );
  assert.equal(
    (await put(next, client)).status,
    409,
    "Stale revision protection",
  );
  const brand = structuredClone(project);
  brand.brand.logo = "/images/hero/workspace.jpg";
  r = await put(brand, client);
  assert.equal(r.status, 200);
  project = await r.json();
  const definitions = JSON.parse(
    await readFile(
      new URL("../src/lib/builder/catalog.json", import.meta.url),
      "utf8",
    ),
  );
  const withCards = structuredClone(project);
  let checkedCards = false;
  for (const page of withCards.pages) {
    for (const section of page.sections) {
      const entry = definitions.find((d) => d.id === section.variant),
        group = entry?.repeaters?.[0];
      if (!group) continue;
      section.collections = {
        ...section.collections,
        [group.id]: group.items.map((template, index) => ({
          id: `initial-${index}`,
          template: index,
          values: Object.fromEntries(
            template.fields.map((key) => [
              key,
              section.values[key] ??
                entry.fields.find((f) => f.key === key).value,
            ]),
          ),
        })),
      };
      section.collections[group.id][0].values[group.items[0].fields[0]] =
        "Client card content";
      r = await put(withCards, client);
      assert.equal(r.status, 200, "Client can edit repeated card content");
      project = await r.json();
      const extraCards = structuredClone(project);
      extraCards.pages
        .find((p) => p.id === page.id)
        .sections.find((s) => s.id === section.id)
        .collections[group.id].push({
          ...structuredClone(section.collections[group.id][0]),
          id: "default-extra-card",
        });
      r = await put(extraCards, client);
      assert.equal(r.status, 200, "Client can manage cards by default");
      project = await r.json();
      project.pages
        .find((p) => p.id === page.id)
        .sections.find((s) => s.id === section.id).clientAccess = {
        text: true,
        images: true,
        reorder: true,
        lockedFields: [],
        collections: [],
      };
      r = await put(project, owner);
      assert.equal(r.status, 200);
      project = await r.json();
      await reject(
        "Client cannot add cards when owner disables management",
        (p) => {
          const list = p.pages
            .find((p) => p.id === page.id)
            .sections.find((s) => s.id === section.id).collections[group.id];
          list.push({ ...structuredClone(list[0]), id: "extra-card" });
        },
      );
      checkedCards = true;
      break;
    }
    if (checkedCards) break;
  }
  assert(checkedCards, "Repeatable card permission check must run");
  const image = await sharp({
    create: { width: 12, height: 12, channels: 3, background: "#eeeeee" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set("file", new Blob([image], { type: "image/png" }), "demo.png");
  r = await fetch(base + "/api/builder/media", {
    method: "POST",
    headers: { Cookie: client, Origin: base },
    body: form,
  });
  assert.equal(r.status, 200, await r.text());
  project = await get(client);
  assert(project.media.length);
  r = await put(project, client);
  assert.equal(r.status, 200, "Save after media upload");
  project = await r.json();
  const bot = structuredClone(project);
  bot.brand.primary = "#123456";
  assert.equal(
    (await botPut(bot)).status,
    403,
    "Unsigned role must default to client",
  );
  assert.equal(
    (await botPut(bot, "client")).status,
    403,
    "Signed bot client has same restrictions",
  );
  r = await botPut(bot, "super-admin");
  assert.equal(r.status, 200, "Signed bot owner retains full access");
  assert.equal(
    (await request("/api/builder/submissions", "GET", null, client)).status,
    200,
  );
  await checkProductWorkflows({ base, owner, client, directory, cronSecret });
  await checkShopInventory({base,owner,client,directory,mailSink});
  await checkCompaniesAndSites({ owner, client, account });
  await checkCustomDomains({ owner, client });
  // Admin pages are never indexed (merged from origin/main).
  const dashboardHtml = await (
    await fetch(base + "/dashboard", { headers: { Cookie: owner } })
  ).text();
  assert.match(dashboardHtml, /noindex/);
  r = await request(
    "/api/builder/accounts",
    "PATCH",
    { id: account.id, disabled: true },
    owner,
  );
  assert.equal(r.status, 200);
  assert.equal(
    (await request("/api/builder", "GET", null, client)).status,
    401,
    "Disabled account session revoked",
  );
  assert.equal(
    (
      await request("/api/builder/session", "POST", {
        email: clientEmail,
        password: clientPassword,
      })
    ).status,
    401,
  );
  r = await request(
    "/api/builder/accounts",
    "PATCH",
    { id: account.id, disabled: false },
    owner,
  );
  assert.equal(r.status, 200);
  const second = await login(clientEmail, clientPassword);
  let resetPassword = randomBytes(24).toString("hex");
  r = await request(
    "/api/builder/accounts",
    "PATCH",
    { id: account.id, password: resetPassword },
    owner,
  );
  assert.equal(r.status, 200);
  assert.equal(
    (await request("/api/builder", "GET", null, second)).status,
    401,
    "Password reset revokes sessions",
  );
  assert.equal(
    (
      await request("/api/builder/session", "POST", {
        email: clientEmail,
        password: clientPassword,
      })
    ).status,
    401,
  );
  const beforeChange = await login(clientEmail, resetPassword);
  const changedPassword = randomBytes(24).toString("hex");
  assert.equal(
    (
      await request(
        "/api/builder/password",
        "POST",
        { currentPassword: "incorrect-password", password: changedPassword },
        beforeChange,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/builder/password",
        "POST",
        { currentPassword: resetPassword, password: changedPassword },
        owner,
      )
    ).status,
    403,
  );
  r = await request(
    "/api/builder/password",
    "POST",
    { currentPassword: resetPassword, password: changedPassword },
    beforeChange,
  );
  assert.equal(r.status, 200);
  const renewed = r.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await request("/api/builder", "GET", null, renewed)).status,
    200,
    "Password change preserves the current renewed session",
  );
  assert.equal(
    (await request("/api/builder", "GET", null, beforeChange)).status,
    401,
    "Password change revokes old sessions",
  );
  assert.equal(
    (
      await request("/api/builder/session", "POST", {
        email: clientEmail,
        password: resetPassword,
      })
    ).status,
    401,
  );
  resetPassword = changedPassword;
  await login(clientEmail, resetPassword);
  for (const asset of ["/favicon.ico", "/icon.svg", "/apple-icon.png"])
    assert.equal((await request(asset)).status, 200, `Favicon asset ${asset}`);
  console.log(
    "PASS: owner/client login, API restrictions, content/publication, media, bot roles, revocation, website contacts/canonical, SMTP encryption, secret retention, TLS validation and private-host rejection.",
  );
  await checkLegacyMigration(owner);
  if (process.env.CMS_KEEP_ROLE_TEST_SERVER === "1") {
    await writeFile(
      join(directory, "submissions.json"),
      JSON.stringify({
        items: [
          {
            id: "demo-enquiry",
            createdAt: new Date().toISOString(),
            pageId: "services",
            pageTitle: "Services",
            sectionId: "demo",
            values: {
              name: "Alex Taylor",
              email: "alex@example.test",
              message:
                "Demo enquiry: we would like to discuss a new workspace for our team.",
            },
            read: false,
            delivery: "received",
          },
        ],
        limits: {},
      }),
    );
    await writeFile(
      resolve(import.meta.dirname, "../.data/role-check-login.json"),
      JSON.stringify({
        base,
        ownerEmail,
        ownerPassword,
        clientEmail,
        clientPassword: resetPassword,
        directory,
      }),
      { mode: 0o600 },
    );
    keep = true;
    console.log("Isolated UI verification server is ready.");
    await new Promise(() => {});
  }
} finally {
  if (!keep) {
    mailSink.close();
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
    await log.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function checkCompaniesAndSites({ owner, client, account }) {
  const sites = async (cookie) =>
    (await request("/api/builder/sites", "GET", null, cookie)).json();
  let registry = await sites(owner);
  assert.equal(registry.companies.length, 1);
  assert.equal(registry.sites.length, 1);
  const first = registry.sites[0];
  assert.equal(
    (
      await request(
        "/api/builder/sites",
        "POST",
        { action: "company", name: "Client company" },
        client,
      )
    ).status,
    403,
    "Clients cannot add companies",
  );
  let r = await request(
    "/api/builder/sites",
    "POST",
    { action: "company", name: "Second Company" },
    owner,
  );
  assert.equal(r.status, 201, "Create company");
  const company = await r.json();
  assert.equal(
    (
      await request(
        "/api/builder/sites",
        "POST",
        { action: "rename-company", id: company.id, name: "Taken over" },
        client,
      )
    ).status,
    403,
    "Clients cannot rename companies",
  );
  assert.equal(
    (
      await request(
        "/api/builder/sites",
        "POST",
        { action: "rename-company", id: company.id, name: " " },
        owner,
      )
    ).status,
    400,
    "Company names are validated",
  );
  r = await request(
    "/api/builder/sites",
    "POST",
    { action: "rename-company", id: company.id, name: "Second Company Ltd" },
    owner,
  );
  assert.equal(r.status, 200, "Rename company");
  assert.equal(
    (
      await request(
        "/api/builder/sites",
        "POST",
        { action: "pin-company", id: company.id, pinned: true },
        client,
      )
    ).status,
    403,
    "Clients cannot pin companies",
  );
  const pinned = await request(
    "/api/builder/sites",
    "POST",
    { action: "pin-company", id: company.id, pinned: true },
    owner,
  );
  assert.equal(pinned.status, 200, "Pin company");
  assert.equal((await pinned.json()).pinned, true);
  assert.equal((await r.json()).name, "Second Company Ltd");
  assert(
    (await sites(owner)).companies.some(
      (item) => item.id === company.id && item.name === "Second Company Ltd",
    ),
    "Renamed company is stored",
  );
  r = await request(
    "/api/builder/sites",
    "POST",
    {
      action: "site",
      companyId: company.id,
      name: "Second site",
      key: "second-site",
    },
    owner,
  );
  assert.equal(r.status, 201, "Create site");
  const second = await r.json();
  assert.equal(second.key, "second-site");
  assert.equal(
    (
      await request(
        "/api/builder/sites",
        "POST",
        {
          action: "site",
          companyId: company.id,
          name: "x",
          key: "second-site",
        },
        owner,
      )
    ).status,
    409,
    "Site keys are unique",
  );
  r = await request(
    "/api/builder/sites",
    "POST",
    {
      action: "site",
      companyId: company.id,
      name: "Copied site",
      copyFrom: first.id,
    },
    owner,
  );
  assert.equal(r.status, 201, "Copy site");
  const copy = await r.json();
  const copied = await (
    await request(`/api/builder?site=${copy.id}`, "GET", null, owner)
  ).json();
  const original = await (
    await request(`/api/builder?site=${first.id}`, "GET", null, owner)
  ).json();
  assert.equal(copied.pages.length, original.pages.length);
  assert.equal(copied.revision, 0);
  assert(
    JSON.stringify(copied).includes(`/site/${copy.key}/services`),
    "Copied internal links point to the copy",
  );
  assert.equal(copied.brand.name, "Copied site", "A copy takes its own name");
  assert(
    copied.pages.every((page) => page.status === "Draft" && !page.published),
    "A copy starts unpublished",
  );
  assert.equal(
    (await fetch(base + `/site/${copy.key}/home`)).status,
    404,
    "Pages of a copy are not public until published",
  );
  // Addresses that would collide with a website id or a page of the first website.
  for (const key of ["default", "services", copy.id])
    assert.equal(
      (
        await request(
          "/api/builder/sites",
          "POST",
          { action: "site", companyId: company.id, name: "Clash", key },
          owner,
        )
      ).status,
      409,
      `Reserved website address is rejected: ${key}`,
    );
  assert.equal(
    (
      await fetch(base + "/api/builder", {
        headers: { Cookie: `${owner}; cms_site=%E0%A4%A` },
      })
    ).status,
    200,
    "A malformed website cookie is ignored",
  );
  registry = await sites(owner);
  assert.equal(registry.sites.length, 3);
  const siteUrl = (path, id = second.id) =>
    `${path}${path.includes("?") ? "&" : "?"}site=${id}`;
  let project = await (
    await request(siteUrl("/api/builder"), "GET", null, owner)
  ).json();
  assert.equal(project.brand.name, "Second site");
  assert(
    project.media.every((item) => !item.url.startsWith("/api/builder/media/")),
    "New site starts with sample images only, no uploads of other sites",
  );
  // Media isolation.
  const image = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#cccccc" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set("file", new Blob([image], { type: "image/png" }), "site-b.png");
  r = await fetch(base + siteUrl("/api/builder/media"), {
    method: "POST",
    headers: { Cookie: owner, Origin: base },
    body: form,
  });
  assert.equal(r.status, 200, "Upload to second site");
  const { asset } = await r.json();
  assert(asset.url.startsWith(`/api/builder/media/${second.id}/`));
  r = await fetch(base + asset.url);
  assert.equal(r.status, 200, "Per-site media URL resolves");
  assert.equal(r.headers.get("content-type"), "image/webp");
  const firstProject = await (
    await request(siteUrl("/api/builder", first.id), "GET", null, owner)
  ).json();
  assert(
    !firstProject.media.some((item) => item.url === asset.url),
    "Media of site B is not visible in site A",
  );
  assert(firstProject.media.every((item) => !item.url.includes(second.id)));
  // Submission isolation.
  project = await (
    await request(siteUrl("/api/builder"), "GET", null, owner)
  ).json();
  project.forms = {
    enabled: true,
    recipient: "",
    successMessage: "Thanks from site B",
  };
  r = await request(siteUrl("/api/builder"), "PUT", project, owner);
  assert.equal(r.status, 200);
  project = await r.json();
  const formPage = project.pages.find(
    (page) =>
      page.published &&
      page.sections.some((section) => section.variant === "contact-v7"),
  );
  assert(formPage, "Second site has a published form page");
  const formSection = formPage.sections.find(
    (section) => section.variant === "contact-v7",
  );
  const firstToken = (
    await (await request(`/api/forms/token?pageId=${formPage.id}`)).json()
  ).token;
  const { token } = await (
    await request(`/api/forms/token?pageId=${formPage.id}&site=${second.id}`)
  ).json();
  await delay(1100);
  const enquiry = (site, value) => ({
    site,
    pageId: formPage.id,
    sectionId: formSection.id,
    token: value,
    website: "",
    values: {
      name: "Site B visitor",
      email: "b@example.test",
      message: "Isolated enquiry for the second website.",
    },
  });
  if (firstToken)
    assert.equal(
      (await request("/api/forms", "POST", enquiry(second.id, firstToken)))
        .status,
      403,
      "A form token of one site is rejected by another",
    );
  r = await request("/api/forms", "POST", enquiry(second.id, token));
  assert.equal(r.status, 200, "Enquiry to second site");
  assert.equal((await r.json()).message, "Thanks from site B");
  const inboxB = await (
    await request(siteUrl("/api/builder/submissions"), "GET", null, owner)
  ).json();
  assert(inboxB.some((item) => item.values.name === "Site B visitor"));
  const inboxA = await (
    await request(
      siteUrl("/api/builder/submissions", first.id),
      "GET",
      null,
      owner,
    )
  ).json();
  assert(
    !inboxA.some((item) => item.values.name === "Site B visitor"),
    "Submission of site B is not visible in site A",
  );
  // Client access is limited to the assigned websites (default: the first one).
  const clientView = await sites(client);
  assert.deepEqual(
    clientView.sites.map((site) => site.id),
    [first.id],
    "Client sees only assigned sites",
  );
  for (const path of [
    "/api/builder",
    "/api/builder/submissions",
    "/api/builder/smtp",
    "/api/builder/sites",
    "/api/builder/catalog",
    "/api/builder/catalog/export",
  ])
    assert.equal(
      (await request(siteUrl(path), "GET", null, client)).status,
      403,
      `Client restricted to one site gets 403 on another: ${path}`,
    );
  // Product catalogue: the client manages products of its own website only; settings are design-only.
  assert.equal(
    (await request(siteUrl("/api/builder/catalog", first.id), "GET", null, client)).status,
    200,
    "Client reads the catalogue of its website",
  );
  assert.equal(
    (await request(siteUrl("/api/builder/catalog"), "POST", { price: 1, text: { en: { name: "X", slug: "role-test-x" } } }, client)).status,
    403,
    "Client cannot add products to another website",
  );
  assert.equal(
    (await request(siteUrl("/api/builder/catalog/settings", first.id), "PUT", { filters: [], priceFormat: "{n} €" }, client)).status,
    403,
    "Catalogue settings are for the design team",
  );
  for (const path of ["/dashboard/shop/products", "/dashboard/shop/orders", "/dashboard/shop/settings"])
    assert.equal((await request(path, "GET", null, client)).status, 200, `Client opens unified shop: ${path}`);
  assert.equal((await request("/dashboard/catalog", "GET", null, client)).headers.get("location"), "/dashboard/shop/products", "Old catalogue link leads to unified shop");
  const clientCatalog = await request(siteUrl("/api/builder/catalog", first.id), "GET", null, client);
  const clientCatalogData = await clientCatalog.json();
  const originalSettings = clientCatalogData.catalog.settings;
  const catalogRevision = clientCatalogData.catalog.revision;
  const categoriesUpdate = await request(siteUrl("/api/builder/catalog/settings", first.id), "PATCH", {categories:["Lighting", "Furniture"], revision:catalogRevision}, client);
  assert.equal(categoriesUpdate.status, 200, "Client maintains its own shop categories");
  const categoriesUpdated = await categoriesUpdate.json();
  assert.deepEqual(categoriesUpdated.settings, {...originalSettings, categories:["Lighting", "Furniture"]}, "Category update preserves every design setting");
  assert.equal((await request(siteUrl("/api/builder/catalog/settings", first.id), "PATCH", {categories:[],revision:catalogRevision}, client)).status, 409, "Stale category edits cannot overwrite newer changes");
  assert.equal((await request(siteUrl("/api/builder/catalog/settings", first.id), "PATCH", {categories:[],revision:categoriesUpdated.revision,filters:[]}, client)).status, 400, "Category endpoint rejects design changes");
  assert.equal((await request(siteUrl("/api/builder/catalog/settings"), "PATCH", {categories:[],revision:0}, client)).status, 403, "Client cannot change another shop's categories");
  const clientUpload = new FormData();
  clientUpload.set("file", new Blob([image], { type: "image/png" }), "x.png");
  assert.equal(
    (
      await fetch(base + siteUrl("/api/builder/media"), {
        method: "POST",
        headers: { Cookie: client, Origin: base },
        body: clientUpload,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/builder/accounts",
        "PATCH",
        { id: account.id, scope: { companies: [company.id], sites: [] } },
        client,
      )
    ).status,
    403,
    "Clients cannot change their own access",
  );
  r = await request(
    "/api/builder/accounts",
    "PATCH",
    {
      id: account.id,
      scope: { companies: [company.id], sites: ["unknown"] },
    },
    owner,
  );
  assert.equal(r.status, 200, "Owner assigns a company");
  assert.deepEqual((await r.json()).scope, {
    companies: [company.id],
    sites: [],
  });
  assert.equal(
    (await request(siteUrl("/api/builder"), "GET", null, client)).status,
    200,
    "Company access covers its websites without a new sign-in",
  );
  assert.equal(
    (await request(siteUrl("/api/builder", first.id), "GET", null, client))
      .status,
    403,
  );
  r = await request(
    "/api/builder/accounts",
    "PATCH",
    { id: account.id, scope: { companies: [], sites: [first.id] } },
    owner,
  );
  assert.equal(r.status, 200);
  // Public URLs.
  r = await fetch(base + "/site/second-site/home");
  assert.equal(r.status, 200, "Public page of the second site");
  assert((await r.text()).includes("Second site"));
  r = await fetch(base + "/site/home", { redirect: "manual" });
  assert.equal(r.status, 307, "Old /site/home redirects");
  assert.equal(
    new URL(r.headers.get("location"), base).pathname,
    `/site/${first.key}/home`,
  );
  r = await fetch(base + "/site/second-site", { redirect: "manual" });
  assert.equal(r.status, 307);
  assert.equal(
    new URL(r.headers.get("location"), base).pathname,
    "/site/second-site/home",
  );
  assert.equal((await fetch(base + "/site/no-such-site/home")).status, 404);
  // Signed bot requests select a website by key; unscoped ones keep the first site.
  assert.equal(
    (await botPut(null, "client", undefined, "GET", "second-site")).status,
    403,
    "Signed client stays on the first website",
  );
  r = await botPut(null, "super-admin", undefined, "GET", "second-site");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).brand.name, "Second site");
  r = await botPut(null, "client", undefined, "GET");
  assert.equal((await r.json()).revision, (await get(owner)).revision);
  r = await botPut(null, "client", "sites", "GET");
  assert.deepEqual(
    (await r.json()).map((site) => site.id),
    [first.id],
    "Signed client lists only the first website",
  );
  r = await botPut(null, "super-admin", "sites", "GET");
  assert.equal((await r.json()).length, 3);
  console.log(
    "PASS: companies and websites, copies, per-site media/enquiries isolation, client site scopes, public /site/{site}/{slug} URLs, legacy redirects and bot site selection.",
  );
}
// Custom domains (Settings → Domain, BUILDER.md → Custom domains): who may connect a domain,
// one website per domain, validation, and host routing through src/proxy.ts.
async function checkCustomDomains({ owner, client }) {
  const { sites } = await (await request("/api/builder/sites", "GET", null, owner)).json();
  const first = sites[0];
  const second = sites.find((site) => site.key === "second-site");
  const domains = (id) => `/api/builder/domains?site=${encodeURIComponent(id)}`;
  // The client opens and edits the domains of its own website only.
  let r = await request(domains(first.id), "GET", null, client);
  assert.equal(r.status, 200, "Client opens Domain of its website");
  assert.equal((await request(domains(second.id), "GET", null, client)).status, 403, "Client: Domain of another website");
  assert.equal(
    (await request(domains(second.id), "POST", { action: "add", domain: "other.test" }, client)).status,
    403,
    "Client cannot connect a domain to another website",
  );
  r = await request(domains(first.id), "POST", { action: "add", domain: "Roles-Check.test" }, client);
  assert.equal(r.status, 201, "Client connects a domain");
  const added = (await r.json()).domain;
  assert.equal(added.domain, "roles-check.test");
  assert.equal(added.primary, true);
  assert.ok(added.records.some((x) => x.type === "TXT" && x.name === "_harbstone-verify"));
  assert.ok(added.records.some((x) => x.type === "A" && x.name === "@"));
  assert.notEqual(added.status, "active", "No DNS for .test: not active");
  // Main mode: one step at the registrar (nameservers); email records are read before the switch.
  assert.deepEqual(added.nameservers, ["ns1.vercel-dns.com", "ns2.vercel-dns.com"], "Nameservers from HOSTING_NAMESERVERS defaults");
  assert.ok(Array.isArray(added.imports), "Found email records listed");
  r = await request(domains(first.id), "POST", { action: "imports", domain: "roles-check.test", selected: [] }, client);
  assert.equal(r.status, 200, "Client saves the record selection");
  assert.equal((await request(domains(second.id), "POST", { action: "scan", domain: "roles-check.test" }, client)).status, 403);
  assert.ok(!("token" in (added.cloudflare || {})), "No Cloudflare token in responses");
  for (const domain of ["https://x.test", "x.test/path", "localhost", "127.0.0.1", "bad_domain", "a.trycloudflare.com"])
    assert.equal(
      (await request(domains(first.id), "POST", { action: "add", domain }, client)).status,
      400,
      `Invalid domain rejected: ${domain}`,
    );
  // One website per domain.
  r = await request(domains(second.id), "POST", { action: "add", domain: "www.roles-check.test" }, owner);
  assert.equal(r.status, 409, "A domain belongs to one website only");
  // Designer of the second website (and only that one).
  const designerEmail = "designer@example.test",
    designerPassword = randomBytes(24).toString("hex");
  r = await request(
    "/api/builder/accounts",
    "POST",
    { name: "Designer", email: designerEmail, password: designerPassword, role: "designer", scope: { companies: [], sites: [second.id] } },
    owner,
  );
  assert.equal(r.status, 201, "Owner creates a designer");
  const designer = await login(designerEmail, designerPassword);
  assert.equal((await request(`/api/builder/payments?site=${second.id}`,"GET",null,designer)).status,403,"Designer cannot read merchant payment configuration");
  assert.equal((await request(`/api/builder/payments?site=${second.id}`,"PUT",{},designer)).status,403,"Designer cannot change merchant keys");
  assert.equal((await request(`/api/builder/payments?site=${second.id}`,"GET",null,client)).status,403,"Client cannot read another website payment configuration");
  const designerShopOrders = await request("/dashboard/shop/orders", "GET", null, designer);
  const designerShopHtml = await designerShopOrders.text();
  assert(designerShopOrders.headers.get("location") === "/dashboard/shop/products" || (designerShopHtml.includes("NEXT_REDIRECT") && designerShopHtml.includes("/dashboard/shop/products")), "Designer cannot open customer orders in the unified shop");

  r = await request(domains(second.id), "POST", { action: "add", domain: "designer-check.test" }, designer);
  assert.equal(r.status, 201, "Designer connects a domain");
  assert.equal((await request(domains(first.id), "GET", null, designer)).status, 403, "Designer: other website");
  r = await request(domains(second.id), "POST", { action: "remove", domain: "designer-check.test" }, designer);
  assert.equal(r.status, 200, "Designer disconnects a domain");
  assert.equal(
    (await request(domains(first.id), "POST", { action: "remove", domain: "roles-check.test" }, designer)).status,
    403,
  );
  // Host routing: mark the domain verified as a successful DNS check would.
  const file = join(directory, "domains.json");
  const doc = JSON.parse(await readFile(file, "utf8"));
  const record = doc.domains.find((d) => d.domain === "roles-check.test");
  record.status = "active";
  record.verifiedAt = record.checkedAt = new Date().toISOString();
  await writeFile(file, JSON.stringify(doc));
  await delay(11000); // proxy lookup (2 s) and primaryDomain (10 s) caches: the file was edited behind the store
  const hostGet = (path, host) =>
    new Promise((resolve, reject) => {
      const req = http.request(base + path, { headers: { host } }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location, body }));
      });
      req.on("error", reject);
      req.end();
    });
  r = await hostGet("/", "roles-check.test");
  assert.equal(r.status, 200, "Domain serves its website at /");
  assert.match(r.body, /<link rel="canonical" href="https:\/\/roles-check\.test\/?"/);
  assert.ok(!/href="\/site\//.test(r.body), `No /site/{key} links on the domain: ${r.body.match(/href="\/site\/[^"]*"/)?.[0]}`);
  r = await hostGet("/home", "roles-check.test");
  assert.equal(r.status, 308, "Home slug redirects to /");
  assert.equal(r.location, "/");
  r = await hostGet("/", "www.roles-check.test");
  assert.equal(r.status, 308, "www redirects to the primary domain");
  assert.equal(r.location, "https://roles-check.test/");
  r = await hostGet("/sitemap.xml", "roles-check.test");
  assert.equal(r.status, 200);
  assert.match(r.body, /<loc>https:\/\/roles-check\.test\//);
  r = await hostGet("/robots.txt", "roles-check.test");
  assert.match(r.body, /Sitemap: https:\/\/roles-check\.test\/sitemap\.xml/);
  for (const path of ["/dashboard", "/login", "/api/builder", "/api/builder/sites", "/api/builder/domains", "/site/second-site/home"])
    assert.equal((await hostGet(path, "roles-check.test")).status, 404, `Not on the client domain: ${path}`);
  assert.equal((await hostGet("/", "unknown-host.test")).status, 404, "Unknown host: 404, not another website");
  assert.equal((await hostGet("/", "designer-check.test")).status, 404, "Removed domain: 404");
  r = await hostGet(`/site/${first.key}/home`, new URL(base).host);
  assert.equal(r.status, 200, "CMS host keeps /site/{key}/…");
  assert.match(r.body, /<link rel="canonical" href="https:\/\/roles-check\.test\/?"/, "Canonical points to the domain");
  r = await request(domains(first.id), "POST", { action: "remove", domain: "roles-check.test" }, client);
  assert.equal(r.status, 200, "Client disconnects its domain");
  console.log(
    "PASS: custom domains (client / designer / owner rights, one website per domain, validation, host routing, www redirect, sitemap/robots/canonical on the domain, admin paths 404).",
  );
}
// A legacy single-project data directory becomes company 1 / site 1 on first read.
async function checkLegacyMigration(owner) {
  const legacy = await mkdtemp(join(tmpdir(), "harbstone-legacy-check-"));
  const legacyPort = port + 1,
    legacyBase = `http://localhost:${legacyPort}`;
  try {
    await fetch(legacyBase);
    throw Error(`Port ${legacyPort} is busy; set CMS_ROLE_TEST_PORT.`);
  } catch (e) {
    if (e.message.startsWith("Port")) throw e;
  }
  const project = await get(owner);
  project.brand.name = "Legacy Studio";
  const media = project.media.find((item) =>
    /^\/api\/builder\/media\/[a-f0-9-]{36}$/.test(item.url),
  );
  assert(media, "Legacy fixture needs an uploaded image");
  const mediaId = media.url.split("/").at(-1);
  await mkdir(join(legacy, "media"));
  await copyFile(
    join(directory, "media", mediaId + ".webp"),
    join(legacy, "media", mediaId + ".webp"),
  );
  await writeFile(join(legacy, "project.json"), JSON.stringify(project));
  await writeFile(
    join(legacy, "submissions.json"),
    JSON.stringify({
      items: [
        {
          id: "legacy-enquiry",
          createdAt: new Date().toISOString(),
          pageId: "home",
          pageTitle: "Home",
          sectionId: "legacy",
          values: { name: "Legacy visitor" },
          read: false,
          delivery: "received",
        },
      ],
      limits: {},
    }),
  );
  const legacyLog = await open(join(legacy, "server.log"), "w");
  const legacyServer = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(legacyPort)],
    {
      cwd: resolve(import.meta.dirname, ".."),
      stdio: ["ignore", legacyLog.fd, legacyLog.fd],
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "",
        BLOB_READ_WRITE_TOKEN: "",
        VERCEL: "",
        CMS_DATA_DIRECTORY: legacy,
        CMS_ADMIN_EMAIL: ownerEmail,
        CMS_ADMIN_PASSWORD: ownerPassword,
        CMS_AUTH_SECRET: randomBytes(40).toString("hex"),
      },
    },
  );
  try {
    for (let i = 0; i < 90; i++) {
      try {
        if ((await fetch(legacyBase + "/login")).ok) break;
      } catch {}
      if (i === 89) throw Error("Legacy migration server did not start.");
      await delay(500);
    }
    const login = await fetch(legacyBase + "/api/builder/session", {
      method: "POST",
      headers: { Origin: legacyBase, "Content-Type": "application/json" },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const read = (path) =>
      fetch(legacyBase + path, { headers: { Cookie: cookie } });
    const registry = await (await read("/api/builder/sites")).json();
    assert.deepEqual(
      registry.companies.map(({ id, name }) => ({ id, name })),
      [{ id: "default", name: "Legacy Studio" }],
      "Legacy project becomes company 1",
    );
    assert.deepEqual(
      registry.sites.map(({ id, key, companyId }) => ({ id, key, companyId })),
      [{ id: "default", key: "legacy-studio", companyId: "default" }],
      "Legacy project becomes site 1",
    );
    assert.equal(registry.current.id, "default");
    const migrated = await (await read("/api/builder")).json();
    assert.equal(migrated.brand.name, "Legacy Studio");
    assert.equal(migrated.pages.length, project.pages.length);
    assert.equal(migrated.revision, project.revision, "Nothing is rewritten");
    const inbox = await (await read("/api/builder/submissions")).json();
    assert(inbox.some((item) => item.id === "legacy-enquiry"));
    assert.equal((await fetch(legacyBase + media.url)).status, 200);
    const again = await (await read("/api/builder/sites")).json();
    assert.deepEqual(again.sites, registry.sites, "Migration is idempotent");
    await access(join(legacy, "companies.json"));
    await access(join(legacy, "project.json"));
    const redirect = await fetch(legacyBase + "/site/home", {
      redirect: "manual",
    });
    assert.equal(
      new URL(redirect.headers.get("location"), legacyBase).pathname,
      "/site/legacy-studio/home",
    );
    console.log(
      "PASS: legacy single-project data migrates to company 1 / site 1 idempotently; files, enquiries and media URLs are preserved.",
    );
  } finally {
    legacyServer.kill("SIGTERM");
    await new Promise((resolve) => legacyServer.once("exit", resolve));
    await legacyLog.close();
    await rm(legacy, { recursive: true, force: true });
  }
}
