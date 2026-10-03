import { buildDxtArchive } from '@/lib/mcp/dxt';
import { strFromU8, strToU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

describe('buildDxtArchive', () => {
  it('lays out manifest, server bundle and ws lib as Claude Desktop expects', () => {
    const entries = unzipSync(
      buildDxtArchive({
        serverJs: strToU8('console.log("server")').buffer as ArrayBuffer,
        wsIndex: 'module.exports = require("./lib/websocket");',
        wsLib: [{ name: 'websocket.js', text: '// ws' }],
      }),
    );

    expect(Object.keys(entries).sort()).toEqual([
      'manifest.json',
      'server/index.js',
      'server/node_modules/ws/index.js',
      'server/node_modules/ws/lib/websocket.js',
    ]);
    expect(strFromU8(entries['server/index.js'])).toBe('console.log("server")');
    expect(strFromU8(entries['server/node_modules/ws/lib/websocket.js'])).toBe('// ws');

    const manifest = JSON.parse(strFromU8(entries['manifest.json']));
    expect(manifest.server.entry_point).toBe('server/index.js');
    expect(manifest.tools).toHaveLength(20);
    expect(manifest.tools[0]).toEqual({ name: 'get_viewer_state' });
  });
});
