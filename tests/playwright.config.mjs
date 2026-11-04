// Visual regression + browser-level isolation/behaviour tests against fixture
// pages composed in DNN's stylesheet order (support/server.mjs).
// Real-DNN end-to-end tests live in e2e/ (separate config, opt-in).
// Paths here (and Playwright's webServer cwd) are relative to this tests/ folder.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.BOND_TEST_PORT || 4173);
const useSystemChrome = !process.env.CI && process.env.BOND_PLAYWRIGHT_BUNDLED !== '1';

export default defineConfig({
  testDir: 'visual',
  globalSetup: './support/global-setup.mjs',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  // Baselines are per OS + browser build; never compare Windows pixels with Linux pixels.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}{/projectName}/{testFilePath}/{arg}{ext}',
  expect: {
    // Absolute budget, not a ratio: a ratio on a full page hides small component changes.
    toHaveScreenshot: { maxDiffPixels: 20, threshold: 0.15, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: useSystemChrome ? 'chrome' : 'chromium', use: { ...devices['Desktop Chrome'], ...(useSystemChrome ? { channel: 'chrome' } : {}) } },
  ],
  webServer: {
    command: 'node support/server.mjs',
    url: `http://127.0.0.1:${PORT}/dnn/default.css`,
    reuseExistingServer: !process.env.CI,
    env: { BOND_TEST_PORT: String(PORT) },
  },
});
