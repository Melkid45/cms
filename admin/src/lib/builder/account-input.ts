import { z } from "zod";
export const accountPassword = z.string().min(12).max(256);
export const clientAccountChange = z
  .object({
    id: z.string().min(1).max(100),
    password: accountPassword.optional(),
    disabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.password !== undefined || value.disabled !== undefined,
  );
export const newClientAccount = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.email().max(254),
    password: accountPassword,
  })
  .strict();
