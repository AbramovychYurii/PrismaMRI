/**
 * useMcpBridge — WebSocket bridge between the app and the local MCP server.
 *
 * Connects directly to the Claude Desktop extension on 127.0.0.1.
 * Handles all commands sent by the MCP server and sends results back.
 */

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

// ── Local-mode detection & discovery ─────────────────────────────────────────

/** Try to open ws://127.0.0.1:port within timeoutMs. Resolves with the open socket. */
function tryLocalPort(port: number, timeoutMs = 500): Promise<WebSocket> {
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

/**
 * Probe all LOCAL_PORTS simultaneously and return the first responsive MCP
 * server.  Parallel scanning ensures the total wait is at most `timeoutMs`
 * (300 ms) regardless of how many ports are tried — vs the sequential approach
 * which could take LOCAL_PORTS.length × timeoutMs (1.5 s).
 */
function scanAllLocalPorts(): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    let settled = false;
    let pending = LOCAL_PORTS.length;

    for (const port of LOCAL_PORTS) {
      tryLocalPort(port, LOCAL_PROBE_TIMEOUT_MS)
        .then((ws) => {
          if (!settled) {
            settled = true;
            resolve(ws);
          } else {
            ws.close(); // extra successful probe — discard
          }
        })
        .catch(() => {
          pending--;
          if (!settled && pending === 0) resolve(null);
        });
    }
  });
}

/**
 * Try the last known port first (from localStorage) to avoid noisy failed
 * WebSocket attempts in the console on every reload.  Falls back to a full
 * parallel scan of all LOCAL_PORTS when the cached port is stale or absent.
 */
async function findLocalServer(): Promise<WebSocket | null> {
  const cached = localStorage.getItem(LAST_LOCAL_PORT_KEY);
  if (cached) {
    const port = Number(cached);
    if ((LOCAL_PORTS as readonly number[]).includes(port)) {
      try {
        return await tryLocalPort(port, LOCAL_PROBE_TIMEOUT_MS);
      } catch {
        // cached port no longer listening — fall through to full scan
      }
    }
  }
  return scanAllLocalPorts();
}

// ── Protocol types ────────────────────────────────────────────────────────────

type IncomingMessage =
  | { type: 'pong' }
  | { type: 'ping' } // local mode: server pings us, we pong back
  | { type: 'mcp_connecting' }
  | { type: 'mcp_disconnected' }
  | { type: 'cmd'; id: string; action: string; [key: string]: unknown };

