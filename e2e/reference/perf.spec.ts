/**
 * Load-time and memory reference. Opens the example volumes in sequence the
 * way a user would (Back to import → Open file), then switches back to the
 * first one, and records per load:
 *
 *  - worker time per import stage and in total (`load` posted → `done` received),
 *  - time to the first 3-D frame on screen (`done` → first draw into the
 *    canvas framebuffer, followed by gl.finish so the GPU work is counted),
 *  - JS heap after a forced GC, and the memory footprint of the renderer and GPU
 *    processes (voxel buffers and textures live outside the JS heap).
 *
 * Instrumentation is injected from the outside (Worker + WebGL2 prototypes), so
 * the app is measured exactly as shipped. Results land in
 * e2e/reference/out/perf-<REF_LABEL>.json and are printed as a table.
 */
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { type Browser, type Page, test } from '@playwright/test';
import { backToImport, examplePath, openFile } from './helpers';

const here = path.dirname(fileURLToPath(import.meta.url));
const LABEL = process.env.REF_LABEL ?? 'run';

const SEQUENCE = [
  'maxillofacial_CBCT.nrrd',
  'dog_frontal_thorax_injured_paw_CT.nrrd',
  'full_body.nrrd',
  'Yurii_Abramovych_Head_Neck_DICOM.zip',
  'maxillofacial_CBCT.nrrd',
];

interface LoadMarks {
  start: number;
  stages: Record<string, number>;
  done: number | null;
  firstFrame: number | null;
  error?: string;
}

/** Runs in the page before any app code. */
function instrument() {
  const loads: LoadMarks[] = [];
  let current: LoadMarks | null = null;
  (window as unknown as { __refPerf: LoadMarks[] }).__refPerf = loads;

  const NativeWorker = window.Worker;
  class TimedWorker extends NativeWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      this.addEventListener('message', (e: MessageEvent) => {
        const d = e.data;
        if (!current || !d) return;
        const t = performance.now();
        if (d.type === 'progress') {
          const stage = d.progress.stage as string;
          if (!(stage in current.stages)) current.stages[stage] = t;
        } else if (d.type === 'done') {
          current.done = t;
        } else if (d.type === 'error') {
          current.error = d.message;
        }
      });
    }
    postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
      if ((message as { type?: string })?.type === 'load') {
        current = { start: performance.now(), stages: {}, done: null, firstFrame: null };
        loads.push(current);
      }
      super.postMessage(message, transfer as Transferable[]);
    }
  }
  window.Worker = TimedWorker as typeof Worker;

  const proto = WebGL2RenderingContext.prototype as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >;
  for (const name of ['drawElements', 'drawArrays']) {
    const original = proto[name];
    proto[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      const result = original.apply(this, args);
      if (
        current?.done != null &&
        current.firstFrame === null &&
        this.getParameter(this.FRAMEBUFFER_BINDING) === null
      ) {
        this.finish();
        current.firstFrame = performance.now();
      }
      return result;
    };
  }
}

/**
 * Memory a process actually costs. On macOS RSS undercounts badly — the kernel
 * compresses idle pages, so a 300 MB voxel buffer can "use" less than that — so
 * the physical footprint (what Activity Monitor shows) is read instead.
 */
function processBytes(pid: number): number {
  if (process.platform === 'darwin') {
    const out = execFileSync('footprint', ['-p', String(pid), '-f', 'bytes']).toString();
    const match = out.match(/Footprint:\s*(\d+)\s*B/);
    if (match) return Number(match[1]);
  }
  return (
    Number(
      execFileSync('ps', ['-o', 'rss=', '-p', String(pid)])
        .toString()
        .trim(),
    ) * 1024
  );
}

async function processMemory(browser: Browser): Promise<Record<string, number>> {
  const cdp = await browser.newBrowserCDPSession();
  const { processInfo } = (await cdp.send('SystemInfo.getProcessInfo')) as {
    processInfo: { type: string; id: number }[];
  };
  await cdp.detach();
  const byType: Record<string, number> = {};
  for (const p of processInfo) {
    try {
      byType[p.type] = (byType[p.type] ?? 0) + processBytes(p.id);
    } catch {
      /* process exited between the two calls */
    }
  }
  return byType;
}

const execFileAsync = promisify(execFile);

async function processBytesAsync(pid: number): Promise<number> {
  if (process.platform === 'darwin') {
    const { stdout } = await execFileAsync('footprint', ['-p', String(pid), '-f', 'bytes']);
    const match = stdout.match(/Footprint:\s*(\d+)\s*B/);
    if (match) return Number(match[1]);
  }
  const { stdout } = await execFileAsync('ps', ['-o', 'rss=', '-p', String(pid)]);
  return Number(stdout.trim()) * 1024;
}

async function rendererPids(browser: Browser): Promise<number[]> {
  const cdp = await browser.newBrowserCDPSession();
  const { processInfo } = (await cdp.send('SystemInfo.getProcessInfo')) as {
    processInfo: { type: string; id: number }[];
  };
  await cdp.detach();
  return processInfo.filter((p) => p.type === 'renderer').map((p) => p.id);
}

/**
 * Samples the renderer footprint until stopped and reports the highest value.
 * Transient copies (decompression buffers, the IndexedDB cache write) are gone
 * by the time the settled reading is taken, so only a peak shows them.
 */
