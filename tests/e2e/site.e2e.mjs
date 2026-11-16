// Every public page of the REAL local site (from its /sitemap.aspx) at desktop,
// tablet and mobile: renders on the Bond theme, HTTP OK, no horizontal scroll,
// no DNN/2sxc error text, no JavaScript errors, no broken images, one h1.
// Read-only. Settings from .env.json (see settings.mjs).
// themes.<theme>.e2e.site.extra (BOND_E2E_SITE_EXTRA) adds pages not in the sitemap.
// Known content exceptions (not theme problems) go in themes.<theme>.e2e.site.allowH1 (BOND_E2E_SITE_ALLOW_H1).
import { test, expect } from '@playwright/test';

const base = process.env.BOND_E2E_BASE_URL;
const sizes = { desktop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, mobile: { width: 390, height: 844 } };
const allowH1 = new Set(JSON.parse(process.env.BOND_E2E_SITE_ALLOW_H1 || '[]'));

let paths = [];
if (base) {
  try {
    const xml = await (await fetch(`${base}/sitemap.aspx`)).text();
    paths = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname))];
  } catch { paths = []; }
  paths = [...new Set([...paths, ...JSON.parse(process.env.BOND_E2E_SITE_EXTRA || '[]')])].sort();
}

test.skip(!base, 'Set BOND_E2E_BASE_URL (or themes.<theme>.e2e.baseUrl in .env.json) to a local DNN site');
test.describe.configure({ mode: 'parallel', timeout: 120000 });

test('the sitemap lists pages', () => { expect(paths.length).toBeGreaterThan(0); });

for (const p of paths) {
  for (const [name, size] of Object.entries(sizes)) {
    test(`${p} @ ${name}`, async ({ page }) => {
      await page.route(/usercentrics/, (r) => r.abort());
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize(size);
      const res = await page.goto(p, { waitUntil: 'networkidle', timeout: 90000 });
      expect(res.status(), 'HTTP status').toBeLessThan(400);
      await expect(page.locator('.bond-header'), 'page renders on the Bond theme').toBeVisible();
      const info = await page.evaluate(async () => {
        for (const i of document.querySelectorAll('img[loading=lazy]')) i.loading = 'eager';
        await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000); }))));
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          errorText: (document.body.innerText.match(/(Something went really wrong[^\n]{0,40}|is op dit moment niet beschikbaar|A critical error|Could not load[^\n]{0,60})/gi) || []).slice(0, 3),
          broken: [...document.images].filter((i) => vis(i) && i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src).slice(0, 3),
          h1: [...document.querySelectorAll('h1')].filter(vis).length,
        };
      });
      expect(info.overflow, 'no horizontal scroll').toBeLessThanOrEqual(1);
      expect(info.errorText, 'DNN/2sxc error text on the page').toEqual([]);
      expect(info.broken, 'broken images').toEqual([]);
      if (!allowH1.has(p)) expect(info.h1, 'exactly one h1').toBe(1);
      expect(errors, 'JavaScript errors').toEqual([]);
    });
  }
}
