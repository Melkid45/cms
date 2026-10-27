"use client";
import { useEffect, useState } from "react";
import { useProject } from "@/lib/builder/client";
import type { FormSettings } from "@/lib/builder/types";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
type Hosting = {
  database: boolean;
  media: boolean;
  authentication: boolean;
  local: boolean;
  smtp: boolean;
  hosted: boolean;
};
export default function FormsSettings() {
  const { project, save, error } = useProject();
  const [draft, setDraft] = useState<FormSettings | null>(null),
    [hosting, setHosting] = useState<Hosting | null>(null),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false);
  const value = draft || project?.forms;
  useEffect(() => {
    fetch("/api/builder/hosting")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check hosting settings.");
        setHosting(await response.json());
      })
      .catch((error) => setNotice(error.message));
  }, []);
  if (!project || !value) return <p>{error || "Loading settings…"}</p>;
  const patch = (changes: Partial<FormSettings>) =>
    setDraft({ ...value, ...changes });
  return (
    <div>
      <PageHeader
        title="Forms & hosting"
        description="Website enquiries, email delivery and production readiness."
      />
      <div className="grid items-start gap-6 xl:grid-cols-[1.2fr_1fr]">
        <form
          className="space-y-6 rounded-xl border bg-white p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              await save({ ...project, forms: value });
              setDraft(null);
              setNotice("Form settings saved.");
            } catch (error) {
              setNotice(
                error instanceof Error
                  ? error.message
                  : "Could not save settings.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <h2 className="font-medium">Website forms</h2>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(event) => patch({ enabled: event.target.checked })}
            />
            Accept website enquiries
          </label>
          <div className="space-y-2">
            <Label htmlFor="recipient">Notification recipient</Label>
            <Input
              id="recipient"
              type="email"
              placeholder="hello@yourcompany.com"
              value={value.recipient}
              onChange={(event) => patch({ recipient: event.target.value })}
            />
            <p className="text-xs leading-5 text-neutral-500">
              Messages are always saved in Inbox. Email notifications require
              SMTP and a recipient.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="successMessage">Success message</Label>
            <Input
              id="successMessage"
              required
              maxLength={500}
              value={value.successMessage}
              onChange={(event) =>
                patch({ successMessage: event.target.value })
              }
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          <p role="status" className="text-sm">
            {notice}
          </p>
        </form>
        <div className="space-y-6">
          <section className="rounded-xl border bg-white p-6">
            <h2 className="mb-4 font-medium">Hosting readiness</h2>
            {hosting ? (
              <dl className="space-y-4 text-sm">
                {(
                  [
                    [
                      "Page & enquiry storage",
                      hosting.database,
                      "DATABASE_URL",
                    ],
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
                      <dd
                        className={ready ? "text-green-700" : "text-amber-700"}
                      >
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
                Local development mode. Pages, files and enquiries are saved on
                this computer. Configure all required hosting services before
                deploying.
              </p>
            )}
          </section>
          <section className="rounded-xl border bg-white p-6">
            <h2 className="mb-3 font-medium">SMTP configuration</h2>
            <p className="text-sm leading-6 text-neutral-500">
              Set SMTP_HOST, SMTP_PORT (587 by default), SMTP_SECURE (true for
              port 465), SMTP_FROM, SMTP_USER and SMTP_PASSWORD in the server
              environment. Credentials stay on the server. Messages remain in
              Inbox if email delivery fails.
            </p>
            <p className="mt-3 text-xs leading-5 text-neutral-500">
              Spam protection: hidden field, expiring signed form token and a
              limit of 5 messages per 10 minutes. Preview forms do not submit
              enquiries.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
