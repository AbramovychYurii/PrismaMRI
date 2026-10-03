import { LAST_LOCAL_PORT_KEY, LOCAL_PORTS, LOCAL_PROBE_TIMEOUT_MS } from '@/lib/mcp/constants';

/**
 * Finding the local MCP server: it listens on the first free port of
 * LOCAL_PORTS on 127.0.0.1, so the app probes them for an open WebSocket.
 */

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
export async function findLocalServer(): Promise<WebSocket | null> {
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
