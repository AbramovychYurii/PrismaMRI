import { LOCAL_PORTS, LOCAL_PROBE_TIMEOUT_MS } from '@/lib/mcp/constants';

/**
 * Finding the local MCP servers. Claude Desktop starts one server per surface
 * (chat, Cowork and Code sessions), and each takes the first free port of
 * LOCAL_PORTS on 127.0.0.1 — so there can be several, and the app has to talk
 * to all of them: a command from any of them is for this one viewer.
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

export interface LocalServer {
  port: number;
  ws: WebSocket;
}

/**
 * Probes `ports` at once and returns an open socket for each one that answered,
 * lowest port first. The wait is one timeout rather than one per port.
 */
export async function openLocalServers(
  ports: readonly number[] = LOCAL_PORTS,
): Promise<LocalServer[]> {
  const settled = await Promise.allSettled(
    ports.map((port) => openSocket(port, LOCAL_PROBE_TIMEOUT_MS)),
  );
  return settled.flatMap((probe, i) =>
    probe.status === 'fulfilled' ? [{ port: ports[i], ws: probe.value }] : [],
  );
}
