# Teleprompter

A standalone, single-page teleprompter for scripted video recording. Type or paste
a script, scroll it at a controllable speed in large mirror-friendly text, and—when
OBS is connected—have each **take** recorded to its own file automatically.

No build step, no framework. It's a static `teleprompter.html` + `teleprompter.js`,
served by a tiny Bun static server and packaged as a container.

## Run it

Locally with Bun:

```bash
bun serve.ts          # serves on http://0.0.0.0:8080
```

Or open `teleprompter.html` directly in a browser—it works standalone; the server
just exists to host it and provide a `/health` endpoint for the container.

### Container

```bash
docker build -t teleprompter .
docker run -p 8080:8080 teleprompter
```

The image (`oven/bun:alpine`) contains only `teleprompter.html`, `teleprompter.js`,
and `serve.ts`, with a healthcheck on `/health`. Binds `0.0.0.0` so it sits cleanly
behind a reverse proxy (Traefik).

## OBS recording (optional)

The teleprompter speaks the OBS WebSocket v5 protocol. Point it at your OBS instance
(default `ws://localhost:4455`, with the password if you've set one) and it drives the
record lifecycle for you:

- Each **take** is its own recording. Pressing **R** stops the current take and starts
  a fresh one, so retakes never clobber each other.
- The active script's name is used as the OBS recording filename.
- Connection is optional—everything except recording works without OBS.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `` ` `` | Toggle edit / present |
| `Space` | Scroll play / pause |
| `↑` `↓` | Speed |
| `+` `−` | Font size |
| `⇧↑` `⇧↓` | Nudge |
| `Home` `End` | Jump to top / bottom |
| `M` | Mirror · `F` flip |
| `R` | Start / re-take (records via OBS) |
| `⌫` | Cut & hold · `Esc` wrap |
| `1`–`9` | Switch script (resets) |

## Scripts

Scripts live in browser `localStorage`—create multiple named scripts and switch
between them with the number keys. `calibration-script.txt` is a sample you can paste
in to tune scroll speed and font size for your setup.

See [`BACKLOG.md`](./BACKLOG.md) for deferred features (file-backed scripts, live
agent sync) planned for an eventual app refactor.
