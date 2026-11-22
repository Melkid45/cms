"use client";
import { useState } from "react";
import { FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { catalogFetch } from "./use-catalog";

// Import in three steps: choose a file → map its columns → check (dry run) → import.
interface Parsed {
  headers: string[];
  columns: string[];
  mapping: string[];
  sample: string[][];
  total: number;
}
interface PreviewRow {
  row: number;
  action: "create" | "update" | "error";
  name: string;
  sku: string;
  price: number;
  errors: string[];
}
interface Preview {
  preview: PreviewRow[];
  summary: { create: number; update: number; error: number };
  saved?: { created: number; updated: number };
}
const ACTION: Record<PreviewRow["action"], string> = { create: "New", update: "Update", error: "Error" };
export function CatalogImport({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [file, setFile] = useState<{ fileName: string; data: string } | null>(null),
    [parsed, setParsed] = useState<Parsed | null>(null),
    [mapping, setMapping] = useState<string[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function choose(input: File | undefined) {
    if (!input) return;
    setError("");
    setPreview(null);
    if (input.size > 8_000_000) return setError("The file is larger than 8 MB.");
    const xlsx = /\.xlsx$/i.test(input.name);
    if (!xlsx && !/\.(csv|txt)$/i.test(input.name)) return setError("Choose a .csv or .xlsx file.");
    let data: string;
    if (xlsx) {
      const bytes = new Uint8Array(await input.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      data = btoa(binary);
    } else data = await input.text();
    const next = { fileName: input.name, data };
    setBusy(true);
    try {
      const result = await catalogFetch<Parsed>("/api/builder/catalog/import", { method: "POST", body: JSON.stringify(next) });
      setFile(next);
      setParsed(result);
      setMapping(result.mapping);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      setBusy(false);
    }
  }
  async function run(apply: boolean) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const result = await catalogFetch<Preview>("/api/builder/catalog/import", { method: "POST", body: JSON.stringify({ ...file, mapping, apply }) });
      setPreview(result);
      if (apply) onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex-1">
          <h2 className="font-medium">Import products</h2>
          <p className="mt-1 text-sm text-neutral-500">
            CSV or Excel (.xlsx), first row = column names. Rows update products with the same id, SKU or address; other rows become new products. Export the catalogue to see every column.
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Close import" onClick={onClose}>
          <X />
        </Button>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-neutral-100 px-4 py-2 text-sm hover:bg-neutral-200">
        <FileUp className="size-4" />
        {file ? file.fileName : "Choose file"}
        <input type="file" accept=".csv,.xlsx,text/csv" className="sr-only" disabled={busy} onChange={(e) => void choose(e.target.files?.[0])} />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {parsed && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-medium">Columns ({parsed.total} rows)</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {parsed.headers.map((header, i) => (
              <label key={i} className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate" title={`${header} — e.g. ${parsed.sample[0]?.[i] ?? ""}`}>
                  {header || `Column ${i + 1}`}
                  <span className="block truncate text-xs text-neutral-500">{parsed.sample[0]?.[i] || "—"}</span>
                </span>
                <select
                  aria-label={`Field for column ${header || i + 1}`}
                  className="h-8 max-w-44 rounded-md bg-white px-2 text-sm"
                  value={mapping[i] || ""}
                  onChange={(e) => {
                    setPreview(null);
                    setMapping((m) => m.map((v, j) => (j === i ? e.target.value : v)));
                  }}
                >
                  <option value="">Skip</option>
                  {parsed.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || !mapping.some(Boolean)} onClick={() => void run(false)}>
              Check
            </Button>
            {preview && !preview.saved && preview.summary.create + preview.summary.update > 0 && (
              <Button disabled={busy} onClick={() => void run(true)}>
                Import {preview.summary.create + preview.summary.update} products
                {preview.summary.error ? ` (skip ${preview.summary.error} with errors)` : ""}
              </Button>
            )}
          </div>
        </div>
      )}
      {preview && (
        <div className="mt-5">
          <p className="mb-2 text-sm">
            {preview.saved
              ? `Saved: ${preview.saved.created} new, ${preview.saved.updated} updated.`
              : `Check: ${preview.summary.create} new, ${preview.summary.update} updates, ${preview.summary.error} with errors. Nothing saved yet.`}
          </p>
          <div className="max-h-80 overflow-auto rounded-lg bg-neutral-50">
            <table className="w-full text-sm">
              <tbody>
                {preview.preview.map((r) => (
                  <tr key={r.row} className="align-top">
                    <td className="px-3 py-1.5 text-neutral-500">{r.row}</td>
                    <td className={`px-3 py-1.5 ${r.action === "error" ? "text-red-600" : ""}`}>{ACTION[r.action]}</td>
                    <td className="px-3 py-1.5">
                      {r.name}
                      {r.errors.length > 0 && <span className="block text-xs text-red-600">{r.errors.join("; ")}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-neutral-500">{r.sku}</td>
                    <td className="px-3 py-1.5 text-right">{r.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
