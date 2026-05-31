/**
 * PrismaMRI MCP Relay — Cloudflare Worker + Durable Object
 *
 * Routes WebSocket messages between the browser app (role=app) and a local MCP
 * server (role=mcp) keyed by session UUID.
 *
 * Endpoints:
 *   POST /session/new          → { sessionId: string }
 *   GET  /ws?session=UUID&role=app|mcp  → WebSocket upgrade
 */

export interface Env {
  RELAY_SESSION: DurableObjectNamespace;
}

// ── Durable Object ──────────────────────────────────────────────────────────

export class RelaySession {
  private app: WebSocket | null = null;
  private mcp: WebSocket | null = null;

  constructor(_state: DurableObjectState, _env: Env) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const role = url.searchParams.get('role') as 'app' | 'mcp' | null;
    if (role !== 'app' && role !== 'mcp') {
      return new Response('role must be app or mcp', { status: 400 });
    }

    // Create a WebSocket pair — client side goes to the caller.
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();

    // Close any previous connection for this role (one client at a time).
    const prev = role === 'app' ? this.app : this.mcp;
    if (prev) {
      try { prev.close(1000, 'reconnected'); } catch { /* ignore */ }
    }

    if (role === 'app') {
      this.app = server;
      if (this.mcp) {
        // Let MCP know the app is online (state sync can start).
        this.mcp.send(JSON.stringify({ type: 'app_connected' }));
        // Also tell the app that an MCP agent is already connected —
        // needed when the browser reloads while the MCP stays connected.
        server.send(JSON.stringify({ type: 'mcp_connecting' }));
      }
    } else {
      this.mcp = server;
      if (this.app) {
        // Tell app an agent just connected (shows the confirmation popup).
        this.app.send(JSON.stringify({ type: 'mcp_connecting' }));
        // Tell MCP that app is already online so it can accept commands immediately.
        server.send(JSON.stringify({ type: 'app_connected' }));
      }
    }

    server.addEventListener('message', (event) => {
      const msg = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
      // Respond to heartbeat pings with a pong so the client can detect
      // dead connections (no pong = WS is silently broken → reconnect).
      if (msg === '{"type":"ping"}') {
        try { server.send('{"type":"pong"}'); } catch { /* ignore */ }
        return;
      }
      // Silently absorb pong messages (shouldn't arrive, but be safe).
      if (msg === '{"type":"pong"}') return;
      const other = role === 'app' ? this.mcp : this.app;
      if (other) {
        try { other.send(msg); } catch { /* ignore if other side closed */ }
      }
    });

    server.addEventListener('close', () => {
      if (role === 'app') {
        this.app = null;
        if (this.mcp) {
          try { this.mcp.send(JSON.stringify({ type: 'app_disconnected' })); } catch { /* ignore */ }
        }
      } else {
        this.mcp = null;
        if (this.app) {
          try { this.app.send(JSON.stringify({ type: 'mcp_disconnected' })); } catch { /* ignore */ }
        }
      }
    });

    server.addEventListener('error', () => {
      // The close event fires after this; cleanup is handled there.
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

// ── Worker fetch handler ────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    // ── POST /session/new ───────────────────────────────────────────────────
    if (url.pathname === '/session/new' && request.method === 'POST') {
      const sessionId = crypto.randomUUID();
      return new Response(JSON.stringify({ sessionId }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── GET /ws?session=UUID&role=app|mcp ───────────────────────────────────
    if (url.pathname === '/ws') {
      const sessionId = url.searchParams.get('session');
      if (!sessionId) {
        return new Response('Missing ?session= param', { status: 400, headers: CORS });
      }
      // Route to the Durable Object identified by the session UUID.
      const id = env.RELAY_SESSION.idFromName(sessionId);
      const obj = env.RELAY_SESSION.get(id);
      return obj.fetch(request);
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};