type OutgoingResult =
  | { type: 'result'; id: string; ok: true; data?: unknown }
  | { type: 'result'; id: string; ok: false; error: string };

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMcpBridge() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Prevents concurrent connect() calls while async port-scan is in flight. */
  const connectingRef = useRef(false);
  const store = useVolumeStore;

  // ── Leader election via Web Locks ────────────────────────────────────────────
  // Only one tab manages the WebSocket bridge at a time.  The first tab to
  // acquire the 'prismamri-mcp-bridge' lock becomes the leader; others wait.
  // When the leader tab closes, the next-in-queue tab takes over automatically.
  const [isLeader, setIsLeader] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    // Resolving this promise releases the lock and relinquishes leadership.
    let releaseLock: (() => void) | null = null;
    const held = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    if (!('locks' in navigator)) {
      // Fallback for environments without Web Locks (rare) — behave as before.
      setIsLeader(true);
    } else {
      navigator.locks
        .request('prismamri-mcp-bridge', { signal: abort.signal }, async () => {
          setIsLeader(true);
          await held;
          setIsLeader(false);
        })
        .catch(() => {
          // AbortError — component unmounted before the lock was ever acquired.
        });
    }

    return () => {
      abort.abort(); // cancel a pending (not-yet-acquired) lock request
      releaseLock?.(); // release an acquired lock so the next tab can take over
    };
    // Intentionally empty deps — lock is held for the full lifetime of this tab.
  }, []);

  const clearSessionIdle = useCallback(() => {
    if (sessionIdleTimer.current) {
      clearTimeout(sessionIdleTimer.current);
      sessionIdleTimer.current = null;
    }
  }, []);

  const scheduleSessionIdle = useCallback(() => {
    clearSessionIdle();
    sessionIdleTimer.current = setTimeout(() => {
      store.getState().setAgentSessionActive(false);
      sessionIdleTimer.current = null;
    }, SESSION_IDLE_MS);
  }, [clearSessionIdle, store]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // ── Command dispatcher ───────────────────────────────────────────────────

  const handleCommand = useCallback(
    async (msg: Extract<IncomingMessage, { type: 'cmd' }>) => {
      const { id, action } = msg;

      // Mark session active and reset the idle countdown.
      clearSessionIdle();
      store.getState().setAgentSessionActive(true);
      store.getState().setAgentActivity(true, ACTION_LABELS[action] ?? action);

      const finish = () => {
        store.getState().setAgentActivity(false);
        scheduleSessionIdle();
      };

      const ok = (data?: unknown) => {
        finish();
        send({ type: 'result', id, ok: true, data } satisfies OutgoingResult);
      };
      const fail = (error: string) => {
        finish();
        send({ type: 'result', id, ok: false, error } satisfies OutgoingResult);
      };

      try {
        const handler = MCP_HANDLERS[action];
        if (handler) {
          await handler({ msg, ok, fail });
          return;
        }
        fail(`Unknown action: ${action}`);
        return;
      } catch (err) {
        fail((err as Error).message ?? 'Internal error');
      }
    },
    [send, store, clearSessionIdle, scheduleSessionIdle],
  );

  // ── WebSocket lifecycle ──────────────────────────────────────────────────

  // Ref so that connect() doesn't need handleCommand in its deps
  // and therefore never triggers an effect re-run (and disconnect) when it changes.
  const handleCommandRef = useRef(handleCommand);
  handleCommandRef.current = handleCommand;

  // Watchdog: if no ping is received from the server within this window,
  // the connection is silently dead — close it so a reconnect can happen.
  // Server pings every 15 s; allow 2 intervals + generous buffer = 40 s.
  const PING_WATCHDOG_MS = 40_000;
  const pingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetPingWatchdog = useCallback((ws: WebSocket) => {
    if (pingWatchdogRef.current) clearTimeout(pingWatchdogRef.current);
    pingWatchdogRef.current = setTimeout(() => {
      console.debug('[mcp-bridge] ping watchdog — no ping in', PING_WATCHDOG_MS, 'ms, closing');
      ws.close(4000, 'ping watchdog timeout');
    }, PING_WATCHDOG_MS);
  }, []);

  const clearPingWatchdog = useCallback(() => {
    if (pingWatchdogRef.current) {
      clearTimeout(pingWatchdogRef.current);
      pingWatchdogRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // Bail out if already connected or a connection attempt is in flight.
    if (wsRef.current || connectingRef.current) return;

    // ── Decide mode and acquire a WebSocket ────────────────────────────────
    // Run asynchronously so port-scanning doesn't block the call site.
    void (async () => {
      connectingRef.current = true;
      let ws: WebSocket | null = null;
      let isLocal = false;

      // Scan local ports — parallel probe (300 ms max) keeps overhead negligible.
      console.debug('[mcp-bridge] scanning local ports…');
      ws = await findLocalServer();
      console.debug('[mcp-bridge] findLocalServer →', ws ? `found ${ws.url}` : 'not found');
      if (ws) {
        isLocal = true;
        const port = Number(new URL(ws.url).port);
        if (port) {
          store.getState().setLocalPort(port);
          localStorage.setItem(LAST_LOCAL_PORT_KEY, String(port));
        }
      }

      if (!ws) {
        connectingRef.current = false;
        return; // nothing to connect to — wait for next trigger
      }

      // Register the socket BEFORE releasing the connecting guard so no
      // concurrent connect() call can slip into the gap between the two.
      wsRef.current = ws;
      connectingRef.current = false;

      // Local server is already running — mark connected immediately.
      if (isLocal) store.getState().setMcpConnected(true);

      // ── Open handler ────────────────────────────────────────────────────
      ws.addEventListener('open', () => {
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
        // Start watchdog immediately — first ping should arrive within 8 s.
        if (isLocal) resetPingWatchdog(ws);
      });

      // ── Message handler ─────────────────────────────────────────────────
      ws.addEventListener('message', (event: MessageEvent<string>) => {
        let msg: IncomingMessage;
        try {
          msg = JSON.parse(event.data) as IncomingMessage;
        } catch {
          return;
        }

        if (msg.type === 'ping') {
          // Local mode: server keepalive — send pong back and reset watchdog.
          wsRef.current?.send('{"type":"pong"}');
          if (isLocal) resetPingWatchdog(ws);
          return;
        }
        if (msg.type === 'pong') {
          return;
        }
        if (msg.type === 'mcp_connecting') {
          store.getState().setMcpConnected(true);
          return;
        }
        if (msg.type === 'mcp_disconnected') {
          store.getState().setMcpConnected(false);
          clearSessionIdle();
          store.getState().setAgentSessionActive(false);
          return;
        }
        if (msg.type === 'cmd') void handleCommandRef.current(msg);
      });

      // ── Close handler ───────────────────────────────────────────────────
      ws.addEventListener('close', (evt) => {
        console.debug('[mcp-bridge] ws closed', evt.code, evt.reason || '(none)', {
          wasClean: evt.wasClean,
        });

        // If wsRef was already replaced, do NOT clobber the new connection.
        if (wsRef.current !== ws) {
          console.debug('[mcp-bridge] close: skipping cleanup — wsRef already replaced');
          return;
        }

        wsRef.current = null;
        clearPingWatchdog();
        store.getState().setMcpConnected(false);
        store.getState().setLocalPort(null);
        // code 1001 = superseded by another client connecting to the same port
        // code 1008 = server rejected us (another healthy connection is active)
        // Both indicate a competing client — back off with jitter so the two
        // clients de-synchronise and one gets to stabilise.
        const competing = evt.code === 1001 || evt.code === 1008;
        const delay = competing
          ? 2_000 + Math.floor(Math.random() * 3_000) // 2–5 s random
          : 1_000;
        console.debug(
          '[mcp-bridge] scheduling reconnect in',
          delay,
          'ms',
          competing ? '(backoff — competing client)' : '',
        );
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null;
          connect();
        }, delay);
      });

      ws.addEventListener('error', (evt) => {
        console.debug('[mcp-bridge] ws error', evt.type, ws.url);
        /* close fires next */
      });
    })();
    // handleCommand is accessed via ref — removing it from deps prevents connect()
    // from changing identity (and triggering a re-run) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // When the browser tab becomes visible again (user switches back), reconnect
  // immediately if the WebSocket is gone.
  //
  // NOTE: we do NOT close the connection on visibility=hidden.  The PWA tab
  // goes to the background whenever the user switches to Claude Desktop to run
  // an analysis — closing the socket at that moment would immediately break
  // every in-flight MCP command.  Instead, the server-side pong watchdog
  // (2 × 15 s = 30 s tolerance) handles truly dead connections, which is
  // enough headroom for Chrome's background-tab throttling.
  useEffect(() => {
    if (!isLeader) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      // Cancel any pending slow reconnect and connect right now.
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      wsRef.current = null;
      connect();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isLeader, connect]);
}
