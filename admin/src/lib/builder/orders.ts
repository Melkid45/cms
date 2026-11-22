import "server-only";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { withDoc } from "./doc-store";
import { database, dataDirectory, StoreError } from "./server";
import { buildBrief, interview } from "./interview";
import { aiComplete, aiEnabled } from "./ai";
import { notifyTeam } from "./notifications";
import type { Identity } from "./access";
export type OrderStatus =
  | "interview" // client is answering questions
  | "submitted" // brief generated, waiting for client confirmation
  | "confirmed" // client confirmed brief and plan; team takes over
  | "in-progress" // designer works on the website
  | "review" // shown to the client
  | "live"
  | "cancelled";
export const orderStatuses: OrderStatus[] = [
  "interview",
  "submitted",
  "confirmed",
  "in-progress",
  "review",
  "live",
  "cancelled",
];
export interface OrderFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  uploadedAt: string;
}
export interface OrderTask {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  by: string;
}
export interface OrderEvent {
  at: string;
  text: string;
  by: string;
}
export interface Order {
  id: string;
  number: number;
  // sha256 of the client's secret link token; the token itself is never stored.
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  contact: { name: string; email: string; phone: string };
  answers: Record<string, string>;
  files: OrderFile[];
  brief: string;
  plan?: "monthly" | "yearly";
  pack?: "standard" | "designer";
  // Promised delivery time of the first version.
  dueAt?: string;
  companyId?: string;
  siteId?: string;
  accountId?: string;
  designerId?: string;
  tasks: OrderTask[];
  events: OrderEvent[];
  // Why the team has to step in (shown as a badge until resolved).
  needsAction?: string;
  // AI summary and site plan for the team, written after the interview (paid, optional).
  aiBrief?: { text: string; model: string; cost: number; createdAt: string };
}
type Store = { next: number; items: Order[] };
const store = <T>(fn: (data: Store) => T | Promise<T>, write = true) =>
  withDoc<Store, T>("orders", () => ({ next: 1, items: [] }), fn, write);
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function checkToken(order: Order, token: string | null) {
  const expected = Buffer.from(order.tokenHash, "hex");
  const actual = Buffer.from(hash(token || ""), "hex");
  if (!token || !timingSafeEqual(expected, actual))
    throw new StoreError("Order not found.", 404);
}
const find = (data: Store, id: string) => {
  const order = data.items.find((item) => item.id === id);
  if (!order) throw new StoreError("Order not found.", 404);
  return order;
};
const event = (order: Order, text: string, by: string) => {
  order.events.push({ at: new Date().toISOString(), text, by });
  order.updatedAt = new Date().toISOString();
};
// What the client may see of their own order.
export const clientView = (order: Order) => ({
  id: order.id,
  number: order.number,
  status: order.status,
  contact: order.contact,
  answers: order.answers,
  files: order.files.map(({ id, name, size }) => ({ id, name, size })),
  brief: order.brief,
  plan: order.plan,
  pack: order.pack,
  dueAt: order.dueAt,
  siteId: order.siteId,
  createdAt: order.createdAt,
});
export async function createOrder() {
  const token = randomBytes(24).toString("base64url");
  const order = await store((data) => {
    if (data.items.filter((item) => item.status === "interview").length > 2000)
      throw new StoreError("Please try again later.", 503);
    const now = new Date().toISOString();
    const item: Order = {
      id: randomUUID(),
      number: data.next++,
      tokenHash: hash(token),
      createdAt: now,
      updatedAt: now,
      status: "interview",
      contact: { name: "", email: "", phone: "" },
      answers: {},
      files: [],
      brief: "",
      tasks: [],
      events: [{ at: now, text: "Interview started", by: "client" }],
    };
    data.items.unshift(item);
    return item;
  });
  return { order: clientView(order), token };
}
export const readClientOrder = (id: string, token: string | null) =>
  store((data) => {
    const order = find(data, id);
    checkToken(order, token);
    return clientView(order);
  }, false);
// Answers arrive one by one, so keys are checked against the script instead of
// z.record(z.enum(...)), which in zod 4 requires every key to be present.
const questionIds = new Set(interview.map((q) => q.id));
const answersInput = z
  .record(z.string(), z.string().max(5000))
  .refine(
    (value) =>
      Object.keys(value).length <= interview.length &&
      Object.keys(value).every((id) => questionIds.has(id)),
  );
const contactInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  phone: z.string().trim().max(40).default(""),
});
export const orderUpdate = z
  .object({
    answers: answersInput.optional(),
    contact: contactInput.optional(),
    submit: z.boolean().optional(),
  })
  .strict();
