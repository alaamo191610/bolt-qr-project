import { defineConfig, devices } from '@playwright/test';

// The "golden" E2E suite: no network mocking anywhere. It runs the real
// server/index.js against a disposable Postgres database, seeded by
// tests/e2e-golden/globalSetup.ts, and the real Vite dev server pointed at
// it, proving the actual QR capability -> session -> order integration end
// to end. Kept separate from playwright.config.ts (which stays fast and
// mocked) because this suite needs a live PostgreSQL and takes materially
// longer.
//
// The backend is started/stopped from globalSetup's returned teardown
// function rather than a webServer entry: a live Socket.IO connection can
// keep an http.Server's close() waiting past a cross-process teardown
// signal's window, and an in-process function call is the one thing here
// that must reliably run (it drops the disposable database).
const GOLDEN_API_PORT = 3901;
const GOLDEN_WEB_PORT = 4180;

export default defineConfig({
  testDir: './tests/e2e-golden',
  globalSetup: './tests/e2e-golden/globalSetup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${GOLDEN_WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${GOLDEN_WEB_PORT}`,
    url: `http://127.0.0.1:${GOLDEN_WEB_PORT}`,
    env: { VITE_API_URL: `http://127.0.0.1:${GOLDEN_API_PORT}/api` },
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
