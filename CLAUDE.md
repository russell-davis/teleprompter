# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run start         # Start server on port 3030
bun run dev           # Start with auto-reload (--watch)
bun run test          # Run Playwright tests (auto-starts server)
bun run test:ui       # Run tests with Playwright UI
bunx playwright test tests/navigation.spec.ts  # Run single test file
```

## Architecture

Single-page application teleprompter for video recording scripts.

**Server** (`server.ts`): Bun HTTP server that:
- Serves static files from `public/`
- Provides SSE endpoint (`/api/scripts/:name/events`) for remote control
- Provides WebSocket endpoint (`/api/scripts/:name/ws`) for live editor sync
- POST to `/api/scripts/:name/control` broadcasts commands to all connected browsers

**Frontend** (`public/index.html`): All client-side code is in a single HTML file with embedded CSS and JavaScript:
- Scripts stored in localStorage (seeded with 'example' on first use)
- Three views: script list (home), editor view, teleprompter/present view
- Editor uses markdown-like syntax that parses to blocks
- Teleprompter has three modes: present (default), edit (E key), focus (F key)

**Data model**: Scripts are `{ title: string, blocks: Array<{ type, content }> }` where type is one of: `say`, `click`, `type`, `prepare`, `next`, `heading`, `note`.

## Testing

Tests use Playwright with `data-testid` attributes. Server auto-starts when running tests. Tests set `localStorage.setItem('teleprompter-help-seen', 'true')` in beforeEach to prevent help modal from auto-opening.
