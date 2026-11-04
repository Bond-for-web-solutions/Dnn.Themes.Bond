// Visual regression. Two levels:
//  1. Page fixtures per theme/layout (what a visitor sees).
//  2. Component gallery per theme: every shared component contract example
//     rendered under EACH theme's CSS. Changing a shared component (e.g. the
//     button) changes these screenshots for every theme that uses it, so the
//     PR shows exactly which themes are affected before anything is deployed.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const themes = fs.readdirSync(path.join(root, 'themes')).filter((t) => fs.existsSync(path.join(root, 'themes', t, 'theme.json')));
const fixtures = (t) => {
  const dir = path.join(root, 'themes', t, 'tests', 'fixtures');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')) : [];
};
const components = fs.readdirSync(path.join(root, 'packages', 'components', 'src'))
  .filter((c) => {
    const f = path.join(root, 'packages', 'components', 'src', c, 'contract.json');
    return fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).examples.length > 0;
  });

async function settle(page) {
  await page.evaluate(async () => { await document.fonts.ready; });
}

for (const theme of themes) {
  test.describe(`${theme}`, () => {
    for (const name of fixtures(theme)) {
      for (const width of [1280, 390]) {
        test(`page ${name} @${width}`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`/fixture/${theme}/${name}`);
          await settle(page);
          await expect(page).toHaveScreenshot(`${theme}-${name}-${width}.png`, { fullPage: true });
        });
      }
    }

    for (const component of components) {
      test(`component ${component}`, async ({ page }) => {
        await page.setViewportSize({ width: 800, height: 900 });
        await page.goto(`/gallery/${theme}`);
        await settle(page);
        await expect(page.locator(`[data-component="${component}"]`)).toHaveScreenshot(`${theme}-component-${component}.png`);
      });
    }
  });
}
