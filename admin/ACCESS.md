# Account access

The existing hosting-configured owner is the **Super admin**. Existing owner sessions remain valid. The owner can create client accounts in **Team → Add client**, reset their passwords, disable access and enable it again. No password is emailed automatically.

Client accounts are stored separately from the website document (PostgreSQL document `accounts`, or private local `accounts.json`). Passwords use salted scrypt hashes. Sessions expire after 12 hours; password changes and access changes increment the account version, invalidating existing sessions. Accounts and password hashes are never included in public site data or project exports.

Clients can change their own password under Website settings → Your password by supplying their current password. The server verifies it inside the account lock, rotates the account version, and renews only the requesting session. Attempts are rate-limited. Owner credentials remain managed through hosting. Signed super-admin provisioning can list/create client accounts through the bot accounts resource; the temporary agent proxy does not expose this resource and signed client requests cannot use it.

| Capability | Super admin | Client |
| --- | --- | --- |
| Read and mark enquiries | Yes | Yes |
| Edit existing section text, links and images | Yes | Yes |
| Reorder existing sections | Yes | Yes |
| Save drafts and publish existing pages | Yes | Yes |
| Upload/select images and replace logos | Yes | Yes |
| Update enquiry settings | Yes | Yes |
| Update website name, contacts, logos and email delivery | Yes | Yes |
| Create/delete pages; change URLs, SEO or locale | Yes | No |
| Add/remove/hide sections; change variants | Yes | No |
| Add/remove/reorder repeated cards | Yes | Enabled by default; the owner can disable individual lists |
| Change colours, shared layout or menus | Yes | No |
| Manage accounts and hosting configuration | Yes | No |

## Companies and websites

The super admin sees every company and website. Each client account has an access scope: whole companies (including websites added to them later) and/or single websites, set in **Team → Website access**. New client accounts get the website that is open while creating them; an account created without a scope (bot, direct API) gets the only website of a single-website installation and no website once there are several; accounts created before multi-site support keep access to the first website only. Clients see and can switch only to their websites; every website-scoped API (project, media, inbox, SMTP, backups, hosting status, website list) checks the scope on the server and returns 403 for other websites. Scope changes apply on the next request without signing the client out. Only the super admin can add companies and websites. Signed Telegram requests are not tied to an account scope: the owner (`super-admin` actor) picks any website with `?site=`, other Telegram users (`client` actor) work on the first website only. The enquiry form limit (5 per 10 minutes per visitor) counts across all websites.

Client navigation contains Overview, Pages and Settings. Overview shows enquiries. Website settings offers the website name, public URL, email, phone, address, enquiry time zone, logos, form availability, recipient and confirmation message. Shared header/footer email and phone links use the contact settings when present. The website URL supplies page canonical URLs. The business address is included in enquiry emails.

Email delivery can use hosting configuration, custom SMTP or remain disabled while saving enquiries to Inbox. Custom SMTP uses TLS on port 465 or STARTTLS on port 587. Passwords are AES-256-GCM encrypted with a purpose-specific key derived from `CMS_AUTH_SECRET`, stored in a separate `smtp` document and never returned by the API or serialized into page data. Rotating that hosting secret requires re-entering SMTP passwords. Blank passwords preserve the saved secret; changing the host or username requires re-entry. Public IPv4 SMTP hosts are resolved and validated before connection, with the chosen address pinned for the connection and the original host retained for TLS verification. Private and reserved addresses are rejected. Connection checks are rate-limited and use SMTP verification without sending email.

Project permissions are checked inside the locked save transaction against the stored revision, rather than trusting browser state. Media uploads use the existing image validation pipeline. Account management and hosting APIs require the owner role. Restricted dashboard routes also check access on the server.

Signed Telegram CMS requests default to client permissions. The trusted bridge fixes the actor before signing: the configured Telegram owner has super-admin CMS access; other allowed senders have client CMS access. A child agent cannot request a different actor through its temporary proxy. This does not change the separate, previously authorised Telegram source-code editing workflow.

