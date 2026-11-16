// Capture every page of a local DNN site: per page and viewport a full-page
// screenshot plus what is on it (headings, text length, images, modules, errors).
// Used to compare a site before and after a theme change.
//   node tests/e2e/site-capture.mjs <out-dir> <tabs.json>
// tabs.json: [{ "id": 33, "path": "//OverBond" }, ...]. Settings from .env.json (themes.<theme>.e2e).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import './settings.mjs';

const [out, tabsFile] = process.argv.slice(2);
const base = process.env.BOND_E2E_BASE_URL;
const tabs = JSON.parse(fs.readFileSync(tabsFile, 'utf8').replace(/^\s+/, '')); // \s also strips a byte-order mark
const sizes = { desktop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, mobile: { width: 390, height: 844 } };
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const results = [];
for (const tab of tabs) {
  for (const [name, size] of Object.entries(sizes)) {
    const page = await browser.newPage({ viewport: size });
    await page.route(/usercentrics/, (r) => r.abort());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let status = 0;
    try {
      const res = await page.goto(`${base}/Default.aspx?TabId=${tab.id}`, { waitUntil: 'networkidle', timeout: 120000 });
      status = res.status();
      await page.evaluate(async () => { for (const i of document.querySelectorAll('img[loading=lazy]')) i.loading = 'eager'; await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000); })))); });
      const info = await page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
        return {
          url: location.pathname,
          title: document.title.trim(),
          theme: document.querySelector('.bond-header') ? 'bond' : (document.querySelector('#theme-page-main, .theme-content-pane') ? 'bondbs5' : 'other'),
          h1: [...document.querySelectorAll('h1')].filter(vis).map((h) => h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)),
          h2: [...document.querySelectorAll('h2')].filter(vis).length,
          text: (main.innerText || '').replace(/\s+/g, ' ').trim().length,
          images: [...document.querySelectorAll('main img, #theme-page-main img, .DnnModule img')].filter(vis).length,
          brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && vis(i)).map((i) => i.src).slice(0, 5),
          modules: [...document.querySelectorAll('.DnnModule')].filter(vis).length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          errorText: (document.body.innerText.match(/(Something went really wrong[^\n]{0,40}|niet beschikbaar|A critical error|Could not load[^\n]{0,60})/gi) || []).slice(0, 3),
        };
      });
      const file = `${tab.id}-${name}.png`;
      await page.screenshot({ path: path.join(out, file), fullPage: true, timeout: 60000 });
      results.push({ tab: tab.id, path: tab.path, viewport: name, status, errors, ...info, file });
    } catch (e) {
      results.push({ tab: tab.id, path: tab.path, viewport: name, status, errors: [...errors, String(e.message).slice(0, 200)] });
    }
    await page.close();
    process.stdout.write('.');
  }
}
await browser.close();
fs.writeFileSync(path.join(out, 'pages.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length} captures -> ${out}`);
