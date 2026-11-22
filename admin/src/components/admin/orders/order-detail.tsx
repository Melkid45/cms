"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  PencilRuler,
  UserPlus,
} from "lucide-react";
import { useAccess } from "@/components/admin/access-context";
import { useWorkspace } from "@/components/admin/site-context";
import { switchSite } from "@/components/admin/site-switcher";
import { answerLabel, interview } from "@/lib/builder/interview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDesigners } from "./orders-screen";
import {
  api,
  card,
  field,
  formatDate,
  isOverdue,
  StatusPill,
  statusLabel,
  type OrderStatus,
  type TeamOrder,
} from "./shared";

function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : label}
    </Button>
  );
}

function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(card, "min-w-0 p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const sizeLabel = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function OrderDetail({ id }: { id: string }) {
  const { isOwner, id: viewerId } = useAccess();
  const workspace = useWorkspace();
  const designers = useDesigners();
  const [order, setOrder] = useState<TeamOrder | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [login, setLogin] = useState<{ email: string; password: string } | null>(
      null,
    );
  useEffect(() => {
    let active = true;
    api<TeamOrder>(`/api/builder/orders/${id}`)
      .then((data) => active && setOrder(data))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [id]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      setOrder(
        await api<TeamOrder>(`/api/builder/orders/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submitText(
    event: React.FormEvent<HTMLFormElement>,
    key: "addTask" | "note",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get("text") || "").trim();
    if (value && (await patch({ [key]: value }))) form.reset();
  }
  async function invite() {
    setBusy(true);
    setError("");
    try {
      setLogin(
        await api<{ email: string; password: string }>(
          `/api/builder/orders/${id}/invite`,
          { method: "POST" },
        ),
      );
      setOrder(await api<TeamOrder>(`/api/builder/orders/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the login.");
    } finally {
      setBusy(false);
    }
  }

  if (!order)
    return (
      <div>
        <BackLink />
        <p className="text-sm text-neutral-500">{error || "Loading order…"}</p>
      </div>
    );

  const site = workspace?.sites.find((s) => s.id === order.siteId);
  const overdue = isOverdue(order);
  const answers = interview
    .filter((q) => q.kind !== "file" && order.answers[q.id]?.trim())
    .map((q) => [q.id, order.answers[q.id]] as const);

  return (
    <div className="admin-panel rise-in min-w-0 rounded-[20px] bg-white p-5 sm:p-6">
      <BackLink />
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-neutral-400">Order #{order.number}</p>
          <h1 className="mt-1 text-xl font-semibold break-words">
            {order.answers.business || "Unnamed business"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <StatusPill
              status={order.status}
              label={statusLabel[order.status]}
            />
            <span>Created {formatDate(order.createdAt)}</span>
          </div>
        </div>
        <label className="flex shrink-0 flex-col gap-1 text-xs text-neutral-500 sm:w-48">
          Status
          <select
            className={field}
            value={order.status}
            disabled={busy}
            onChange={(e) => patch({ status: e.target.value })}
          >
            {(Object.keys(statusLabel) as OrderStatus[])
              .filter((s) => isOwner || s !== "cancelled")
              .map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
          </select>
        </label>
      </header>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {order.needsAction && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center">
          <AlertCircle className="size-4 shrink-0" />
          <p className="min-w-0 flex-1 break-words">
            <strong className="font-semibold">Needs action:</strong>{" "}
            {order.needsAction}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => patch({ needsAction: null })}
          >
            <Check /> Resolve
          </Button>
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {order.siteId && (
          <Button onClick={() => switchSite(order.siteId!, "/dashboard/pages")}>
            <PencilRuler /> Open website editor
          </Button>
        )}
        {site && (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a href={`/site/${site.key}`} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLink /> Open public website
          </Button>
        )}
        {isOwner && order.siteId && !order.accountId && (
          <Button variant="outline" disabled={busy} onClick={invite}>
            <UserPlus /> Create client login
          </Button>
        )}
        {!order.siteId && (
          <p className="text-sm text-neutral-500">
            The website is created when the client confirms the brief.
          </p>
        )}
      </div>

      {login && (
        <div className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">Client login created</p>
          <p className="mt-1 text-emerald-900">
            The password is shown only once. Copy it now and send it to the
            client privately.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-white p-3 font-mono text-xs leading-6 text-black">
            {`${location.origin}/login\n${login.email}\n${login.password}`}
          </pre>
          <div className="mt-3">
            <CopyButton
              text={`${location.origin}/login\n${login.email}\n${login.password}`}
              label="Copy login"
            />
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {order.aiBrief && (
            <Section
              title="AI summary and site plan"
              action={<CopyButton text={order.aiBrief.text} />}
            >
              <pre className="max-h-[520px] overflow-auto rounded-lg bg-neutral-50 p-4 font-sans text-sm leading-6 break-words whitespace-pre-wrap text-neutral-800">
                {order.aiBrief.text}
              </pre>
              <p className="mt-2 text-xs text-neutral-500">
                {order.aiBrief.model} · ${order.aiBrief.cost.toFixed(4)} · check
                before sending anything to the client
              </p>
            </Section>
          )}
          <Section
            title="Brief"
            action={order.brief && <CopyButton text={order.brief} />}
          >
            {order.brief ? (
              <pre className="max-h-[520px] overflow-auto rounded-lg bg-neutral-50 p-4 font-sans text-sm leading-6 break-words whitespace-pre-wrap text-neutral-800">
                {order.brief}
              </pre>
            ) : (
              <p className="text-sm text-neutral-500">
                The client has not finished the interview yet.
              </p>
            )}
          </Section>

          <Section title="Answers">
            {answers.length ? (
              <dl className="space-y-3">
                {answers.map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-neutral-500">
                      {answerLabel(key)}
                    </dt>
                    <dd className="mt-0.5 text-sm leading-6 break-words whitespace-pre-wrap">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-neutral-500">No answers yet.</p>
            )}
          </Section>

          <Section title="Notes and history">
            <form
              onSubmit={(e) => submitText(e, "note")}
              className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start"
            >
              <Textarea
                name="text"
                placeholder="Add a note for the team"
                maxLength={2000}
                className="min-h-10"
                aria-label="Note"
              />
              <Button type="submit" variant="outline" disabled={busy}>
                Add note
              </Button>
            </form>
            <ol className="space-y-3">
              {[...order.events].reverse().map((item, index) => (
                <li key={index} className="text-sm">
                  <p className="leading-6 break-words">{item.text}</p>
                  <p className="text-xs text-neutral-400">
                    {item.by} · {formatDate(item.at)}
                  </p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className="min-w-0 space-y-5">
          <Section title="Client">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-neutral-500">Name</dt>
                <dd className="break-words">{order.contact.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Email</dt>
                <dd className="break-all">
                  {order.contact.email ? (
                    <a
                      href={`mailto:${order.contact.email}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {order.contact.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Phone</dt>
                <dd>
                  {order.contact.phone ? (
                    <a href={`tel:${order.contact.phone}`}>
                      {order.contact.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Client login</dt>
                <dd>{order.accountId ? "Created" : "Not created yet"}</dd>
              </div>
            </dl>
          </Section>

          <Section title="Package">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-neutral-500">Pack</dt>
                <dd>
                  {order.pack === "designer"
                    ? "Designer pack"
                    : order.pack === "standard"
                      ? "Standard"
                      : "Not chosen yet"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Hosting plan</dt>
                <dd className="capitalize">{order.plan || "Not chosen yet"}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">First version due</dt>
                <dd className={cn(overdue && "font-medium text-red-600")}>
                  {order.dueAt ? formatDate(order.dueAt) : "—"}
                  {overdue && " · overdue"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Website</dt>
                <dd className="break-words">
                  {site?.name || (order.siteId ? "Created" : "Not created yet")}
                </dd>
              </div>
            </dl>
          </Section>

          <Section title="Designer">
            {isOwner ? (
              <select
                aria-label="Designer"
                className={field}
                value={order.designerId || ""}
                disabled={busy}
                onChange={(e) => patch({ designerId: e.target.value || null })}
              >
                <option value="">No designer (I work on it myself)</option>
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name || d.email}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm">
                {order.designerId === viewerId ? "Assigned to you" : "—"}
              </p>
            )}
            {isOwner && !designers.length && (
              <p className="mt-2 text-xs text-neutral-500">
                Add designer accounts on the{" "}
                <Link href="/dashboard/team" className="underline">
                  Team
                </Link>{" "}
                page.
              </p>
            )}
          </Section>

          <Section title="Tasks">
            {order.tasks.length > 0 && (
              <ul className="mb-3 space-y-1">
                {order.tasks.map((task) => (
                  <li key={task.id}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-1.5 text-sm hover:bg-neutral-50">
                      <input
                        type="checkbox"
                        checked={task.done}
                        disabled={busy}
                        onChange={() => patch({ toggleTask: task.id })}
                        className="mt-1 size-4 shrink-0 accent-black"
                      />
                      <span
                        className={cn(
                          "min-w-0 break-words",
                          task.done && "text-neutral-400 line-through",
                        )}
                      >
                        {task.text}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(e) => submitText(e, "addTask")}
              className="flex gap-2"
            >
              <Input
                name="text"
                placeholder="New task"
                maxLength={1000}
                aria-label="New task"
              />
              <Button type="submit" variant="outline" disabled={busy}>
                Add
              </Button>
            </form>
          </Section>

          <Section title="Files">
            {order.files.length ? (
              <ul className="space-y-1">
                {order.files.map((file) => (
                  <li key={file.id}>
                    <a
                      href={`/api/builder/orders/${order.id}/files/${file.id}`}
                      className="flex items-center gap-2.5 rounded-lg p-1.5 text-sm hover:bg-neutral-50"
                    >
                      <Download className="size-4 shrink-0 text-neutral-400" />
                      <span className="min-w-0 flex-1 truncate">
                        {file.name}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-400">
                        {sizeLabel(file.size)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">No files uploaded.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/orders"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-black"
    >
      <ArrowLeft className="size-4" /> All orders
    </Link>
  );
}
