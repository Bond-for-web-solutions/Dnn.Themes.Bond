// Bond 1.0 -> 1.1 migration parity. Renders the same fixture markup with
// (a) the legacy CSS/JS straight from git (commit 0600865) in its ORIGINAL
//     load order - before DNN's default.css - and
// (b) the new build,
// then compares computed styles of the key elements. Expected differences
// are listed explicitly (docs/migration/bond-legacy-assessment.md#visible-changes);
// anything else fails. Screenshots of both are attached to the report.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

let hasLegacy = true;
try { execFileSync('git', ['cat-file', '-e', '0600865:resources/css/skin.css'], { stdio: 'ignore' }); } catch { hasLegacy = false; }

const PROPS = ['color', 'backgroundColor', 'backgroundImage', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'textDecorationLine',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopColor', 'borderTopWidth', 'borderTopLeftRadius', 'boxShadow',
  'display', 'flexDirection', 'gap', 'justifyContent', 'alignItems', 'position', 'opacity', 'height', 'maxWidth'];

// [label, legacy selector, new selector]
const PAIRS = {
  default: [
    ['header', '.bond-header', '.bond-header'],
    ['header main', '.bond-header__main', '.bond-header__main'],
    ['topbar', '.bond-topbar', '.bond-topbar'],
    ['container', '.bond-header__main .bond-container', '.bond-header__main .bond-container'],
    ['nav link (selected)', '.bond-nav .bond-nav-link.is-selected', '.bond-nav .bond-nav-link.is-selected'],
    ['nav link', '.bond-nav a[href="#about"]', '.bond-nav a[href="#about"]'],
    ['nav link (disabled)', '.bond-nav .bond-nav-link--disabled', '.bond-nav .bond-nav-link--disabled'],
    ['submenu', '.bond-nav .bond-submenu', '.bond-nav .bond-submenu'],
    ['submenu link', '.bond-nav a[href="#dnn"]', '.bond-nav a[href="#dnn"]'],
    ['content', '.bond-content', '.bond-content'],
    ['footer', '.bond-footer', '.bond-footer'],
    ['footer accent', '.bond-footer__accent', '.bond-footer__accent'],
    ['footer link', '.bond-footer a[href="#services"]', '.bond-footer a[href="#services"]'],
    ['footer meta link', '.bond-footer__meta a[href="#terms"]', '.bond-footer__meta a[href="#terms"]'],
    ['copyright', '.bond-footer__copyright', '.bond-footer__copyright'],
  ],
  login: [
    ['card wrapper', '.bond-login', '.bond-auth'],
    ['card', '.bond-login__card', '.bond-auth__card'],
    ['title', '.bond-login__title', '.bond-auth__title'],
    ['subtitle', '.bond-login__subtitle', '.bond-auth__subtitle'],
    ['label', '.bond-login__label', '.bond-auth .bond-field__label'],
    ['input', '.bond-login__input', '.bond-auth .bond-field__input'],
    ['remember', '.bond-login__remember', '.bond-auth__remember'],
    ['link', '.bond-login__link', '.bond-auth__link'],
    ['submit', '.bond-login__submit', '.bond-auth .bond-button'],
  ],
  splash: [
    ['splash', '.bond-splash', '.bond-splash'],
    ['inner', '.bond-splash__inner', '.bond-splash__inner'],
    ['logo', '.bond-logo', '.bond-logo'],
    ['title', '.bond-splash__title', '.bond-splash__title'],
    ['text', '.bond-splash__text', '.bond-splash__text'],
    ['rule', '.bond-splash__rule', '.bond-splash__rule'],
    ['footer', '.bond-splash__footer', '.bond-splash__footer'],
    ['footer link', '.bond-splash__footer a', '.bond-splash__footer a'],
  ],
};

// Intentional, documented differences (docs/migration/bond-legacy-assessment.md#visible-changes).
// Key: `${fixture}|${label}|${prop}` -> reason.
const FONT = 'text now renders in MuseoSans instead of the Arial DNN forced on Bond 1.0 (body font fix), so line boxes differ';
const EXPECTED = {
  'default|content|height': FONT,
  'login|card wrapper|height': FONT,
  'login|card|height': FONT,
  'login|input|height': FONT,
  'login|submit|height': FONT,
  'login|submit|gap': 'flex gap on a text-only button: no visual effect',
};

// url("http://host/a/b/logo.png") -> url(logo.png): same file, new path.
const normalise = (p, v) => (p === 'backgroundImage' ? v.replace(/url\("?[^)"]*\/([^/)"]+)"?\)/g, 'url($1)') : v);

async function styles(page, pairs, which) {
  return page.evaluate(({ pairs, which, props }) => Object.fromEntries(pairs.map(([label, legacySel, newSel]) => {
    const el = document.querySelector(which === 'legacy' ? legacySel : newSel);
    if (!el) return [label, null];
    const cs = getComputedStyle(el);
    return [label, Object.fromEntries(props.map((p) => [p, cs[p]]))];
  })), { pairs, which, props: PROPS });
}

test.describe('Bond 1.0 -> 1.1 parity', () => {
  test.skip(!hasLegacy, 'legacy commit 0600865 not in this clone (shallow checkout)');

  for (const fixture of Object.keys(PAIRS)) {
    test(`${fixture}: component styles match Bond 1.0`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/legacy/${fixture}`);
      await page.evaluate(async () => { await document.fonts.ready; });
      const legacy = await styles(page, PAIRS[fixture], 'legacy');
      const legacyBody = await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundColor }));
      await testInfo.attach(`${fixture}-legacy.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

      await page.goto(`/fixture/bond/${fixture}`);
      await page.evaluate(async () => { await document.fonts.ready; });
      const current = await styles(page, PAIRS[fixture], 'new');
      const currentBody = await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundColor }));
      await testInfo.attach(`${fixture}-new.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

      const diffs = [];
      for (const [label] of PAIRS[fixture]) {
        expect(legacy[label], `legacy element "${label}" missing`).not.toBeNull();
        expect(current[label], `new element "${label}" missing`).not.toBeNull();
        for (const p of PROPS) {
          if (normalise(p, legacy[label][p]) !== normalise(p, current[label][p]) && !(`${fixture}|${label}|${p}` in EXPECTED)) diffs.push(`${label} ${p}: ${legacy[label][p]} -> ${current[label][p]}`);
        }
      }
      await testInfo.attach(`${fixture}-body.json`, { body: JSON.stringify({ legacyBody, currentBody }, null, 2), contentType: 'application/json' });
      expect(diffs, `Unexpected visual differences vs Bond 1.0:\n${diffs.join('\n')}`).toEqual([]);
    });
  }

  test('documented change: body font and background now apply as Bond 1.0 intended', async ({ page }) => {
    await page.goto('/legacy/default');
    const legacy = await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundColor }));
    await page.goto('/fixture/bond/default');
    const current = await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundColor }));
    // Bond 1.0: DNN's default.css (loaded later) reset body to font-family:inherit (Arial) and a white background.
    expect(legacy.font).toMatch(/Arial/);
    expect(legacy.bg).toBe('rgb(255, 255, 255)');
    expect(current.font).toMatch(/MuseoSans/);
    expect(current.bg).toBe('rgb(244, 237, 228)');
  });
});
