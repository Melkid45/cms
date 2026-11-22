import "server-only";
import { inflateRawSync } from "node:zlib";
import { StoreError } from "../server";

// Minimal .xlsx reader for the catalogue import (no extra dependency): first worksheet → rows of
// cell texts. Reads shared strings, inline strings, numbers and booleans; formulas give their
// cached value. Dates stay as Excel serial numbers (the catalogue has no date columns).
function unzip(buffer: Buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new StoreError("This is not an .xlsx file.");
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const files = new Map<string, () => Buffer>();
  for (let n = 0; n < count && buffer.readUInt32LE(at) === 0x02014b50; n++) {
    const method = buffer.readUInt16LE(at + 10);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const skip = nameLength + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    files.set(name, () => {
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const data = buffer.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data, { maxOutputLength: 50_000_000 });
      throw new StoreError("Unsupported .xlsx compression.");
    });
    at += 46 + skip;
  }
  return files;
}
const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");
const column = (ref: string) => [...ref.replace(/\d+$/, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

export function readXlsx(buffer: Buffer): string[][] {
  const files = unzip(buffer);
  const read = (name: string) => files.get(name)?.().toString("utf8");
  const shared = [...(read("xl/sharedStrings.xml") || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  // First sheet of the workbook (by its relationship), else sheet1.
  const workbook = read("xl/workbook.xml") || "";
  const rid = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const rels = read("xl/_rels/workbook.xml.rels") || "";
  const target = rid && [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`))?.match(/Target="([^"]+)"/)?.[1];
  const sheetName = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target}`) : "xl/worksheets/sheet1.xml";
  const sheet = read(sheetName) || read("xl/worksheets/sheet1.xml");
  if (!sheet) throw new StoreError("The .xlsx file has no worksheet.");
  const rows: string[][] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= 5001) break;
    const cells: string[] = [];
    let next = 0;
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const index = ref ? column(ref) : next;
      next = index + 1;
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      const body = cell[2] || "";
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = texts(body);
      else if (type === "b") value = v === "1" ? "yes" : "";
      else if (v !== undefined) value = decode(v);
      if (index < 500) cells[index] = value;
    }
    rows.push(Array.from(cells, (c) => c ?? ""));
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
