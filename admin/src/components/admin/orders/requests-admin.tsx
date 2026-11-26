"use client";
import { Select, SelectOption } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { useAccess } from "@/components/admin/access-context";
import { useWorkspace } from "@/components/admin/site-context";
import { withSite } from "@/lib/builder/site-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Toolbar, chip, rowLine, subPanel } from "@/components/admin/admin-panel";
import {
  api,
  formatDate,
  money,
  requestLabel,
  StatusPill,
  type ChangeRequest,
  type TeamAccount,
} from "./shared";

type Filter = "open" | "all" | "done";

export function RequestsAdmin({
  designers,
  lead,
}: {
  designers: TeamAccount[];
  lead?: React.ReactNode;
}) {
  const { isOwner } = useAccess();
  const workspace = useWorkspace();
  const [items, setItems] = useState<ChangeRequest[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [quoting, setQuoting] = useState(""),
    [filter, setFilter] = useState<Filter>("open");
  useEffect(() => {
    let active = true;
    api<ChangeRequest[]>(withSite("/api/builder/requests?all=1"))
      .then((data) => active && setItems(data))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  const siteName = (id: string) =>
    workspace?.sites.find((site) => site.id === id)?.name || "Website";
  async function update(body: Record<string, unknown>) {
    setBusy(String(body.id));
    setError("");
    try {
      const item = await api<ChangeRequest>(withSite("/api/builder/requests"), {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setItems((current) =>
        (current || []).map((r) => (r.id === item.id ? item : r)),
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update.");
      return false;
    } finally {
      setBusy("");
    }
  }
  async function quote(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const price = Number(String(data.get("price")).replace(",", "."));
    if (!Number.isFinite(price) || price < 0)
      return setError("Enter a valid price.");
    if (
      await update({
        id,
        action: "quote",
        price,
        quoteNote: String(data.get("note") || ""),
      })
    )
      setQuoting("");
  }
  const shown = (items || []).filter((r) =>
    filter === "all"
      ? true
      : filter === "done"
        ? r.status === "done" || r.status === "declined"
        : r.status !== "done" && r.status !== "declined",
  );

  return (
    <div>
      <Toolbar>
        {lead}
        {(
          [
            ["open", "Open"],
            ["done", "Closed"],
            ["all", "All"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={chip(filter === id)}
          >
            {label}
          </button>
        ))}
      </Toolbar>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {!items && !error && (
        <p className="text-sm text-neutral-400">Loading requests…</p>
      )}
      {items && !shown.length && (
        <p className={cn(subPanel, "p-10 text-center text-sm text-neutral-500")}>
          {isOwner
            ? "No change requests here. Clients send them from their Overview."
            : "No change requests are assigned to you."}
        </p>
      )}
      <div className="space-y-3">
        {shown.map((item) => (
          <article key={item.id} className={cn(rowLine, "py-4")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-400">#{item.number}</span>
              <h3 className="min-w-0 truncate font-semibold">
                {siteName(item.siteId)}
              </h3>
              <StatusPill
                status={item.status}
                label={requestLabel[item.status]}
              />
              {item.price !== undefined && (
                <span className="text-sm font-medium">{money(item.price)}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {item.author} · {formatDate(item.createdAt)}
            </p>
            <p className="mt-3 text-sm leading-6 break-words whitespace-pre-wrap">
              {item.text}
            </p>
            {item.quoteNote && (
              <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-600">
                Quote note: {item.quoteNote}
              </p>
            )}
            {quoting === item.id ? (
              <form
                onSubmit={(e) => quote(e, item.id)}
                className="mt-4 grid gap-2 sm:grid-cols-[140px_1fr_auto_auto]"
              >
                <Input
                  name="price"
                  inputMode="decimal"
                  placeholder="Price, EUR"
                  defaultValue={item.price ?? ""}
                  required
                  aria-label="Price in EUR"
                />
                <Input
                  name="note"
                  placeholder="Note for the client (optional)"
                  defaultValue={item.quoteNote ?? ""}
                  maxLength={2000}
                  aria-label="Quote note"
                />
                <Button type="submit" disabled={busy === item.id}>
                  Send quote
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setQuoting("")}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {isOwner &&
                  (item.status === "new" || item.status === "quoted") && (
                    <Button
                      size="sm"
                      variant={item.status === "new" ? "default" : "outline"}
                      onClick={() => setQuoting(item.id)}
                    >
                      {item.status === "new" ? "Quote" : "Change quote"}
                    </Button>
                  )}
                {isOwner && (
                  <Select
                    aria-label="Assigned designer"
                    className="h-9 w-auto max-w-full"
                    value={String(item.designerId || "")}
                    disabled={busy === item.id}
                    onValueChange={(selectedValue) =>
                      update({
                        id: item.id,
                        action: "assign",
                        designerId: selectedValue || null,
                      })}
                  >
                    <SelectOption value="">No designer</SelectOption>
                    {designers.map((d) => (
                      <SelectOption key={d.id} value={String(d.id)}>
                        {d.name || d.email}
                      </SelectOption>
                    ))}
                  </Select>
                )}
                {item.status !== "done" && item.status !== "declined" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === item.id}
                    onClick={() => update({ id: item.id, action: "done" })}
                  >
                    Mark done
                  </Button>
                )}
                {item.status === "accepted" && (
                  <span className="text-xs text-neutral-500">
                    Accepted by the client, invoice issued
                  </span>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
