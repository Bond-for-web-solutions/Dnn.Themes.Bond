// End-to-end tests against a REAL local DNN site (opt-in). Nothing here runs
// unless BOND_E2E_BASE_URL is set; it never runs in CI by default.
//
// Settings come from the shell or from themes.<theme>.e2e in .env.json in the repo
// root (git-ignored; copy .env.example.json). Shell variables win over the file.
// See settings.mjs for every key. BOND_E2E_BUNDLED uses Playwright's Chromium:
// a Chrome policy/extension can block *.dnndev.me (ERR_BLOCKED_BY_CLIENT).
import { defineConfig, devices } from '@playwright/test';
import './settings.mjs';

// A trace records every typed value, the password included: no traces when one is set.
const hasPassword = Boolean(process.env.BOND_E2E_PASSWORD);

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.e2e\.mjs$/,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.BOND_E2E_BASE_URL,
    trace: hasPassword ? 'off' : 'retain-on-failure',
    ...(process.env.CI || process.env.BOND_E2E_BUNDLED ? {} : { channel: 'chrome' }),
  },
  projects: [{ name: 'dnn', use: { ...devices['Desktop Chrome'] } }],
});
