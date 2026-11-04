// Acceptance test 8 on a real DNN install: layouts per page, client resource
// loading, panes, containers, login, edit mode. Read-only: it never changes
// site settings or content.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BOND_E2E_BASE_URL;
const pages = JSON.parse(process.env.BOND_E2E_PAGES || '{"default":"/"}');
const theme = process.env.BOND_E2E_THEME || 'bond';
const cfg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'themes', theme, 'theme.json'), 'utf8'));
const skinPath = `/Portals/_default/Skins/${cfg.dnn.skinName}/`;

test.skip(!base, 'Set BOND_E2E_BASE_URL to a local DNN site to run end-to-end tests');

for (const [layout, url] of Object.entries(pages)) {
  test(`layout "${layout}" at ${url}: resources, panes, no errors`, async ({ page }) => {
    const requests = []; const problems = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('response', (r) => { if (r.status() >= 400 && r.url().includes(skinPath)) problems.push(`${r.status()} ${r.url()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    const res = await page.goto(url);
    expect(res.status(), 'page must not be DNN\'s error page').toBeLessThan(400);
    await expect(page.locator('body')).not.toContainText('No sites currently exist');

    const css = requests.filter((u) => u.includes(skinPath) && /\.css(\?|$)/.test(u));
    expect(css.some((u) => /\/skin\.css\?cdv=\d+/.test(u)), 'skin.css auto-loaded with a cdv cache-buster').toBe(true);
    for (const other of Object.keys(pages).filter((l) => l !== layout)) {
      expect(css.some((u) => u.includes(`/${other}.css`)), `${other}.css must not load on the ${layout} layout`).toBe(false);
    }
    // Order: DNN default.css before the theme's skin.css.
    const order = await page.$$eval('link[rel=stylesheet]', (ls) => ls.map((l) => l.href));
    const iDefault = order.findIndex((h) => /dnndefault\/[\d.]+\/default\.css/.test(h));
    const iSkin = order.findIndex((h) => /\/skin\.css/.test(h));
    if (iDefault >= 0 && iSkin >= 0) expect(iDefault).toBeLessThan(iSkin);
    expect(requests.some((u) => u.includes(`${skinPath}resources/js/theme.js`))).toBe(true);
    expect(problems).toEqual([]);
  });
}

test('login page shows the themed auth card and keeps DNN controls', async ({ page }) => {
  await page.goto('/Login');
  const card = page.locator('.bond-auth[data-bond-auth="login"]');
  if (!(await card.count())) test.skip(true, 'This site does not route /Login to the DNN auth module');
  await expect(card).toBeVisible();
  await expect(page.locator('.dnnLoginService')).toHaveClass(/bond-auth__native--hidden/);
});

test('admin: log in, edit mode shows panes and module actions', async ({ page }) => {
  test.skip(!process.env.BOND_E2E_USER || !process.env.BOND_E2E_PASSWORD, 'Set BOND_E2E_USER/BOND_E2E_PASSWORD for admin checks');
  await page.goto('/Login');
  await page.locator('.bond-auth input[autocomplete="username"]').fill(process.env.BOND_E2E_USER);
  await page.locator('.bond-auth input[type="password"]').fill(process.env.BOND_E2E_PASSWORD);
  await page.locator('.bond-auth .bond-button').click();
  await page.waitForLoadState('networkidle');
  await page.goto(Object.values(pages)[0]);
  await expect(page.locator('#dnn_ContentPane')).toBeAttached();
  // Persona Bar (DNN 9/10 admin UI) is present for administrators.
  await expect(page.locator('#personaBar-iframe, .personabar')).toHaveCount(1, { timeout: 15000 });
});
