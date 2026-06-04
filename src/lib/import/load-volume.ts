import { importFormatAdapters } from '@/lib/import/adapters';
import type { ImportFile, ImportSource, ProgressFn } from '@/lib/import/types';
import type { LoadedVolume } from '@/types';
import { unzipSync } from 'fflate';

async function expandZips(source: ImportSource, onProgress: ProgressFn): Promise<ImportSource> {
  const zips = source.files.filter((f) => f.name.endsWith('.zip'));
  if (zips.length === 0) return source;

  onProgress({ stage: 'scanning', message: 'Extracting archive…' });
  const expanded: ImportFile[] = source.files.filter((f) => !f.name.endsWith('.zip'));
  for (const z of zips) {
    const buf = new Uint8Array(await z.file.arrayBuffer());
    const entries = unzipSync(buf, {
      filter: (file) => !file.name.endsWith('/') && !file.name.startsWith('__MACOSX'),
    });
    for (const [path, bytes] of Object.entries(entries)) {
      // `pop()` is safe: an entry path is never an empty string. Fall back to
      // the full path for the (impossible) empty case rather than asserting.
      const name = (path.split('/').pop() ?? path).toLowerCase();
      const file = new File([new Uint8Array(bytes)], name);
      expanded.push({ path, name, file });
    }
  }
  return { rootName: source.rootName, files: expanded };
}

export async function loadVolumeFromSource(
  rawSource: ImportSource,
  onProgress: ProgressFn,
): Promise<LoadedVolume> {
  onProgress({ stage: 'scanning', current: 0, total: 0, message: 'Detecting format…' });
  const source = await expandZips(rawSource, onProgress);

  const adapter = importFormatAdapters.find((a) => a.matches(source));
  if (!adapter) {
    throw new Error(
      'Unrecognized format. Supported: DICOM series, NIfTI (.nii/.nii.gz), NRRD, MHA/MHD.',
    );
  }
  onProgress({ stage: 'parsing-headers', message: `Reading ${adapter.label}…` });
  const volume = await adapter.parse(source, onProgress);
  onProgress({ stage: 'done', message: 'Volume ready', current: 1, total: 1 });
  return volume;
}
