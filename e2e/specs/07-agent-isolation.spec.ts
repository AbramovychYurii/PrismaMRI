/**
 * 07 — Isolation from a local MCP server
 *
 * The app probes 127.0.0.1:7389–7393 for an MCP server, and a server that
 * answers puts a connection dialog over the page. A run must not depend on
 * whether one happens to be listening, so `helpers/test` closes those sockets.
 * This puts a real server on one of the ports and checks the page cannot reach
 * it — which a run on a machine with no server could never show.
 */
import { createServer } from 'node:http';
import { LOCAL_PORTS } from '../../src/lib/mcp/constants';
import { expect, test } from '../helpers/test';

/** Listens on the first agent port nobody holds; null when all of them are taken. */
async function listenOnFreeAgentPort() {
  for (const port of LOCAL_PORTS) {
    let upgrades = 0;
    const server = createServer();
    server.on('upgrade', (_req, socket) => {
      upgrades++;
      socket.destroy();
    });
    const listening = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
    if (listening) return { server, port, upgrades: () => upgrades };
  }
  return null;
}

test('a server on an agent port is out of reach of the page', async ({ page }) => {
  const held = await listenOnFreeAgentPort();
  test.skip(held === null, 'every agent port is taken on this machine');
  if (!held) return;

  try {
    await page.goto('/');
    // The app probes on its own; also open one by hand so the check does not
    // depend on when that probe fires.
    await page.evaluate(
      (port) =>
        new Promise<void>((resolve) => {
          const ws = new WebSocket(`ws://127.0.0.1:${port}`);
          ws.addEventListener('close', () => resolve());
          ws.addEventListener('error', () => resolve());
          setTimeout(resolve, 2_000);
        }),
      held.port,
    );
    expect(held.upgrades()).toBe(0);
  } finally {
    await new Promise((resolve) => held.server.close(resolve));
  }
});
