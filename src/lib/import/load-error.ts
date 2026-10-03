/**
 * What the import screen says when a load fails. Most parser errors are
 * already written for people; two families arrive as raw engine messages and
 * mean nothing to a reader, so they are reworded.
 */

/** How V8, SpiderMonkey and JavaScriptCore word a failed large allocation. */
const OUT_OF_MEMORY = /allocation failed|invalid (typed )?array (buffer )?length|out of memory/i;

/** A DataView read past the end of the bytes a header promised. */
const TRUNCATED = /outside the bounds of the DataView|offset is out of bounds/i;

export const OUT_OF_MEMORY_MESSAGE =
  'Not enough memory to open this volume. Close other tabs or apps and try again, or open a smaller or cropped export.';

export const TRUNCATED_MESSAGE =
  'This file is shorter than its header says — it may be truncated, or its header may not match its data. Download or export it again, then retry.';

export function describeLoadError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : '';
  if (OUT_OF_MEMORY.test(message)) return OUT_OF_MEMORY_MESSAGE;
  if (TRUNCATED.test(message)) return TRUNCATED_MESSAGE;
  return message || fallback;
}
