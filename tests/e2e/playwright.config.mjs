// End-to-end tests against a REAL local DNN site (opt-in). Nothing here runs
// unless BOND_E2E_BASE_URL is set; it never runs in CI by default.
//
//   BOND_E2E_BASE_URL=http://mysite.dnndev.me
//   BOND_E2E_PAGES='{"default":"/","splash":"/splash"}'   # layout -> page path using it
//   BOND_E2E_THEME=bond                                   # theme under test
//   BOND_E2E_USER / BOND_E2E_PASSWORD                      # optional: admin checks (env only, never commit)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.e2e\.mjs$/,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.BOND_E2E_BASE_URL,
    trace: 'retain-on-failure',
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  projects: [{ name: 'dnn', use: { ...devices['Desktop Chrome'] } }],
});
