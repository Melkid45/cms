"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SiteSettings } from "@/components/admin/site-settings";



export function ProjectSettingsForm() {
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

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
              Used as the default reply address for website forms and customer messages.
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
        <CardHeader className="border-b">
          <CardTitle className="text-sm">SMTP connection</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <p className="text-sm leading-6 text-neutral-500">
              Required for contact forms, invitations, password recovery, and other system emails.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="smtpHost">Host</Label>
            <Input
              id="smtpHost"
              name="smtpHost"
              placeholder="smtp.example.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>

          <div className="grid grid-cols-[1fr_1.5fr] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="smtpPort">Port</Label>
              <Input
                id="smtpPort"
                name="smtpPort"
                type="number"
                inputMode="numeric"
                min={1}
                max={65535}
                defaultValue={587}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="smtpSecurity">Security</Label>
              <Select
                id="smtpSecurity"
                name="smtpSecurity"
                defaultValue="starttls"
              >
                <SelectOption value="starttls">STARTTLS</SelectOption>
                <SelectOption value="tls">TLS / SSL</SelectOption>
                <SelectOption value="none">None</SelectOption>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="smtpUsername">Username</Label>
            <Input
              id="smtpUsername"
              name="smtpUsername"
              placeholder="SMTP account username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="smtpPassword">Password</Label>
            <div className="relative">
              <Input
                id="smtpPassword"
                name="smtpPassword"
                type={showSmtpPassword ? "text" : "password"}
                placeholder="SMTP account password"
                autoComplete="new-password"
                className="pr-9"
              />
              <button
                type="button"
                aria-label={showSmtpPassword ? "Hide SMTP password" : "Show SMTP password"}
                aria-pressed={showSmtpPassword}
                onClick={() => setShowSmtpPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 grid w-9 place-items-center text-neutral-400 transition-colors hover:text-black focus-visible:outline-none"
              >
                {showSmtpPassword ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-neutral-400">
          Saving and connection testing will be enabled with the project backend.
        </p>
        <Button type="submit" disabled>
          <Save data-icon="inline-start" /> Save settings
        </Button>
      </div>
    </form>
  );
}
