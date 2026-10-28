"use client";
import { useEffect, useState } from "react";
import { Mail, ShieldCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
interface Settings {
  revision: number;
  source: "hosting" | "custom" | "disabled";
  host: string;
  port: 465 | 587;
  username: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  passwordConfigured: boolean;
  ready: boolean;
}
export function SmtpSettings() {
  const [saved, setSaved] = useState<Settings | null>(null),
    [draft, setDraft] = useState<Settings | null>(null),
    [password, setPassword] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [testing, setTesting] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/builder/smtp", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        if (active) setSaved(data);
      })
      .catch((e) => {
        if (active) setNotice(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const value = draft || saved;
  const dirty =
    !!password || (!!draft && JSON.stringify(draft) !== JSON.stringify(saved));
  function patch(changes: Partial<Settings>) {
    if (value) {
      setDraft({ ...value, ...changes });
      setNotice("");
    }
  }
  return (
    <section className="rounded-xl border bg-white">
      <div className="flex items-center gap-3 border-b border-neutral-100 p-6">
        <span className="grid size-10 place-items-center rounded-lg bg-neutral-100">
          <Mail className="size-5" />
        </span>
        <div className="flex-1">
          <h2 className="font-semibold">Email delivery</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Connect the mailbox used to send website enquiries.
          </p>
        </div>
        {value && (
          <span className="rounded-full border px-3 py-1 text-xs">
            {value.ready ? "Configured" : "Not configured"}
          </span>
        )}
      </div>
      {!value ? (
        <p role="status" className="p-6 text-sm">
          {notice || "Loading email settings…"}
        </p>
      ) : (
        <form
          className="space-y-5 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setNotice("");
            try {
              const {
                passwordConfigured: _password,
                ready: _ready,
                ...settings
              } = value;
              void _password;
              void _ready;
              const response = await fetch("/api/builder/smtp", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...settings,
                  ...(password ? { password } : {}),
                }),
              });
              const result = await response.json();
              if (!response.ok) throw Error(result.error);
              setSaved(result);
              setDraft(null);
              setPassword("");
              setNotice("Email settings saved.");
            } catch (e) {
              setNotice(
                e instanceof Error
                  ? e.message
                  : "Could not save email settings.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="max-w-md space-y-2">
            <Label htmlFor="smtp-source">Delivery method</Label>
            <Select
              id="smtp-source"
              value={value.source}
              onValueChange={(source) =>
                patch({ source: source as Settings["source"] })
              }
            >
              <SelectOption value="hosting">Hosting configuration</SelectOption>
              <SelectOption value="custom">Custom SMTP</SelectOption>
              <SelectOption value="disabled">
                Disabled — keep enquiries in Inbox
              </SelectOption>
            </Select>
          </div>
          {value.source === "custom" && (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">SMTP host</Label>
                  <Input
                    id="smtp-host"
                    value={value.host}
                    onChange={(e) => patch({ host: e.target.value })}
                    placeholder="smtp.example.com"
                    maxLength={253}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Connection security</Label>
                  <Select
                    id="smtp-port"
                    value={String(value.port)}
                    onValueChange={(port) =>
                      patch({ port: Number(port) as 465 | 587 })
                    }
                  >
                    <SelectOption value="587">STARTTLS · port 587</SelectOption>
                    <SelectOption value="465">TLS · port 465</SelectOption>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">Username</Label>
                  <Input
                    id="smtp-user"
                    value={value.username}
                    onChange={(e) => patch({ username: e.target.value })}
                    autoComplete="off"
                    maxLength={254}
                    placeholder="mailbox@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-password">Password</Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setNotice("");
                    }}
                    autoComplete="new-password"
                    maxLength={1000}
                    placeholder={
                      value.passwordConfigured
                        ? "Saved · leave blank to keep"
                        : "Enter your mailbox password"
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-name">Sender name</Label>
                  <Input
                    id="smtp-from-name"
                    value={value.fromName}
                    onChange={(e) => patch({ fromName: e.target.value })}
                    maxLength={100}
                    placeholder="Your website"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from">Sender email</Label>
                  <Input
                    id="smtp-from"
                    type="email"
                    value={value.fromEmail}
                    onChange={(e) => patch({ fromEmail: e.target.value })}
                    required
                    placeholder="website@example.com"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="smtp-reply">Default reply-to email</Label>
                  <Input
                    id="smtp-reply"
                    type="email"
                    value={value.replyTo}
                    onChange={(e) => patch({ replyTo: e.target.value })}
                    placeholder="Optional · website contact email is used by default"
                  />
                </div>
              </div>
              <p className="flex items-center gap-2 text-xs text-neutral-500">
                <ShieldCheck className="size-4 shrink-0" />
                Saved passwords are encrypted and are never shown here.
              </p>
            </>
          )}
          {value.source === "hosting" && (
            <p className="rounded-lg bg-neutral-50 p-4 text-sm leading-6 text-neutral-500">
              {value.ready
                ? "Email delivery uses the configuration provided by your hosting administrator."
                : "Hosting email delivery is not configured. Choose Custom SMTP to connect a mailbox."}
            </p>
          )}
          {value.source === "disabled" && (
            <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500">
              Enquiries will still be saved in Inbox. No email notifications
              will be sent.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || testing || !dirty}>
              {busy ? (
                <>
                  <LoaderCircle className="animate-spin" /> Saving…
                </>
              ) : (
                "Save email settings"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || testing || dirty || !saved?.ready}
              onClick={async () => {
                setTesting(true);
                setNotice("");
                try {
                  const response = await fetch("/api/builder/smtp", {
                    method: "POST",
                  });
                  const result = await response.json();
                  if (!response.ok) throw Error(result.error);
                  setNotice(result.message);
                } catch (e) {
                  setNotice(
                    e instanceof Error ? e.message : "Connection failed.",
                  );
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? (
                <>
                  <LoaderCircle className="animate-spin" /> Checking…
                </>
              ) : (
                "Test connection"
              )}
            </Button>
            <span className="text-xs text-neutral-400">
              {dirty
                ? "Save changes before testing."
                : "Connection test does not send an email."}
            </span>
          </div>
          <p role="status" className="text-sm">
            {notice}
          </p>
        </form>
      )}
    </section>
  );
}
