"use client";
import { useEffect, useState } from "react";
import { withSite } from "@/lib/builder/site-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  api,
  card,
  formatDate,
  money,
  requestLabel,
  StatusPill,
  type ChangeRequest,
} from "./orders/shared";

// Client side of change requests: content is the client's own; layout and design
// changes go through a request that the team prices and carries out.
export function ChangeRequests() {
  const [items, setItems] = useState<ChangeRequest[] | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  useEffect(() => {
    let active = true;
    api<ChangeRequest[]>(withSite("/api/builder/requests"))
      .then((data) => active && setItems(data))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("text") || "").trim();
    if (text.length < 5) return setError("Describe the change in a few words.");
    setBusy("new");
    setError("");
    setNotice("");
    try {
      const item = await api<ChangeRequest>(withSite("/api/builder/requests"), {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setItems((current) => [item, ...(current || [])]);
      form.reset();
      setNotice("Request sent. We will reply with a price.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the request.");
    } finally {
      setBusy("");
    }
  }
  async function decide(id: string, action: "accept" | "decline") {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const item = await api<ChangeRequest>(withSite("/api/builder/requests"), {
        method: "PATCH",
        body: JSON.stringify({ id, action }),
      });
      setItems((current) =>
        (current || []).map((r) => (r.id === item.id ? item : r)),
      );
      if (action === "accept")
        setNotice(
          "Thank you. An invoice is issued and we will start the work.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className={cn(card, "mb-6 p-4 sm:p-6")}>
      <h2 className="font-semibold">Change requests</h2>
      <form onSubmit={send} className="mt-4 space-y-3">
        <Textarea
          name="text"
          required
          minLength={5}
          maxLength={4000}
          placeholder="For example: make the header menu bigger and add a booking button"
          className="min-h-24"
          aria-label="Describe the change"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy === "new"}>
            Send request
          </Button>
          <span className="text-sm text-neutral-500">
            Layout and design changes: we send a price first.
          </span>
        </div>
      </form>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {!!items?.length && (
        <ul className="mt-5 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg bg-neutral-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  status={item.status}
                  label={requestLabel[item.status]}
                />
                <span className="text-xs text-neutral-400">
                  #{item.number} · {formatDate(item.createdAt)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 break-words whitespace-pre-wrap">
                {item.text}
              </p>
              {item.status === "new" && (
                <p className="mt-2 text-xs text-neutral-500">
                  Waiting for our price.
                </p>
              )}
              {item.price !== undefined && item.status !== "new" && (
                <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                  <p>
                    Price: <strong>{money(item.price)}</strong>
                  </p>
                  {item.quoteNote && (
                    <p className="mt-1 leading-6 break-words whitespace-pre-wrap text-neutral-600">
                      {item.quoteNote}
                    </p>
                  )}
                  {item.status === "quoted" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={busy === item.id}
                        onClick={() => decide(item.id, "accept")}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === item.id}
                        onClick={() => decide(item.id, "decline")}
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                  {item.status === "accepted" && (
                    <p className="mt-1 text-xs text-neutral-500">
                      Accepted. An invoice is issued; our team is on it.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
