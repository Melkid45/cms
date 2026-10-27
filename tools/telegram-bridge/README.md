# Telegram → Codex → Harbstone CMS

Local Node.js 22+ bridge using Telegram long polling and the installed Codex CLI/ChatGPT login. No public server or API key required. The Mac must remain awake and connected. This is a **separate persistent Codex session per Telegram user**, not a mirror of the desktop conversation. All users edit the same repository; tasks run sequentially. Avoid concurrent desktop edits.

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

Vite emits `harbstone-release.json` containing the build's commit. After pushing, the bridge waits up to three minutes for this exact commit on the public production domain, then returns the actual status and direct page links. `/status` checks the last published commit again. A successful push is not reported as a successful deployment until the marker matches. Vercel Git integration must deploy `main` with `frontend` as its root. Admin changes can be committed/pushed but the frontend domain does not prove an admin deployment; configure a separate admin deployment when needed.

Run all bridge checks: `node --test tools/telegram-bridge/*.test.mjs`.

Local config, offsets and session IDs are outside Git with owner-only permissions. Do not expose that folder to clients. Codex runs with `workspace-write` and approval policy `never`; operations needing additional permissions fail. Full editing/publication permission applies to this project, not to other projects, machine credentials, or bridge access management. Only admit trusted collaborators; this is not a multi-tenant hosting service. Network/tool availability depends on the local Codex configuration.

Sources: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [Telegram Bot API](https://core.telegram.org/bots/api).
