// Huisstijl 2027 on a REAL local DNN site (opt-in, read-only): the "pagina"
// layout pilot and the /bond-huisstijl reference page at eight viewports.
//
//   BOND_E2E_BASE_URL=http://bondforwebsolutions.dnndev.me pnpm test:e2e
//   BOND_E2E_HUISSTIJL_PAGES='{"huisstijl":"/bond-huisstijl","over-bond":"/over-bond"}'  (optional)
//
// Per page and viewport: HTTP status, JS errors, failed requests, horizontal
// overflow, font, brand colours, header behaviour and a full-page screenshot
// (baseline per platform in huisstijl.e2e.mjs-snapshots/, reviewed by a person
// before it is accepted). Plus functional checks (menu, dropdown, skip link,
// form validation, focus, touch targets, reduced motion) and axe WCAG 2.2 AA.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BOND_E2E_BASE_URL;
const pages = JSON.parse(process.env.BOND_E2E_HUISSTIJL_PAGES || JSON.stringify({
  huisstijl: '/bond-huisstijl',
  'over-bond': '/over-bond',
  community: '/community',
  electrolux: '/werk/electrolux',
  kennis: '/kennis',
}));
const viewports = {
  'desktop-1920': { width: 1920, height: 1080 },
  'laptop-1440': { width: 1440, height: 900 },
  'laptop-1280': { width: 1280, height: 800 },
  'tablet-1024': { width: 1024, height: 768 },
  'tablet-768': { width: 768, height: 1024 },
  'mobile-430': { width: 430, height: 932 },
  'mobile-390': { width: 390, height: 844 },
  'mobile-320': { width: 320, height: 568 },
};
const PAPIER = 'rgb(251, 246, 241)';
const INKT = 'rgb(56, 62, 66)';
const reportDir = path.resolve(import.meta.dirname, '..', 'test-results', 'huisstijl');

test.skip(!base, 'Set BOND_E2E_BASE_URL to a local DNN site to run end-to-end tests');
// A real DNN site needs a minute or more after a deploy or app restart (cold
// start: compilation, caches); the margins below are for that, not for slow pages.
test.describe.configure({ mode: 'parallel', timeout: 120000 });

// The site's cookie banner (Usercentrics, loaded by the site, not the theme)
// traps focus and covers the page; the theme tests run without it.
const blockConsent = (page) => page.route(/usercentrics/, (r) => r.abort());

/** Load a page, collecting JS errors, console errors and failed requests. */
async function open(page, url) {
  await blockConsent(page);
  const problems = { pageErrors: [], consoleErrors: [], failed: [] };
  page.on('pageerror', (e) => problems.pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.consoleErrors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) problems.failed.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => problems.failed.push(`failed ${r.url()} (${r.failure()?.errorText})`));
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  return { res, problems };
}

