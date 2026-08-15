import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'REAL_E2E_PORT=3100 REAL_E2E_FIXTURE=/tmp/bolt-qr-real-backend-fixture.json node tests/e2e/real-backend-server.js',
      url: 'http://127.0.0.1:3100/api/health/live',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'VITE_API_URL=http://127.0.0.1:3100/api npm run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
