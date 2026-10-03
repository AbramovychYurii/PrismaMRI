import { downloadBlob } from '@/lib/download';
import { type Zippable, strToU8, zipSync } from 'fflate';

/** The MCP server bundle and its `ws` dependency, emitted by `npm run build:dxt`. */
const SERVER_BUNDLE_URL = `${import.meta.env.BASE_URL}dxt-server/index.js`;
const WS_LIB_URL = `${import.meta.env.BASE_URL}dxt-server/ws/`;

/**
 * The .dxt file is a ZIP of `manifest.json` + a server bundle (Node + ws lib),
 * dropped into Claude Desktop via Settings → Extensions → Install Extension.
 */
export async function downloadDxt(): Promise<void> {
  const [serverJs, wsIndex, wsLib] = await Promise.all([
    fetch(SERVER_BUNDLE_URL).then((r) => r.arrayBuffer()),
    fetch(`${WS_LIB_URL}index.js`).then((r) => r.text()),
    Promise.all(
      [
        'constants.js',
        'event-target.js',
        'buffer-util.js',
        'extension.js',
        'limiter.js',
        'permessage-deflate.js',
        'receiver.js',
        'sender.js',
        'stream.js',
        'subprotocol.js',
        'validation.js',
        'websocket.js',
        'websocket-server.js',
      ].map((f) =>
        fetch(`${WS_LIB_URL}lib/${f}`)
          .then((r) => r.text())
          .then((t) => ({ name: f, text: t })),
      ),
    ),
  ]);

  const archive = buildDxtArchive({ serverJs, wsIndex, wsLib });
  downloadBlob(
    new Blob([archive as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    'prismamri.dxt',
  );
}

export interface DxtParts {
  /** The bundled MCP server (`server/index.js`). */
  serverJs: ArrayBuffer;
  /** `ws` package entry and its lib files — the server's only runtime dependency. */
  wsIndex: string;
  wsLib: { name: string; text: string }[];
}

/** Zips the manifest, server bundle and `ws` into a Claude Desktop extension. */
export function buildDxtArchive({ serverJs, wsIndex, wsLib }: DxtParts): Uint8Array {
  const manifest = {
    dxt_version: '0.1',
    name: 'prismamri',
    display_name: 'PrismaMRI AI Agent',
    version: '2.1.0',
    description:
      'Navigate MRI slices, analyze findings, place annotations and capture images — all controlled by Claude.',
    author: { name: 'PrismaMRI' },
    license: 'MIT',
    server: {
      type: 'node',
      entry_point: 'server/index.js',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/server/index.js'],
        env: {},
      },
    },
    tools: [
      'get_viewer_state',
      'get_volume_overview',
      'navigate_to_slice',
      'step_slice',
      'navigate_to_center',
      'set_window_level',
      'apply_wl_preset',
      'set_render_preset',
      'set_slab_mm',
      'capture_slice',
      'capture_all_planes',
      'capture_overview_grid',
      'capture_3d',
      'add_annotation',
      'remove_annotation',
      'list_annotations',
      'clear_annotations',
      'set_measurement',
      'get_measurement',
      'clear_measurement',
    ].map((name) => ({ name })),
    compatibility: { claude_desktop: '>=0.10.0', platforms: ['darwin', 'win32', 'linux'] },
  };

  const files: Zippable = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'server/index.js': new Uint8Array(serverJs),
    'server/node_modules/ws/index.js': strToU8(wsIndex),
  };
  for (const { name, text } of wsLib) {
    files[`server/node_modules/ws/lib/${name}`] = strToU8(text);
  }

  return zipSync(files, { level: 6 });
}
