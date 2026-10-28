"use client";
import { useState } from "react";
import { Building2, ImageIcon, Inbox } from "lucide-react";
import { useProject } from "@/lib/builder/client";
import type { WebsiteSettings, FormSettings } from "@/lib/builder/types";
import { MediaPicker } from "@/components/builder/media-picker";
import { PageHeader } from "@/components/admin/page-header";
import { SmtpSettings } from "@/components/admin/smtp-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectOption } from "@/components/ui/select";
type Draft = {
  name: string;
  logo: string;
  footerLogo: string;
  website: WebsiteSettings;
  forms: FormSettings;
};
export default function ClientSettings() {
  const { project, save, error } = useProject();
  const [draft, setDraft] = useState<Draft | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  if (!project) return <p>{error || "Loading settings…"}</p>;
  const value = draft || {
    name: project.brand.name,
    logo: project.brand.logo,
    footerLogo: project.brand.footerLogo,
    website: project.website || {
      url: "",
      contactEmail: "",
      phone: "",
      address: "",
      timeZone: "UTC",
    },
    forms: project.forms || {
      enabled: true,
      recipient: "",
      successMessage: "Thank you. Your message has been received.",
    },
  };
  const patch = (data: Partial<Draft>) => {
    setDraft({ ...value, ...data });
    setNotice("");
  };
  const website = (data: Partial<WebsiteSettings>) =>
    patch({ website: { ...value.website, ...data } });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Website settings"
        description="Your company details, logos and website enquiries."
      />
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setNotice("");
          try {
            await save({
              ...project,
              brand: {
                ...project.brand,
                name: value.name,
                logo: value.logo,
                footerLogo: value.footerLogo,
              },
              website: value.website,
              forms: value.forms,
            });
            setDraft(null);
            setNotice("Website settings saved.");
          } catch (e) {
            setNotice(
              e instanceof Error ? e.message : "Could not save settings.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className="rounded-xl border bg-white">
          <div className="flex items-center gap-3 border-b border-neutral-100 p-6">
            <Building2 className="size-5 text-neutral-500" />
            <div>
              <h2 className="font-semibold">General & contacts</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Shared contact details for your website.
              </p>
            </div>
          </div>
          <div className="grid gap-5 p-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website-name">Website name</Label>
              <Input
                id="website-name"
                value={value.name}
                maxLength={100}
                required
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-url">Public website URL</Label>
              <Input
                id="website-url"
                type="url"
                value={value.website.url}
                onChange={(e) => website({ url: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Contact email</Label>
              <Input
                id="contact-email"
                type="email"
                value={value.website.contactEmail}
                onChange={(e) => website({ contactEmail: e.target.value })}
                placeholder="hello@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">Phone number</Label>
              <Input
                id="contact-phone"
                type="tel"
                maxLength={100}
                value={value.website.phone}
                onChange={(e) => website({ phone: e.target.value })}
                placeholder="+44 20 7946 0000"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="contact-address">Address</Label>
              <Textarea
                id="contact-address"
                rows={2}
                maxLength={1000}
                value={value.website.address}
                onChange={(e) => website({ address: e.target.value })}
                placeholder="Street, city, country"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-timezone">Time zone</Label>
              <Select
                id="website-timezone"
                value={value.website.timeZone}
                onValueChange={(timeZone) => website({ timeZone })}
              >
                {[
                  ...new Set([
                    value.website.timeZone,
                    "UTC",
                    "Europe/London",
                    "Europe/Berlin",
                    "Europe/Moscow",
                    "Asia/Omsk",
                    "America/New_York",
                  ]),
                ].map((zone) => (
                  <SelectOption key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </SelectOption>
                ))}
              </Select>
              <p className="text-xs text-neutral-400">
                Used for enquiry dates in the admin panel.
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-xl border bg-white">
          <h2 className="flex items-center gap-3 border-b border-neutral-100 p-6 font-semibold">
            <ImageIcon className="size-5 text-neutral-500" />
            Website logos
          </h2>
          <div className="grid gap-6 p-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label>Header logo</Label>
              <MediaPicker
                value={value.logo}
                onChange={(logo) => patch({ logo })}
              />
            </div>
            <div className="space-y-3">
              <Label>Footer logo</Label>
              <MediaPicker
                value={value.footerLogo}
                onChange={(footerLogo) => patch({ footerLogo })}
              />
            </div>
          </div>
        </section>
        <section className="rounded-xl border bg-white">
          <h2 className="flex items-center gap-3 border-b border-neutral-100 p-6 font-semibold">
            <Inbox className="size-5 text-neutral-500" />
            Website enquiries
          </h2>
          <div className="space-y-5 p-6">
            <div className="flex items-center justify-between gap-5">
              <div>
                <Label htmlFor="forms-enabled">Accept enquiries</Label>
                <p className="mt-1 text-sm text-neutral-500">
                  Receive messages through website forms.
                </p>
              </div>
              <Switch
                id="forms-enabled"
                checked={value.forms.enabled}
                onCheckedChange={(enabled) =>
                  patch({ forms: { ...value.forms, enabled } })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipient">Enquiry recipient</Label>
              <Input
                id="recipient"
                type="email"
                value={value.forms.recipient}
                onChange={(e) =>
                  patch({
                    forms: { ...value.forms, recipient: e.target.value },
                  })
                }
                placeholder="inbox@example.com"
              />
              <p className="text-xs text-neutral-400">
                Enquiries are always saved in Inbox, even if email delivery
                fails.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-success">Confirmation message</Label>
              <Textarea
                id="form-success"
                rows={2}
                required
                maxLength={500}
                value={value.forms.successMessage}
                onChange={(e) =>
                  patch({
                    forms: { ...value.forms, successMessage: e.target.value },
                  })
                }
              />
            </div>
          </div>
        </section>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save website settings"}
          </Button>
          <p role="status" className="text-sm">
            {notice}
          </p>
        </div>
      </form>
      <SmtpSettings />
    </div>
  );
}
