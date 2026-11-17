/**
 * The public surface of the viewer packages, one text file per entry in `api/`.
 *
 * Each line is `<kind> <name>`, read with the TypeScript compiler, so types and
 * `export *` re-exports count, not only what exists at run time. A change to
 * these files is a change to what the packages promise:
 *
 *   - added an export     → fine in a minor release; review the name.
 *   - removed or renamed  → a breaking change (a minor bump while the version is 0.x).
 *   - moved to /unstable  → also breaking for anyone who imported it.
 *
 * When it fails on purpose, update the files and commit them with the change:
 *
 *   npx vitest run scripts/api-surface.test.ts -u
 *
 * Names and kinds only: a changed signature does not show up here.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The entries `exports` will list, and the file each one is checked against. */
const ENTRIES = [
  { name: 'viewer-core', file: 'src/viewer-core/index.ts' },
  { name: 'viewer-core-analysis', file: 'src/viewer-core/analysis/index.ts' },
  { name: 'viewer-core-unstable', file: 'src/viewer-core/unstable.ts' },
  { name: 'viewer-react', file: 'src/viewer-react/index.ts' },
  { name: 'viewer-react-unstable', file: 'src/viewer-react/unstable.ts' },
] as const;

function kindOf(flags: ts.SymbolFlags): string {
  const kinds: string[] = [];
  if (flags & ts.SymbolFlags.Class) kinds.push('class');
  if (flags & ts.SymbolFlags.Function) kinds.push('function');
  if (flags & ts.SymbolFlags.Enum) kinds.push('enum');
  if (flags & ts.SymbolFlags.Interface) kinds.push('interface');
  if (flags & ts.SymbolFlags.TypeAlias) kinds.push('type');
  if (flags & ts.SymbolFlags.Variable) kinds.push('const');
  if (flags & ts.SymbolFlags.Module) kinds.push('namespace');
  return kinds.join('+') || 'unknown';
}

function program(): ts.Program {
  const config = ts.readConfigFile(path.join(root, 'tsconfig.app.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  return ts.createProgram(
    ENTRIES.map((e) => path.join(root, e.file)),
    { ...parsed.options, noEmit: true, types: [], skipLibCheck: true },
  );
}

describe('public API surface', () => {
  const built = program();
  const checker = built.getTypeChecker();

  for (const entry of ENTRIES) {
    it(`@prisma-mri/${entry.name}`, async () => {
      const source = built.getSourceFile(path.join(root, entry.file));
      const module = source && checker.getSymbolAtLocation(source);
      if (!module) throw new Error(`${entry.file} is not a module`);

      const lines = checker
        .getExportsOfModule(module)
        .map((symbol) => {
          const target =
            symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
          return `${kindOf(target.flags)} ${symbol.name}`;
        })
        .sort((a, b) => a.split(' ')[1].localeCompare(b.split(' ')[1]) || a.localeCompare(b));

      await expect(`${lines.join('\n')}\n`).toMatchFileSnapshot(
        path.join(root, 'api', `${entry.name}.txt`),
      );
    });
  }
});
