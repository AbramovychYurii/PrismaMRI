import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',

  // Per-test timeout.
  timeout: 60_000,

  // Assertion timeout (expect().toBeVisible(), etc.).
  expect: {
    timeout: 15_000,
  },

  // Run specs sequentially — WebGL context and shared preview server benefit
  // from serial execution.
  fullyParallel: false,
  workers: 1,

  // One retry in CI to absorb flaky WebGL timing.
  retries: process.env.CI ? 1 : 0,

  reporter: process.env.CI
    ? [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']]
    : [['list']],

  use: {
    baseURL: 'http://localhost:4173',
    // Collect trace on first retry so failures are inspectable in CI.
    trace: 'on-first-retry',
    // Give CI headless Chromium a larger viewport so layouts render correctly.
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Build the app once then serve it for all tests.  In local dev the server is
  // reused if already running (reuseExistingServer: true).
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
