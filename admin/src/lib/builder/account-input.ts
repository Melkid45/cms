import { z } from "zod";
export const accountPassword = z.string().min(12).max(256);
export const newClientAccount = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.email().max(254),
    password: accountPassword,
  })
  .strict();
