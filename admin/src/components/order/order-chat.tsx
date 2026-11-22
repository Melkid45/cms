"use client";
// Public website-order chat: scripted interview → contact → brief → package → thank you.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { interview, type Question } from "@/lib/builder/interview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BriefCard,
  type ClientOrder,
  loadKey,
  money,
  orderApi,
  OrderApiError,
  OrderFrame,
  type OrderKey,
  orderLink,
  type Pack,
  type Plan,
  type Prices,
  saveKey,
} from "./order-shared";

type Phase = "loading" | "chat" | "contact" | "brief" | "done" | "error";
type Answers = Record<string, string>;

// One start per page load, even when React runs effects twice in development.
let starting: Promise<{ key: OrderKey; order: ClientOrder }> | null = null;
async function startOrder() {
  const stored = loadKey();
  if (stored) {
    try {
      const order = await orderApi<ClientOrder>(`/api/orders/${stored.id}`, {
        token: stored.token,
      });
      if (order.status !== "cancelled") return { key: stored, order };
    } catch (error) {
      if (!(error instanceof OrderApiError && error.status === 404))
        throw error;
    }
  }
  const created = await orderApi<{ order: ClientOrder; token: string }>(
    "/api/orders",
    { method: "POST" },
  );
  const key = { id: created.order.id, token: created.token };
  saveKey(key);
  return { key, order: created.order };
}

const answered = (q: Question, answers: Answers, files: unknown[]) =>
  q.id in answers || (q.kind === "file" && files.length > 0);
const shown = (q: Question, value: string | undefined) => {
  if (!value?.trim()) return "Skipped";
  return q.kind === "multi" ? value.split("\n").join(", ") : value;
};
function phaseFor(order: ClientOrder): Phase {
  if (order.status === "interview")
    return interview.every((q) => answered(q, order.answers, order.files))
      ? "contact"
      : "chat";
  return order.status === "submitted" ? "brief" : "done";
}

