# Telegram → Codex → Harbstone CMS

Local Node.js 22+ bridge using Telegram long polling and the installed Codex CLI/ChatGPT login. No public server or API key required. The Mac must remain awake and connected. This is a **separate persistent Codex session per Telegram user**, not a mirror of the desktop conversation. All users edit the same repository; tasks run sequentially. Avoid concurrent desktop edits.

## Live Next.js admin

The live builder is `https://harbstone-admin.vercel.app`. The bot can create/edit pages, update text and images, publish selected pages, and change shared menus, layout and brand settings. Content is stored in PostgreSQL; a content-only task needs no Git push or rebuild. Saving a page updates its draft; publication is an explicit per-page operation. The agent must not publish unrelated drafts. Revision conflicts require pulling current data and merging only the requested changes. History, trash and schema validation use the same server workflow as the admin UI.

The bridge uses a separate Ed25519 key, never the owner's password or session secret. Run `node tools/telegram-bridge/cms.mjs --init` once; it creates an owner-only private key outside Git and prints only its public key. Set that public key as production `CMS_BOT_PUBLIC_KEY` on the admin project and redeploy. Remove/rotate this public key and redeploy to revoke bot access. Never copy or print `cms-private.pem`.

Each bot task receives a temporary localhost capability. The bridge signs upstream requests itself and closes the local session when the task finishes. Signatures bind the method, URL and body, expire after 60 seconds, and have single-use nonces stored in PostgreSQL. The agent receives neither the private key nor the owner credentials. The CMS endpoint supports only this project's document, publishing and validated media upload.

During an authorized task, use `node tools/telegram-bridge/cms.mjs status`, `pull .telegram-media/project.json`, `save .telegram-media/project.json`, `publish <page-id>` and `upload <image-file>`. Re-pull after uploads, since they increment the project revision. Temporary project exports belong in ignored `.telegram-media` and must not be committed. Use `node tools/telegram-bridge/test-live-cms.mjs` for an owner-run deployment check: it creates, edits, publishes and removes only its own temporary page without sending Telegram messages.

## Owner test

1. `node tools/telegram-bridge/bridge.mjs --init`
2. Open `~/Library/Application Support/Harbstone/telegram/config.json` locally. Paste the BotFather token into `token`. Do not send it in chat or commit it.
3. `codex login status` must report an authenticated account.
4. `node tools/telegram-bridge/bridge.mjs`
5. Open the one-use owner pairing link printed in the terminal. Keep it private. Only possession of this code can claim the owner account.
6. First ask a read-only question about this repository. Then ask for a small reversible edit and inspect its diff locally.

Stop using Ctrl+C. After testing, add the client's numeric Telegram user ID to `allowedIds` in the local config and restart. An unauthorized user receives their ID when contacting the already paired bot. The client gets a fresh session without the owner's conversation history. Removing their ID and restarting revokes access. No public self-registration.

`/start` and `/status` show connection information. Send text, a photo with a caption, or JPEG/PNG/WebP as a document. An image alone prompts clarification before edits. Reply to an image with text or a voice message to explain the change. Albums are processed as separate messages; use individual images with instructions for now.

Voice messages and audio files up to 5 minutes are transcribed locally with whisper.cpp (`ggml-small`, multilingual). The recognized text is sent back before Codex processes it. There is no separate transcription API or key. Install `brew install whisper.cpp` and `ffmpeg`, and place the multilingual model at `~/Library/Application Support/Harbstone/telegram/models/ggml-small.bin`. Optional `speech` config keys: `model`, `whisper`, `ffmpeg`, `language` (default `auto`). Files are limited to 20 MiB, downloaded only for authorized users, and removed from ignored `.telegram-media` request folders after processing. Requested site assets must be copied to the project's images folder by Codex before cleanup. Do not treat speech recognition as perfectly accurate; verify the returned transcript.

CLI tools/logs are not forwarded. A failed/interrupted task is never automatically rerun; check repository changes before retrying. A delivery retry after restart may duplicate the answer, not the code changes.

Run media transport tests: `node --test tools/telegram-bridge/media.test.mjs`.

## Automatic publication

All authorized users can edit the project and request publication. The agent knows the production domain `https://harbcms.vercel.app`. After each successful task with file changes, the bridge runs the frontend build and collection checks (and admin lint/build if relevant), commits only the task's files, and pushes to `origin/main` at `https://github.com/Melkid45/cms.git`. There is no extra approval per push. Read-only questions create no commits. The agent itself does not perform Git publication; the bridge handles it outside the coding sandbox.

The bridge compares the working tree before/after each request. Existing drafts are preserved. Editing a file that already contained unsaved work, staged changes, changes during validation, diverged Git history, or failed checks stops publication with an explanation. No automatic merge or force push. Resolve existing drafts and retry once the owner has reviewed them. Avoid concurrent desktop edits.

Vite emits `harbstone-release.json`; the Next admin exposes `/api/release`. After pushing, the bridge waits up to four minutes for the exact commit on every affected deployment. Admin code targets the Next project; shared template/style/image edits target both projects. `/status` repeats those checks. A successful push is not reported as a deployment until the relevant markers match. Both Vercel projects must have Git integration connected to `main`, with roots `frontend` and `admin` respectively. Approved source-template changes are imported into the admin registry before publication checks; generated changes join the same commit. Existing owner drafts still stop automatic publication if touched.

Run all bridge checks: `node --test tools/telegram-bridge/*.test.mjs`.

Local config, offsets and session IDs are outside Git with owner-only permissions. Do not expose that folder to clients. Codex runs with `workspace-write` and approval policy `never`; operations needing additional permissions fail. Full editing/publication permission applies to this project, not to other projects, machine credentials, or bridge access management. Only admit trusted collaborators; this is not a multi-tenant hosting service. Network/tool availability depends on the local Codex configuration.

Sources: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [Telegram Bot API](https://core.telegram.org/bots/api).
