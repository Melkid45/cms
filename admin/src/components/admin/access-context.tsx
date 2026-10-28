"use client";
import { createContext, useContext } from "react";
import type { Identity } from "@/lib/builder/permissions";
export const AccessContext = createContext<Identity | null>(null);
export function useAccess() {
  const identity = useContext(AccessContext);
  if (!identity) throw new Error("Account context is missing.");
  return { ...identity, isOwner: identity.role === "super-admin" };
}