// Saves interview answers; submit builds the brief and notifies the team.
export async function updateClientOrder(
  id: string,
  token: string | null,
  input: z.infer<typeof orderUpdate>,
) {
  let submitted: Order | undefined;
  const view = await store((data) => {
    const order = find(data, id);
    checkToken(order, token);
    if (!["interview", "submitted"].includes(order.status))
      throw new StoreError("This brief is already confirmed.", 409);
    if (input.answers) order.answers = { ...order.answers, ...input.answers };
    if (input.contact) order.contact = input.contact;
    if (input.submit) {
      if (!order.contact.email)
        throw new StoreError("Add your name and email first.");
      const missing = interview.find(
        (q) => !q.optional && q.kind !== "file" && !order.answers[q.id]?.trim(),
      );
      if (missing) throw new StoreError(`Please answer: ${missing.text}`);
      order.brief = buildBrief({
        answers: order.answers,
        contact: order.contact,
        files: order.files,
      });
      if (order.answers.features?.trim())
        order.needsAction = `Quote a custom block: ${order.answers.features.trim().slice(0, 200)}`;
      if (order.status === "interview") submitted = order;
      order.status = "submitted";
      event(order, "Brief generated", "client");
    }
    order.updatedAt = new Date().toISOString();
    return clientView(order);
  });
  if (submitted)
    await notifyTeam({
      kind: "order-new",
      title: `New website order #${submitted.number}`,
      text: `${submitted.answers.business || "A new client"} (${submitted.contact.name}, ${submitted.contact.email}) finished the interview. Waiting for the client to confirm the brief.`,
      href: `/dashboard/orders/${submitted.id}`,
    });
  return view;
}
// Writes the AI summary of a submitted order for the team. Never throws: the plain
// brief always exists, AI is an extra.
export async function writeAiBrief(id: string) {
  if (!aiEnabled()) return;
  const order = await store((data) => find(data, id), false).catch(() => null);
  if (!order?.brief || order.status === "interview") return;
  try {
    const result = await aiComplete({
      system:
        "You are a senior web project lead at Harbstone, a studio that builds small-business websites from a library of designer-made sections (hero, about, services, gallery, projects, process, pricing, testimonials, faq, contact). Write for the internal team in English, plain text, no markdown tables. Sections: 1) Summary (3-4 sentences). 2) Site map: each page with the sections it needs, in order. 3) Content to collect from the client. 4) Open questions and risks (custom features that need a paid custom block). Be concrete and short.",
      user: order.brief,
      maxTokens: 1500,
    });
    await store((data) => {
      const item = find(data, id);
      item.aiBrief = {
        text: result.text,
        model: result.model,
        cost: result.cost,
        createdAt: new Date().toISOString(),
      };
      event(item, "AI summary written", "system");
    });
  } catch {
    // Budget used up, service down or AI off: the team works from the plain brief.
  }
}
export const confirmInput = z
  .object({
    plan: z.enum(["monthly", "yearly"]),
    pack: z.enum(["standard", "designer"]),
  })
  .strict();
// Client confirms the brief and chooses a plan. Website creation and invoices are
// handled by the caller (route) so this module stays free of registry/billing imports.
export async function confirmClientOrder(
  id: string,
  token: string | null,
  plan: "monthly" | "yearly",
  pack: "standard" | "designer",
  hours: number,
) {
  return store((data) => {
    const order = find(data, id);
    checkToken(order, token);
    if (order.status !== "submitted")
      throw new StoreError("Review the brief before confirming.", 409);
    order.status = "confirmed";
    order.plan = plan;
    order.pack = pack;
    order.dueAt = new Date(Date.now() + hours * 3600000).toISOString();
    order.needsAction =
      pack === "designer"
        ? `Designer pack: assign a designer, first version due in ${hours} h.`
        : "Review the draft website and assign a designer if needed.";
    event(order, `Brief confirmed: ${pack} pack, ${plan} hosting`, "client");
    return order;
  });
}
export async function linkOrder(
  id: string,
  patch: Partial<Pick<Order, "companyId" | "siteId" | "accountId">>,
  text: string,
) {
  return store((data) => {
    const order = find(data, id);
    Object.assign(order, patch);
    event(order, text, "system");
    return order;
  });
}
// Team view: the owner sees every order, a designer only those assigned to them.
const visible = (order: Order, viewer: Identity) =>
  viewer.role === "super-admin" ||
  (viewer.role === "designer" && order.designerId === viewer.id);
const teamView = ({ tokenHash, ...order }: Order) => {
  void tokenHash;
  return order;
};
export const listOrders = (viewer: Identity) =>
  store(
    (data) =>
      data.items
        .filter((order) => visible(order, viewer))
        .filter(
          (order) =>
            viewer.role === "super-admin" || order.status !== "interview",
        )
        .map(teamView),
    false,
  );
export const readOrder = (id: string, viewer: Identity) =>
  store((data) => {
    const order = find(data, id);
    if (!visible(order, viewer)) throw new StoreError("Order not found.", 404);
    return teamView(order);
  }, false);
