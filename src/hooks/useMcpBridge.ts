import {
  ACTION_LABELS,
  LAST_LOCAL_PORT_KEY,
  LOCAL_PORTS,
  LOCAL_PROBE_TIMEOUT_MS,
  SESSION_IDLE_MS,
} from '@/lib/mcp/constants';
import { MCP_HANDLERS } from '@/lib/mcp/handlers';
import { useVolumeStore } from '@/store/volumeStore';
import { useCallback, useEffect, useRef, useState } from 'react';

const BRIDGE_LOCK = 'prismamri-mcp-bridge';

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

function openSocket(port: number, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('timeout'));
    }, timeoutMs);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('error'));
    });
  });
}

/** Probes every port at once, so the wait is one timeout rather than N. */
function scanAllLocalPorts(): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    let settled = false;
    let pending = LOCAL_PORTS.length;

    for (const port of LOCAL_PORTS) {
      openSocket(port, LOCAL_PROBE_TIMEOUT_MS)
        .then((ws) => {
          if (settled) {
            ws.close();
            return;
          }
          settled = true;
          resolve(ws);
        })
        .catch(() => {
          pending--;
          if (!settled && pending === 0) resolve(null);
        });
    }
  });
}

/** Retries the last known port first, which keeps reloads free of failed-socket noise. */
async function findLocalServer(): Promise<WebSocket | null> {
  const cached = Number(localStorage.getItem(LAST_LOCAL_PORT_KEY));
  if ((LOCAL_PORTS as readonly number[]).includes(cached)) {
    try {
      return await openSocket(cached, LOCAL_PROBE_TIMEOUT_MS);
    } catch {
      /* stale port — fall through to the full scan */
    }
  }
  return scanAllLocalPorts();
}

type IncomingMessage =
  | { type: 'pong' }
  | { type: 'ping' }
  | { type: 'mcp_connecting' }
  | { type: 'mcp_disconnected' }
  | { type: 'cmd'; id: string; action: string; [key: string]: unknown };

type OutgoingResult =
  | { type: 'result'; id: string; ok: true; data?: unknown }
  | { type: 'result'; id: string; ok: false; error: string };

/**
 * Elects a single tab to own the bridge. The lock is held for the tab's whole
 * lifetime; when the leader closes, the next tab in the queue takes over.
 */
function useBridgeLeadership(): boolean {
  const [isLeader, setIsLeader] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    let releaseLock: (() => void) | null = null;
    const heldUntilUnmount = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    if (!('locks' in navigator)) {
      setIsLeader(true);
    } else {
      navigator.locks
        .request(BRIDGE_LOCK, { signal: abort.signal }, async () => {
          setIsLeader(true);
          await heldUntilUnmount;
          setIsLeader(false);
        })
        .catch(() => {
          /* AbortError — unmounted before the lock was granted */
        });
    }

    return () => {
      abort.abort();
      releaseLock?.();
    };
  }, []);

  return isLeader;
}

/**
 * WebSocket bridge to the local MCP server (the Claude Desktop extension on
 * 127.0.0.1). Dispatches incoming commands to {@link MCP_HANDLERS} and reports
 * each result back.
 */
