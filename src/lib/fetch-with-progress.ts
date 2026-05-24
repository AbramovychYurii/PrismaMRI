const PROGRESS_MIN_INTERVAL_MS = 80;

/** HEAD request when allowed (same-origin); may be null cross-origin due to CORS. */
export async function probeContentLength(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) return null;
    const raw = response.headers.get('Content-Length');
    if (!raw) return null;
    const bytes = Number(raw);
    return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function throttleProgress(onProgress: (loaded: number, total: number) => void) {
  let lastAt = 0;
  return (loaded: number, total: number, force = false) => {
    const now = performance.now();
    if (!force && now - lastAt < PROGRESS_MIN_INTERVAL_MS && total > 0 && loaded < total) return;
    lastAt = now;
    onProgress(loaded, total);
  };
}

/** GET as Blob; reports download % when total size is known (HEAD probe and/or XHR progress). */
export function fetchBlobWithProgress(
  url: string,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Load cancelled.', 'AbortError'));
  }

  return probeContentLength(url).then((probedTotal) => {
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Load cancelled.', 'AbortError'));
    }

    return new Promise<Blob>((resolve, reject) => {
      const report = throttleProgress(onProgress);
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'blob';

      const onAbort = () => {
        xhr.abort();
        reject(new DOMException('Load cancelled.', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const cleanup = () => signal?.removeEventListener('abort', onAbort);

      xhr.onprogress = (event) => {
        const total = event.lengthComputable ? event.total : (probedTotal ?? 0);
        report(event.loaded, total);
      };

      xhr.onload = () => {
        cleanup();
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`HTTP ${xhr.status}`));
          return;
        }
        const blob = xhr.response as Blob;
        const total = probedTotal ?? blob.size;
        report(total, total, true);
        resolve(blob);
      };

      xhr.onerror = () => {
        cleanup();
        reject(new Error('Failed to fetch'));
      };

      // xhr.abort() was already handled by onAbort — no double-reject needed.
      xhr.onabort = cleanup;

      xhr.send();
    });
  });
}
