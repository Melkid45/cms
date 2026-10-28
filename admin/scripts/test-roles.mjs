import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  randomBytes,
  generateKeyPairSync,
  sign,
  createHash,
} from "node:crypto";
import { mkdtemp, writeFile, readFile, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
const directory = await mkdtemp(join(tmpdir(), "harbstone-role-check-"));
const port = Number(process.env.CMS_ROLE_TEST_PORT || 3101),
  base = `http://localhost:${port}`;
const ownerPassword = randomBytes(24).toString("hex"),
  clientPassword = randomBytes(24).toString("hex");
const ownerEmail = "owner@example.test",
  clientEmail = "client@example.test";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const log = await open(join(directory, "server.log"), "w");
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  {
    cwd: resolve(import.meta.dirname, ".."),
    stdio: ["ignore", log.fd, log.fd],
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "",
      BLOB_READ_WRITE_TOKEN: "",
      VERCEL: "",
      SMTP_HOST: "",
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
async function botPut(data, role, resource, method = "PUT") {
  const params = new URLSearchParams();
  if (role) params.set("actor", role);
  if (resource) params.set("resource", resource);
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
  const live = await (await fetch(base + "/site/home")).text();
  assert(
    live.includes("hello@example.test"),
    "Shared layout email uses website settings",
  );
  assert(
    live.includes("https://example.test/site/home"),
    "Public canonical URL uses website URL",
  );
  const reject = async (label, change) => {
    const next = structuredClone(project);
    change(next);
    const response = await put(next, client);
    assert.equal(response.status, 403, label);
  };
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
      await reject("Client cannot add repeatable cards", (p) => {
        const list = p.pages
          .find((p) => p.id === page.id)
          .sections.find((s) => s.id === section.id).collections[group.id];
        list.push({ ...structuredClone(list[0]), id: "extra-card" });
      });
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
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
    await log.close();
    await rm(directory, { recursive: true, force: true });
  }
}
