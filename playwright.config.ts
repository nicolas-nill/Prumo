import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3200)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`

/**
 * Smoke tests against the in-memory demo mode (no Supabase, Meta or OpenAI needed).
 * Set PLAYWRIGHT_CHROMIUM_PATH to reuse a preinstalled Chromium instead of downloading one.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${port}`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { PRUMO_DEMO_MODE: 'on' },
      },
})
