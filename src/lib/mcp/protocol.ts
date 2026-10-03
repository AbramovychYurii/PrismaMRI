/** Messages exchanged with the local MCP server over the bridge WebSocket. */

export type IncomingMessage =
  | { type: 'pong' }
  | { type: 'ping' }
  | { type: 'mcp_connecting' }
  | { type: 'mcp_disconnected' }
  | { type: 'cmd'; id: string; action: string; [key: string]: unknown };

export type OutgoingResult =
  | { type: 'result'; id: string; ok: true; data?: unknown }
  | { type: 'result'; id: string; ok: false; error: string };
