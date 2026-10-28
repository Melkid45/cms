"use client";
import { useEffect, useState } from "react";
import { Mail, Check, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { Submission } from "@/lib/builder/submissions";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/components/admin/access-context";
import { useProject } from "@/lib/builder/client";
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
        {items
          .filter((i) => !unread || !i.read)
          .map((item) => (
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
                  disabled={item.read}
                  onClick={async () => {
                    const response = await fetch("/api/builder/submissions", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: item.id, read: true }),
                    });
                    if (response.ok)
                      setItems((current) =>
                        current.map((i) =>
                          i.id === item.id ? { ...i, read: true } : i,
                        ),
                      );
                    else setError("Could not update message.");
                  }}
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
            </article>
          ))}
        {loaded && !items.length && (
          <div className="rounded-xl border bg-white p-12 text-center text-sm text-neutral-500">
            Your website enquiries will appear here.
          </div>
        )}
        {!loaded && <p>Loading messages…</p>}
      </div>
    </div>
  );
}
