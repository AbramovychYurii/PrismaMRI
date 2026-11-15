import { create } from 'zustand';

/**
 * State of the link to the local MCP server and the agent driving it. Belongs
 * to the PrismaMRI app, not to the viewer: a viewer embedded elsewhere has no
 * agent, and one agent connection serves whichever viewer the app shows.
 */
interface AgentState {
  /** True while at least one local MCP server is connected over the loopback WebSocket. */
  mcpConnected: boolean;
  /** Loopback ports of the connected MCP servers, lowest first; empty when disconnected. */
  localPorts: number[];
  /** Set while the agent is executing a command — drives the activity indicator. */
  agentActivity: { active: boolean; action: string | null };
  /** True for the entire duration of an agent prompt session (first cmd → inactivity/disconnect). */
  agentSessionActive: boolean;
}

interface AgentActions {
  setMcpConnected: (v: boolean) => void;
  setLocalPorts: (ports: number[]) => void;
  setAgentActivity: (active: boolean, action?: string | null) => void;
  setAgentSessionActive: (v: boolean) => void;
}

export const useAgentStore = create<AgentState & AgentActions>()((set) => ({
  mcpConnected: false,
  localPorts: [],
  agentActivity: { active: false, action: null },
  agentSessionActive: false,

  setMcpConnected: (mcpConnected) => set({ mcpConnected }),
  setLocalPorts: (localPorts) =>
    set((state) =>
      // The same ports are the same connection: keep the array, so nothing re-renders.
      state.localPorts.join() === localPorts.join() ? state : { localPorts },
    ),
  setAgentActivity: (active, action = null) =>
    set({ agentActivity: { active, action: active ? (action ?? null) : null } }),
  setAgentSessionActive: (agentSessionActive) => set({ agentSessionActive }),
}));
