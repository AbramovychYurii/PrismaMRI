import { buildDxtArchive } from '@/lib/mcp/dxt';
import { strFromU8, strToU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import serverSource from '../../../mcp-server/src/index.ts?raw';
import { TOOLS, TOOL_ACTIONS } from '../../../mcp-server/src/tools';
import { ACTION_LABELS } from './constants';
import { MCP_HANDLERS } from './handlers';

/**
 * The MCP server and the app are two programs that only meet over a socket, and
 * a tool is spread over both: its schema and wire action live in
 * mcp-server/src/tools.ts, its handler and label here, its reply text in the
 * server's handleTool, its name in the .dxt manifest. Nothing but this file
 * notices when one of them is left behind.
 */

const toolNames = TOOLS.map((t) => t.name);
const actions: string[] = Object.values(TOOL_ACTIONS).map((t) => t.action);

describe('MCP tools: server and app agree', () => {
  it('lists each tool once, and every tool has a wire action', () => {
    expect(new Set(toolNames).size).toBe(toolNames.length);
    expect(toolNames.slice().sort()).toEqual(Object.keys(TOOL_ACTIONS).sort());
  });

  it('gives each tool its own action', () => {
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('has an app handler for every action, and no handler left over', () => {
    const handled = Object.keys(MCP_HANDLERS);
    expect(actions.filter((a) => !handled.includes(a))).toEqual([]);
    expect(handled.filter((a) => !actions.includes(a))).toEqual([]);
  });

  it('shows the agent a label for every action', () => {
    const labelled = Object.keys(ACTION_LABELS);
    expect(actions.filter((a) => !labelled.includes(a))).toEqual([]);
    expect(labelled.filter((a) => !actions.includes(a))).toEqual([]);
  });

  it('has a case in the server for every tool', () => {
    expect(toolNames.filter((name) => !serverSource.includes(`case '${name}'`))).toEqual([]);
  });

  it('names the same tools in the .dxt manifest', () => {
    const entries = unzipSync(
      buildDxtArchive({ serverJs: strToU8('').buffer as ArrayBuffer, wsIndex: '', wsLib: [] }),
    );
    const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as {
      tools: { name: string }[];
    };
    expect(manifest.tools.map((t) => t.name).sort()).toEqual(toolNames.slice().sort());
  });

  it('only requires arguments the schema declares', () => {
    for (const tool of TOOLS) {
      const declared = Object.keys(tool.inputSchema.properties);
      expect(
        tool.inputSchema.required.filter((r) => !declared.includes(r)),
        tool.name,
      ).toEqual([]);
    }
  });
});
