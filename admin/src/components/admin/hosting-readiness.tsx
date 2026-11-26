"use client";
import { useEffect, useState } from "react";
import { withSite } from "@/lib/builder/site-client";
type Hosting = {
  database: boolean;
  media: boolean;
  authentication: boolean;
  local: boolean;
  smtp: boolean;
  hosted: boolean;
};
export function HostingReadiness() {
  const [hosting, setHosting] = useState<Hosting | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch(withSite("/api/builder/hosting"), { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not check hosting settings.");
        const data = await r.json();
        if (live) setHosting(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <>
      {" "}
      <section className="rounded-xl border bg-white p-6" id="hosting">
        <h2 className="mb-4 font-medium">Hosting readiness</h2>
        {hosting ? (
          <dl className="space-y-4 text-sm">
            {(
              [
                ["Page & enquiry storage", hosting.database, "DATABASE_URL"],
                ["Uploaded media", hosting.media, "BLOB_READ_WRITE_TOKEN"],
                [
                  "Owner authentication",
                  hosting.authentication,
                  "CMS_ADMIN_EMAIL, CMS_ADMIN_PASSWORD, CMS_AUTH_SECRET",
                ],
                [
                  "Email delivery",
                  hosting.smtp,
                  "SMTP_HOST, SMTP_FROM and optional SMTP_USER / SMTP_PASSWORD",
                ],
              ] as const
            ).map(([label, ready, env]) => (
              <div key={label}>
                <div className="flex justify-between gap-4">
                  <dt>{label}</dt>
                  <dd className={ready ? "text-green-700" : "text-amber-700"}>
                    {ready ? "Configured" : "Not configured"}
                  </dd>
                </div>
                {!ready && (
                  <p className="mt-1 break-words text-xs text-neutral-500">
                    {env}
                  </p>
                )}
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-neutral-500">
            Checking server configuration…
          </p>
        )}
        {hosting?.local && (
          <p className="mt-5 rounded-lg bg-neutral-50 p-3 text-xs leading-5">
            Local development mode. Pages, files and enquiries are saved on this
            computer. Configure all required hosting services before deploying.
          </p>
        )}
      </section>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </>
  );
}
