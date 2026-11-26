// Runtime of the online booking widget (contact-v60, booking agent 2026-11-19):
// service → specialist (when the business has a staff list) → day (month calendar with only
// open days enabled) → free time → name / phone / e-mail / comment → booking, then a success
// screen with an .ics download and the signed "change or cancel" link.
// Free days and times come from /api/booking (computed on the server); the server re-checks
// the time inside its locked store, so a taken slot answers 409 and the widget reloads times.
// All texts are fields of the template ([data-l] labels), so every page/language has its own.
// In the editor and the library (no published page) it shows sample data and books nothing.

type Service = { id: string; name: string; duration: number; price: number };
type Staff = { id: string; name: string; role: string; services: string[] };
type Config = { services: Service[]; staff: Staff[]; currency: string; today: string; last: string };
type Done = { number: number; status: string; service: string; staff: string; date: string; from: string; to: string; ics: string; manage: string };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (date: string) => new Date(`${date}T12:00:00Z`);
const monthOf = (date: string) => date.slice(0, 7);
const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const CHECK =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
const ARROW = (d: string) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

// Sample data for previews (editor without booking settings, library, screenshots).
function demoConfig(): Config {
  const today = ymd(new Date());
  const last = ymd(new Date(Date.now() + 60 * 86400000));
  return {
    services: [
      { id: "a", name: "Consultation", duration: 30, price: 0 },
      { id: "b", name: "Standard appointment", duration: 60, price: 45 },
      { id: "c", name: "Extended appointment", duration: 90, price: 70 },
    ],
    staff: [],
    currency: "EUR",
    today,
    last,
  };
}
const demoDays = (month: string, today: string, last: string) => {
  const out: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const date = `${month}-${pad(d)}`;
    const u = utc(date);
    if (monthOf(ymd(u)) !== month || date < today || date > last) continue;
    if (u.getUTCDay() !== 0) out.push(date);
  }
  return out;
};
const demoSlots = ["09:00", "09:30", "10:30", "11:00", "13:00", "14:30", "15:00", "16:30"];

