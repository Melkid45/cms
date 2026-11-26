import { z } from "zod";
export const accountPassword = z.string().min(12).max(256);
// Companies and websites a client may open; ids come from the companies registry.
export const accessScope = z
  .object({
    companies: z.array(z.string().regex(/^[a-z0-9]{1,40}$/)).max(200),
    sites: z.array(z.string().regex(/^[a-z0-9]{1,40}$/)).max(500),
  })
  .strict();
export const clientAccountChange = z
  .object({
    id: z.string().min(1).max(100),
    password: accountPassword.optional(),
    disabled: z.boolean().optional(),
    scope: accessScope.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.password !== undefined ||
      value.disabled !== undefined ||
      value.scope !== undefined,
  );
export const newClientAccount = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.email().max(254),
    password: accountPassword,
    scope: accessScope.optional(),
    role: z.enum(["client", "designer"]).default("client"),
  })
  .strict();