## Editing and recovery

Existing pages autosave private drafts after 1.5 seconds of inactivity. New pages and URL changes require an explicit save. Publishing remains a separate action. Failed saves keep local edits visible; stale revisions are rejected. Closing the editor, following a navigation link or signing out warns while changes are pending. Draft checkpoints within five minutes are coalesced to avoid flooding version history.

The owner can disable client editing or publishing per page, and text, images or reordering per section. Existing individual field locks remain enforced. These rules are enforced against stored permissions inside the save transaction; clients cannot grant themselves permissions. A section with reordering disabled remains anchored at its existing position.

Live preview defaults to section selection in page editors. Clicking a section, or pressing Enter/Space on its focused container, closes preview and opens, scrolls to and highlights that section’s editor. Closing its content editor removes the selection outline. Browse website switches back to normal preview interactions. Selection messages accept only the current iframe window, the same origin and an existing visible section ID. This mode is absent on published pages and pages the client cannot edit.

Owners can control client item management separately for each repeatable list using “Client can add, remove and reorder items” inside its editor. Management is enabled when no explicit collection policy is stored. Existing explicit policies, including an empty list, remain enforced. Disabling one group preserves the settings of other groups. Every field in that list must still be client editable, so deleting cards cannot bypass locked text/images. Clients with permission can add, duplicate, remove and reorder 1–30 items using approved templates; they cannot change existing item templates, invent fields, edit block variants or grant themselves permissions. Removing a permission takes effect on the next save, including for a client editor already open. Existing content editing remains available when list structure is locked.

Inbox supports read/unread messages, private notes and search. Concurrent changes are revision checked. Notes are not exposed on the public website. Workflow statuses are not enabled.

Settings → Backups is owner only. Up to five full copies include project content and independent image bytes, with SHA-256 integrity verification. Each copy supports up to 32 MB of media; unsupported external image URLs or incomplete media cause creation to fail rather than silently omit files. Copies, including the before-restore snapshot, expire after seven days. A daily Vercel Cron at 03:00 UTC deletes expired backup records, authenticated with the production-only CRON_SECRET. Opening the list or accessing a copy also prunes expired records. Current website images and other documents are not deleted. Download copies for storage outside the database. Restore verifies all data, stages replacement images and checks the current project revision before saving. It also preserves a content-only snapshot of the state before the last restore. Accounts, SMTP secrets and enquiries are unaffected. Copies stored in the same database are not a replacement for provider database backups. Downloaded archive import and scheduled backup creation are not implemented.

## Automated checks

Run `npm run build` followed by `npm run test:roles`. The test starts its own production server on port 3101 with temporary local storage, generated credentials, no database, no Blob and no SMTP. It checks both roles, API and route restrictions, repeatable content, uploads, publication, signed bot actors, stale revisions and session revocation. It does not touch the hosted website. `CMS_ROLE_TEST_PORT` overrides the test port. `CMS_KEEP_ROLE_TEST_SERVER=1` keeps the isolated demo running for browser verification and writes temporary login details to ignored `.data/role-check-login.json`.

## Request hardening

- Passwordless local access (development without `CMS_ADMIN_PASSWORD`) works only for requests to `127.0.0.1`/`localhost` that did not pass through a tunnel; any other host name has to sign in.
- Rate limits (sign-in, enquiry forms) use the address written by the hosting proxy (`x-real-ip` on Vercel, the last `x-forwarded-for` entry elsewhere), so a client-supplied `X-Forwarded-For` cannot reset them.
- Every JSON API reads its body through `readJson` with a hard size limit that does not depend on `Content-Length`.
- The session cookie is `HttpOnly`, `SameSite=Strict` and `Secure` whenever the request arrived over HTTPS.
- All responses carry `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy` and a `frame-ancestors`/`base-uri`/`object-src` Content-Security-Policy (`next.config.ts`); production adds HSTS. Admin screens and builder APIs send `X-Robots-Tag: noindex`.

