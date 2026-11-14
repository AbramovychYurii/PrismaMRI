#!/usr/bin/env node
/**
 * Keeps the viewer packages apart until they move into their own workspaces.
 *
 *   src/viewer-core/   imports only itself and its own dependencies — no React,
 *                      no app code, no other package.
 *   src/viewer-react/  imports itself, `@prisma-mri/viewer-core` and its own
 *                      dependencies — no app code.
 *   the app            reaches the viewer only through the package names, never
 *                      a path inside src/viewer-core or src/viewer-react.
 *
 * Run by `npm run lint`. Exits 1 and lists every import that crosses a line.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const PACKAGES = {
  core: {
    dir: 'src/viewer-core',
    deps: ['fflate', 'three'],
  },
  react: {
    dir: 'src/viewer-react',
    deps: ['@prisma-mri/viewer-core', 'react', 'react-dom', 'zustand', 'three', 'lucide-react'],
  },
};
/** Allowed in test files of either package, on top of its own dependencies. */
const TEST_DEPS = ['vitest'];

/** Static, side-effect, re-export and dynamic imports, and worker URLs. */
const IMPORT = [
  /^\s*(?:import|export)\s+(?:type\s+)?[^'";]*?\s*from\s*['"]([^'"]+)['"]/gms,
  /^\s*import\s*['"]([^'"]+)['"]/gm,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g,
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

function packageOf(file) {
  for (const [name, pkg] of Object.entries(PACKAGES)) {
    if (file.startsWith(`${pkg.dir}/`)) return name;
  }
  return 'app';
}

/** Bare specifier → its package name (`three/examples/x` → `three`). */
function bareName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Where a path-like specifier points, relative to the repo, or null for a bare one. */
function target(spec, file) {
  const bare = spec.split('?')[0];
  if (bare.startsWith('@/')) return `src/${bare.slice(2)}`;
  if (bare.startsWith('.')) return rel(path.resolve(ROOT, path.dirname(file), bare));
  return null;
}

const problems = [];

for (const abs of walk(SRC)) {
  const file = rel(abs);
  const home = packageOf(file);
  const isTest = /\.test\.tsx?$/.test(file);
  const text = readFileSync(abs, 'utf8');
  const specs = new Set(IMPORT.flatMap((re) => [...text.matchAll(re)].map((m) => m[1])));

  for (const spec of specs) {
    const to = target(spec, file);
    if (home === 'app') {
      if (to && packageOf(to) !== 'app') {
        problems.push(`${file}: "${spec}" reaches into ${PACKAGES[packageOf(to)].dir} — import from @prisma-mri/viewer-${packageOf(to)} instead`);
      }
      continue;
    }
    const pkg = PACKAGES[home];
    if (to) {
      if (spec.startsWith('@/')) {
        problems.push(`${file}: "${spec}" — use a relative import inside ${pkg.dir}`);
      } else if (packageOf(to) !== home) {
        problems.push(`${file}: "${spec}" leaves ${pkg.dir}`);
      }
      continue;
    }
    if (spec.startsWith('node:') && isTest) continue;
    const name = bareName(spec);
    if (!pkg.deps.includes(name) && !(isTest && TEST_DEPS.includes(name))) {
      problems.push(`${file}: "${spec}" is not a dependency of ${pkg.dir}`);
    }
  }
}

if (problems.length) {
  console.error(`Package boundaries: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('Package boundaries: ok');
