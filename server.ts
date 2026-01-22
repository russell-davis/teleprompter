import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { watch } from "fs";

const PORT = 3030;
const SCRIPTS_DIR = join(import.meta.dir, "scripts");

// Ensure scripts directory exists
await mkdir(SCRIPTS_DIR, { recursive: true });

// Store connected clients for SSE
const clients = new Map<string, Set<ReadableStreamDefaultController>>();

function broadcast(scriptName: string, data: object) {
  const scriptClients = clients.get(scriptName);
  if (scriptClients) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    for (const controller of scriptClients) {
      try {
        controller.enqueue(new TextEncoder().encode(message));
      } catch {
        scriptClients.delete(controller);
      }
    }
  }
}

// Watch scripts directory for changes
watch(SCRIPTS_DIR, (eventType, filename) => {
  if (filename?.endsWith(".json")) {
    const scriptName = filename.replace(".json", "");
    broadcast(scriptName, { type: "reload" });
  }
});

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // API Routes
    if (path === "/api/scripts") {
      const files = await readdir(SCRIPTS_DIR).catch(() => []);
      const scripts = files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""));
      return Response.json(scripts, { headers: corsHeaders });
    }

    if (path.startsWith("/api/scripts/") && !path.includes("/control") && !path.includes("/events")) {
      const scriptName = path.replace("/api/scripts/", "");
      const filePath = join(SCRIPTS_DIR, `${scriptName}.json`);

      if (req.method === "GET") {
        try {
          const content = await readFile(filePath, "utf-8");
          return Response.json(JSON.parse(content), { headers: corsHeaders });
        } catch {
          return Response.json({ error: "Script not found" }, { status: 404, headers: corsHeaders });
        }
      }

      if (req.method === "PUT") {
        const body = await req.json();
        await writeFile(filePath, JSON.stringify(body, null, 2));
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (req.method === "DELETE") {
        const { unlink } = await import("fs/promises");
        await unlink(filePath).catch(() => {});
        return Response.json({ success: true }, { headers: corsHeaders });
      }
    }

    // SSE endpoint for real-time updates
    if (path.match(/^\/api\/scripts\/[^/]+\/events$/)) {
      const scriptName = path.split("/")[3];

      const stream = new ReadableStream({
        start(controller) {
          if (!clients.has(scriptName)) {
            clients.set(scriptName, new Set());
          }
          clients.get(scriptName)!.add(controller);
        },
        cancel(controller) {
          clients.get(scriptName)?.delete(controller);
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Control endpoint (for remote control)
    if (path.match(/^\/api\/scripts\/[^/]+\/control$/) && req.method === "POST") {
      const scriptName = path.split("/")[3];
      const body = await req.json();
      broadcast(scriptName, body);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Static files
    let filePath = join(import.meta.dir, "public", path === "/" ? "index.html" : path);

    try {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
    } catch {}

    // SPA fallback
    return new Response(Bun.file(join(import.meta.dir, "public", "index.html")));
  },
});

console.log(`Teleprompter running at http://localhost:${PORT}`);
console.log(`Scripts directory: ${SCRIPTS_DIR}`);
