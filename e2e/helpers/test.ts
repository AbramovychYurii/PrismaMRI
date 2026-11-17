/**
 * The `test` every spec imports instead of Playwright's own.
 *
 * The app looks for a local MCP server on 127.0.0.1:7389–7393 (Claude Desktop
 * starts one per surface). Where one is running, the app opens its "AI agent
 * connection request" dialog, which covers the page and swallows every click —
 * about 30 of the tests then time out for a reason that has nothing to do with
 * the code. A run has to give the same answer whether or not an agent happens
 * to be listening, so the sockets are closed before they open and the app sees
 * "no server", as it does on CI.
 *
 * A spec that makes its own context (`browser.newContext()`) has to call
 * `blockAgentSockets(context)` on it: this fixture only covers the one it is
 * given. `npm run lint` refuses a spec that imports `@playwright/test` itself.
 */
import { type BrowserContext, type Page, test as base, expect } from '@playwright/test';
import { LOCAL_PORTS } from '../../src/lib/mcp/constants';

const AGENT_PORTS: readonly number[] = LOCAL_PORTS;

/** Closes every WebSocket the page opens to a port a local MCP server may use. */
export async function blockAgentSockets(target: Page | BrowserContext): Promise<void> {
  await target.routeWebSocket(
    (url) => url.hostname === '127.0.0.1' && AGENT_PORTS.includes(Number(url.port)),
    (ws) => ws.close(),
  );
}

export const test = base.extend<{ agentSocketsBlocked: undefined }>({
  agentSocketsBlocked: [
    async ({ context }, use) => {
      await blockAgentSockets(context);
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect };
export type { Browser, BrowserContext, Page } from '@playwright/test';