for (const [name, url] of Object.entries(pages)) {
  for (const [vp, size] of Object.entries(viewports)) {
    test(`${name} @ ${vp}: renders in the huisstijl without overflow or errors`, async ({ page }) => {
      await page.setViewportSize(size);
      const { res, problems } = await open(page, url);
      expect(res.status(), 'HTTP status').toBeLessThan(400);
      await expect(page.locator('.bond-header')).toBeVisible();
      await expect(page.locator('main.bond-pagina')).toBeAttached();

      // No horizontal scroll at this width.
      const overflow = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll('body *')].filter((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || getComputedStyle(el).position === 'fixed') return false;
          let p = el.parentElement;
          while (p) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip') return false; p = p.parentElement; }
          return r.right > w + 1;
        }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(el.getBoundingClientRect().right)}`);
        return { scroll: document.documentElement.scrollWidth - w, wide };
      });
      // The menu fits on one line (no wrapped nav items), the header button too.
      const header = await page.evaluate(() => {
        const items = [...document.querySelectorAll('.bond-nav .bond-menu--root > .bond-menu__item')].filter((e) => e.offsetParent);
        const tops = new Set(items.map((e) => Math.round(e.getBoundingClientRect().top)));
        const cta = document.querySelector('.bond-header__cta');
        return { navRows: tops.size, ctaH: cta && cta.offsetParent ? cta.getBoundingClientRect().height : 0 };
      });
      expect(header.navRows, 'desktop menu on one line').toBeLessThanOrEqual(1);
      expect(header.ctaH, 'header button on one line').toBeLessThanOrEqual(46);
      // Text never runs over the kleurvlakken (brandbook): no heading or lead overlaps a block.
      const overBlock = await page.evaluate(() => [...document.querySelectorAll('.bond-vlakken')].flatMap((s) => {
        const blockLeft = s.getBoundingClientRect().right - parseFloat(getComputedStyle(s, '::before').width) - parseFloat(getComputedStyle(s, '::after').width);
        const blockBottom = s.getBoundingClientRect().top + parseFloat(getComputedStyle(s, '::before').height);
        return [...s.querySelectorAll('h1, h2, .bond-label, .bond-lead')].filter((t) => { const r = t.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(t); const tr = range.getBoundingClientRect(); return tr.right > blockLeft + 1 && r.top < blockBottom; }).map((t) => t.textContent.trim().slice(0, 40));
      }));
      expect(overBlock, 'text over a kleurvlak').toEqual([]);
      expect(overflow.scroll, `horizontal overflow; widest: ${overflow.wide.join(', ')}`).toBeLessThanOrEqual(1);

      // Brand basics: papier page, antraciet text, Museo Sans loaded.
      const look = await page.evaluate(() => {
        const cs = (s) => (document.querySelector(s) ? getComputedStyle(document.querySelector(s)) : null);
        return {
          bodyBg: cs('body').backgroundColor,
          bodyColor: cs('body').color,
          headerBg: cs('.bond-header__main')?.backgroundColor,
          font: document.fonts.check('300 16px museo-sans') || document.fonts.check('300 16px MuseoSans'),
          h1: cs('main h1') ? { color: cs('main h1').color, weight: cs('main h1').fontWeight } : null,
        };
      });
      expect(look.bodyBg).toBe(PAPIER);
      expect(look.bodyColor).toBe(INKT);
      expect(look.headerBg).toBe(PAPIER);
      expect(look.font, 'Museo Sans (Adobe kit or theme fallback) is loaded').toBe(true);
      if (look.h1) expect(look.h1.weight).toBe('700');

      // Header: hamburger below 1200px, inline menu from 1200px (--bond-nav-wide).
      if (size.width < 1200) {
        await expect(page.locator('.bond-hamburger')).toBeVisible();
        await expect(page.locator('.bond-nav')).toBeHidden();
      } else {
        await expect(page.locator('.bond-nav')).toBeVisible();
        await expect(page.locator('.bond-hamburger')).toBeHidden();
      }

      expect(problems.pageErrors, 'uncaught JavaScript errors').toEqual([]);
      problems.failed = problems.failed.filter((f) => !/usercentrics/.test(f));
      const ownFailures = problems.failed.filter((f) => f.includes('/Portals/_default/Skins/') || f.includes('/Portals/_default/Containers/'));
      expect(ownFailures, 'theme files that failed to load').toEqual([]);
      fs.mkdirSync(reportDir, { recursive: true });
      fs.writeFileSync(path.join(reportDir, `${name}-${vp}.json`), JSON.stringify({ url, size, overflow, look, problems }, null, 2));

      // Lazy images below the fold load only on scroll; load them for the full-page shot.
      await page.evaluate(async () => { for (const i of document.querySelectorAll('img[loading=lazy]')) i.loading = 'eager'; await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))); });
      await expect(page).toHaveScreenshot(`${name}-${vp}.png`, { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.002, timeout: 30000 });
    });
  }
}

test('mobile menu opens, is keyboard operable and closes with Escape', async ({ page }) => {
  await page.setViewportSize(viewports['mobile-390']);
  await open(page, pages.huisstijl);
  const button = page.locator('.bond-hamburger');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#bond-mobile-menu')).toBeVisible();
  await expect(page.locator('#bond-mobile-menu .bond-nav-link').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#bond-mobile-menu')).toBeHidden();
  await expect(button).toBeFocused();
});

test('desktop dropdown opens on hover and on keyboard focus', async ({ page }) => {
  await page.setViewportSize(viewports['laptop-1440']);
  await open(page, pages.huisstijl);
  const parent = page.locator('.bond-nav .bond-menu--root > .bond-menu__item:has(> .bond-submenu)').first();
  test.skip(!(await parent.count()), 'No menu item with sub pages');
  await parent.hover();
  await expect(parent.locator('> .bond-submenu')).toBeVisible();
  await page.mouse.move(0, 400);
  await parent.locator('> .bond-nav-link').focus();
  await expect(parent.locator('> .bond-submenu')).toBeVisible();
});

test('skip link is the first tab stop and moves focus to main', async ({ page }) => {
  await page.setViewportSize(viewports['laptop-1440']);
  await open(page, pages.huisstijl);
  await page.keyboard.press('Tab');
  const skip = page.locator('.bond-skip');
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#bond-main')).toBeFocused();
});

test('showcase form: validation messages, focus on the first error, success state', async ({ page }) => {
  await page.setViewportSize(viewports['laptop-1440']);
  await open(page, pages.huisstijl);
  const form = page.locator('.bond-demo-form');
  await form.locator('.bond-demo-submit').click();
  await expect(form.locator('#hs-naam')).toBeFocused();
  await expect(form.locator('#hs-naam ~ .invalid-feedback')).toBeVisible();
  const errColor = await form.locator('#hs-naam ~ .invalid-feedback').evaluate((e) => getComputedStyle(e).color);
  expect(errColor, 'error text in koraal diep').toBe('rgb(168, 67, 42)');
  await form.locator('#hs-naam').fill('Test');
  await form.locator('#hs-mail').fill('test@example.com');
  await form.locator('#hs-akkoord').check();
  await form.locator('.bond-demo-submit').click();
  await expect(form.locator('.bond-demo-ok')).toBeVisible();
});

test('buttons and links show a 2px koraal-diep focus ring', async ({ page }) => {
  await page.setViewportSize(viewports['laptop-1440']);
  await open(page, pages.huisstijl);
  for (const sel of ['.bond-sectie .bond-knop--koraal', '.bond-sectie .bond-more', '.bond-sectie .btn-primary', '.bond-header__cta']) {
    const el = page.locator(sel).first();
    await el.focus();
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); // focus via keyboard -> :focus-visible
    const o = await el.evaluate((e) => { const s = getComputedStyle(e); return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor }; });
    expect(o.style, `${sel} outline`).toBe('solid');
    expect(o.width, `${sel} outline width`).toBe('2px');
    expect(o.color, `${sel} outline colour`).toBe('rgb(168, 67, 42)');
  }
});

test('touch targets in header, footer and showcase are at least 24x24 px (WCAG 2.5.8)', async ({ page }) => {
  await page.setViewportSize(viewports['mobile-390']);
  await open(page, pages.huisstijl);
  const small = await page.evaluate(() => [...document.querySelectorAll('.bond-header a, .bond-header button, .bond-footer a, .bond-sectie a, .bond-sectie button')]
    .filter((e) => e.offsetParent !== null && !e.closest('p:not(.bond-tegel__voet), td, li.bond-footer__nav-item, address'))
    .map((e) => ({ t: e.textContent.trim().slice(0, 30), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }))
    .filter((r) => r.w < 24 || r.h < 24));
  expect(small).toEqual([]);
});

test('reduced motion: no transitions on buttons and links', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: viewports['laptop-1440'] });
  const page = await ctx.newPage();
  await blockConsent(page);
  await page.goto(pages.huisstijl.startsWith('http') ? pages.huisstijl : base + pages.huisstijl, { waitUntil: 'networkidle' });
  const d = await page.locator('.bond-sectie .bond-knop').first().evaluate((e) => getComputedStyle(e).transitionDuration);
  expect(d).toBe('0s');
  await ctx.close();
});

for (const [name, url] of Object.entries(pages)) {
  for (const vp of ['laptop-1440', 'mobile-390']) {
    test(`axe WCAG 2.2 AA: ${name} @ ${vp}`, async ({ page }) => {
      await page.setViewportSize(viewports[vp]);
      await open(page, url);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const rows = r.violations.flatMap((v) => v.nodes.map((n) => ({ rule: v.id, impact: v.impact, target: n.target.join(' '), html: n.html.slice(0, 160) })));
      fs.mkdirSync(reportDir, { recursive: true });
      fs.writeFileSync(path.join(reportDir, `axe-${name}-${vp}.json`), JSON.stringify(rows, null, 2));
      // The theme (header, footer, showcase sections, pagina layer) must be clean;
      // violations inside existing 2sxc/HTML content are reported, not hidden.
      const theme = rows.filter((x) => /bond-(header|footer|skip|strook|mobile|nav|sectie|tegel|knop|staal|citaat|waarden|feit|tabel|pil|label|lead|more|blok)/.test(x.target + x.html));
      expect(theme, `axe violations in theme-owned markup (all: ${rows.length}, see ${reportDir})`).toEqual([]);
    });
  }
}
