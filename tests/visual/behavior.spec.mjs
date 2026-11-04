// Runtime behaviour of theme JavaScript on DNN-shaped markup.
import { test, expect } from '@playwright/test';

test('auth card replaces DNN login form and drives the native controls', async ({ page }) => {
  await page.goto('/fixture/bond/login');
  const card = page.locator('.bond-auth[data-bond-auth="login"]');
  await expect(card).toBeVisible();
  await expect(card.locator('.bond-auth__title')).toHaveText('Welcome back');
  // Native form is visually hidden but still in the DOM for DNN's postback wiring.
  const native = page.locator('.dnnLoginService');
  await expect(native).toHaveClass(/bond-auth__native--hidden/);
  expect(await native.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);

  // Labels come from DNN (localised), inputs are labelled.
  await expect(card.getByLabel('Username:')).toBeVisible();
  await card.getByLabel('Username:').fill('host');
  await card.getByLabel('Password:').fill('s3cret');
  await expect(page.locator('#dnn_ctr412_Login_Login_DNN_txtUsername')).toHaveValue('host');
  await expect(page.locator('#dnn_ctr412_Login_Login_DNN_txtPassword')).toHaveValue('s3cret');
  await card.getByLabel('Remember Login').check();
  await expect(page.locator('#dnn_ctr412_Login_Login_DNN_chkCookie')).toBeChecked();

  // Submitting clicks DNN's own LinkButton (its href stands in for __doPostBack here).
  await card.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/#postback-login$/);
  await expect(card.getByRole('link', { name: 'Reset Password' })).toHaveAttribute('href', /ctl=SendPassword/);
});

test('auth card fails open when DNN renders controls it does not mirror (captcha)', async ({ page }) => {
  await page.route('**/fixture/bond/login', async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace('<div class="dnnFormItem"><span id="dnn_ctr412_Login_Login_DNN_lblLoginRememberMe"',
      '<div class="dnnFormItem dnnCaptcha"><img alt="captcha"><input type="text" id="dnn_ctr412_Login_Login_DNN_ctlCaptcha"></div><div class="dnnFormItem"><span id="dnn_ctr412_Login_Login_DNN_lblLoginRememberMe"');
    await route.fulfill({ response: res, body: html });
  });
  await page.goto('/fixture/bond/login');
  await expect(page.locator('.bond-auth')).toHaveCount(0);
  await expect(page.locator('#dnn_ctr412_Login_Login_DNN_ctlCaptcha')).toBeVisible();
  await expect(page.locator('#dnn_ctr412_Login_Login_DNN_txtUsername')).toBeVisible();
});

test('auth card: native form is removed from the tab order and accessibility tree', async ({ page }) => {
  await page.goto('/fixture/bond/login');
  await expect(page.locator('.dnnLoginService')).toBeHidden();
  expect(await page.locator('.dnnLoginService').evaluate((el) => el.hidden)).toBe(true);
});

test('auth card: Enter in the password field submits', async ({ page }) => {
  await page.goto('/fixture/bond/login');
  const card = page.locator('.bond-auth[data-bond-auth="login"]');
  await card.getByLabel('Password:').fill('x');
  await card.getByLabel('Password:').press('Enter');
  await expect(page).toHaveURL(/#postback-login$/);
});

test('auth card is rebuilt once per UpdatePanel partial postback', async ({ page }) => {
  // Stub ASP.NET AJAX's PageRequestManager so we can fire endRequest like DNN does.
  await page.addInitScript(() => {
    window.__endRequest = [];
    window.Sys = { WebForms: { PageRequestManager: { getInstance: () => ({ add_endRequest: (fn) => window.__endRequest.push(fn) }) } } };
  });
  await page.goto('/fixture/bond/login');
  expect(await page.evaluate(() => window.__endRequest.length)).toBeGreaterThan(0);
  await page.evaluate(() => { for (const fn of window.__endRequest) fn(); for (const fn of window.__endRequest) fn(); });
  await expect(page.locator('.bond-auth[data-bond-auth="login"]')).toHaveCount(1);
  await expect(page.locator('[data-bond-menu-toggle]')).toHaveAttribute('data-bond-ready', 'true');
});

test('mobile menu toggles with aria-expanded and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/fixture/bond/default');
  const toggle = page.getByRole('button', { name: 'Toggle navigation' });
  const menu = page.locator('#bond-mobile-menu');
  await expect(menu).toBeHidden();
  await toggle.click();
  await expect(menu).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('mobile menu closes when the viewport grows to desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/fixture/bond/default');
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('#bond-mobile-menu')).not.toHaveClass(/is-open/);
});

test('desktop submenu opens on keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/fixture/bond/default');
  const sub = page.locator('.bond-nav .bond-submenu--root').first();
  await expect(sub).toBeHidden();
  await page.locator('.bond-nav a[href="#services"]').focus();
  await expect(sub).toBeVisible();
});

test('dzp dashboard sidebar toggle (layout-specific script)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/fixture/dzp/dashboard');
  const toggle = page.getByRole('button', { name: 'Toggle sidebar' });
  await toggle.click();
  await expect(page.locator('[data-dzp-dashboard]')).toHaveClass(/is-collapsed/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('basic accessibility contract on every page fixture', async ({ page }) => {
  for (const url of ['/fixture/bond/default', '/fixture/bond/login', '/fixture/bond/splash', '/fixture/dzp/dashboard']) {
    await page.goto(url);
    const issues = await page.evaluate(() => {
      const out = [];
      for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) out.push(`img without alt: ${img.src.slice(0, 40)}`);
      for (const el of document.querySelectorAll('button, a[href]')) {
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim() || el.querySelector('img[alt]')?.alt;
        if (!name) out.push(`unnamed ${el.tagName}: ${el.outerHTML.slice(0, 60)}`);
      }
      for (const input of document.querySelectorAll('.bond-auth input')) {
        if (!input.labels || !input.labels.length) out.push(`unlabelled input ${input.id}`);
      }
      for (const nav of document.querySelectorAll('nav')) if (!nav.getAttribute('aria-label')) out.push('nav without aria-label');
      return out;
    });
    expect(issues, url).toEqual([]);
  }
});

test('splash ContentPane: hidden while empty, shown when it holds a module', async ({ page }) => {
  await page.goto('/fixture/bond/splash');
  const pane = page.locator('#dnn_ContentPane');
  await expect(pane).toBeHidden();
  await pane.evaluate((el) => { el.classList.remove('DNNEmptyPane'); el.innerHTML = '<div class="DnnModule"><p>Contact form</p></div>'; });
  await expect(pane).toBeVisible();
  await expect(pane).toHaveCSS('max-width', '440px');
});
