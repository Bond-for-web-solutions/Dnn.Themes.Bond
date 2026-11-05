// CSS isolation guarantees, measured in a real browser against DNN's real
// default.css (docs/css-architecture.md#guarantees):
//  G1  A theme does not change the box model of DNN core module UI.
//  G2  Shared components survive DNN default.css (a:visited, element resets).
//  G3  Shared components win ties against sloppy third-party module CSS.
//  G4  Layout bundles only load (and only apply) on their own layout.
//  G5  Pages render without console errors or failed requests.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const themes = fs.readdirSync(path.join(root, 'themes')).filter((t) => fs.existsSync(path.join(root, 'themes', t, 'tests', 'fixtures', 'admin.html')));

// Layout-affecting properties that a theme must not change on DNN's own UI.
// Inherited typography (font-family, color) is expected to follow the theme.
const BOX = ['display', 'position', 'float', 'clear', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderTopStyle', 'borderLeftWidth',
  'borderTopLeftRadius', 'listStyleType', 'textDecorationLine', 'fontSize', 'fontWeight', 'textTransform',
  'visibility', 'opacity', 'verticalAlign', 'cursor'];

async function snapshotStyles(page, selector, props) {
  return page.$$eval(selector, (els, ps) => els.map((el) => {
    const cs = getComputedStyle(el);
    return { el: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`, ...Object.fromEntries(ps.map((p) => [p, cs[p]])) };
  }), props);
}

for (const theme of themes) {
  test(`G1 ${theme}: DNN core module UI keeps its box model`, async ({ page }) => {
    const sel = '#dnn-admin-form, #dnn-admin-form *';
    await page.goto(`/blank/${theme}/admin`);
    const before = await snapshotStyles(page, sel, BOX);
    await page.goto(`/fixture/${theme}/admin`);
    const after = await snapshotStyles(page, sel, BOX);
    const diffs = [];
    before.forEach((b, i) => {
      for (const p of BOX) if (b[p] !== after[i][p]) diffs.push(`${b.el} ${p}: ${b[p]} -> ${after[i][p]}`);
    });
    expect(diffs, `Theme CSS changed DNN core UI:\n${diffs.join('\n')}`).toEqual([]);
  });
}

test('G2 bond: components survive DNN default.css (visited links, heading margins)', async ({ page, context }) => {
  await page.goto('/fixture/bond/default');
  // Make every link "visited" for this origin by navigating to the anchors first.
  for (const h of ['#cta', '#inline', '#home', '#about']) await page.goto(`/fixture/bond/default${h}`);
  await page.goto('/fixture/bond/default');
  const btn = page.locator('.Normal a.bond-button');
  await expect(btn).toHaveCSS('text-decoration-line', 'none');
  await expect(btn).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('.bond-nav-link.is-selected').first()).toHaveCSS('text-decoration-line', 'none');
  await expect(page.locator('.bond-footer__link').nth(1)).toHaveCSS('color', 'rgb(107, 98, 86)');
  await context.clearCookies();
});

test('G3 bond: shared components win ties against third-party module CSS', async ({ page }) => {
  await page.goto('/fixture/bond/default?module=hostile');
  const link = page.locator('.Normal a.bond-button');
  await expect(link).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(link).toHaveCSS('text-decoration-line', 'none');
  const button = page.locator('.Normal button.bond-button');
  await expect(button).not.toHaveCSS('background-color', 'rgb(0, 128, 0)');
  await expect(button).not.toHaveCSS('border-top-left-radius', '0px');
  // The hostile rule still applies to plain module links - the theme does not fight module CSS globally.
  await expect(page.locator('.Normal a[href="#inline"]')).toHaveCSS('color', 'rgb(255, 0, 0)');
});

test('G3 bond: auth card inputs win ties against module CSS', async ({ page }) => {
  await page.goto('/fixture/bond/login?module=hostile');
  const input = page.locator('.bond-auth .bond-field__input').first();
  await expect(input).toBeVisible();
  await expect(input).not.toHaveCSS('border-top-style', 'dashed');
  const w = await input.evaluate((el) => el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width);
  expect(w).toBeGreaterThan(0.99);
});

test('G4 layout bundles load only on their own layout', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await page.goto('/fixture/dzp/default');
  expect(requests.some((p) => p.endsWith('/dashboard.css'))).toBe(false);
  expect(requests.some((p) => p.endsWith('/dashboard.js'))).toBe(false);
  requests.length = 0;
  await page.goto('/fixture/dzp/dashboard');
  expect(requests.some((p) => p.endsWith('/dashboard.css'))).toBe(true);
  expect(requests.some((p) => p.endsWith('/dashboard.js'))).toBe(true);
  await page.goto('/fixture/bond/default');
  // splash.css is not loaded on default pages, and skin.css alone does not style splash markup.
  const hasSplashRule = await page.evaluate(() => [...document.styleSheets].some((s) => {
    try { return [...s.cssRules].some((r) => r.selectorText && r.selectorText.includes('bond-splash')); } catch { return false; }
  }));
  expect(hasSplashRule).toBe(false);
});

for (const [theme, name] of [['bond', 'default'], ['bond', 'login'], ['bond', 'splash'], ['dzp', 'default'], ['dzp', 'dashboard'], ['dzp', 'splash']]) {
  test(`G5 ${theme}/${name}: no console errors or failed requests`, async ({ page }) => {
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`); });
    await page.goto(`/fixture/${theme}/${name}`);
    await page.evaluate(async () => { await document.fonts.ready; });
    expect(problems).toEqual([]);
  });
}

// The shared splash (@bond/splash) reads none of the theme's tokens: it must
// render identically under every theme's skin.css.
test('shared splash looks the same in every theme', async ({ page }) => {
  const PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundImage', 'marginTop', 'marginBottom',
    'paddingTop', 'paddingLeft', 'width', 'height', 'maxWidth', 'gap', 'borderTopLeftRadius'];
  const SELECTORS = ['.bond-splash', '.bond-splash__inner', '.bond-splash__logo', '.bond-splash__title', '.bond-splash__text', '.bond-splash__rule',
    '.bond-splash__footer', '.bond-splash__link'];
  const read = async (theme) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/fixture/${theme}/splash`);
    await page.evaluate(async () => { await document.fonts.ready; });
    return page.evaluate(({ props, selectors }) => Object.fromEntries(selectors.map((s) => {
      const el = document.querySelector(s); const cs = getComputedStyle(el); const box = el.getBoundingClientRect();
      // The logo URL differs only by the theme's own skin folder.
      return [s, { ...Object.fromEntries(props.map((p) => [p, p === 'backgroundImage' ? cs[p].replace(/^.*\/resources\//, '') : cs[p]])), box: [box.x, box.y, box.width, box.height].map(Math.round) }];
    })), { props: PROPS, selectors: SELECTORS });
  };
  expect(await read('dzp')).toEqual(await read('bond'));
});