export function mountBookingWidgets(
  el: HTMLElement,
  signal: AbortSignal,
  opts: { siteId?: string; pageId?: string; locale?: string; editing?: boolean },
): () => void {
  const cleanups: (() => void)[] = [];
  el.querySelectorAll<HTMLElement>("[data-booking]").forEach((root) => {
    const host = root.querySelector<HTMLElement>("[data-booking-app]");
    if (!host) return;
    const L: Record<string, string> = {};
    root.querySelectorAll<HTMLElement>("[data-l]").forEach((e) => (L[e.dataset.l!] = (e.textContent || "").trim()));
    const lang = opts.locale || document.documentElement.lang || "en";
    const app = document.createElement("div");
    app.className = "contact__bk-root";
    host.append(app);
    cleanups.push(() => app.remove());
    const site = opts.siteId || "";
    const live = !!(site && opts.pageId && !opts.editing);
    let demo = false;
    let config: Config | null = null;
    let failed = "";
    const s = {
      service: "",
      staff: "",
      month: "",
      days: null as string[] | null,
      date: "",
      slots: null as string[] | null,
      time: "",
      values: { name: "", phone: "", email: "", comment: "", website: "" } as Record<string, string>,
      status: "",
      error: false,
      sending: false,
      done: null as Done | null,
    };
    let token = "";
    const loadToken = async () => {
      const r = await fetch(`/api/forms/token?pageId=${encodeURIComponent(opts.pageId!)}&site=${encodeURIComponent(site)}`, { signal });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      token = data.token;
      return token;
    };
    const get = async (query: string) => {
      const r = await fetch(`/api/booking?site=${encodeURIComponent(site)}${query}`, { signal, cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(data.error || "error"), { status: r.status });
      return data;
    };
    const fmtMoney = (n: number) =>
      n ? new Intl.NumberFormat(lang, { style: "currency", currency: config?.currency || "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n) : "";
    const fmtDate = (date: string, o: Intl.DateTimeFormatOptions) => {
      try {
        return utc(date).toLocaleDateString(lang, { ...o, timeZone: "UTC" });
      } catch {
        return utc(date).toLocaleDateString("en", { ...o, timeZone: "UTC" });
      }
    };
    const staffFor = () => (config?.staff || []).filter((p) => p.services.includes(s.service));
    const service = () => config?.services.find((x) => x.id === s.service);

    async function loadDays(autoPick: boolean) {
      s.days = null;
      s.slots = null;
      s.date = "";
      s.time = "";
      render();
      const month = s.month;
      let days: string[];
      try {
        days = demo ? demoDays(month, config!.today, config!.last) : (await get(`&service=${encodeURIComponent(s.service)}&staff=${encodeURIComponent(s.staff)}&month=${month}`)).days;
      } catch {
        if (signal.aborted) return;
        days = [];
      }
      if (month !== s.month) return;
      // Nothing left this month (e.g. late on the last day): jump once to the next month.
      if (autoPick && !days.length && month === monthOf(config!.today) && shiftMonth(month, 1) <= monthOf(config!.last)) {
        s.month = shiftMonth(month, 1);
        return loadDays(true);
      }
      s.days = days;
      if (autoPick && days.length) return pickDay(days[0], false);
      render();
    }
    async function pickDay(date: string, focus = true) {
      s.date = date;
      s.time = "";
      s.slots = null;
      render(focus ? `day-${date}` : undefined);
      let slots: string[];
      try {
        slots = demo ? demoSlots : (await get(`&service=${encodeURIComponent(s.service)}&staff=${encodeURIComponent(s.staff)}&date=${date}`)).slots;
      } catch {
        if (signal.aborted) return;
        slots = [];
      }
      if (s.date !== date) return;
      s.slots = slots;
      render(focus ? `day-${date}` : undefined);
    }

    function render(focusKey?: string) {
      const active = focusKey || (document.activeElement as HTMLElement | null)?.closest?.("[data-k]")?.getAttribute("data-k") || "";
      if (!config) {
        app.innerHTML = failed ? `<p class="contact__bk-empty text text--md">${esc(failed)}</p>` : "";
        return;
      }
      if (s.done) {
        const d = s.done;
        app.innerHTML = `<div class="contact__bk-done" role="status">
          <span class="contact__bk-check">${CHECK}</span>
          <h3 class="heading heading--sm" tabindex="-1" data-k="done">${esc(L.successTitle)}</h3>
          <p class="contact__bk-summary text text--md">${esc(d.service)}${d.staff ? ` · ${esc(d.staff)}` : ""}<br>${esc(fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" }))}, ${esc(d.from)}–${esc(d.to)}</p>
          <p class="text text--md">${esc(d.status === "confirmed" ? L.confirmed : L.pending)}</p>
          <div class="contact__bk-actions">
            ${d.ics ? `<a class="button button--accent text text--sm" href="${esc(d.ics)}" download="booking-${d.number}.ics">${esc(L.calendar)}</a>` : ""}
            ${d.manage ? `<a class="text-link text text--sm" href="${esc(d.manage)}" target="_blank" rel="noopener">${esc(L.manage)}</a>` : ""}
            <button class="contact__bk-link text text--sm" type="button" data-act="again" data-k="again">${esc(L.again)}</button>
          </div></div>`;
        app.querySelector<HTMLElement>(`[data-k="${active === "submit" ? "done" : active}"]`)?.focus();
        return;
      }
      const svc = service();
      const staff = staffFor();
      const month = s.month;
      const first = utc(`${month}-01`);
      const lead = (first.getUTCDay() + 6) % 7;
      const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      const open = new Set(s.days || []);
      const weekdays = Array.from({ length: 7 }, (_, i) => fmtDate(ymd(new Date(Date.UTC(2024, 0, 1 + i))), { weekday: "short" }));
      const minutes = (n: number) => (L.minutes || "{n} min").replace("{n}", String(n));
      app.innerHTML = `
        <div class="contact__bk-step" role="group" aria-labelledby="bk-s-${esc(root.id)}">
          <p class="contact__bk-title text text--md" id="bk-s-${esc(root.id)}">${esc(L.service)}</p>
          <div class="contact__bk-options">${config.services
            .map(
              (x) => `<button class="contact__bk-opt text text--md" type="button" data-act="service" data-id="${esc(x.id)}" data-k="svc-${esc(x.id)}" aria-pressed="${x.id === s.service}"><b>${esc(x.name)}</b><span class="text text--sm">${esc([minutes(x.duration), fmtMoney(x.price)].filter(Boolean).join(" · "))}</span></button>`,
            )
            .join("")}</div>
        </div>
        ${
          svc && staff.length
            ? `<div class="contact__bk-step" role="group" aria-label="${esc(L.staff)}"><p class="contact__bk-title text text--md">${esc(L.staff)}</p><div class="contact__bk-chips">
            <button class="contact__bk-chip text text--sm" type="button" data-act="staff" data-id="" data-k="st-" aria-pressed="${!s.staff}">${esc(L.any)}</button>
            ${staff.map((p) => `<button class="contact__bk-chip text text--sm" type="button" data-act="staff" data-id="${esc(p.id)}" data-k="st-${esc(p.id)}" aria-pressed="${p.id === s.staff}" ${p.role ? `title="${esc(p.role)}"` : ""}>${esc(p.name)}</button>`).join("")}
          </div></div>`
            : ""
        }
        ${
          svc
            ? `<div class="contact__bk-step" role="group" aria-label="${esc(L.date)}"><p class="contact__bk-title text text--md">${esc(L.date)}</p>
          <div class="contact__bk-cal">
            <div class="contact__bk-month"><button class="contact__bk-nav" type="button" data-act="month" data-n="-1" data-k="prev" aria-label="${esc(L.prev)}" ${month <= monthOf(config.today) ? "disabled" : ""}>${ARROW("m15 18-6-6 6-6")}</button>
            <span aria-live="polite">${esc(fmtDate(`${month}-01`, { month: "long", year: "numeric" }))}</span>
            <button class="contact__bk-nav" type="button" data-act="month" data-n="1" data-k="next" aria-label="${esc(L.next)}" ${month >= monthOf(config.last) ? "disabled" : ""}>${ARROW("m9 18 6-6-6-6")}</button></div>
            <div class="contact__bk-grid">${weekdays.map((w) => `<span class="contact__bk-wd" aria-hidden="true">${esc(w)}</span>`).join("")}${"<span></span>".repeat(lead)}${Array.from({ length: daysIn }, (_, i) => {
              const date = `${month}-${pad(i + 1)}`;
              const ok = open.has(date);
              return `<button class="contact__bk-day" type="button" data-act="day" data-date="${date}" data-k="day-${date}" aria-label="${esc(fmtDate(date, { weekday: "long", day: "numeric", month: "long" }))}" aria-pressed="${date === s.date}" ${ok ? "" : "disabled"}>${i + 1}</button>`;
            }).join("")}</div>
            ${s.days && !s.days.length ? `<p class="contact__bk-empty text text--sm">${esc(L.noDays)}</p>` : ""}
          </div></div>`
            : ""
        }
        ${
          s.date
            ? `<div class="contact__bk-step" role="group" aria-label="${esc(L.time)}"><p class="contact__bk-title text text--md">${esc(L.time)}<span class="text text--sm contact__bk-empty">${esc(fmtDate(s.date, { weekday: "long", day: "numeric", month: "long" }))}</span></p>
          ${s.slots === null ? "" : s.slots.length ? `<div class="contact__bk-times">${s.slots.map((t) => `<button class="contact__bk-time text text--sm" type="button" data-act="time" data-time="${t}" data-k="t-${t}" aria-pressed="${t === s.time}">${t}</button>`).join("")}</div>` : `<p class="contact__bk-empty text text--sm">${esc(L.noSlots)}</p>`}
          </div>`
            : ""
        }
        ${
          s.time && svc
            ? `<div class="contact__bk-step" role="group" aria-label="${esc(L.details)}"><p class="contact__bk-title text text--md">${esc(L.details)}</p>
          <p class="contact__bk-summary text text--md">${esc(svc.name)}${s.staff ? ` · ${esc(staff.find((p) => p.id === s.staff)?.name || "")}` : ""} · ${esc(fmtDate(s.date, { weekday: "short", day: "numeric", month: "long" }))}, ${esc(s.time)}</p>
          <div class="contact__bk-fields">
            <label class="contact__bk-field text text--md">${esc(L.name)} *<input class="contact__bk-input" name="name" autocomplete="name" maxlength="160" required data-k="f-name" value="${esc(s.values.name)}"></label>
            <label class="contact__bk-field text text--md">${esc(L.phone)} *<input class="contact__bk-input" name="phone" type="tel" autocomplete="tel" maxlength="40" required data-k="f-phone" value="${esc(s.values.phone)}"></label>
            <label class="contact__bk-field contact__bk-field--wide text text--md">${esc(L.email)}<input class="contact__bk-input" name="email" type="email" autocomplete="email" maxlength="254" data-k="f-email" value="${esc(s.values.email)}"></label>
            <label class="contact__bk-field contact__bk-field--wide text text--md">${esc(L.comment)}<textarea class="contact__bk-input" name="comment" rows="3" maxlength="2000" data-k="f-comment">${esc(s.values.comment)}</textarea></label>
            <input class="contact__bk-trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          </div>
          <div class="contact__bk-actions"><button class="button button--accent text text--sm" type="button" data-act="submit" data-k="submit" ${s.sending ? "disabled" : ""}>${esc(s.sending ? L.sending : L.submit)}</button></div>
          <p class="contact__bk-status text text--sm${s.error ? " is-error" : ""}" role="status" aria-live="polite">${esc(s.status)}</p>
          </div>`
            : ""
        }`;
      if (active) app.querySelector<HTMLElement>(`[data-k="${active}"]`)?.focus({ preventScroll: true });
    }

    async function submit() {
      const fields = [...app.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(".contact__bk-input")];
      let bad: HTMLElement | null = null;
      for (const f of fields) {
        const ok = f.checkValidity() && (!f.required || f.value.trim() !== "");
        f.setAttribute("aria-invalid", String(!ok));
        if (!ok && !bad) bad = f;
      }
      if (bad) {
        s.status = L.required;
        s.error = true;
        app.querySelector(".contact__bk-status")!.textContent = s.status;
        app.querySelector(".contact__bk-status")!.classList.add("is-error");
        bad.focus();
        return;
      }
      if (!live) {
        s.status = L.preview;
        s.error = false;
        return render("submit");
      }
      s.sending = true;
      s.status = "";
      render("submit");
      const send = async (retry: boolean): Promise<void> => {
        const r = await fetch("/api/booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            site,
            pageId: opts.pageId,
            token: token || (await loadToken()),
            locale: lang,
            serviceId: s.service,
            staffId: s.staff,
            date: s.date,
            time: s.time,
            ...s.values,
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (r.status === 403 && retry) {
          await loadToken();
          await new Promise((res) => setTimeout(res, 1100));
          return send(false);
        }
        if (r.status === 409 && data.code === "taken") {
          s.status = L.taken;
          s.error = true;
          s.time = "";
          await pickDay(s.date, false);
          return;
        }
        if (!r.ok) throw new Error(data.error || L.error);
        s.done = data;
        window.dispatchEvent(new CustomEvent("cms:track", { detail: { e: "booking" } }));
      };
      try {
        if (!token) {
          await loadToken();
          await new Promise((res) => setTimeout(res, 1100));
        }
        await send(true);
      } catch (e) {
        if (signal.aborted) return;
        s.status = e instanceof Error && e.message && e.message !== "error" ? e.message : L.error;
        s.error = true;
      } finally {
        s.sending = false;
        if (!signal.aborted) render(s.done ? "done" : "submit");
      }
    }

    app.addEventListener(
      "click",
      (e) => {
        const b = (e.target as Element).closest<HTMLElement>("[data-act]");
        if (!b || !app.contains(b)) return;
        const act = b.dataset.act;
        if (act === "service") {
          s.service = b.dataset.id!;
          if (!staffFor().some((p) => p.id === s.staff)) s.staff = "";
          s.month = monthOf(config!.today);
          void loadDays(true);
        } else if (act === "staff") {
          s.staff = b.dataset.id || "";
          s.month = monthOf(config!.today);
          void loadDays(true);
        } else if (act === "month") {
          s.month = shiftMonth(s.month, Number(b.dataset.n));
          void loadDays(false);
        } else if (act === "day") void pickDay(b.dataset.date!);
        else if (act === "time") {
          s.time = b.dataset.time!;
          s.status = "";
          render(`t-${s.time}`);
          app.querySelector<HTMLElement>('[data-k="f-name"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } else if (act === "submit") void submit();
        else if (act === "again") {
          s.done = null;
          s.time = "";
          s.status = "";
          s.values.comment = "";
          void pickDay(s.date, false);
        }
      },
      { signal },
    );
    app.addEventListener(
      "input",
      (e) => {
        const f = e.target as HTMLInputElement;
        if (f.name in s.values) s.values[f.name] = f.value;
        if (f.getAttribute("aria-invalid") === "true") f.setAttribute("aria-invalid", "false");
      },
      { signal },
    );
    app.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter" && (e.target as Element).matches("input.contact__bk-input")) {
          e.preventDefault();
          void submit();
        }
      },
      { signal },
    );

    (async () => {
      try {
        if (!site) throw Object.assign(new Error("preview"), { status: 404 });
        config = await get("");
        if (!config!.services.length) throw Object.assign(new Error("empty"), { status: 404 });
      } catch (e) {
        if (signal.aborted) return;
        if (live) {
          failed = L.unavailable;
          return render();
        }
        // Editor / library: sample data so the block can be seen and styled.
        demo = true;
        config = demoConfig();
        void e;
      }
      s.month = monthOf(config!.today);
      if (config!.services.length === 1) {
        s.service = config!.services[0].id;
        void loadDays(true);
      } else render();
    })();
  });
  return () => cleanups.forEach((f) => f());
}
