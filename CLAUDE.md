# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A tiny starter kit for building throwaway "engagement apps" (votes, polls, counters, etc.) that live on a public server and are joined by phones via an on-screen QR code. The canonical workflow is: SSH into the live server, prompt Claude to edit the two files, apply changes. The README shows the intended prompting pattern (a voting app example).

Everything the app does lives in exactly two files: `server.js` and `index.html`. Add new behavior by editing these, not by introducing a framework or a build step.

## Critical workflow rules

- **Do not run `node server.js`.** A `pm2` instance named `server` is already running on the host. Starting another process will fight for port 3000.
- **Apply changes with `yarn && pm2 restart server`** (or run `./restart.sh`). This is the only "build/deploy" step.
- **Edit `index.html` first, then `server.js`, then `index.html` again** when building a new app. The README prescribes this order, starting with swapping the `loading...` headline to a "Building ..." message so the user sees progress immediately.
- **`./reset.sh` is destructive**: it runs `git reset --hard HEAD && git clean -fd`. It wipes all uncommitted work. Never invoke it to "clean up" without the user asking.

## Architecture in one paragraph

`server.js` is an Express + `socket.io` server on port 3000 that serves the current directory as static files. It starts a `chokidar` watcher on `index.html`; any change emits a `reload` event to all connected clients so every phone/tab refreshes in sync. A per-connection counter (`userCount`) and `qrcode-terminal` console QR complete the picture. `index.html` ships with a client-side socket.io bootstrap plus a QR renderer (via `qrcode-generator` CDN) that points each device to the page URL.

Practical consequences of this design:

- **`index.html` must contain the socket.io client `<script>` block** (the `<script src="/socket.io/socket.io.js">` plus the `io()` wiring near the bottom of the file). The server no longer injects this; if you rewrite `index.html` from scratch, preserve the block or nothing will live-reload.
- Because every `index.html` save triggers a full client reload, client-side state is ephemeral. Persist anything important (votes, counters, etc.) on the server, not in the page.
- Each socket connection gets a `userId` (from `?userId=` query, `localStorage`, or a generated fallback). Reuse this if you need per-user identity; don't reinvent it.

## Commands

- `yarn` — install dependencies (`express`, `socket.io`, `chokidar`, `qrcode-terminal`).
- `pm2 restart server` — reload the running server after edits.
- `./restart.sh` — shorthand for `yarn && pm2 restart server`.
- `pm2 logs server` — tail server logs when debugging socket or startup issues.

There is no test suite, linter, or build step.
