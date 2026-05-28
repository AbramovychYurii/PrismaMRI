/**
 * Generates a minimal synthetic NRRD volume for Playwright tests.
 *
 * Volume: 32 × 32 × 32 voxels, spacing 1.0 mm, Int16, little-endian, raw encoding.
 * Contains a solid sphere in the center so slice renderings are visually non-empty.
 *
 * Run once with:  node e2e/fixtures/generate.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dir, 'test.nrrd');

const SIZE = 32;
const N = SIZE * SIZE * SIZE;

// Build Int16 data: background = -1000 (air), sphere = 400 (tissue).
const data = new Int16Array(N);
const cx = SIZE / 2 - 0.5;
const cy = SIZE / 2 - 0.5;
const cz = SIZE / 2 - 0.5;
const r = SIZE / 4;

for (let z = 0; z < SIZE; z++) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const idx = z * SIZE * SIZE + y * SIZE + x;
      data[idx] = dist <= r ? 400 : -1000;
    }
  }
}

// Build NRRD header.
const header = [
  'NRRD0004',
  'type: short',
  'dimension: 3',
  `sizes: ${SIZE} ${SIZE} ${SIZE}`,
  'spacings: 1.0 1.0 1.0',
  'endian: little',
  'encoding: raw',
  '',  // blank line separates header from data
  '',
].join('\n');

const headerBuf = Buffer.from(header, 'ascii');
const dataBuf = Buffer.from(data.buffer);

writeFileSync(OUT, Buffer.concat([headerBuf, dataBuf]));
console.log(`Written ${OUT} (${(headerBuf.length + dataBuf.length / 1024).toFixed(1)} KB)`);
