import "server-only";
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { database, dataDirectory, StoreError } from "./server";
const globalDocs = globalThis as typeof globalThis & {
  docQueue?: Promise<unknown>;
};
const validId = (id: string) => /^[a-z0-9:-]{1,80}$/.test(id);
const fileOf = (id: string) =>
  path.join(dataDirectory, `${id.replaceAll(":", "-")}.json`);
// Local multi-document writes use a durable roll-forward journal. A reader always completes
// an interrupted commit before reading any document. Production uses one SQL transaction.
const journal = () => path.join(dataDirectory, ".doc-transaction.json");
async function recover() {
  let documents: Record<string, unknown>;
  try {
    documents = JSON.parse(await readFile(journal(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const [id, document] of Object.entries(documents)) {
    if (!validId(id)) throw new StoreError("Invalid transaction journal.", 503);
    await writeFile(fileOf(id) + ".tmp", JSON.stringify(document), {
      mode: 0o600,
    });
    await rename(fileOf(id) + ".tmp", fileOf(id));
  }
  await rm(journal());
}
export async function withDocs<D extends Record<string, unknown>, T>(
  initial: { [K in keyof D]: () => D[K] },
  update: (data: D) => T | Promise<T>,
  write = true,
): Promise<T> {
  const ids = Object.keys(initial).sort();
  if (!ids.length || ids.some((id) => !validId(id)))
    throw new StoreError("Invalid store.");
  const sql = await database();
  if (sql)
    return (await sql.begin(async (tx) => {
      const data: Record<string, unknown> = {};
      // Consistent ordering prevents deadlocks when checkout and stock edits overlap.
      for (const id of ids) {
        await tx`INSERT INTO harbstone_project(id,document) VALUES (${id},${tx.json(initial[id]() as postgres.JSONValue)}) ON CONFLICT DO NOTHING`;
        const [row] =
          await tx`SELECT document FROM harbstone_project WHERE id=${id} FOR UPDATE`;
        data[id] = row.document;
      }
      const result = await update(data as D);
      if (write)
        for (const id of ids)
          await tx`UPDATE harbstone_project SET document=${tx.json(data[id] as postgres.JSONValue)} WHERE id=${id}`;
      return result;
    })) as T;
  if (process.env.VERCEL)
    throw new StoreError("Connect DATABASE_URL for persistent storage.", 503);
  const operation = (globalDocs.docQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      await recover();
      const data: Record<string, unknown> = {};
      for (const id of ids) {
        try {
          data[id] = JSON.parse(await readFile(fileOf(id), "utf8"));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          data[id] = initial[id]();
        }
      }
      const result = await update(data as D);
      if (write) {
        await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
        await writeFile(journal() + ".tmp", JSON.stringify(data), {
          mode: 0o600,
          flush: true,
        });
        await rename(journal() + ".tmp", journal());
        await recover();
      }
      return result;
    });
  globalDocs.docQueue = operation;
  return operation;
}
export function withDoc<D, T>(
  id: string,
  initial: () => D,
  update: (data: D) => T | Promise<T>,
  write = true,
): Promise<T> {
  return withDocs<Record<string, D>, T>(
    { [id]: initial },
    (data) => update(data[id]),
    write,
  );
}
