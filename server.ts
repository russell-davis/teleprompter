import { join } from "path";
import type { ServerWebSocket } from "bun";
import pkg from "./package.json";

const PORT = process.env.PORT || 3030;

// Store connected clients for SSE (used for remote control)
const clients = new Map<string, Set<ReadableStreamDefaultController>>();

// Store WebSocket clients for live preview
const wsClients = new Map<string, Set<ServerWebSocket<{ scriptName: string }>>>();

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

function broadcastWS(scriptName: string, data: object) {
  const scriptClients = wsClients.get(scriptName);
  if (scriptClients) {
    const message = JSON.stringify(data);
    for (const ws of scriptClients) {
      try {
        ws.send(message);
      } catch {
        scriptClients.delete(ws);
      }
    }
  }
}

const server = Bun.serve<{ scriptName: string }>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // WebSocket upgrade for live preview
    const wsMatch = path.match(/^\/api\/scripts\/([^/]+)\/ws$/);
    if (wsMatch) {
      const scriptName = wsMatch[1];
      const upgraded = server.upgrade(req, { data: { scriptName } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // SSE endpoint for real-time updates (remote control)
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

    // Control endpoint (for remote control by agents)
    if (path.match(/^\/api\/scripts\/[^/]+\/control$/) && req.method === "POST") {
      const scriptName = path.split("/")[3];
      const body = await req.json();
      broadcast(scriptName, body);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Version endpoint
    if (path === "/api/version") {
      return Response.json({ version: pkg.version }, { headers: corsHeaders });
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
  websocket: {
    open(ws) {
      const { scriptName } = ws.data;
      if (!wsClients.has(scriptName)) {
        wsClients.set(scriptName, new Set());
      }
      wsClients.get(scriptName)!.add(ws);
    },
    message(ws, message) {
      // Broadcast script updates to all other clients viewing same script
      const { scriptName } = ws.data;
      const data = JSON.parse(message.toString());
      broadcastWS(scriptName, data);
    },
    close(ws) {
      const { scriptName } = ws.data;
      wsClients.get(scriptName)?.delete(ws);
    },
  },
});

console.log(`Teleprompter running at http://localhost:${PORT}`);
