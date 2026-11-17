/**
 * Blob → file download.
 *
 * Pure — no React, no Zustand. Safe to call from anywhere with a Blob.
 */

/**
 * Save `blob` to the user's downloads as `filename`.
 *
 * Two details the obvious four-line version gets wrong:
 *
 * • The anchor is put in the document before it is clicked. A click on a
 *   detached anchor is ignored by Firefox, so the download silently never
 *   starts there.
 * • The object URL is revoked on the next task, not synchronously after
 *   `click()`. Revoking in the same tick can cancel a download the browser
 *   has not begun reading yet.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