export const teamUpdate = z
  .object({
    status: z.enum(orderStatuses as [OrderStatus, ...OrderStatus[]]).optional(),
    designerId: z.string().max(100).nullable().optional(),
    needsAction: z.string().max(500).nullable().optional(),
    addTask: z.string().trim().min(1).max(1000).optional(),
    toggleTask: z.string().max(100).optional(),
    note: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export async function updateOrder(
  id: string,
  viewer: Identity,
  input: z.infer<typeof teamUpdate>,
) {
  const owner = viewer.role === "super-admin";
  if (
    !owner &&
    (input.designerId !== undefined || input.status === "cancelled")
  )
    throw new StoreError("Only the super admin can do this.", 403);
  let assigned: Order | undefined;
  const result = await store((data) => {
    const order = find(data, id);
    if (!visible(order, viewer)) throw new StoreError("Order not found.", 404);
    const by = viewer.name || viewer.email;
    if (input.status && input.status !== order.status) {
      order.status = input.status;
      event(order, `Status: ${input.status}`, by);
    }
    if (input.designerId !== undefined) {
      order.designerId = input.designerId || undefined;
      event(
        order,
        input.designerId ? "Designer assigned" : "Designer removed",
        by,
      );
      if (input.designerId) assigned = order;
    }
    if (input.needsAction !== undefined)
      order.needsAction = input.needsAction || undefined;
    if (input.addTask) {
      order.tasks.push({
        id: randomUUID(),
        text: input.addTask,
        done: false,
        createdAt: new Date().toISOString(),
        by,
      });
      event(order, `Task added: ${input.addTask}`, by);
    }
    if (input.toggleTask) {
      const task = order.tasks.find((item) => item.id === input.toggleTask);
      if (!task) throw new StoreError("Task not found.", 404);
      task.done = !task.done;
      event(order, `${task.done ? "Done" : "Reopened"}: ${task.text}`, by);
    }
    if (input.note) event(order, input.note, by);
    order.updatedAt = new Date().toISOString();
    return teamView(order);
  });
  if (assigned)
    await notifyTeam({
      kind: "order-action",
      title: `Order #${assigned.number} assigned to you`,
      text: `${assigned.answers.business || "Website order"}: the brief and tasks are ready.`,
      href: `/dashboard/orders/${assigned.id}`,
      designerId: assigned.designerId,
    });
  return result;
}
// ---- Brief files (private: never served publicly) ----
const allowedFiles: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "text/plain": "txt",
  "text/markdown": "md",
};
const fileDirectory = (orderId: string) =>
  path.join(dataDirectory, "orders", orderId);
export async function addOrderFile(
  id: string,
  token: string | null,
  file: File,
) {
  const mime = allowedFiles[file.type]
    ? file.type
    : /\.md$/i.test(file.name)
      ? "text/markdown"
      : "";
  if (!mime || file.size > 10 * 1024 * 1024 || file.size === 0)
    throw new StoreError(
      "Upload a PDF, Word, text or Markdown file under 10 MB.",
    );
  const bytes = Buffer.from(await file.arrayBuffer());
  const meta: OrderFile = {
    id: randomUUID(),
    name: file.name.replace(/[^\w .()-]+/g, "_").slice(0, 120) || "brief",
    size: bytes.length,
    mime,
    uploadedAt: new Date().toISOString(),
  };
  await store((data) => {
    const order = find(data, id);
    checkToken(order, token);
    if (!["interview", "submitted"].includes(order.status))
      throw new StoreError("This brief is already confirmed.", 409);
    if (order.files.length >= 5) throw new StoreError("Up to 5 files.");
  }, false);
  const sql = await database();
  if (sql)
    await sql`INSERT INTO harbstone_project(id,document) VALUES (${`order-file:${meta.id}`}, ${sql.json({ data: bytes.toString("base64") })})`;
  else {
    await mkdir(fileDirectory(id), { recursive: true, mode: 0o700 });
    await writeFile(path.join(fileDirectory(id), meta.id), bytes, {
      mode: 0o600,
    });
  }
  return store((data) => {
    const order = find(data, id);
    order.files.push(meta);
    event(order, `File uploaded: ${meta.name}`, "client");
    return clientView(order);
  });
}
export async function readOrderFile(
  id: string,
  fileId: string,
  viewer: Identity,
) {
  const order = await readOrder(id, viewer);
  const meta = order.files.find((file) => file.id === fileId);
  if (!meta) throw new StoreError("File not found.", 404);
  const sql = await database();
  let bytes: Buffer;
  if (sql) {
    const [row] =
      await sql`SELECT document FROM harbstone_project WHERE id=${`order-file:${meta.id}`}`;
    if (!row) throw new StoreError("File not found.", 404);
    bytes = Buffer.from((row.document as { data: string }).data, "base64");
  } else bytes = await readFile(path.join(fileDirectory(id), meta.id));
  return { meta, bytes };
}
