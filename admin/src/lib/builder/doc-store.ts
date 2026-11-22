import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { database, dataDirectory, StoreError } from "./server";
const globalDocs = globalThis as typeof globalThis & {
  docQueue?: Promise<unknown>;
};
// One locked JSON document of the installation (orders, notifications, billing):
// PostgreSQL row in harbstone_project, or a private local file in .data/.
export async function withDoc<D, T>(
  id: string,
  initial: () => D,
  update: (data: D) => T | Promise<T>,
  write = true,
): Promise<T> {
  if (!/^[a-z0-9:-]{1,80}$/.test(id)) throw new StoreError("Invalid store.");
  const sql = await database();
  if (sql)
    return (await sql.begin(async (tx) => {
      await tx`INSERT INTO harbstone_project(id,document) VALUES (${id},${tx.json(initial() as unknown as postgres.JSONValue)}) ON CONFLICT DO NOTHING`;
      const [row] =
        await tx`SELECT document FROM harbstone_project WHERE id=${id} FOR UPDATE`;
      const result = await update(row.document as D);
      if (write)
        await tx`UPDATE harbstone_project SET document=${tx.json(row.document)} WHERE id=${id}`;
      return result;
    })) as T;
  if (process.env.VERCEL)
    throw new StoreError("Connect DATABASE_URL for persistent storage.", 503);
  const operation = (globalDocs.docQueue ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const file = path.join(dataDirectory, `${id.replaceAll(":", "-")}.json`);
      let data: D;
      try {
        data = JSON.parse(await readFile(file, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        data = initial();
      }
      const result = await update(data);
      if (write) {
        await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
        await writeFile(file + ".tmp", JSON.stringify(data), { mode: 0o600 });
        await rename(file + ".tmp", file);
      }
      return result;
    });
  globalDocs.docQueue = operation;
  return operation;
}
