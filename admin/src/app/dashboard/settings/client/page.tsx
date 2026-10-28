"use client";
import { useState } from "react";
import { useProject } from "@/lib/builder/client";
import { MediaPicker } from "@/components/builder/media-picker";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export default function ClientSettings() {
  const { project, save, error } = useProject();
  const [draft, setDraft] = useState<{
      logo: string;
      footerLogo: string;
      recipient: string;
    } | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  if (!project) return <p>{error || "Loading settings…"}</p>;
  const value = draft || {
    logo: project.brand.logo,
    footerLogo: project.brand.footerLogo,
    recipient: project.forms?.recipient || "",
  };
  return (
    <div>
      <PageHeader
        title="Website settings"
        description="Your website logos and enquiry recipient."
      />
      <form
        className="space-y-6 rounded-xl border bg-white p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await save({
              ...project,
              brand: {
                ...project.brand,
                logo: value.logo,
                footerLogo: value.footerLogo,
              },
              forms: {
                enabled: project.forms?.enabled ?? true,
                successMessage:
                  project.forms?.successMessage ||
                  "Thank you for your message.",
                recipient: value.recipient,
              },
            });
            setDraft(null);
            setNotice("Settings saved.");
          } catch (e) {
            setNotice(
              e instanceof Error ? e.message : "Could not save settings.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <Label>Header logo</Label>
            <MediaPicker
              value={value.logo}
              onChange={(logo) => setDraft({ ...value, logo })}
            />
          </div>
          <div className="space-y-3">
            <Label>Footer logo</Label>
            <MediaPicker
              value={value.footerLogo}
              onChange={(footerLogo) => setDraft({ ...value, footerLogo })}
            />
          </div>
        </div>
        <div className="max-w-lg space-y-2">
          <Label htmlFor="recipient">Enquiry recipient</Label>
          <Input
            id="recipient"
            type="email"
            value={value.recipient}
            onChange={(e) => setDraft({ ...value, recipient: e.target.value })}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
        <p role="status" className="text-sm">
          {notice}
        </p>
      </form>
    </div>
  );
}
