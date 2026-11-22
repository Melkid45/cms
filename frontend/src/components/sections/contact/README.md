# Contact / CTA
Eight variants: balanced surface CTA, photo + introduction, dark centered CTA, contact details + form, editorial email CTA, dark split CTA with two buttons, broad form-led composition, photo with inset CTA.
Form controls never use focus outlines; focus changes only the bottom border, preserving red invalid borders.
Shared typography/container/buttons. Shared form styles in template/_form.scss; underline-only controls and red invalid borders.
Form validates required trimmed values and email syntax, focuses first invalid field, supports keyboard and status announcements.
Demo only: submission makes no request, does not store personal data, and explicitly reports that nothing was sent. Connect a server endpoint, server-side validation, spam protection and real privacy information before launch.
All contact data is demonstration content.


- contact-v40 Request Panel (anselat agent): photo + light panel with heading, text and a request form (name, address, email, phone, WhatsApp checkbox) with pill inputs. Posts to the inbox; the server checks the phone characters and the checkbox value.

contact-v20 (delivery): map image with a three-zone legend; "how we deliver" list + pickup card (OpenStreetMap embedded from an ordinary openstreetmap.org link with ?mlat/&mlon/#map=zoom/lat/lon, address, hours, link chips); delivery calculator — order total slider (min/max from the two limit labels), city input (visual), three zones (name, note with the "free from N" figure, price, hidden term), dark result panel, hint, note. Zone price turns into the "free" label once the total reaches the note's figure.
contact-v21 (hub): contact card (status pill, four channel tiles with icons, three opening-hours cells, address and e-mail lines) + map panel (image and/or OpenStreetMap link) with an overlay (title, text, zone legend, up to three actions; "Copy address" copies the title).
contact-v20 update (pass 2): the pickup chips include a "Copy address" button (copies the bold address line of the pickup card).
Map option (contact-v20/v21): a map link `https://www.openstreetmap.org/?mlat=..&mlon=..&style=positron&pin=<image url>#map=16/lat/lon` becomes a light MapLibre (OpenFreeMap Positron) map with a round pin; add `zones=/geo/lv-zones.json` for a delivery-zone map over the section's map image (contact-v21 hub: static, click follows the first overlay button; contact-v20 map card: clickable zones select the calculator rows). Lazy-loaded, no API key.

contact-v25 (account): pop-up opened by a link to `#account` — sign in, create account, find an order without an account (number + e-mail or phone). Messages and header-menu texts are fields in its hidden label list; the "My account page" link points to the page with contact-v26. Needs the runtime (`admin/src/components/builder/account-widgets.ts`) and `/api/shop/account`.
contact-v26 (cabinet): the buyer's account page — signed out: a sign-in prompt; signed in: orders list, one order (items, total, warranty, delivery, history steps, documents when delivered), warranty card and acceptance certificate (printable), profile and password. All texts are fields (hidden label list), statuses map to the shop order statuses (new, confirmed, shipped, done, cancelled).
contact-v27 (search): pop-up opened by `#search` — live results while typing: product cards (photo, title, specs, price) from the website's shop grids and published pages (title + SEO description), from `/api/shop/search`.
contact-v28 (chat): chat panel opened by `#chat` in the bottom-right corner — greeting, three quick questions, message box and messenger links; sending opens the first link (`data-chat-target`, e.g. https://wa.me/<number>) with the text filled in. A live chat needs a messaging backend.

Library agent (v50…v59, 2026-11-19):
- contact-v50 Booking: booking request form (date, time with min/max, number of people 1–30, name, phone, optional e-mail, comment) into the website inbox like every form; the server checks phone, number range and the browser date/time formats. Next to it: opening hours (5 rows, empty rows hide), address + note + phone, and an OpenStreetMap map built from the "Open the map" link (`openstreetmap.org/?mlat=..&mlon=..#map=zoom/lat/lon`, same widget as contact-v20/21; no API key). Field labels (e.g. "People" → "Guests" / "Patients") are editable.
contact-v23 (inline-cta): framed horizontal call to action — heading and one line on the left, a button on the right.
contact-v24 (button-row): one or two buttons in a row (e.g. under a page title).

Booking agent (v60…v69, 2026-11-19):
- contact-v60 Appointments: real online booking in the booking card of contact-v50 — service cards (minutes, price) → specialist chips (only when the website has staff) → month calendar with only open days → free times → name, phone, e-mail, comment → Book; success screen with "Add to calendar" (.ics) and the signed "Change or cancel" link. Days and times come from the website's booking settings (Dashboard → Bookings), computed on the server; no double booking. All texts are fields in the hidden label list (translate per page). Side: opening hours (5 rows, empty rows hide), address + note + phone, OpenStreetMap from the map link. Runtime: `admin/src/components/builder/booking-widgets.ts`, API `/api/booking`. Without booking settings (library, editor) it shows sample services and books nothing.
- contact-v29 Info pop-ups (Zcena agent, 2026-11-19): one pop-up (`data-modal="info"`) with up to four panels — heading, subtitle, formatted text (`data-rich-text`: lists, **bold**), two buttons; empty parts are hidden. Links `#info-1`…`#info-4` open it on that panel (`shop-widgets.ts`), `#info` on the first. Used by pricing-v22 fact rows (delivery, ready, pickup, warranty).
contact-v20 update: the city field suggests places from a hidden list ("name | zone number | km", one per line); choosing one selects its zone and shows "place · zone" in the result.
