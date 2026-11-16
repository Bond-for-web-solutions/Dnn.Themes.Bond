// Log in to / out of the real DNN site for the signed-in e2e tests.
// Credentials only from the environment (themes.<theme>.e2e in .env.json, git-ignored); never logged.
import { expect } from '@playwright/test';

export const credentials = {
  user: process.env.BOND_E2E_USER || '',
  password: process.env.BOND_E2E_PASSWORD || '',
  loginPath: process.env.BOND_E2E_LOGIN_PATH || '/Login',
};
export const hasCredentials = Boolean(credentials.user && credentials.password);

/** Signed in = DNN serves the Persona Bar (admins/editors) or a logout link. */
export async function isLoggedIn(page) {
  return page.evaluate(() => Boolean(document.querySelector('#personaBar-iframe, .personabar, a[href*="/Logoff"], a[href*="ctl/logoff" i]')));
}

/** Log in through the site's own DNN login form and return to `returnTo`. */
export async function login(page, returnTo = '/') {
  await page.goto(`${credentials.loginPath}?returnurl=${encodeURIComponent(returnTo)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const user = page.locator('input[id$="_txtUsername"], .bond-auth input[autocomplete="username"]').first();
  const pass = page.locator('input[id$="_txtPassword"], .bond-auth input[type="password"]').first();
  await expect(user, 'login form on ' + credentials.loginPath).toBeVisible({ timeout: 30000 });
  await user.fill(credentials.user);
  await pass.fill(credentials.password);
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.locator('[id$="_cmdLogin"], .bond-auth .bond-button').first().click(),
  ]);
  await page.waitForLoadState('networkidle', { timeout: 90000 });
  // A failed login stays on the login form with a DNN message.
  const error = await page.locator('.dnnFormMessage.dnnFormValidationSummary, .dnnFormError').first().textContent({ timeout: 1000 }).catch(() => null);
  if (!(await isLoggedIn(page))) throw new Error(`Login failed${error ? `: ${error.trim()}` : ''} (check themes.<theme>.e2e.login.user/password in .env.json)`);
}

/** Log out the DNN way (?ctl=Logoff on any page) and verify the visitor view. */
export async function logout(page) {
  await page.goto('/Default.aspx?ctl=Logoff', { waitUntil: 'networkidle', timeout: 90000 });
  await page.goto('/', { waitUntil: 'networkidle', timeout: 90000 });
  if (await isLoggedIn(page)) throw new Error('Still signed in after logging out');
}
