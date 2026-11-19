// Bundles the MCP server for the .dxt that the app builds in the browser
// (src/lib/mcp/dxt.ts). Writes public/dxt-server/index.js plus the `ws`
// package it leaves external, because `ws` loads its optional native add-ons
// with a runtime require that a bundle cannot follow.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/dxt-server');

// Resolve `ws` the way the server would, so a workspace install (hoisted) and a
// nested one both work.
const wsDir = dirname(createRequire(join(root, 'mcp-server/')).resolve('ws/package.json'));

rmSync(out, { recursive: true, force: true });
await build({
  entryPoints: [join(root, 'mcp-server/src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: join(out, 'index.js'),
  external: ['ws'],
  loader: { '.md': 'text' },
  logLevel: 'warning',
});

mkdirSync(join(out, 'ws/lib'), { recursive: true });
cpSync(join(wsDir, 'index.js'), join(out, 'ws/index.js'));
for (const file of readdirSync(join(wsDir, 'lib')).filter((f) => f.endsWith('.js'))) {
  cpSync(join(wsDir, 'lib', file), join(out, 'ws/lib', file));
}
console.log('MCP server bundled to public/dxt-server/');