function Bubble({
  from,
  children,
  action,
}: {
  from: "assistant" | "client";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const mine = from === "client";
  return (
    <div
      className={`flex animate-in duration-300 fade-in slide-in-from-bottom-1 ${mine ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`group max-w-[85%] sm:max-w-[75%] ${mine ? "text-right" : ""}`}
      >
        <div
          className={`inline-block rounded-2xl px-4 py-3 text-left text-[0.95rem] leading-relaxed break-words whitespace-pre-line ${
            mine
              ? "rounded-br-md bg-[#1d1d1b] text-white"
              : "rounded-bl-md bg-white text-[#161616] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
          }`}
        >
          {children}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-shadow hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)] ${
        active
          ? "bg-[#1d1d1b] text-white"
          : "bg-white text-[#161616] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
      }`}
    >
      {active && <Check className="size-3.5" />}
      {children}
    </button>
  );
}

const cardShadow =
  "shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]";

// Answer control for the current question.
function AnswerBox({
  question,
  initial,
  onAnswer,
  onUpload,
  uploading,
}: {
  question: Question;
  initial: string;
  onAnswer: (value: string) => void;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [picked, setPicked] = useState<string[]>(
    initial ? initial.split("\n").filter(Boolean) : [],
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);
  const send = () => {
    if (!value.trim()) return;
    onAnswer(value.trim());
  };
  const skip = question.optional && (
    <Button variant="ghost" size="lg" onClick={() => onAnswer("")}>
      Skip
    </Button>
  );

  if (question.kind === "file")
    return (
      <div className={`rounded-2xl bg-white p-4 sm:p-5 ${cardShadow}`}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f6f5f2]">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-medium">Upload your brief</p>
            {question.hint && (
              <p className="text-sm text-neutral-500">{question.hint}</p>
            )}
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.md,application/pdf,text/plain,text/markdown"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onUpload(file);
          }}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="lg"
            className="h-10 px-4"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
            {uploading ? "Uploading…" : "Upload brief"}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="h-10 px-4"
            disabled={uploading}
            onClick={() => onAnswer("")}
          >
            Skip
          </Button>
        </div>
      </div>
    );

  if (question.kind === "choice")
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {question.options?.map((option) => (
          <Chip
            key={option}
            active={initial === option}
            onClick={() => onAnswer(option)}
          >
            {option}
          </Chip>
        ))}
        {skip}
      </div>
    );

  if (question.kind === "multi")
    return (
      <div className="flex flex-col items-end gap-3">
        <div className="flex flex-wrap justify-end gap-2">
          {question.options?.map((option) => (
            <Chip
              key={option}
              active={picked.includes(option)}
              onClick={() =>
                setPicked((list) =>
                  list.includes(option)
                    ? list.filter((item) => item !== option)
                    : [...list, option],
                )
              }
            >
              {option}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2">
          {skip}
          <Button
            size="lg"
            className="h-10 px-4"
            disabled={!picked.length}
            onClick={() =>
              onAnswer(
                (question.options || [])
                  .filter((option) => picked.includes(option))
                  .join("\n"),
              )
            }
          >
            Continue <ArrowRight />
          </Button>
        </div>
      </div>
    );

  const multiline = question.kind === "textarea";
  return (
    <form
      className={`rounded-2xl bg-white p-3 ${cardShadow}`}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      {multiline ? (
        <Textarea
          ref={field}
          value={value}
          maxLength={5000}
          rows={3}
          placeholder="Type your answer"
          className="min-h-24 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              send();
            }
          }}
        />
      ) : (
        <Input
          ref={field}
          value={value}
          maxLength={300}
          placeholder="Type your answer"
          className="h-11 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0"
          onChange={(event) => setValue(event.target.value)}
        />
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-neutral-500">{question.hint}</p>
        <div className="flex shrink-0 gap-2">
          {skip}
          <Button
            type="submit"
            size="lg"
            className="h-10 px-4"
            disabled={!value.trim()}
          >
            Send <ArrowRight />
          </Button>
        </div>
      </div>
    </form>
  );
}

function ContactBox({
  initial,
  busy,
  onSubmit,
}: {
  initial: ClientOrder["contact"];
  busy: boolean;
  onSubmit: (contact: ClientOrder["contact"]) => void;
}) {
  const [contact, setContact] = useState(initial);
  const field = (
    key: keyof ClientOrder["contact"],
    label: string,
    type: string,
    required: boolean,
  ) => (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>
        {label}
        {!required && (
          <span className="font-normal text-neutral-500"> (optional)</span>
        )}
      </span>
      <Input
        type={type}
        required={required}
        value={contact[key]}
        autoComplete={
          key === "name" ? "name" : key === "email" ? "email" : "tel"
        }
        maxLength={key === "email" ? 254 : key === "phone" ? 40 : 120}
        className="h-11 bg-[#f6f5f2] border-transparent text-base"
        onChange={(event) =>
          setContact((value) => ({ ...value, [key]: event.target.value }))
        }
      />
    </label>
  );
  return (
    <form
      className={`grid gap-4 rounded-2xl bg-white p-4 sm:p-5 ${cardShadow}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name: contact.name.trim(),
          email: contact.email.trim(),
          phone: contact.phone.trim(),
        });
      }}
    >
      {field("name", "Your name", "text", true)}
      {field("email", "Email", "email", true)}
      {field("phone", "Phone", "tel", false)}
      <Button
        type="submit"
        size="lg"
        className="h-11 justify-self-end px-5"
        disabled={busy}
      >
        {busy && <Loader2 className="animate-spin" />}
        Prepare my brief
      </Button>
    </form>
  );
}

function PackageStep({
  prices,
  busy,
  onConfirm,
}: {
  prices: Prices | null;
  busy: boolean;
  onConfirm: (pack: Pack, plan: Plan) => void;
}) {
  const [pack, setPack] = useState<Pack>("standard");
  const [plan, setPlan] = useState<Plan>("yearly");
  if (!prices)
    return (
      <p className="flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" /> Loading prices…
      </p>
    );
  const packs: { id: Pack; title: string; text: string }[] = [
    {
      id: "standard",
      title: "Standard",
      text: `Built from the Harbstone block library. Ready in about ${prices.standard.hours} hours.`,
    },
    {
      id: "designer",
      title: "Designer pack",
      text: `A designer customises the look of your website. Ready in about ${prices.designer.hours} hours.`,
    },
  ];
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {packs.map((item) => {
          const active = pack === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => setPack(item.id)}
              className={`grid gap-2 rounded-2xl p-5 text-left transition-shadow hover:shadow-[0_4px_18px_rgba(0,0,0,0.08)] ${
                active
                  ? "bg-white shadow-[0_0_0_2px_#1d1d1b]"
                  : `bg-white ${cardShadow}`
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{item.title}</span>
                <span
                  className={`grid size-5 place-items-center rounded-full ${active ? "bg-[#1d1d1b] text-white" : "bg-[#ecebe7]"}`}
                >
                  {active && <Check className="size-3" />}
                </span>
              </span>
              <span className="text-2xl font-semibold tracking-[-0.02em]">
                {money(prices[item.id].fee, prices.currency)}
              </span>
              <span className="text-sm text-neutral-600">{item.text}</span>
            </button>
          );
        })}
      </div>

      <div className={`grid gap-3 rounded-2xl bg-white p-5 ${cardShadow}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-semibold">Hosting and care</span>
          <div className="inline-flex rounded-full bg-[#f0efeb] p-1">
            {(["monthly", "yearly"] as Plan[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={plan === item}
                onClick={() => setPlan(item)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  plan === item
                    ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                    : "text-neutral-600"
                }`}
              >
                {item === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-2xl font-semibold tracking-[-0.02em]">
          {money(prices[plan], prices.currency)}
          <span className="text-base font-normal text-neutral-500">
            {plan === "monthly" ? " / month" : " / year"}
          </span>
        </p>
        <p className="text-sm text-neutral-600">
          Your website runs on Harbstone hosting: we keep it online, secure and
          up to date. You edit the content yourself in a simple admin panel.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          No card payment now. After you confirm, our team will contact you to
          arrange payment.
        </p>
        <Button
          size="lg"
          className="h-11 shrink-0 px-5"
          disabled={busy}
          onClick={() => onConfirm(pack, plan)}
        >
          {busy && <Loader2 className="animate-spin" />}
          Confirm brief
        </Button>
      </div>
    </div>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-[#f6f5f2] p-3 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 truncate font-mono text-sm">{link}</code>
      <Button
        variant="secondary"
        size="lg"
        className="bg-white"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}

function ThankYou({
  order,
  orderKey,
  prices,
  onNew,
}: {
  order: ClientOrder;
  orderKey: OrderKey;
  prices: Prices | null;
  onNew: () => void;
}) {
  const hours =
    order.pack && prices
      ? prices[order.pack].hours
      : order.dueAt
        ? Math.max(
            1,
            Math.round(
              (new Date(order.dueAt).getTime() -
                new Date(order.createdAt).getTime()) /
                3600000,
            ),
          )
        : null;
  return (
    <section
      className={`grid grid-cols-[minmax(0,1fr)] gap-5 rounded-2xl bg-white p-5 sm:p-7 ${cardShadow}`}
    >
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.02em]">
          Thank you! Order #{order.number} is confirmed.
        </h2>
        <p className="mt-1 text-neutral-600">Here is what happens next.</p>
      </div>
      <ol className="grid gap-3">
        {[
          "Our team has been notified and is reviewing your brief.",
          hours
            ? `You will see the first version of your website within about ${hours} hours.`
            : "You will see the first version of your website soon.",
          `You will receive your login to the admin panel at ${order.contact.email || "your email"}.`,
          "We will contact you to arrange payment.",
        ].map((text, index) => (
          <li key={text} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#f0efeb] text-sm font-semibold">
              {index + 1}
            </span>
            <span className="pt-0.5">{text}</span>
          </li>
        ))}
      </ol>
      <div className="grid min-w-0 gap-2">
        <p className="font-medium">Your private order link</p>
        <p className="text-sm text-neutral-600">
          Keep this link to check the status of your order. Anyone with the link
          can see it, so do not share it.
        </p>
        <CopyLink link={orderLink(orderKey)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          className="h-10 px-4"
          nativeButton={false}
          render={
            <Link
              href={`/order/${orderKey.id}#t=${encodeURIComponent(orderKey.token)}`}
            />
          }
        >
          Open order status <ArrowRight />
        </Button>
        <Button variant="ghost" size="lg" className="h-10 px-4" onClick={onNew}>
          Start a new order
        </Button>
      </div>
    </section>
  );
}

export function OrderChat() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [key, setKey] = useState<OrderKey | null>(null);
  const [order, setOrder] = useState<ClientOrder | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [files, setFiles] = useState<ClientOrder["files"]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<Prices | null>(null);
  const pending = useRef<Answers>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const apply = useCallback((next: { key: OrderKey; order: ClientOrder }) => {
    setKey(next.key);
    setOrder(next.order);
    setAnswers(next.order.answers);
    setFiles(next.order.files);
    setPhase(phaseFor(next.order));
  }, []);

  const boot = useCallback(() => {
    starting ??= startOrder();
    starting.then(apply, (failure: unknown) => {
      starting = null;
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not start your order.",
      );
      setPhase("error");
    });
  }, [apply]);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (phase !== "brief" && phase !== "done") return;
    let live = true;
    orderApi<Prices>("/api/orders/prices").then(
      (value) => live && setPrices(value),
      () => live && setError("Could not load prices. Reload the page."),
    );
    return () => {
      live = false;
    };
  }, [phase]);

  // Sends answers collected so far; failed answers stay queued for the next try.
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = pending.current;
    if (!key || !Object.keys(batch).length) return true;
    pending.current = {};
    setSaving(true);
    try {
      await orderApi(`/api/orders/${key.id}`, {
        method: "PATCH",
        token: key.token,
        json: { answers: batch },
      });
      setSaveError("");
      setRetry(false);
      return true;
    } catch (failure) {
      pending.current = { ...batch, ...pending.current };
      setRetry(true);
      setSaveError(
        failure instanceof Error ? failure.message : "Could not save.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [key]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const current = interview.findIndex((q) => !answered(q, answers, files));
  const active =
    phase === "chat" ? (editing ?? (current === -1 ? null : current)) : null;

  useEffect(() => {
    if (phase === "loading") return;
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [phase, active, saveError]);

  const answer = (question: Question, value: string) => {
    const next = { ...answers, [question.id]: value };
    setAnswers(next);
    setEditing(null);
    pending.current = { ...pending.current, [question.id]: value };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
    if (interview.every((q) => answered(q, next, files))) setPhase("contact");
  };

  const upload = async (file: File) => {
    if (!key) return;
    if (file.size > 10 * 1024 * 1024) {
      setSaveError("Upload a file under 10 MB.");
      return;
    }
    setUploading(true);
    setSaveError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const saved = await orderApi<{ files?: ClientOrder["files"] }>(
        `/api/orders/${key.id}/files`,
        { method: "POST", token: key.token, body },
      );
      const list = saved.files || [
        ...files,
        { id: file.name, name: file.name, size: file.size },
      ];
      setFiles(list);
      answer(interview[0], list.map((item) => item.name).join("\n"));
    } catch (failure) {
      setSaveError(
        failure instanceof Error ? failure.message : "Could not upload.",
      );
    } finally {
      setUploading(false);
    }
  };

  const submitContact = async (contact: ClientOrder["contact"]) => {
    if (!key) return;
    if (timer.current) clearTimeout(timer.current);
    const batch = pending.current;
    pending.current = {};
    setBusy(true);
    setSaveError("");
    try {
      const view = await orderApi<ClientOrder>(`/api/orders/${key.id}`, {
        method: "PATCH",
        token: key.token,
        json: {
          ...(Object.keys(batch).length ? { answers: batch } : {}),
          contact,
          submit: true,
        },
      });
      setOrder(view);
      setPhase("brief");
    } catch (failure) {
      pending.current = { ...batch, ...pending.current };
      setSaveError(
        failure instanceof Error ? failure.message : "Could not send.",
      );
      if (order) setOrder({ ...order, contact });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (pack: Pack, plan: Plan) => {
    if (!key) return;
    setBusy(true);
    setSaveError("");
    try {
      const view = await orderApi<ClientOrder>(
        `/api/orders/${key.id}/confirm`,
        { method: "POST", token: key.token, json: { pack, plan } },
      );
      setOrder(view);
      setPhase("done");
    } catch (failure) {
      setSaveError(
        failure instanceof Error ? failure.message : "Could not confirm.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => {
    saveKey(null);
    starting = null;
    pending.current = {};
    setOrder(null);
    setKey(null);
    setAnswers({});
    setFiles([]);
    setEditing(null);
    setSaveError("");
    setPhase("loading");
    boot();
  };

  const statusLink = key && (
    <Link
      href={`/order/${key.id}#t=${encodeURIComponent(key.token)}`}
      className="text-sm font-medium text-neutral-600 hover:text-[#111]"
    >
      Order #{order?.number}
    </Link>
  );

  if (phase === "loading")
    return (
      <OrderFrame>
        <p className="flex items-center gap-2 py-16 text-neutral-500">
          <Loader2 className="size-4 animate-spin" /> Starting your order…
        </p>
      </OrderFrame>
    );
  if (phase === "error" || !order || !key)
    return (
      <OrderFrame>
        <div className={`mt-10 rounded-2xl bg-white p-6 ${cardShadow}`}>
          <p className="font-medium">We could not open your order.</p>
          <p className="mt-1 text-sm text-neutral-600">{error}</p>
          <Button
            size="lg"
            className="mt-4 h-10 px-4"
            onClick={() => {
              setPhase("loading");
              boot();
            }}
          >
            <RotateCcw /> Try again
          </Button>
        </div>
      </OrderFrame>
    );

  // Questions already asked: everything answered, in script order, up to the current one.
  const asked = interview.filter(
    (q, index) =>
      answered(q, answers, files) && (current === -1 || index < current),
  );
  const interviewDone = phase !== "chat";
  const fileNames = files.map((item) => item.name).join(", ");

  return (
    <OrderFrame right={statusLink}>
      <h1 className="sr-only">Order a website</h1>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-4">
        <Bubble from="assistant">{interview[0].text}</Bubble>
        <p className="-mt-2 pl-1 text-xs text-neutral-500">
          Your answers are saved as you go. You can close this page and come
          back later on this device.
        </p>

        {asked.map((q) => {
          const index = interview.indexOf(q);
          return (
            <div key={q.id} className="grid gap-4">
              {index > 0 && <Bubble from="assistant">{q.text}</Bubble>}
              {editing !== index && (
                <Bubble
                  from="client"
                  action={
                    !interviewDone || phase === "contact"
                      ? q.kind !== "file" && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(index);
                              if (phase === "contact") setPhase("chat");
                            }}
                            className="mt-1 inline-flex items-center gap-1 px-1 text-xs text-neutral-500 hover:text-[#111]"
                          >
                            <Pencil className="size-3" /> Change
                          </button>
                        )
                      : null
                  }
                >
                  {q.kind === "file"
                    ? fileNames
                      ? `Uploaded: ${fileNames}`
                      : "Skipped — no brief yet"
                    : shown(q, answers[q.id])}
                </Bubble>
              )}
              {editing === index && (
                <AnswerBox
                  key={`edit-${q.id}`}
                  question={q}
                  initial={answers[q.id] || ""}
                  onAnswer={(value) => answer(q, value)}
                  onUpload={upload}
                  uploading={uploading}
                />
              )}
            </div>
          );
        })}

        {phase === "chat" && active !== null && editing === null && (
          <>
            {active > 0 && (
              <Bubble from="assistant">{interview[active].text}</Bubble>
            )}
            <AnswerBox
              key={interview[active].id}
              question={interview[active]}
              initial={answers[interview[active].id] || ""}
              onAnswer={(value) => answer(interview[active], value)}
              onUpload={upload}
              uploading={uploading}
            />
          </>
        )}

        {interviewDone && (
          <Bubble from="assistant">
            {phase === "contact"
              ? "Thank you, that is everything I need. Where should we send your brief and the login to your website?"
              : `Thank you, ${order.contact.name || "that is all"}! We will use ${order.contact.email} for your brief and your login.`}
          </Bubble>
        )}
        {phase === "contact" && (
          <ContactBox
            initial={order.contact}
            busy={busy}
            onSubmit={submitContact}
          />
        )}

        {(phase === "brief" || phase === "done") && order.brief && (
          <>
            <Bubble from="assistant">
              {phase === "brief"
                ? "I prepared the brief for your website. Please check it, then choose a package below."
                : "Here is the brief you confirmed."}
            </Bubble>
            <BriefCard order={order} />
          </>
        )}

        {phase === "brief" && (
          <>
            <Bubble from="assistant">
              Choose how we build your website and how you pay for hosting.
            </Bubble>
            <PackageStep prices={prices} busy={busy} onConfirm={confirm} />
          </>
        )}

        {phase === "done" && (
          <ThankYou
            order={order}
            orderKey={key}
            prices={prices}
            onNew={startNew}
          />
        )}

        {(saveError || saving) && (
          <div
            role={saveError ? "alert" : "status"}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm ${
              saveError
                ? "bg-[#fdecea] text-[#8a1c12]"
                : "bg-transparent text-neutral-500"
            }`}
          >
            <span>{saveError || "Saving…"}</span>
            {saveError && retry && (
              <Button
                variant="secondary"
                size="sm"
                className="bg-white"
                onClick={() => void flush()}
              >
                <RotateCcw /> Retry
              </Button>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>
    </OrderFrame>
  );
}
