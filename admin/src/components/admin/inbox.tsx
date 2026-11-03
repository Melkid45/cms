"use client";
import { useEffect, useState } from "react";
import { Mail, Check, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { Submission } from "@/lib/builder/submissions";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/components/admin/access-context";
import { useProject } from "@/lib/builder/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
export default function Submissions({
  overview = false,
}: {
  overview?: boolean;
}) {
  const { isOwner } = useAccess();
  const { project } = useProject();
  const [items, setItems] = useState<Submission[]>([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [unread, setUnread] = useState(false);
  const [query, setQuery] = useState(""),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [saving, setSaving] = useState("");
  const filtered = items.filter(
    (item) =>
      (!unread || !item.read) &&
      [item.pageTitle, ...Object.values(item.values), item.internalNote || ""]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function update(item: Submission, patch: Partial<Submission>) {
    setSaving(item.id);
    setError("");
    try {
      const response = await fetch("/api/builder/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          revision: item.revision || 0,
          ...patch,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setItems((current) =>
        current.map((row) => (row.id === data.id ? data : row)),
      );
      if (patch.internalNote !== undefined)
        setNotes((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update enquiry.");
    } finally {
      setSaving("");
    }
  }
  const load = async () => {
    try {
      const response = await fetch("/api/builder/submissions", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setItems(result);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load messages.",
      );
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => {
    let active = true;
    fetch("/api/builder/submissions", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (active) setItems(data);
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div>
      <PageHeader
        title={overview ? "Your enquiries" : "Inbox"}
        description="Enquiries submitted through your published website."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCw />
              Refresh
            </Button>
            {isOwner && (
              <Button
                nativeButton={false}
                render={<Link href="/dashboard/settings/forms" />}
              >
                Form settings
              </Button>
            )}
          </div>
        }
      />
      <div className="mb-5 flex gap-2">
        <Input
          aria-label="Search enquiries"
          placeholder="Search names, messages or notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Button
          variant={unread ? "ghost" : "secondary"}
          onClick={() => setUnread(false)}
        >
          All messages ({items.length})
        </Button>
        <Button
          variant={unread ? "secondary" : "ghost"}
          onClick={() => setUnread(true)}
        >
          Unread ({items.filter((i) => !i.read).length})
        </Button>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-red-600">
          {error}
        </p>
      )}
      <div className="space-y-4">
        {filtered.map((item) => (
          <article key={item.id} className="rounded-xl border bg-white p-6">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Mail className="size-5" />
              <h2 className="min-w-0 flex-1 break-words font-medium">
                {item.pageTitle}
              </h2>
              <span className="text-xs text-neutral-500">
                {new Date(item.createdAt).toLocaleString("en-GB", {
                  timeZone: project?.website?.timeZone || "UTC",
                })}
              </span>
              <span className="rounded-full border px-3 py-1 text-xs">
                {item.delivery === "sent"
                  ? "Email sent"
                  : item.delivery === "failed"
                    ? "Email failed · saved in inbox"
                    : "Saved in inbox"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={item.read || !!saving}
                onClick={() => void update(item, { read: true })}
              >
                <Check />
                {item.read ? "Read" : "Mark as read"}
              </Button>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              {Object.entries(item.values).map(([name, value]) => (
                <div
                  key={name}
                  className={value.length > 150 ? "sm:col-span-2" : ""}
                >
                  <dt className="mb-1 text-xs capitalize text-neutral-500">
                    {name.replaceAll("_", " ")}
                  </dt>
                  <dd className="whitespace-pre-wrap break-words text-sm leading-6">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 space-y-3 border-t pt-5">
              <label
                htmlFor={`note-${item.id}`}
                className="text-xs font-medium text-neutral-500"
              >
                Internal note · visible only in the admin panel
              </label>
              <Textarea
                id={`note-${item.id}`}
                value={notes[item.id] ?? item.internalNote ?? ""}
                maxLength={4000}
                rows={2}
                placeholder="What was discussed? What is the next step?"
                onChange={(e) =>
                  setNotes((current) => ({
                    ...current,
                    [item.id]: e.target.value,
                  }))
                }
              />
              <Button
                variant="outline"
                size="sm"
                disabled={
                  !!saving ||
                  notes[item.id] === undefined ||
                  notes[item.id] === (item.internalNote || "")
                }
                onClick={() =>
                  void update(item, { internalNote: notes[item.id] })
                }
              >
                Save note
              </Button>
            </div>
          </article>
        ))}
        {loaded && !items.length && (
          <div className="rounded-xl border bg-white p-12 text-center text-sm text-neutral-500">
            Your website enquiries will appear here.
          </div>
        )}
        {loaded && items.length > 0 && !filtered.length && (
          <p className="rounded-xl border bg-white p-8 text-center text-sm text-neutral-500">
            No enquiries match your filters.
          </p>
        )}
        {!loaded && <p>Loading messages…</p>}
      </div>
    </div>
  );
}
