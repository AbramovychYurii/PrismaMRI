import { useBridgeLeadership } from '@/hooks/useBridgeLeadership';
import { ACTION_LABELS, LOCAL_PORTS, LOCAL_RESCAN_MS, SESSION_IDLE_MS } from '@/lib/mcp/constants';
import { MCP_HANDLERS } from '@/lib/mcp/handlers';
import { openLocalServers } from '@/lib/mcp/local-server';
import type { IncomingMessage, OutgoingResult } from '@/lib/mcp/protocol';
import { useAgentStore } from '@/store';
import { useViewer } from '@prisma-mri/viewer-react';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Server pings every 15 s; two missed intervals plus buffer means the socket is
 * dead in a way `close` never reported.
 */
const PING_WATCHDOG_MS = 40_000;

const RECONNECT_DELAY_MS = 1_000;

/** Close codes meaning another client took the port (1001) or holds it (1008). */
const COMPETING_CLIENT_CODES = [1001, 1008];
const COMPETING_BACKOFF_MS = 2_000;
const COMPETING_JITTER_MS = 3_000;

type Command = Extract<IncomingMessage, { type: 'cmd' }>;

/**
 * WebSocket bridge to the local MCP servers (the Claude Desktop extension on
 * 127.0.0.1). Dispatches incoming commands to {@link MCP_HANDLERS} and reports
 * each result back on the socket it came from. There can be several servers
 * (see `local-server.ts`), and the bridge keeps a socket to every one it finds.
 */
