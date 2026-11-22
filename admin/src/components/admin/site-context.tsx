"use client";
import { createContext, useContext } from "react";
import type { Company, Site } from "@/lib/builder/sites";
export interface Workspace {
  site: Site | null;
  companies: Company[];
  sites: Site[];
}
export const SiteContext = createContext<Workspace | null>(null);
export const useWorkspace = () => useContext(SiteContext);
// Public key of the selected website (undefined outside the dashboard).
export const useSiteKey = () => useContext(SiteContext)?.site?.key;
