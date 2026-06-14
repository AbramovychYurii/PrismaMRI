import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { dicomAdapter } from '@/lib/import/adapters/dicom/adapter';
import type { ImportSource } from '@/lib/import/types';
import { prepareVolumeFor3D } from '@/lib/volume/preview-3d';
import { buildScalarHistogram, resolveHistogramWindowLevel } from '@/workers/volume/scalars';

const ZIP = '/Users/yurii/Desktop/Yurii_Abramovych_Head_Neck_DICOM.zip';

const zipBuf = new Uint8Array(readFileSync(ZIP));
const entries = unzipSync(zipBuf, {
  filter: (f) => !f.name.endsWith('/') && !f.name.startsWith('__MACOSX'),
});

const source: ImportSource = {
  rootName: 'set',
  files: Object.entries(entries).map(([path, bytes]) => ({
    path,
    name: (path.split('/').pop() ?? path).toLowerCase(),
    file: new File([new Uint8Array(bytes)], (path.split('/').pop() ?? path).toLowerCase()),
  })),
};

const noop = () => {};

async function run() {
  const series = await dicomAdapter.listSeries!(source);
  console.log(`listSeries → ${series.length} series\n`);

  for (const s of series) {
    process.stdout.write(`[${s.key.slice(-12)}] "${s.label}" ${s.columns}x${s.rows} n=${s.count} … `);
    try {
      const vol = await dicomAdapter.parse(source, noop, s.key);
      const hist = buildScalarHistogram(vol.voxels, 1024);
      const wl = resolveHistogramWindowLevel(hist);
      const prep = prepareVolumeFor3D(vol, hist);
      console.log(
        `OK dims=${vol.meta.dims.join('x')} range=[${vol.scalarMin},${vol.scalarMax}] wl={w:${wl.window.toFixed(0)},l:${wl.level.toFixed(0)}} prepDims=${prep.dims.join('x')}`,
      );
    } catch (err) {
      console.log(`✗ THREW: ${(err as Error).name}: ${(err as Error).message}`);
      console.log((err as Error).stack?.split('\n').slice(0, 4).join('\n'));
    }
  }
}

run().catch((e) => {
  console.error('top-level:', e);
  process.exit(1);
});