export function useMcpBridge() {
  /** One socket per server, by port. */
  const sockets = useRef(new Map<number, WebSocket>());
  /** Ports whose server said its agent went away while the socket stays open. */
  const agentless = useRef(new Set<number>());
  const watchdogs = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against a second scan while the async port probe is in flight. */
  const scanning = useRef(false);
  /** False once the bridge is torn down, so a scan still in flight closes what it found. */
  const active = useRef(false);
  const store = useAgentStore;
  const viewer = useViewer();

  const isLeader = useBridgeLeadership();

  const clearSessionIdle = useCallback(() => {
    if (sessionIdleTimer.current) clearTimeout(sessionIdleTimer.current);
    sessionIdleTimer.current = null;
  }, []);

  const scheduleSessionIdle = useCallback(() => {
    clearSessionIdle();
    sessionIdleTimer.current = setTimeout(() => {
      store.getState().setAgentSessionActive(false);
      sessionIdleTimer.current = null;
    }, SESSION_IDLE_MS);
  }, [clearSessionIdle, store]);

  const clearWatchdog = useCallback((port: number) => {
    const timer = watchdogs.current.get(port);
    if (timer) clearTimeout(timer);
    watchdogs.current.delete(port);
  }, []);

  const resetWatchdog = useCallback(
    (port: number, ws: WebSocket) => {
      clearWatchdog(port);
      watchdogs.current.set(
        port,
        setTimeout(() => {
          console.debug('[mcp-bridge] no ping in', PING_WATCHDOG_MS, 'ms — closing', port);
          ws.close(4000, 'ping watchdog timeout');
        }, PING_WATCHDOG_MS),
      );
    },
    [clearWatchdog],
  );

  /** Drops everything kept about the server on `port`. */
  const forget = useCallback(
    (port: number) => {
      sockets.current.delete(port);
      agentless.current.delete(port);
      clearWatchdog(port);
    },
    [clearWatchdog],
  );

  /** Mirrors the open sockets into the store. */
  const publish = useCallback(() => {
    const ports = [...sockets.current.keys()].sort((a, b) => a - b);
    store.getState().setLocalPorts(ports);
    store.getState().setMcpConnected(ports.some((p) => !agentless.current.has(p)));
  }, [store]);

  const handleCommand = useCallback(
    async (msg: Command, ws: WebSocket) => {
      const { id, action } = msg;

      clearSessionIdle();
      store.getState().setAgentSessionActive(true);
      store.getState().setAgentActivity(true, ACTION_LABELS[action] ?? action);

      const reply = (result: OutgoingResult) => {
        store.getState().setAgentActivity(false);
        scheduleSessionIdle();
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(result));
      };
      const ok = (data?: unknown) => reply({ type: 'result', id, ok: true, data });
      const fail = (error: string) => reply({ type: 'result', id, ok: false, error });

      const handler = MCP_HANDLERS[action];
      if (!handler) {
        fail(`Unknown action: ${action}`);
        return;
      }
      try {
        await handler({ msg, ok, fail, viewer });
      } catch (err) {
        fail((err as Error).message ?? 'Internal error');
      }
    },
    [store, viewer, clearSessionIdle, scheduleSessionIdle],
  );

  // Held in refs so connect() and attach() keep a stable identity and never
  // tear down a socket just because a handler dependency changed.
  const handleCommandRef = useRef(handleCommand);
  handleCommandRef.current = handleCommand;
  const connectRef = useRef<() => void>(() => {});

  /** Wires up a freshly opened socket for the server on `port`. */
  const attach = useCallback(
    (ws: WebSocket, port: number) => {
      sockets.current.set(port, ws);
      publish();

      ws.addEventListener('message', (event: MessageEvent<string>) => {
        let msg: IncomingMessage;
        try {
          msg = JSON.parse(event.data) as IncomingMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'ping':
            ws.send('{"type":"pong"}');
            resetWatchdog(port, ws);
            return;
          case 'mcp_connecting':
            agentless.current.delete(port);
            publish();
            return;
          case 'mcp_disconnected':
            agentless.current.add(port);
            publish();
            if (!store.getState().mcpConnected) {
              clearSessionIdle();
              store.getState().setAgentSessionActive(false);
            }
            return;
          case 'cmd':
            void handleCommandRef.current(msg, ws);
            return;
          default:
            return;
        }
      });

      ws.addEventListener('close', (evt) => {
        // A newer socket already replaced this one — leave it alone.
        if (sockets.current.get(port) !== ws) return;

        forget(port);
        publish();

        // Jitter the retry when another client is competing, so the two
        // de-synchronise and one gets to stabilise.
        const competing = COMPETING_CLIENT_CODES.includes(evt.code);
        const delay = competing
          ? COMPETING_BACKOFF_MS + Math.floor(Math.random() * COMPETING_JITTER_MS)
          : RECONNECT_DELAY_MS;
        console.debug('[mcp-bridge] closed', port, evt.code, '— reconnecting in', delay, 'ms');
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null;
          connectRef.current();
        }, delay);
      });

      ws.addEventListener('error', () => {
        console.debug('[mcp-bridge] socket error', ws.url);
      });
    },
    [store, publish, resetWatchdog, forget, clearSessionIdle],
  );

  /** Connects to every server on a port we have no socket for yet. */
  const connect = useCallback(() => {
    if (scanning.current) return;
    scanning.current = true;

    void (async () => {
      try {
        const free = LOCAL_PORTS.filter((port) => !sockets.current.has(port));
        for (const { port, ws } of await openLocalServers(free)) {
          if (!active.current || sockets.current.has(port)) {
            ws.close(1000, 'not needed');
            continue;
          }
          attach(ws, port);
        }
      } finally {
        scanning.current = false;
      }
    })();
  }, [attach]);
  connectRef.current = connect;

  useEffect(() => {
    if (!isLeader) return;
    active.current = true;
    connect();
    return () => {
      active.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      clearSessionIdle();
      for (const [port, ws] of sockets.current) {
        forget(port);
        ws.close(1000, 'unmount');
      }
      publish();
    };
  }, [isLeader, connect, clearSessionIdle, forget, publish]);

  /**
   * A server can start after the bridge connected to another one, and nothing
   * announces it — so, while connected to any, look again now and then. Not
   * while disconnected: nobody asked for an agent, and every probe of a free
   * port shows as a failed socket in the console.
   */
  useEffect(() => {
    if (!isLeader) return;
    const id = setInterval(() => {
      if (sockets.current.size > 0) connectRef.current();
    }, LOCAL_RESCAN_MS);
    return () => clearInterval(id);
  }, [isLeader]);

  /**
   * Looks again when the tab is shown. The sockets are deliberately left open
   * while hidden: the tab backgrounds every time the user switches to Claude
   * Desktop, and closing then would kill in-flight commands. Truly dead
   * connections are caught by the ping watchdog instead.
   */
  useEffect(() => {
    if (!isLeader) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      // Forget sockets that are closing or closed but whose `close` has not
      // fired yet; their ports are free to reconnect.
      for (const [port, ws] of sockets.current) {
        if (ws.readyState !== WebSocket.OPEN) forget(port);
      }
      publish();
      connectRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isLeader, forget, publish]);
}
