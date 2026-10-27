import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
const env = process.env;
const checks = [
  ["DATABASE_URL", !!env.DATABASE_URL],
  ["BLOB_READ_WRITE_TOKEN", !!env.BLOB_READ_WRITE_TOKEN],
  [
    "CMS_ADMIN_EMAIL",
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.CMS_ADMIN_EMAIL || ""),
  ],
  [
    "CMS_ADMIN_PASSWORD (12+ characters)",
    (env.CMS_ADMIN_PASSWORD || "").length >= 12,
  ],
  [
    "CMS_AUTH_SECRET (32+ characters)",
    (env.CMS_AUTH_SECRET || "").length >= 32,
  ],
];
for (const [label, ok] of checks)
  console.log(`${ok ? "OK" : "MISSING"} ${label}`);
console.log(
  env.SMTP_HOST && env.SMTP_FROM
    ? "SMTP configured; test actual delivery before launch."
    : "SMTP optional: messages will be stored in Inbox.",
);
console.log(
  "Configuration presence check only. Verify database and file uploads after deployment.",
);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
