// Signed-in checks on the REAL local site (opt-in): needs themes.<theme>.e2e.login.user and
// .password in .env.json (git-ignored). Read-only: nothing is saved.
//   1. log in, log out, log in again (the session really ends and starts again)
//   2. every page on the new theme renders for an editor: Persona Bar, 2sxc edit
//      toolbars on the content, no JavaScript errors, no failed theme files;
//      a screenshot per page goes to tests/test-results/huisstijl-admin/ for review
//   3. DNN edit mode on /bond-huisstijl: panes and module action menus appear
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { hasCredentials, isLoggedIn, login, logout } from './auth.mjs';

const base = process.env.BOND_E2E_BASE_URL;
const pages = JSON.parse(process.env.BOND_E2E_HUISSTIJL_PAGES || JSON.stringify({
  huisstijl: '/bond-huisstijl', 'over-bond': '/over-bond', community: '/community', electrolux: '/werk/electrolux', kennis: '/kennis',
}));
const shots = path.resolve(import.meta.dirname, '..', 'test-results', 'huisstijl-admin');

test.skip(!base, 'Set BOND_E2E_BASE_URL (or themes.<theme>.e2e.baseUrl in .env.json) to a local DNN site');
test.skip(!hasCredentials, 'Fill themes.<theme>.e2e.login.user and .password in .env.json for the signed-in tests');
test.describe.configure({ mode: 'serial', timeout: 180000 });
test.use({ viewport: { width: 1440, height: 900 } });

const blockConsent = (page) => page.route(/usercentrics/, (r) => r.abort());

test('log in, log out and log in again', async ({ page }) => {
  await blockConsent(page);
  await login(page, '/bond-huisstijl');
  expect(await isLoggedIn(page), 'signed in after the first login').toBe(true);
  await expect(page.locator('.bond-header')).toBeVisible();

  await logout(page);
  await page.goto('/bond-huisstijl', { waitUntil: 'networkidle', timeout: 90000 });
  expect(await isLoggedIn(page), 'visitor view after logout').toBe(false);
  await expect(page.locator('#personaBar-iframe')).toHaveCount(0);
  await expect(page.locator('.bond-footer__meta-link', { hasText: 'Inloggen' })).toBeVisible();

  await login(page, '/bond-huisstijl');
  expect(await isLoggedIn(page), 'signed in again').toBe(true);
  await expect(page).toHaveURL(/bond-huisstijl/);
});

for (const [name, url] of Object.entries(pages)) {
  test(`signed in: ${name} renders for an editor`, async ({ page }) => {
    await blockConsent(page);
    const errors = []; const failed = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { if (r.status() >= 400 && /\/Portals\/_default\/(Skins|Containers)\//.test(r.url())) failed.push(`${r.status()} ${r.url()}`); });
    await login(page, url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await expect(page.locator('.bond-header')).toBeVisible();
    await expect(page.locator('main.bond-pagina')).toBeAttached();
    await expect(page.locator('#personaBar-iframe'), 'Persona Bar for an editor').toHaveCount(1, { timeout: 30000 });
    // 2sxc marks editable blocks for editors (data-edit-context); visitors never get it.
    const editable = await page.locator('[data-edit-context]').count();
    const sxcBlocks = await page.locator('.sc-content-block').count();
    if (sxcBlocks) expect(editable, '2sxc edit context on the content').toBeGreaterThan(0);
    // The header stays usable next to the Persona Bar (not covered, not overflowing).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no horizontal overflow when signed in').toBeLessThanOrEqual(1);
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, `${name}-signed-in.png`), fullPage: true });
    expect(errors, 'JavaScript errors when signed in').toEqual([]);
    expect(failed, 'theme files that failed to load').toEqual([]);
  });
}

test('edit mode on /bond-huisstijl shows panes and module actions', async ({ page }) => {
  await blockConsent(page);
  await login(page, '/bond-huisstijl');
  // DNN 10 edit mode via the query string the Persona Bar "Edit page" button uses.
  await page.goto('/bond-huisstijl?editmode=true', { waitUntil: 'networkidle', timeout: 90000 });
  const inEdit = await page.evaluate(() => document.body.classList.contains('dnnEditState') || Boolean(document.querySelector('.dnnEditState, .actionMenu, .dnn_mact')));
  test.skip(!inEdit, 'Edit mode could not be switched on from the URL on this site; switch it on in the Persona Bar and check by hand');
  await expect(page.locator('.actionMenu, .dnn_mact').first()).toBeAttached();
  for (const pane of ['HeaderPane', 'BannerPane', 'ContentPane', 'BottonPane']) await expect(page.locator(`#dnn_${pane}`)).toBeAttached();
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, 'huisstijl-edit-mode.png'), fullPage: true });
  await page.goto('/bond-huisstijl?editmode=false', { waitUntil: 'networkidle', timeout: 90000 });
});
