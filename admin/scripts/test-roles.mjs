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
async function botPut(data, role) {
  const query = role ? `?actor=${role}` : "";
  const path = "/api/builder/bot" + query,
    body = JSON.stringify(data),
    time = String(Date.now()),
    nonce = randomBytes(18).toString("base64url");
  const signature = sign(
    null,
    Buffer.from(
      `${time}\n${nonce}\nPUT\n${path}\n${createHash("sha256").update(body).digest("hex")}`,
    ),
    privateKey,
  ).toString("base64");
  return fetch(base + path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-harbstone-time": time,
      "x-harbstone-nonce": nonce,
      "x-harbstone-signature": signature,
    },
    body,
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
  brand.brand.logo = "/images/demo-logo.svg";
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
  const resetPassword = randomBytes(24).toString("hex");
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
  await login(clientEmail, resetPassword);
  console.log(
    "PASS: isolated owner/client login, account management, direct API restrictions, protected routes, content/reordering/publication, media, bot roles, revision conflicts and session revocation.",
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
