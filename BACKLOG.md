# Teleprompter — Backlog

Deferred features for when this gets refactored from the standalone
`teleprompter.html` + `teleprompter.js` page into a real app.

---

## Issue: File-backed scripts with live sync from agents

**Status:** deferred — wait for the real-app refactor (decided 2026-05-30).

### Motivation
Be able to "point at files" on disk so scripts are backed by real files, not just
browser localStorage. Then **poll the file for updates** or **press a Sync button**
to pull the latest changes from agents (Claude, etc.) that are editing the same
scripts alongside the user while they record.

Ties together cleanly with two things already built:
- **Multiple named scripts** (currently localStorage-backed; would become one file per script).
- **Script-name recording filenames** (file basename → kebab → OBS `FilenameFormatting`).

### Key constraint discovered (the reason this is non-trivial)
A `file://` page **cannot `fetch()` arbitrary local file paths** — browser security
blocks it. So "store a path and poll it" is impossible from the current standalone page.
Two viable architectures only:

**Option A — File System Access API (serverless).**
- Verified available in this Brave/`file://` context: `window.showOpenFilePicker` is a
  function and `window.isSecureContext === true`.
- User picks a *folder* once (`showDirectoryPicker`); page holds the handle, enumerates
  `*.md` / `*.txt` as scripts, and re-reads on a timer or on Sync.
- Pros: keeps the zero-infra "just open the HTML" model.
- Cons: one-click permission re-grant per page load (handle persists via IndexedDB but
  permission must be re-requested with a user gesture); polling only (no instant push);
  Chromium-only.

**Option B — Bun server (live watch).**
- The old Astro project's `server.ts` already did this: serves the app, exposes a
  `scripts/` dir, `fs.watch` → SSE push on change. Revive/adapt it.
- Pros: instant push (no polling), no permission prompts, clean agent story (agents just
  edit files).
- Cons: launch a server instead of double-clicking; serve at `http://<hostname>:PORT`
  (per the dev-URLs convention, not `localhost`).

### Open design decisions (resolve at build time)
1. **Access method:** File System Access folder picker (serverless) vs Bun server (live watch).
2. **Sync cadence:** auto-poll on an interval + manual Sync button, vs manual Sync only.
   (Mid-recording, auto-changing text underfoot is risky — probably want auto toggle-able,
   and never swap the *active* script's text while a take is rolling.)
3. **Direction:** one-way (disk → app; agents own the files, in-app editor is read-only
   for file-backed scripts) vs two-way (in-app edits write back; risk of clobbering an
   agent's concurrent edits — needs a conflict story).

### Model (regardless of option)
- One file per script in a folder; **filename = script name = recording filename basename**.
- Switching scripts already stops recording + rewinds + resets (done).
- A "synced ✓ / out-of-date" indicator in the HUD so you know if the on-screen text
  matches disk.

### Recommendation
If it stays a lightweight single page → Option A. If the refactor introduces a backend
anyway → Option B (strictly better UX: live push, no prompts, natural agent collaboration).
