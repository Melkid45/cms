"use client";
import { useEffect, useState } from "react";
import { Plus, ShieldCheck, UserRound, KeyRound } from "lucide-react";
import { useAccess } from "./access-context";
import { PageHeader } from "./page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
interface Account {
  id: string;
  name: string;
  email: string;
  disabled: boolean;
}
export function TeamAccounts() {
  const owner = useAccess();
  const [items, setItems] = useState<Account[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [reset, setReset] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/builder/accounts", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        if (active) setItems(data);
      })
      .catch((e) => {
        if (active) setNotice(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/builder/accounts", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id, password: data.password } : data),
      });
      const account = await response.json();
      if (!response.ok) throw Error(account.error);
      setItems((current) =>
        id
          ? current.map((a) => (a.id === id ? account : a))
          : [...current, account],
      );
      form.reset();
      setCreating(false);
      setReset("");
      setNotice(
        id
          ? "Password updated. Previous sessions have been signed out."
          : "Client account created. Share the login details privately.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save account.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader
        title="Team"
        description="You manage the design. Clients manage their website content."
        action={
          <Button onClick={() => setCreating(!creating)}>
            <Plus /> Add client
          </Button>
        }
      />
      <div className="mb-6 rounded-xl border bg-white p-5 text-sm leading-6 text-neutral-500">
        <strong className="text-black">Client access</strong>
        <p>
          Edit text and photos, reorder existing sections, update logos and view
          enquiries. Design, colours, section variations and account management
          stay with the super admin.
        </p>
      </div>
      {creating && (
        <form
          onSubmit={submit}
          className="mb-6 space-y-4 rounded-xl border bg-white p-6"
        >
          <h2 className="font-semibold">New client account</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                name="name"
                required
                maxLength={100}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                name="email"
                type="email"
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-password">Password</Label>
              <Input
                id="client-password"
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                placeholder="At least 12 characters"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Create account
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="flex items-center gap-4 border-b p-5">
          <ShieldCheck className="size-5" />
          <div className="flex-1">
            <p className="font-medium">{owner.name}</p>
            <p className="text-sm text-neutral-500">
              {owner.email || "Local development"}
            </p>
          </div>
          <span className="rounded-full bg-black px-3 py-1 text-xs text-white">
            Super admin
          </span>
        </div>
        {items.map((account) => (
          <div key={account.id} className="border-b p-5 last:border-0">
            <div className="flex flex-wrap items-center gap-4">
              <UserRound className="size-5 text-neutral-400" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{account.name}</p>
                <p className="break-all text-sm text-neutral-500">
                  {account.email}
                </p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs">
                {account.disabled ? "Disabled" : "Client"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReset(reset === account.id ? "" : account.id)}
              >
                <KeyRound /> Reset password
              </Button>
              <Button
                disabled={busy}
                variant="ghost"
                size="sm"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await fetch("/api/builder/accounts", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        id: account.id,
                        disabled: !account.disabled,
                      }),
                    });
                    const data = await r.json();
                    if (!r.ok) throw Error(data.error);
                    setItems((current) =>
                      current.map((a) => (a.id === data.id ? data : a)),
                    );
                    setNotice(
                      data.disabled
                        ? "Account disabled. Active sessions have been revoked."
                        : "Account enabled.",
                    );
                  } catch (e) {
                    setNotice(
                      e instanceof Error
                        ? e.message
                        : "Could not update access.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {account.disabled ? "Enable access" : "Disable access"}
              </Button>
            </div>
            {reset === account.id && (
              <form
                onSubmit={(e) => submit(e, account.id)}
                className="mt-4 flex flex-wrap gap-3"
              >
                <Input
                  aria-label="New password"
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={256}
                  required
                  autoComplete="new-password"
                  placeholder="New password · at least 12 characters"
                  className="max-w-sm"
                />
                <Button type="submit" disabled={busy}>
                  Update password
                </Button>
              </form>
            )}
          </div>
        ))}
        {!items.length && (
          <p className="p-6 text-sm text-neutral-500">
            No client accounts yet. Add one when you are ready to hand over the
            website.
          </p>
        )}
      </div>
      <p role="status" className="mt-4 text-sm">
        {notice}
      </p>
    </div>
  );
}
