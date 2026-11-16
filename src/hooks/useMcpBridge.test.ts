// @vitest-environment happy-dom
/**
 * Claude Desktop starts one MCP server per surface (chat, Cowork and Code
 * sessions), each on its own port. The bridge must hold a socket to every one
 * of them and answer each command on the socket it came from — otherwise the
 * servers it did not pick can never reach the viewer.
 */
import { LOCAL_PORTS, LOCAL_RESCAN_MS } from '@/lib/mcp/constants';
import { useAgentStore } from '@/store/agentStore';
import { act, createElement } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMcpBridge } from './useMcpBridge';

vi.mock('@/hooks/useBridgeLeadership', () => ({ useBridgeLeadership: () => true }));
vi.mock('@/store', async () => ({
  useAgentStore: (await import('@/store/agentStore')).useAgentStore,
}));
vi.mock('@prisma-mri/viewer-react', () => ({ useViewer: () => ({}) }));
vi.mock('@/lib/mcp/handlers', () => ({
  MCP_HANDLERS: {
    get_viewer_state: ({ ok }: { ok: (data?: unknown) => void }) => ok({ answered: true }),
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A WebSocket that connects to whichever ports `listening` holds and fails on the rest. */
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static listening = new Set<number>();
  static all: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  readonly port: number;
  readonly sent: Record<string, unknown>[] = [];
  private readonly handlers = new Map<string, ((event: unknown) => void)[]>();

  constructor(readonly url: string) {
    this.port = Number(new URL(url).port);
    FakeSocket.all.push(this);
    setTimeout(() => {
      if (FakeSocket.listening.has(this.port)) {
        this.readyState = FakeSocket.OPEN;
        this.emit('open', {});
      } else {
        this.readyState = FakeSocket.CLOSED;
        this.emit('error', {});
      }
    }, 0);
  }

  addEventListener(type: string, handler: (event: unknown) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000) {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.emit('close', { code });
  }

  /** The server speaks. */
  receive(message: object) {
    this.emit('message', { data: JSON.stringify(message) });
  }

  private emit(type: string, event: unknown) {
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }

  static open(port: number): FakeSocket {
    const sockets = FakeSocket.all.filter(
      (s) => s.port === port && s.readyState === FakeSocket.OPEN,
    );
    const socket = sockets[sockets.length - 1];
    if (!socket) throw new Error(`no open socket on ${port}`);
    return socket;
  }
}

let root: Root;

/** Lets pending timers and promises settle. */
async function settle(ms = 10) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function Probe() {
  useMcpBridge();
  return null;
}

async function mountBridge() {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  act(() => root.render(createElement(Probe)));
  await settle();
}

const ports = () => useAgentStore.getState().localPorts;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
  FakeSocket.listening = new Set();
  FakeSocket.all = [];
  useAgentStore.setState({ mcpConnected: false, localPorts: [] });
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('bridge to several MCP servers', () => {
  it('connects to every server that answers, not just the first', async () => {
    FakeSocket.listening = new Set([7389, 7390]);
    await mountBridge();

    expect(ports()).toEqual([7389, 7390]);
    expect(useAgentStore.getState().mcpConnected).toBe(true);
  });

  it('answers a command on the socket it came from', async () => {
    FakeSocket.listening = new Set([7389, 7390]);
    await mountBridge();

    FakeSocket.open(7390).receive({ type: 'cmd', id: 'q1', action: 'get_viewer_state' });
    await settle();

    expect(FakeSocket.open(7390).sent).toContainEqual({
      type: 'result',
      id: 'q1',
      ok: true,
      data: { answered: true },
    });
    expect(FakeSocket.open(7389).sent).toEqual([]);
  });

  it('keeps the other server when one goes away, and takes it back when it returns', async () => {
    FakeSocket.listening = new Set([7389, 7390]);
    await mountBridge();

    FakeSocket.listening.delete(7389);
    FakeSocket.open(7389).close(1006);
    await settle();
    expect(ports()).toEqual([7390]);
    expect(useAgentStore.getState().mcpConnected).toBe(true);

    FakeSocket.listening.add(7389);
    await settle(2_000);
    expect(ports()).toEqual([7389, 7390]);
  });

  it('finds a server that starts after the bridge connected to another', async () => {
    FakeSocket.listening = new Set([7389]);
    await mountBridge();
    expect(ports()).toEqual([7389]);

    FakeSocket.listening.add(7390);
    await settle(LOCAL_RESCAN_MS + 500);

    expect(ports()).toEqual([7389, 7390]);
  });

  it('does not probe the ports again while nothing is connected', async () => {
    await mountBridge();
    expect(FakeSocket.all).toHaveLength(LOCAL_PORTS.length);

    await settle(LOCAL_RESCAN_MS * 4);

    expect(FakeSocket.all).toHaveLength(LOCAL_PORTS.length);
    expect(useAgentStore.getState().mcpConnected).toBe(false);
  });

  it('shows the agent as gone only when every server has lost its agent', async () => {
    FakeSocket.listening = new Set([7389, 7390]);
    await mountBridge();

    FakeSocket.open(7389).receive({ type: 'mcp_disconnected' });
    await settle();
    expect(useAgentStore.getState().mcpConnected).toBe(true);

    FakeSocket.open(7390).receive({ type: 'mcp_disconnected' });
    await settle();
    expect(useAgentStore.getState().mcpConnected).toBe(false);

    FakeSocket.open(7389).receive({ type: 'mcp_connecting' });
    await settle();
    expect(useAgentStore.getState().mcpConnected).toBe(true);
  });
});
