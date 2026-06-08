/**
 * Streaming helpers for the import pipeline.
 *
 * Both helpers exist so the non-DICOM adapters can emit progress while large
 * (often 100+ MB) volumes are being read off disk and gunzipped — otherwise
 * the progress bar parks at 15% (start of `reading-files`) until the whole
 * file is in memory and decompressed, which can take several seconds.
 *
 * Each helper accepts a `(loaded, total)` callback that fires once per chunk.
 * The caller decides how to map those values onto the import-stage budget.
 */

import { Gunzip } from 'fflate';

/**
 * Read a Blob through `blob.stream()` so we see chunk boundaries.
 *
 * `loaded` is the number of bytes consumed so far, `total` is `blob.size`.
 * Yields after each chunk via the `await reader.read()` microtask, which is
 * enough to let the worker post the progress message in between reads.
 */
export async function readBlobBytes(
  blob: Blob,
  onChunk?: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const total = blob.size;
  const reader = blob.stream().getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onChunk?.(loaded, total);
  }
  // Single allocation + copy is faster than incremental Uint8Array growth.
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Bytes of compressed input fed to the streaming Gunzip per progress tick. */
const GUNZIP_FEED_CHUNK = 1 << 20; // 1 MB

/**
 * Decompress a gzip payload via fflate's streaming `Gunzip`, feeding the
 * input in 1 MB chunks so we can emit progress between them.
 *
 * `loaded` / `total` reports input-bytes consumed (not output produced) — the
 * output size isn't known until the stream finishes, and input consumption is
 * a stable monotonic measure of progress regardless of compression ratio.
 */
export function gunzipBytes(
  input: Uint8Array,
  onChunk?: (loaded: number, total: number) => void,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let outLen = 0;
  const gz = new Gunzip((chunk) => {
    chunks.push(chunk);
    outLen += chunk.length;
  });
  for (let off = 0; off < input.length; off += GUNZIP_FEED_CHUNK) {
    const end = Math.min(off + GUNZIP_FEED_CHUNK, input.length);
    gz.push(input.subarray(off, end), end >= input.length);
    onChunk?.(end, input.length);
  }
  const out = new Uint8Array(outLen);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
