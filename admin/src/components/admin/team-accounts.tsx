"use client";
import { useEffect, useState } from "react";
import { Plus, ShieldCheck, UserRound, KeyRound, Globe } from "lucide-react";
import { useAccess } from "./access-context";
import { useWorkspace } from "./site-context";
import type { AccessScope } from "@/lib/builder/access";
import { AdminPanel, subPanel } from "./admin-panel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
interface Account {
  id: string;
  name: string;
  email: string;
  role?: "client" | "designer";
  disabled: boolean;
  scope: AccessScope;
}
export function TeamAccounts() {
  const owner = useAccess();
  const workspace = useWorkspace();
  const [items, setItems] = useState<Account[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [reset, setReset] = useState(""),
    [scoping, setScoping] = useState(""),
    [role, setRole] = useState<"client" | "designer">("client");
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
        // New clients get access to the website that is open now.
        body: JSON.stringify(
          id
            ? { id, password: data.password }
            : {
                ...data,
                role,
                scope: {
                  companies: [],
                  sites: workspace?.site ? [workspace.site.id] : [],
                },
              },
        ),
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
          : role === "designer"
            ? "Designer account created. Share the login details privately."
            : "Client account created. Share the login details privately.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save account.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminPanel
      title="Team"
      toolbar={
        <Button className="ml-auto h-10 px-4" onClick={() => setCreating(!creating)}>
          <Plus /> Add account
        </Button>
      }
    >
      {creating && (
        <form
          onSubmit={submit}
          className={cn(subPanel, "mb-5 space-y-4 p-5")}
        >
          <h2 className="font-semibold">New account</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="client-role">Role</Label>
              <Select
                id="client-role"
                value={role}
                onValueChange={(value) =>
                  setRole(value === "designer" ? "designer" : "client")
                }
              >
                <SelectOption value="client">Client</SelectOption>
                <SelectOption value="designer">Designer</SelectOption>
              </Select>
            </div>
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
      <div>
        <div className="flex items-center gap-4 border-b pb-4">
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
          <div key={account.id} className="border-b py-4 last:border-0">
            <div className="flex flex-wrap items-center gap-4">
              <UserRound className="size-5 text-neutral-400" />
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-medium">{account.name}</p>
                <p className="break-all text-sm text-neutral-500">
                  {account.email}
                </p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs">
                {account.role === "designer" ? "Designer" : "Client"}
              </span>
              {account.disabled && (
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
                  Disabled
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setScoping(scoping === account.id ? "" : account.id)
                }
              >
                <Globe /> Website access
              </Button>
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
            {scoping === account.id && workspace && (
              <ScopeEditor
                account={account}
                workspace={workspace}
                busy={busy}
                onSave={async (scope) => {
                  setBusy(true);
                  setNotice("");
                  try {
                    const r = await fetch("/api/builder/accounts", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: account.id, scope }),
                    });
                    const data = await r.json();
                    if (!r.ok) throw Error(data.error);
                    setItems((current) =>
                      current.map((a) => (a.id === data.id ? data : a)),
                    );
                    setScoping("");
                    setNotice("Website access updated.");
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
              />
            )}
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
          <p className="py-4 text-sm text-neutral-500">
            No accounts yet. Add a designer to build websites or a client when
            you are ready to hand over a website.
          </p>
        )}
      </div>
      <p role="status" className="mt-4 text-sm">
        {notice}
      </p>
    </AdminPanel>
  );
}

// Super admin chooses whole companies (including websites added later) or single websites.
function ScopeEditor({
  account,
  workspace,
  busy,
  onSave,
}: {
  account: Account;
  workspace: NonNullable<ReturnType<typeof useWorkspace>>;
  busy: boolean;
  onSave: (scope: AccessScope) => void;
}) {
  const [scope, setScope] = useState<AccessScope>(account.scope);
  const toggle = (kind: keyof AccessScope, id: string, on: boolean) =>
    setScope({
      ...scope,
      [kind]: on
        ? [...scope[kind], id]
        : scope[kind].filter((item) => item !== id),
    });
  return (
    <div className="mt-4 space-y-3 rounded-xl bg-neutral-50 p-4">
      {workspace.companies.map((company) => {
        const whole = scope.companies.includes(company.id);
        return (
          <div key={company.id} className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={whole}
                onChange={(e) =>
                  toggle("companies", company.id, e.target.checked)
                }
              />
              {company.name} · all websites
            </label>
            <div className="space-y-1 pl-6">
              {workspace.sites
                .filter((site) => site.companyId === company.id)
                .map((site) => (
                  <label
                    key={site.id}
                    className="flex items-center gap-2 text-sm text-neutral-600"
                  >
                    <input
                      type="checkbox"
                      disabled={whole}
                      checked={whole || scope.sites.includes(site.id)}
                      onChange={(e) =>
                        toggle("sites", site.id, e.target.checked)
                      }
                    />
                    {site.name}
                    <span className="text-xs text-neutral-400">
                      /site/{site.key}
                    </span>
                  </label>
                ))}
            </div>
          </div>
        );
      })}
      <Button size="sm" disabled={busy} onClick={() => onSave(scope)}>
        Save access
      </Button>
    </div>
  );
}
