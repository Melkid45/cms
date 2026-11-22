# Harbstone CMS

Monorepo for a section-based website builder (CMS) for small-business sites. Repo: https://github.com/Melkid45/cms.git (branch `main`).

## Structure

| Folder | What | Stack |
| --- | --- | --- |
| `frontend/` | Static library of approved sections (hero, about, services, pricing, faq, contact, ...), headers/footers, demo landings. **Source of truth for templates.** | Vite 8, SCSS, Tailwind 4, Splide, HTML `@include`/`@layout` (custom plugin in `vite.config.js`) |
| `admin/` | Next.js builder/CMS: dashboard, page editor, media, inbox, accounts, backups, multiple companies/websites, public pages at `/site/[site]/[slug]` | Next 16 (App Router, Turbopack), React 19, shadcn/base-ui, dnd-kit, postgres.js, Vercel Blob, nodemailer, sharp, zod 4 |
| `tools/telegram-bridge/` | Local Telegram bot → Codex CLI that edits the repo and the live CMS (signed Ed25519 requests to `/api/builder/bot`) | Node 22+, no deps |

Detailed docs (read before changing related code):
- `admin/BUILDER.md` — builder, storage, hosting, forms/SMTP, Telegram endpoint, checks
- `admin/ACCESS.md` — roles (Super admin / Client), permissions, drafts, backups
- `admin/AGENTS.md` — **Next 16 differs from training data; read `admin/node_modules/next/dist/docs/` before writing Next code**
- `frontend/STRUCTURE.md`, `frontend/TAILWIND.md`, `frontend/src/styles/README.md` — HTML/SCSS conventions
- `tools/telegram-bridge/README.md` — bot setup and auto-publication

## Key rules

- Sections are authored in `frontend/src/components/{sections,layout}`. After changing a template run `npm run import:sections` in `admin/` — it compiles them into the typed registry (`admin/src/lib/builder/catalog.json`) and copies images. Don't hand-edit generated catalog; refresh screenshots in `admin/public/previews` if structure changed.
- Pages store variant IDs + content values, never raw HTML.
- Block responsiveness uses container queries (`.block` is an inline-size container), not only viewport media queries. Fixed sizes in `px`.
- Server is the authority: permissions and revisions are checked inside the locked save transaction; stale saves → HTTP 409.
- Save draft ≠ publish. Public routes only see published snapshots.
- Never commit secrets. `.data/` (local storage) and `.telegram-media/` are git-ignored.

## Local run

```bash
# admin (no env needed locally: data goes to admin/.data/, no login in dev without CMS_ADMIN_PASSWORD)
cd admin && npm install && npm run dev -- --hostname 127.0.0.1   # http://127.0.0.1:3000/dashboard/pages

# frontend section library
cd frontend && npm install && npm run dev                         # http://localhost:5173
```

Sample site "Northline Studio": `/site/northline-studio/home` (old `/site/home` redirects). Companies/websites: see `admin/BUILDER.md` → Companies and websites.

## Environment (production, see `admin/hosting.env.example`)

`DATABASE_URL` (Postgres), `BLOB_READ_WRITE_TOKEN`, `CMS_ADMIN_EMAIL`, `CMS_ADMIN_PASSWORD` (≥12), `CMS_AUTH_SECRET` (≥32), `NEXT_PUBLIC_SITE_URL`; optional `CMS_BOT_PUBLIC_KEY`, `SMTP_*`, `CRON_SECRET`, `CMS_DATA_DIRECTORY`. On Vercel without DB/Blob, writes fail explicitly (by design).

## Checks (in `admin/`)

`npm run test:blocks`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, then `npm run test:roles` (spins its own server on :3101, isolated). Against a running dev server: `npm run test:api`, `npm run test:workflows` (creates a demo enquiry — test env only). Bridge: `node --test tools/telegram-bridge/*.test.mjs`. `npm run check:deploy` checks env presence only.

## Deployment

Two separate Vercel projects, both auto-deploy from `main`:
- `frontend` → https://harbcms.vercel.app (static library/demos)
- `admin` → https://harbstone-admin.vercel.app (CMS; content publish is a DB operation, no rebuild)

Telegram bridge pushes to `origin/main` automatically after successful tasks — avoid uncommitted parallel edits in the same working copy it uses. Daily cron `/api/cron/backups` at 03:00 UTC.
