"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { card, field, label, ErrorLine } from "@/components/admin/crm/crm-ui";
import {
  hhmm,
  parseHhmm,
  WEEKDAYS,
  type BookingSettings,
  type BookingService,
  type BookingStaff,
  type WeekHours,
} from "@/lib/builder/booking/shared";
import { cn } from "@/lib/utils";

// Booking settings of the website: on/off, confirmation, slot rules, business hours,
// holidays, services and staff (each with optional own hours and vacations).
const newId = () => Math.random().toString(36).slice(2, 10);
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function Num({ value, onChange, min = 0, max, step = 1, id }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; id?: string }) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      className={field}
      value={Number.isFinite(value) ? value : ""}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );
}
function Hours({ hours, onChange, name }: { hours: WeekHours; onChange: (h: WeekHours) => void; name: string }) {
  const set = (d: number, i: number, key: "from" | "to", value: string) => {
    const next = copy(hours);
    const n = parseHhmm(value);
    if (Number.isNaN(n)) return;
    next[d][i][key] = n;
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {WEEKDAYS.map((day, d) => (
        <div key={day} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-24 shrink-0">{day}</span>
          {hours[d].length === 0 && <span className="text-neutral-400">Closed</span>}
          {hours[d].map((span, i) => (
            <span key={i} className="flex items-center gap-1">
              <input aria-label={`${name}: ${day} opens`} type="time" step={300} className={cn(field, "w-28")} value={hhmm(span.from)} onChange={(e) => set(d, i, "from", e.target.value)} />
              –
              <input aria-label={`${name}: ${day} closes`} type="time" step={300} className={cn(field, "w-28")} value={hhmm(Math.min(span.to, 1439))} onChange={(e) => set(d, i, "to", e.target.value)} />
              <button
                type="button"
                aria-label={`Remove ${day} hours ${i + 1}`}
                className="grid size-8 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-black"
                onClick={() => {
                  const next = copy(hours);
                  next[d].splice(i, 1);
                  onChange(next);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
          {hours[d].length < 4 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const next = copy(hours);
                const last = next[d].at(-1);
                next[d].push(last ? { from: Math.min(last.to + 60, 1380), to: Math.min(last.to + 240, 1440) } : { from: 540, to: 1080 });
                onChange(next);
              }}
            >
              <Plus data-icon="inline-start" /> {hours[d].length ? "Add hours" : "Open"}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export function BookingSettingsForm({
  initial,
  revision,
  onSave,
}: {
  initial: BookingSettings;
  revision: number;
  onSave: (settings: BookingSettings, revision: number) => Promise<string | null>;
}) {
  const [s, setS] = useState<BookingSettings>(() => copy(initial));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<BookingSettings>) => {
    setSaved(false);
    setS((x) => ({ ...x, ...p }));
  };
  const service = (i: number, p: Partial<BookingService>) =>
    patch({ services: s.services.map((x, n) => (n === i ? { ...x, ...p } : x)) });
  const staff = (i: number, p: Partial<BookingStaff>) => patch({ staff: s.staff.map((x, n) => (n === i ? { ...x, ...p } : x)) });
  async function save() {
    setBusy(true);
    setError("");
    const message = await onSave(
      {
        ...s,
        services: s.services.map((x) => ({ ...x, name: x.name.trim() || "Service" })),
        staff: s.staff.map((x) => ({ ...x, name: x.name.trim() || "Staff member" })),
        currency: s.currency.toUpperCase(),
      },
      revision,
    );
    setBusy(false);
    if (message) setError(message);
    else setSaved(true);
  }
  const section = cn(card, "space-y-4 p-4 sm:p-6");
  return (
    <div className="space-y-5">
      <ErrorLine error={error} />
      <section className={section}>
        <h2 className="text-sm font-semibold">Online booking</h2>
        <label className="flex items-center justify-between gap-3 text-sm">
          Visitors can book on the website (booking block “Appointments”)
          <Switch checked={s.enabled} onCheckedChange={(v: boolean) => patch({ enabled: v })} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          Confirm new bookings automatically (off = they wait as Pending until you confirm)
          <Switch checked={s.autoConfirm} onCheckedChange={(v: boolean) => patch({ autoConfirm: v })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className={label} htmlFor="bk-step">Time step (minutes)</label>
            <Num id="bk-step" value={s.step} min={5} max={240} step={5} onChange={(n) => patch({ step: n })} />
          </div>
          <div>
            <label className={label} htmlFor="bk-notice">Minimum notice (hours)</label>
            <Num id="bk-notice" value={Math.round((s.minNotice / 60) * 100) / 100} min={0} max={720} step={0.5} onChange={(n) => patch({ minNotice: Math.round(n * 60) })} />
          </div>
          <div>
            <label className={label} htmlFor="bk-days">Book up to (days ahead)</label>
            <Num id="bk-days" value={s.maxDays} min={1} max={365} onChange={(n) => patch({ maxDays: n })} />
          </div>
          <div>
            <label className={label} htmlFor="bk-cap">Parallel bookings (no staff list)</label>
            <Num id="bk-cap" value={s.capacity} min={1} max={50} onChange={(n) => patch({ capacity: n })} />
          </div>
          <div>
            <label className={label} htmlFor="bk-cur">Currency</label>
            <input id="bk-cur" className={field} maxLength={3} value={s.currency} onChange={(e) => patch({ currency: e.target.value.toUpperCase() })} />
          </div>
        </div>
        <p className="text-xs text-neutral-400">Times are in the website time zone (Settings → enquiry time zone).</p>
      </section>

      <section className={section}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Services</h2>
          <Button size="sm" variant="outline" className="bg-white" onClick={() => patch({ services: [...s.services, { id: newId(), name: "", duration: 30, price: 0, buffer: 0, staffIds: [], active: true }] })}>
            <Plus data-icon="inline-start" /> Add service
          </Button>
        </div>
        {!s.services.length && <p className="text-sm text-neutral-500">Add the services visitors can book, with their length and price.</p>}
        {s.services.map((x, i) => (
          <div key={x.id} className="space-y-3 rounded-xl bg-neutral-50 p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_110px_110px_110px_auto]">
              <div>
                <label className={label} htmlFor={`sv-n-${x.id}`}>Name</label>
                <input id={`sv-n-${x.id}`} className={cn(field, "bg-white")} maxLength={120} value={x.name} placeholder="Haircut" onChange={(e) => service(i, { name: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor={`sv-d-${x.id}`}>Minutes</label>
                <Num id={`sv-d-${x.id}`} value={x.duration} min={5} max={720} step={5} onChange={(n) => service(i, { duration: n })} />
              </div>
              <div>
                <label className={label} htmlFor={`sv-p-${x.id}`}>Price</label>
                <Num id={`sv-p-${x.id}`} value={x.price} min={0} step={0.5} onChange={(n) => service(i, { price: n })} />
              </div>
              <div>
                <label className={label} htmlFor={`sv-b-${x.id}`}>Buffer after (min)</label>
                <Num id={`sv-b-${x.id}`} value={x.buffer} min={0} max={240} step={5} onChange={(n) => service(i, { buffer: n })} />
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <label className="flex items-center gap-2 text-xs text-neutral-500">
                  <Switch checked={x.active} onCheckedChange={(v: boolean) => service(i, { active: v })} aria-label={`${x.name || "Service"} bookable`} /> On
                </label>
                <Button size="icon-sm" variant="ghost" aria-label={`Remove ${x.name || "service"}`} onClick={() => patch({ services: s.services.filter((_, n) => n !== i) })}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            {s.staff.length > 0 && (
              <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <legend className={cn(label, "mb-1")}>Who does it (none ticked = everyone)</legend>
                {s.staff.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={x.staffIds.includes(p.id)}
                      onChange={(e) => service(i, { staffIds: e.target.checked ? [...x.staffIds, p.id] : x.staffIds.filter((y) => y !== p.id) })}
                    />
                    {p.name || "Staff member"}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        ))}
      </section>

      <section className={section}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Staff</h2>
          <Button size="sm" variant="outline" className="bg-white" onClick={() => patch({ staff: [...s.staff, { id: newId(), name: "", role: "", hours: null, vacations: [], active: true }] })}>
            <Plus data-icon="inline-start" /> Add staff member
          </Button>
        </div>
        <p className="text-xs text-neutral-400">Optional. With a staff list every person is booked separately and visitors can choose who they want. Without it the business takes the number of parallel bookings set above.</p>
        {s.staff.map((p, i) => (
          <div key={p.id} className="space-y-3 rounded-xl bg-neutral-50 p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <label className={label} htmlFor={`st-n-${p.id}`}>Name</label>
                <input id={`st-n-${p.id}`} className={cn(field, "bg-white")} maxLength={120} value={p.name} onChange={(e) => staff(i, { name: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor={`st-r-${p.id}`}>Role (optional)</label>
                <input id={`st-r-${p.id}`} className={cn(field, "bg-white")} maxLength={120} value={p.role} onChange={(e) => staff(i, { role: e.target.value })} />
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <label className="flex items-center gap-2 text-xs text-neutral-500">
                  <Switch checked={p.active} onCheckedChange={(v: boolean) => staff(i, { active: v })} aria-label={`${p.name || "Staff member"} takes bookings`} /> On
                </label>
                <Button size="icon-sm" variant="ghost" aria-label={`Remove ${p.name || "staff member"}`} onClick={() => patch({ staff: s.staff.filter((_, n) => n !== i), services: s.services.map((x) => ({ ...x, staffIds: x.staffIds.filter((y) => y !== p.id) })) })}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!p.hours} onChange={(e) => staff(i, { hours: e.target.checked ? copy(s.hours) : null })} />
              Own working hours and days off (otherwise the business hours)
            </label>
            {p.hours && <Hours name={p.name || "Staff"} hours={p.hours} onChange={(h) => staff(i, { hours: h })} />}
            <div className="space-y-2">
              <p className={label}>Vacations / days away</p>
              {p.vacations.map((v, n) => (
                <div key={n} className="flex flex-wrap items-center gap-2 text-sm">
                  <input aria-label="From" type="date" className={cn(field, "w-40 bg-white")} value={v.from} onChange={(e) => staff(i, { vacations: p.vacations.map((y, k) => (k === n ? { ...y, from: e.target.value } : y)) })} />
                  –
                  <input aria-label="To" type="date" className={cn(field, "w-40 bg-white")} value={v.to} onChange={(e) => staff(i, { vacations: p.vacations.map((y, k) => (k === n ? { ...y, to: e.target.value } : y)) })} />
                  <input aria-label="Note" placeholder="Note" className={cn(field, "w-48 bg-white")} maxLength={200} value={v.note} onChange={(e) => staff(i, { vacations: p.vacations.map((y, k) => (k === n ? { ...y, note: e.target.value } : y)) })} />
                  <Button size="icon-sm" variant="ghost" aria-label="Remove vacation" onClick={() => staff(i, { vacations: p.vacations.filter((_, k) => k !== n) })}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => { const d = new Date().toISOString().slice(0, 10); staff(i, { vacations: [...p.vacations, { from: d, to: d, note: "" }] }); }}>
                <Plus data-icon="inline-start" /> Add vacation
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section className={section}>
        <h2 className="text-sm font-semibold">Business hours</h2>
        <Hours name="Business" hours={s.hours} onChange={(h) => patch({ hours: h })} />
      </section>

      <section className={section}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Holidays (closed days)</h2>
          <Button size="sm" variant="outline" className="bg-white" onClick={() => patch({ holidays: [...s.holidays, { date: new Date().toISOString().slice(0, 10), note: "" }] })}>
            <Plus data-icon="inline-start" /> Add day
          </Button>
        </div>
        {s.holidays.map((h, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <input aria-label="Closed day" type="date" className={cn(field, "w-40")} value={h.date} onChange={(e) => patch({ holidays: s.holidays.map((x, n) => (n === i ? { ...x, date: e.target.value } : x)) })} />
            <input aria-label="Note" placeholder="e.g. Midsummer" className={cn(field, "w-56")} maxLength={200} value={h.note} onChange={(e) => patch({ holidays: s.holidays.map((x, n) => (n === i ? { ...x, note: e.target.value } : x)) })} />
            <Button size="icon-sm" variant="ghost" aria-label="Remove day" onClick={() => patch({ holidays: s.holidays.filter((_, n) => n !== i) })}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </section>

      <div className="sticky bottom-4 flex items-center gap-3">
        <Button disabled={busy} onClick={() => void save()}>
          Save booking settings
        </Button>
        {saved && <span className="text-sm text-emerald-700" role="status">Saved</span>}
      </div>
    </div>
  );
}
