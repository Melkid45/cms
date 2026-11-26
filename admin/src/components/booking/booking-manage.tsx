"use client";
import { useEffect, useState } from "react";

// Public page of one booking (signed link): details, .ics download and cancellation.
// Texts follow the language of the page the booking was made on.
const T = {
  en: { title: "Your booking", service: "Service", with: "Specialist", when: "Time", status: "Status", cancel: "Cancel the booking", sure: "Cancel this booking?", cancelled: "The booking is cancelled.", calendar: "Add to calendar", notFound: "Booking not found. The link may be incomplete.", late: "This booking can no longer be cancelled online. Please call us.", loading: "Loading…", st: { pending: "Waiting for confirmation", confirmed: "Confirmed", cancelled: "Cancelled", "no-show": "Missed", done: "Done" } },
  lv: { title: "Jūsu pieraksts", service: "Pakalpojums", with: "Speciālists", when: "Laiks", status: "Statuss", cancel: "Atcelt pierakstu", sure: "Atcelt šo pierakstu?", cancelled: "Pieraksts ir atcelts.", calendar: "Pievienot kalendāram", notFound: "Pieraksts nav atrasts. Iespējams, saite nav pilnīga.", late: "Šo pierakstu vairs nevar atcelt tiešsaistē. Lūdzu, zvaniet mums.", loading: "Ielādē…", st: { pending: "Gaida apstiprinājumu", confirmed: "Apstiprināts", cancelled: "Atcelts", "no-show": "Neieradās", done: "Notika" } },
  ru: { title: "Ваша запись", service: "Услуга", with: "Специалист", when: "Время", status: "Статус", cancel: "Отменить запись", sure: "Отменить эту запись?", cancelled: "Запись отменена.", calendar: "Добавить в календарь", notFound: "Запись не найдена. Возможно, ссылка неполная.", late: "Эту запись уже нельзя отменить онлайн. Пожалуйста, позвоните нам.", loading: "Загрузка…", st: { pending: "Ждёт подтверждения", confirmed: "Подтверждена", cancelled: "Отменена", "no-show": "Не пришёл", done: "Состоялась" } },
  de: { title: "Ihr Termin", service: "Leistung", with: "Bei", when: "Zeit", status: "Status", cancel: "Termin absagen", sure: "Diesen Termin absagen?", cancelled: "Der Termin ist abgesagt.", calendar: "Zum Kalender hinzufügen", notFound: "Termin nicht gefunden. Der Link ist möglicherweise unvollständig.", late: "Dieser Termin kann nicht mehr online abgesagt werden. Bitte rufen Sie uns an.", loading: "Wird geladen…", st: { pending: "Wartet auf Bestätigung", confirmed: "Bestätigt", cancelled: "Abgesagt", "no-show": "Nicht erschienen", done: "Erledigt" } },
};
type Info = {
  number: number;
  status: keyof (typeof T)["en"]["st"];
  service: string;
  staff: string;
  date: string;
  from: string;
  to: string;
  locale: string;
  business: string;
  address: string;
  phone: string;
  cancellable: boolean;
};
export function BookingManage({ site, id, token }: { site: string; id: string; token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const query = `site=${encodeURIComponent(site)}&id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;
  const t = T[(info?.locale && info.locale in T ? info.locale : "en") as keyof typeof T];
  useEffect(() => {
    fetch(`/api/booking/manage?${query}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? setInfo(await r.json()) : setError("notFound")))
      .catch(() => setError("notFound"));
  }, [query]);
  async function cancel() {
    if (!confirm(t.sure)) return;
    setBusy(true);
    const r = await fetch("/api/booking/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site, id, t: token, action: "cancel" }),
    });
    setBusy(false);
    if (r.ok) setInfo((i) => i && { ...i, status: "cancelled", cancellable: false });
    else setError(r.status === 409 ? "late" : "notFound");
  }
  const date = info
    ? new Date(`${info.date}T12:00:00Z`).toLocaleDateString(info.locale || "en", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : "";
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <div className="rounded-2xl bg-white p-6 shadow-[0_10px_40px_rgb(0_0_0/0.06)] sm:p-8">
        {!info && !error && <p>{T.en.loading}</p>}
        {error && !info && <p role="alert">{t.notFound}</p>}
        {info && (
          <>
            <p className="text-sm text-neutral-500">{info.business}</p>
            <h1 className="mt-1 text-2xl font-semibold">
              {t.title} #{info.number}
            </h1>
            <dl className="mt-6 grid gap-4 text-[15px]">
              <div>
                <dt className="text-sm text-neutral-500">{t.service}</dt>
                <dd>{info.service}</dd>
              </div>
              {info.staff && (
                <div>
                  <dt className="text-sm text-neutral-500">{t.with}</dt>
                  <dd>{info.staff}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-neutral-500">{t.when}</dt>
                <dd>
                  {date}, {info.from}–{info.to}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-neutral-500">{t.status}</dt>
                <dd className="font-medium">{t.st[info.status] || info.status}</dd>
              </div>
              {(info.address || info.phone) && (
                <p className="text-sm text-neutral-500">{[info.address, info.phone].filter(Boolean).join(" · ")}</p>
              )}
            </dl>
            <div role="status" className="mt-4 text-sm">
              {info.status === "cancelled" && t.cancelled}
              {error === "late" && t.late}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {info.status !== "cancelled" && (
                <a className="rounded-full bg-neutral-100 px-5 py-3 text-sm font-medium" href={`/api/booking/manage?${query}&format=ics`}>
                  {t.calendar}
                </a>
              )}
              {info.cancellable && (
                <button type="button" disabled={busy} onClick={() => void cancel()} className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-60">
                  {t.cancel}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