function samplePeak(pids: number[]) {
  let peak = 0;
  let running = true;
  const loop = (async () => {
    while (running) {
      let total = 0;
      for (const pid of pids) {
        total += await processBytesAsync(pid).catch(() => 0);
      }
      peak = Math.max(peak, total);
      await new Promise((r) => setTimeout(r, 50));
    }
  })();
  return async () => {
    running = false;
    await loop;
    return peak;
  };
}

async function jsHeapAfterGc(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
  await cdp.detach();
  return usedSize;
}

const mb = (bytes: number) => Math.round(bytes / 1e5) / 10;
const ms = (a: number | null | undefined, b: number | null | undefined) =>
  a != null && b != null ? Math.round(b - a) : null;

test('load timings and memory', async ({ page, browser }) => {
  await page.addInitScript(instrument);
  await page.goto('/');

  const env = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown',
      cores: navigator.hardwareConcurrency,
      memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    };
  });

  const rows = [];
  for (const [i, file] of SEQUENCE.entries()) {
    if (i > 0) await backToImport(page);
    const stopSampling = samplePeak(await rendererPids(browser));
    await openFile(page, examplePath(file));

    // The first frame is drawn on the next animation frame after mount, and
    // the IndexedDB cache write runs after that — let both finish.
    await page.waitForFunction(
      () => {
        const loads = (window as unknown as { __refPerf: LoadMarks[] }).__refPerf;
        return loads.at(-1)?.firstFrame != null;
      },
      undefined,
      { timeout: 300_000 },
    );
    await page.waitForTimeout(3_000);
    const peak = await stopSampling();

    const marks = (await page.evaluate(() =>
      (window as unknown as { __refPerf: LoadMarks[] }).__refPerf.at(-1),
    )) as LoadMarks;
    const s = marks.stages;
    const heap = await jsHeapAfterGc(page);
    const memory = await processMemory(browser);

    rows.push({
      file,
      workerMs: ms(marks.start, marks.done),
      readMs: ms(s['reading-files'], s.assembling),
      assembleMs: ms(s.assembling, s['preparing-3d']),
      prepare3dMs: ms(s['preparing-3d'], marks.done),
      doneToFirstFrameMs: ms(marks.done, marks.firstFrame),
      totalToFirstFrameMs: ms(marks.start, marks.firstFrame),
      jsHeapMb: mb(heap),
      rendererMb: mb(memory.renderer ?? 0),
      peakRendererMb: mb(peak),
      gpuMb: mb(memory.GPU ?? memory.gpu ?? 0),
      error: marks.error,
    });
  }

  console.table(rows);
  const outDir = path.join(here, 'out');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, `perf-${LABEL}.json`),
    JSON.stringify({ label: LABEL, date: new Date().toISOString(), env, rows }, null, 2),
  );
});

/**
 * Main-thread cost of one W/L slider tick: React render + commit for a single
 * `input` event on the Window slider, as a user drag fires them. The slider
 * drives the 3-D contrast live, so this is paid on every pointer move.
 */
test('window/level drag cost', async ({ page }) => {
  await page.goto('/');
  await openFile(page, examplePath('maxillofacial_CBCT.nrrd'));

  const perTickMs = await page
    .locator('input.wl-slider')
    .first()
    .evaluate((input: HTMLInputElement) => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      const min = Number(input.min);
      const max = Number(input.max);
      const samples: number[] = [];
      for (let i = 0; i < 300; i++) {
        const t = performance.now();
        setValue?.call(input, String(min + ((max - min) * (i % 100)) / 100));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        samples.push(performance.now() - t);
      }
      samples.sort((a, b) => a - b);
      return { median: samples[150], p90: samples[270] };
    });

  console.log(
    `W/L tick: median ${perTickMs.median.toFixed(2)} ms, p90 ${perTickMs.p90.toFixed(2)} ms`,
  );
  const outDir = path.join(here, 'out');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, `wl-${LABEL}.json`), JSON.stringify(perTickMs));
});

/**
 * Cold load of the import screen — what a first visit costs before any volume
 * is chosen. CPU is throttled 4× (a mid-range laptop); each run gets a fresh
 * context, so nothing is cached. Reports the median of five runs.
 */
test('import screen cold load', async ({ browser }) => {
  const runs: { lcpMs: number; scriptKb: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto('/');
    await page.getByRole('button', { name: /^Open file/ }).waitFor();
    runs.push(
      await page.evaluate(
        () =>
          new Promise<{ lcpMs: number; scriptKb: number }>((resolve) => {
            new PerformanceObserver((list) => {
              const lcp = list.getEntries().at(-1)?.startTime ?? Number.NaN;
              const scripts = performance
                .getEntriesByType('resource')
                .filter((r) => (r as PerformanceResourceTiming).initiatorType === 'script');
              const bytes = scripts.reduce(
                (n, r) => n + (r as PerformanceResourceTiming).encodedBodySize,
                0,
              );
              resolve({ lcpMs: Math.round(lcp), scriptKb: Math.round(bytes / 1024) });
            }).observe({ type: 'largest-contentful-paint', buffered: true });
          }),
      ),
    );
    await context.close();
  }
  runs.sort((a, b) => a.lcpMs - b.lcpMs);
  const median = runs[2];
  console.log(`Import screen: LCP ${median.lcpMs} ms, initial script ${median.scriptKb} KB`);
  const outDir = path.join(here, 'out');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, `import-${LABEL}.json`), JSON.stringify({ runs, median }));
});
