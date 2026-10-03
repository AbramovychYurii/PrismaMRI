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
 *
 * Memory matters as much as speed here: a full-body CT is ~300 MB compressed
 * and ~520 MB inflated, so every helper writes into one buffer of the final
 * size where that size is known, instead of keeping a chunk list and copying
 * it into a second buffer at the end.
 */

import type { ProgressFn } from '@/lib/import/types';
import { Gunzip, Inflate, Unzlib } from 'fflate';

type ChunkFn = (loaded: number, total: number) => void;

/**
 * Collects a byte stream. With `expected` set, chunks are copied straight into
 * one buffer of that size; if the stream overruns it, collection carries on in
 * a chunk list so nothing is lost. A short stream yields a shorter view.
 */
class ByteSink {
  private buffer: Uint8Array | null;
  private chunks: Uint8Array[] = [];
  private length = 0;

  constructor(expected?: number) {
    this.buffer = expected !== undefined ? new Uint8Array(expected) : null;
  }

  push(chunk: Uint8Array): void {
    if (this.buffer && this.length + chunk.length <= this.buffer.length) {
      this.buffer.set(chunk, this.length);
    } else {
      if (this.buffer) {
        this.chunks.push(this.buffer.subarray(0, this.length));
        this.buffer = null;
      }
      this.chunks.push(chunk);
    }
    this.length += chunk.length;
  }

  result(): Uint8Array {
    if (this.buffer) return this.buffer.subarray(0, this.length);
    if (this.chunks.length === 1) return this.chunks[0];
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}

/**
 * Read a Blob through `blob.stream()` so we see chunk boundaries.
 *
 * `loaded` is the number of bytes consumed so far, `total` is `blob.size`.
 * Yields after each chunk via the `await reader.read()` microtask, which is
 * enough to let the worker post the progress message in between reads.
 */
export async function readBlobBytes(blob: Blob, onChunk?: ChunkFn): Promise<Uint8Array> {
  const total = blob.size;
  const reader = blob.stream().getReader();
  const sink = new ByteSink(total);
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sink.push(value);
    loaded += value.length;
    onChunk?.(loaded, total);
  }
  return sink.result();
}

/** Bytes of compressed input fed to the decompressor per progress tick. */
const FEED_CHUNK = 1 << 20; // 1 MB

/** The three deflate wrappers volume formats use; names match DecompressionStream's. */
export type Compression = 'gzip' | 'deflate' | 'deflate-raw';

/**
 * Which wrapper `bytes` start with. NRRD and NIfTI write gzip; MetaImage's
 * CompressedData is zlib ('deflate'), as ITK writes it. A stream with neither
 * header is taken to be raw deflate.
 */
export function detectCompression(bytes: Uint8Array): Compression {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip';
  if (bytes.length >= 2 && (bytes[0] & 0x0f) === 8 && ((bytes[0] << 8) | bytes[1]) % 31 === 0) {
    return 'deflate';
  }
  return 'deflate-raw';
}

/**
 * Inflate via fflate's streaming decoders, feeding the input in 1 MB chunks
 * so we can emit progress between them.
 *
 * `loaded` / `total` reports input-bytes consumed (not output produced) — the
 * output size isn't known until the stream finishes, and input consumption is
 * a stable monotonic measure of progress regardless of compression ratio.
 */
export function inflateBytes(
  input: Uint8Array,
  format: Compression,
  onChunk?: ChunkFn,
  expected?: number,
): Uint8Array {
  const sink = new ByteSink(expected);
  const push = (chunk: Uint8Array) => sink.push(chunk);
  const stream =
    format === 'gzip'
      ? new Gunzip(push)
      : format === 'deflate'
        ? new Unzlib(push)
        : new Inflate(push);
  for (let off = 0; off < input.length; off += FEED_CHUNK) {
    const end = Math.min(off + FEED_CHUNK, input.length);
    stream.push(input.subarray(off, end), end >= input.length);
    onChunk?.(end, input.length);
  }
  return sink.result();
}

/**
 * The same, through the platform's native `DecompressionStream` — several
 * times faster than inflating in JavaScript. Rejects on anything the native
 * decoder will not take, so the caller can fall back to fflate.
 */
async function inflateNative(
  input: Uint8Array,
  format: Compression,
  onChunk?: ChunkFn,
  expected?: number,
): Promise<Uint8Array> {
  const stream = new DecompressionStream(format);
  const writer = stream.writable.getWriter();
  const feeding = (async () => {
    for (let off = 0; off < input.length; off += FEED_CHUNK) {
      const end = Math.min(off + FEED_CHUNK, input.length);
      await writer.write(input.subarray(off, end) as Uint8Array<ArrayBuffer>);
      onChunk?.(end, input.length);
    }
    await writer.close();
  })();
  // A decode error surfaces on the reader; keep the writer's copy of it from
  // becoming an unhandled rejection.
  feeding.catch(() => {});

  const sink = new ByteSink(expected);
  const reader = stream.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sink.push(value);
  }
  await feeding;
  return sink.result();
}

/**
 * Inflate `input`, whichever wrapper it has, with the native decoder where it
 * exists and accepts the input (multi-member gzip, for one, is not guaranteed
 * to), else fflate.
 */
export async function inflate(
  input: Uint8Array,
  onChunk?: ChunkFn,
  expected?: number,
): Promise<Uint8Array> {
  const format = detectCompression(input);
  if (typeof DecompressionStream !== 'undefined') {
    try {
      return await inflateNative(input, format, onChunk, expected);
    } catch {
      /* fall through to fflate, which reports its own error for bad data */
    }
  }
  return inflateBytes(input, format, onChunk, expected);
}

/**
 * Reads `file` whole as the first half of the `reading-files` stage. Formats
 * that may be compressed reserve the second half for {@link inflateWithProgress};
 * an uncompressed file simply jumps to the next stage when assembly starts.
 */
export async function readWithProgress(file: File, onProgress: ProgressFn): Promise<Uint8Array> {
  onProgress({ stage: 'reading-files', current: 0, total: file.size * 2 });
  return readBlobBytes(file, (loaded, total) => {
    onProgress({ stage: 'reading-files', current: loaded, total: total * 2 });
  });
}

/**
 * Inflates `input` as the second half of the `reading-files` stage of a file of
 * `fileSize` bytes. Progress is compressed input consumed, which is monotonic
 * whatever the compression ratio. `expected` — the inflated size, when the
 * header already told us — lets the output land in a single buffer.
 */
export function inflateWithProgress(
  input: Uint8Array,
  fileSize: number,
  onProgress: ProgressFn,
  expected?: number,
): Promise<Uint8Array> {
  return inflate(
    input,
    (loaded, total) => {
      onProgress({ stage: 'reading-files', current: fileSize + loaded, total: fileSize + total });
    },
    expected,
  );
}
