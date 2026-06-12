// Minimal static server for the standalone teleprompter (deploy artifact).
// Serves teleprompter.html at / plus teleprompter.js, and a /health endpoint
// for the container healthcheck. Binds 0.0.0.0 so it's reachable from Traefik.
import { join } from "node:path";

const PORT = Number(process.env.PORT) || 8080;
const ROOT = import.meta.dir;

const FILES: Record<string, { path: string; type: string }> = {
  "/": { path: "teleprompter.html", type: "text/html; charset=utf-8" },
  "/teleprompter.html": { path: "teleprompter.html", type: "text/html; charset=utf-8" },
  "/teleprompter.js": { path: "teleprompter.js", type: "text/javascript; charset=utf-8" },
};

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/health") return new Response("ok");
    const entry = FILES[pathname];
    if (!entry) return new Response("Not found", { status: 404 });
    const file = Bun.file(join(ROOT, entry.path));
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file, { headers: { "content-type": entry.type } });
  },
});

console.log(`teleprompter serving on http://0.0.0.0:${PORT}`);