## Designer role (2026-11-18)

Three roles: **Super admin** (everything), **Designer** (Orders assigned to them, Pages, Layout, Section library, Media library, Project/Brand/Website style settings of the websites in their scope — full design rights there; no Team, Billing, Backups, Inbox in the menu, no account management), **Client** (content only; non-content changes go through change requests). Designers are created in Team → role Designer; assigning an order to a designer adds its website to the designer's scope. The owner can do all designer work directly.

## Social posts (2026-11-19)

Every account with access to a website (super admin, designer, client) can create, edit, render, schedule and mark social posts of that website (`/dashboard/social`, `/api/builder/social*` use `authorizeSite`). Connecting Facebook/Instagram/TikTok accounts (Settings → Social accounts, `/api/builder/social/accounts`, OAuth routes) is super admin only; tokens are encrypted and never returned. See BUILDER.md → Social posts.

## CRM (2026-11-19)

Contacts, deals, tasks and CRM settings (Telegram notifications, stages, auto deals) of a website: the **super admin** and the **clients** of that website — full use, including delete, merge, import/export and connecting their own Telegram bot. **Designers** have no CRM access (menu hidden, routes blocked by `crmRoute` in `access.ts`, API 403 from `crmAccess`), like Shop orders: they build sites and do not see customer data. Every `/api/builder/crm*` call uses `authorizeSite`, so a client gets 403 for websites outside their scope. The notification bell now also serves clients (CRM notifications of their websites only). See BUILDER.md → CRM.

## SEO (2026-11-19)

As in the table above, clients cannot change SEO: page SEO fields (including social texts and canonical) and the website SEO settings (`project.seo`: business details, verification, redirects, indexing) return 403 for client saves (`clientProjectError`). Dashboard → SEO and `/api/builder/seo` are for the super admin and designers; switching the SEO pack is super admin only. See BUILDER.md → SEO.

## Bookings (2026-11-19)

Online bookings of a website (Dashboard → Bookings: calendar, list, services, staff, hours): the **super admin** and the **clients** of that website — full use (settings, create, move, statuses, notes); deleting bookings permanently is super admin only. **Designers** have no access (menu hidden, route covered by `crmRoute`, API 403 from `crmAccess`), like the CRM. Every `/api/builder/bookings` call uses `authorizeSite` (403 outside the client's scope). Visitors book through the public widget (contact-v60) and manage their own booking only through the signed link. See BUILDER.md → Booking.

## AI SEO assistant (2026-11-19)

Part of the SEO pack. Reading the suggestion queue: every account with access to the website (clients only when the website has the SEO pack). Running the assistant: super admin and designers. Approving, rejecting, undoing and AI-revising suggestions: super admin, designers, and clients of that website when it has the SEO pack — the server applies the approved change itself, so this is the one way a client changes SEO texts; structural suggestions (a new FAQ section) are design roles only, and page/section client locks are respected. Settings, budget and sending the report: super admin. See BUILDER.md → AI SEO assistant.

## Approvals (2026-11-19)

The approvals queue (`/dashboard/approvals`, `/api/builder/approvals`) is for the **super admin** and the **clients** of the website (Approve / Skip / Edit of prepared social posts, SEO suggestions, onboarding texts); designers get 403, like the CRM. Telegram button presses act with client rights. Test mode, the webhook and polling are super admin only. The Telegram webhook is public but needs both per-website secrets and serves only the saved chat ids. See BUILDER.md → Approvals.

## Onboarding autopilot (2026-11-19)

The customer opens their onboarding with a private link (token in `#t=`, only its hash is stored) or with their website order link; no CMS account is needed. In the dashboard (menu Onboarding) the super admin sees every onboarding and starts new ones (test records with simulated AI are super admin only); designers and client accounts see the onboardings of websites in their scope and can answer, comment and approve like the customer. Only the super admin can issue a new client link. Customers cannot publish a test website. See BUILDER.md → Onboarding autopilot.
