import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/**
 * End-to-end tests drive a real browser through the real app (production build, throw-away in-memory database).
 *   npx playwright install chromium      (once)
 *   npm run build && npm run test:e2e
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // the tests share one database, so they run one after another
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Only for machines where Playwright's own browser cannot be installed.
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: process.env.PW_CHROMIUM_ARGS ? process.env.PW_CHROMIUM_ARGS.split(' ') : undefined,
    },
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      SWAMI_MEMORY_DB: '1',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'E2E-Password-1',
      AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123456',
      SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
    },
  },
});