export function useMcpBridge() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against a second connect() while the async port scan is in flight. */
  const connecting = useRef(false);
  const store = useVolumeStore;

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

  const clearPingWatchdog = useCallback(() => {
    if (pingWatchdog.current) clearTimeout(pingWatchdog.current);
    pingWatchdog.current = null;
  }, []);

  const resetPingWatchdog = useCallback(
    (ws: WebSocket) => {
      clearPingWatchdog();
      pingWatchdog.current = setTimeout(() => {
        console.debug('[mcp-bridge] no ping in', PING_WATCHDOG_MS, 'ms — closing');
        ws.close(4000, 'ping watchdog timeout');
      }, PING_WATCHDOG_MS);
    },
    [clearPingWatchdog],
  );

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const handleCommand = useCallback(
    async (msg: Extract<IncomingMessage, { type: 'cmd' }>) => {
      const { id, action } = msg;

      clearSessionIdle();
      store.getState().setAgentSessionActive(true);
      store.getState().setAgentActivity(true, ACTION_LABELS[action] ?? action);

      const reply = (result: OutgoingResult) => {
        store.getState().setAgentActivity(false);
        scheduleSessionIdle();
        send(result);
      };
      const ok = (data?: unknown) => reply({ type: 'result', id, ok: true, data });
      const fail = (error: string) => reply({ type: 'result', id, ok: false, error });

      const handler = MCP_HANDLERS[action];
      if (!handler) {
        fail(`Unknown action: ${action}`);
        return;
      }
      try {
        await handler({ msg, ok, fail });
      } catch (err) {
        fail((err as Error).message ?? 'Internal error');
      }
    },
    [send, store, clearSessionIdle, scheduleSessionIdle],
  );

  // Held in a ref so connect() keeps a stable identity and never tears down the
  // socket just because a handler dependency changed.
  const handleCommandRef = useRef(handleCommand);
  handleCommandRef.current = handleCommand;

  const connect = useCallback(() => {
    if (wsRef.current || connecting.current) return;

    void (async () => {
      connecting.current = true;
      const ws = await findLocalServer();
      if (!ws) {
        connecting.current = false;
        return;
      }

      const port = Number(new URL(ws.url).port);
      if (port) {
        store.getState().setLocalPort(port);
        localStorage.setItem(LAST_LOCAL_PORT_KEY, String(port));
      }

      // Register before clearing the guard so no concurrent call slips between.
      wsRef.current = ws;
      connecting.current = false;
      store.getState().setMcpConnected(true);

      ws.addEventListener('open', () => {
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
        resetPingWatchdog(ws);
      });

      ws.addEventListener('message', (event: MessageEvent<string>) => {
        let msg: IncomingMessage;
        try {
          msg = JSON.parse(event.data) as IncomingMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'ping':
            wsRef.current?.send('{"type":"pong"}');
            resetPingWatchdog(ws);
            return;
          case 'mcp_connecting':
            store.getState().setMcpConnected(true);
            return;
          case 'mcp_disconnected':
            store.getState().setMcpConnected(false);
            clearSessionIdle();
            store.getState().setAgentSessionActive(false);
            return;
          case 'cmd':
            void handleCommandRef.current(msg);
            return;
          default:
            return;
        }
      });

      ws.addEventListener('close', (evt) => {
        // A newer socket already replaced this one — leave it alone.
        if (wsRef.current !== ws) return;

        wsRef.current = null;
        clearPingWatchdog();
        store.getState().setMcpConnected(false);
        store.getState().setLocalPort(null);

        // Jitter the retry when another client is competing, so the two
        // de-synchronise and one gets to stabilise.
        const competing = COMPETING_CLIENT_CODES.includes(evt.code);
        const delay = competing
          ? COMPETING_BACKOFF_MS + Math.floor(Math.random() * COMPETING_JITTER_MS)
          : RECONNECT_DELAY_MS;
        console.debug('[mcp-bridge] closed', evt.code, '— reconnecting in', delay, 'ms');
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null;
          connect();
        }, delay);
      });

      ws.addEventListener('error', () => {
        console.debug('[mcp-bridge] socket error', ws.url);
      });
    })();
  }, [store, clearSessionIdle, resetPingWatchdog, clearPingWatchdog]);

  useEffect(() => {
    if (!isLeader) return;
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      clearSessionIdle();
      clearPingWatchdog();
      wsRef.current?.close(1000, 'unmount');
      wsRef.current = null;
    };
  }, [isLeader, connect, clearSessionIdle, clearPingWatchdog]);

  /**
   * Reconnects when the tab is shown again. The socket is deliberately left
   * open while hidden: the tab backgrounds every time the user switches to
   * Claude Desktop, and closing then would kill in-flight commands. Truly dead
   * connections are caught by the ping watchdog instead.
   */
  useEffect(() => {
    if (!isLeader) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      wsRef.current = null;
      connect();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isLeader, connect]);
}
