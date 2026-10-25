import { readdir } from "node:fs/promises";
import path from "node:path";
import { blockDefinitions } from "./cms-library";

export interface BlockFamily {
  id: string;
  label: string;
  ready?: boolean;
  variants: { id: string; label: string; source: string }[];
}

export async function getBlockCatalog(): Promise<BlockFamily[]> {
  const root = path.resolve(process.cwd(), "../frontend/src/_components/sections");
  const folders = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const legacy = (await Promise.all(folders.filter((folder) => folder.isDirectory()).map(async (folder) => {
    const files = (await readdir(path.join(root, folder.name))).filter((file) => file.endsWith(".html")).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    return {
      id: folder.name,
      label: folder.name.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "),
      variants: files.map((file) => ({ id: file.replace(".html", ""), label: file.match(/-v(\d+)/) ? `Variation ${file.match(/-v(\d+)/)![1]}` : "Default", source: `${folder.name}/${file}` })),
    };
  }))).filter((family) => family.variants.length > 0).sort((a, b) => a.label.localeCompare(b.label));
  const ready = ["about", "services", "column-text", "photo", "text-numbers"].map((id) => ({
    id: `cms-${id}`, label: id.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "), ready: true,
    variants: blockDefinitions.filter((block) => block.family === id).map((block) => ({ id: block.id, label: block.label, source: `cms/${block.id}` })),
  }));
  return [...ready, ...legacy];
}
