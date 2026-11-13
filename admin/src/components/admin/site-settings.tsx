"use client";

import Link from "next/link";
import { useState } from "react";
import { Globe, ShoppingBag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { saveProject, useProject } from "@/lib/builder/client";
import { Switch } from "@/components/ui/switch";

function SettingToggle({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-5">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-1 text-xs leading-5 text-neutral-400">{description}</p>
      </div>
      <Switch
        id={id}
        name={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function SiteSettings() {
  const { project } = useProject();
  const store = project?.store?.enabled ?? false;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function toggleStore(enabled: boolean) {
    if (!project || busy) return;
    setBusy(true);
    setNotice("");
    try {
      await saveProject({
        ...project,
        store: {
          ...project.store,
          enabled,
          cart: project.store?.cart ?? "drawer",
        },
      });
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not save store settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  const [indexing, setIndexing] = useState(true);
  const [maintenance, setMaintenance] = useState(false);

  return (
    <>
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Globe className="size-4" /> Website
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="siteLanguage">Default language</Label>
              <Select id="siteLanguage" name="siteLanguage" defaultValue="en">
                <SelectOption value="en">English</SelectOption>
                <SelectOption value="ru">Russian</SelectOption>
                <SelectOption value="de">German</SelectOption>
              </Select>
              <p className="text-xs text-neutral-400">
                Used for new pages and default website content.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="siteTimezone">Time zone</Label>
              <Select id="siteTimezone" name="siteTimezone" defaultValue="UTC">
                <SelectOption value="UTC">UTC</SelectOption>
                <SelectOption value="Europe/London">
                  Europe / London
                </SelectOption>
                <SelectOption value="Europe/Berlin">
                  Europe / Berlin
                </SelectOption>
                <SelectOption value="Europe/Moscow">
                  Europe / Moscow
                </SelectOption>
                <SelectOption value="Asia/Omsk">Asia / Omsk</SelectOption>
                <SelectOption value="America/New_York">
                  America / New York
                </SelectOption>
              </Select>
              <p className="text-xs text-neutral-400">
                Used for scheduled publishing and order timestamps.
              </p>
            </div>
          </div>
          <div className="space-y-5 border-t pt-5">
            <SettingToggle
              id="siteIndexing"
              label="Search engine visibility"
              description="Allow public pages to be indexed. Individual pages can still use noindex."
              checked={indexing}
              onChange={setIndexing}
            />
            <SettingToggle
              id="siteMaintenance"
              label="Maintenance mode"
              description="Show a maintenance page to visitors while the admin panel remains available."
              checked={maintenance}
              onChange={setMaintenance}
            />
            {maintenance && (
              <div className="grid gap-2 rounded-lg border bg-neutral-50 p-4">
                <Label htmlFor="maintenanceMessage">Visitor message</Label>
                <Input
                  id="maintenanceMessage"
                  name="maintenanceMessage"
                  defaultValue="We're making a few improvements. Please check back soon."
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShoppingBag className="size-4" /> Online store
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <SettingToggle
            id="siteOnlineStore"
            label="This website is an online store"
            description="Show the cart in the website header and enable Shop in the admin panel."
            checked={store}
            disabled={!project || busy}
            onChange={toggleStore}
          />
          {store && (
            <Link className="text-sm underline" href="/dashboard/shop">
              Open Shop settings
            </Link>
          )}
          {(busy || notice) && (
            <p role="status" className="text-sm">
              {busy ? "Saving…" : notice}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
