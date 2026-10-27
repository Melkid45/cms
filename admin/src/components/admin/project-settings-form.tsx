"use client";

import { FormEvent } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { SiteSettings } from "@/components/admin/site-settings";

export function ProjectSettingsForm() {
  function preventSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <form className="space-y-5" onSubmit={preventSubmit}>
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">General</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="projectName">Project name</Label>
            <Input
              id="projectName"
              name="projectName"
              defaultValue="Harbstone website"
              autoComplete="organization"
              required
            />
            <p className="text-xs leading-5 text-neutral-400">
              Used inside the admin panel and in system emails.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="websiteUrl">Website URL</Label>
            <Input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              placeholder="https://example.com"
              autoComplete="url"
              required
            />
            <p className="text-xs leading-5 text-neutral-400">
              The public production address without a trailing slash.
            </p>
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              placeholder="hello@example.com"
              autoComplete="email"
              required
            />
            <p className="text-xs leading-5 text-neutral-400">
              Used as the default reply address for website forms and customer
              messages.
            </p>
          </div>
        </CardContent>
      </Card>

      <SiteSettings />

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Email sender</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="senderName">Sender name</Label>
            <Input
              id="senderName"
              name="senderName"
              defaultValue="Harbstone website"
              autoComplete="organization"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="senderEmail">Sender email</Label>
            <Input
              id="senderEmail"
              name="senderEmail"
              type="email"
              placeholder="no-reply@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="replyToEmail">Reply-to email</Label>
            <Input
              id="replyToEmail"
              name="replyToEmail"
              type="email"
              placeholder="Leave empty to use the contact email"
              autoComplete="email"
            />
            <p className="text-xs leading-5 text-neutral-400">
              Optional address that receives replies to automated messages.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-sm">Email delivery</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-neutral-500">
            Website enquiries and SMTP are managed in Forms & hosting.
          </p>
          <Link
            href="/dashboard/settings/forms"
            className="text-sm font-medium underline underline-offset-4"
          >
            Open Forms & hosting
          </Link>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-neutral-400">
          Saving and connection testing will be enabled with the project
          backend.
        </p>
        <Button type="submit" disabled>
          <Save data-icon="inline-start" /> Save settings
        </Button>
      </div>
    </form>
  );
}
