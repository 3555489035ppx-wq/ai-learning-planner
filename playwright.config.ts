import { defineConfig, devices } from '@playwright/test'

const usesExternalServer = process.env.PW_EXTERNAL_SERVER === '1'
const browserChannel = process.env.PW_CHANNEL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    ...(browserChannel ? { channel: browserChannel } : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: usesExternalServer ? undefined : {
    // Invoke Vite directly: on Windows, `pnpm dev` can leave its child process
    // attached after Playwright finishes, which prevents the E2E command from exiting.
    command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
