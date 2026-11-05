// Test-only static server (127.0.0.1). Composes fixture pages the way DNN
// would load them for a layout:
//   DNN default.css (priority 5) -> [module CSS 10] -> skin.css (15)
//   -> <layout>.css (20) -> container.css (25)
// and injects theme.js (+ layout JS) at the end of the <form>, like
// DnnJsInclude ForceProvider="DnnFormBottomProvider".
//
//   /fixture/<theme>/<name>[?module=hostile]  themes/<theme>/tests/fixtures/<name>.html
//   /gallery/<theme>                          every component contract example under <theme>
//   /legacy/<name>                            Bond 1.0 CSS/JS from git (commit LEGACY_REF) in its original order
//   /blank/<theme>/<name>                     fixture with DNN CSS only (no theme) - isolation baseline
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const publish = process.env.BOND_PUBLISH_ROOT ? path.resolve(process.env.BOND_PUBLISH_ROOT) : path.join(root, 'publish');
export const LEGACY_REF = '0600865';
const PORT = Number(process.env.BOND_TEST_PORT || 4173);
const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.otf': 'font/otf', '.svg': 'image/svg+xml', '.map': 'application/json', '.html': 'text/html' };

const themeConfig = (theme) => JSON.parse(fs.readFileSync(path.join(root, 'themes', theme, 'theme.json'), 'utf8'));
const skinUrl = (theme) => `/publish/${theme}/theme/Skins/${themeConfig(theme).dnn.skinName}`;
const skinDir = (theme) => path.join(publish, theme, 'theme', 'Skins', themeConfig(theme).dnn.skinName);
const containerUrl = (theme) => `/publish/${theme}/theme/Containers/${themeConfig(theme).dnn.containerName}`;
const containerDir = (theme) => path.join(publish, theme, 'theme', 'Containers', themeConfig(theme).dnn.containerName || '_');

// Simulates a third-party module stylesheet with sloppy, broad selectors.
const HOSTILE_MODULE_CSS = `
.DnnModule a { color: rgb(255, 0, 0); text-decoration: line-through; }
.DnnModule button { background: rgb(0, 128, 0); border-radius: 0; }
.DnnModule h2 { font-family: "Courier New", monospace; margin: 3rem 0; }
.DnnModule div { padding: 0; }
.DnnModule input { width: 50%; border: 3px dashed rgb(255, 0, 255); }`;

// `moduleCss` goes right after DNN's default.css - where DNN places module
// stylesheets (FileOrder.Css.ModuleCss = 10, before the skin at 15).
function page({ title, css = [], moduleCss = '', body, scripts = [] }) {
  const links = css.map((h) => `<link rel="stylesheet" href="${h}">`);
  if (moduleCss) links.splice(1, 0, `<style data-module-css>${moduleCss}</style>`);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
${links.join('\n')}
</head><body><form id="Form" method="post" action="#" onsubmit="return false">
${body}
${scripts.map((s) => `<script src="${s}"></script>`).join('\n')}
</form></body></html>`;
}

function readFixture(theme, name) {
  const file = path.join(root, 'themes', theme, 'tests', 'fixtures', `${name}.html`);
  if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, 'utf8');
  const layout = (/<!--\s*layout:\s*([a-z0-9_-]+)\s*-->/i.exec(html) || [])[1] || 'default';
  return { html, layout };
}

function themePage(theme, name, { withTheme = true, hostile = false } = {}) {
  const fx = readFixture(theme, name);
  if (!fx) return null;
  const css = ['/dnn/default.css'];
  const scripts = [];
  if (withTheme) {
    css.push(`${skinUrl(theme)}/skin.css`);
    if (fs.existsSync(path.join(skinDir(theme), `${fx.layout}.css`))) css.push(`${skinUrl(theme)}/${fx.layout}.css`);
    if (fs.existsSync(path.join(containerDir(theme), 'container.css'))) css.push(`${containerUrl(theme)}/container.css`);
    scripts.push(`${skinUrl(theme)}/resources/js/theme.js`);
    if (fs.existsSync(path.join(skinDir(theme), 'resources', 'js', `${fx.layout}.js`))) scripts.push(`${skinUrl(theme)}/resources/js/${fx.layout}.js`);
  }
  return page({ title: `${theme}/${name}`, css, moduleCss: hostile ? HOSTILE_MODULE_CSS : '', body: fx.html, scripts });
}

function galleryPage(theme) {
  const dir = path.join(root, 'packages', 'components', 'src');
  const sections = fs.readdirSync(dir).sort().map((c) => {
    const f = path.join(dir, c, 'contract.json');
    if (!fs.existsSync(f)) return '';
    const contract = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!contract.examples.length) return '';
    return `<section class="gallery__section" data-component="${c}" style="padding:16px;display:flex;flex-direction:column;gap:12px;max-width:640px">
<h2 style="font:600 14px/1.2 monospace;margin:0">${c}</h2>${contract.examples.join('\n')}</section>`;
  }).join('\n');
  return page({ title: `gallery ${theme}`, css: ['/dnn/default.css', `${skinUrl(theme)}/skin.css`], body: `<div class="DnnModule DnnModule-DNN_HTML"><div class="Normal">${sections}</div></div>` });
}

const legacyCache = new Map();
function legacyFile(rel) {
  if (!legacyCache.has(rel)) {
    try { legacyCache.set(rel, execFileSync('git', ['show', `${LEGACY_REF}:${rel}`], { cwd: root, maxBuffer: 1 << 24 })); } catch { legacyCache.set(rel, null); }
  }
  return legacyCache.get(rel);
}

function legacyPage(name) {
  // Bond 1.0 used the same fixture markup apart from a few class names and the menu id.
  const fx = readFixture('bond', name);
  if (!fx) return null;
  const html = fx.html
    .replace(/<div id="dnn_ContentPane" class="bond-splash__contentpane[^"]*"><\/div>\s*/, '') // 1.0 splash had no pane
    .replace(/bond-footer__meta-link/g, '')
    .replace(/bond-splash__link/g, '')
    .replace(/bond-splash__logo/g, 'bond-logo') // renamed in @bond/splash (BEM, no generic .bond-logo)
    .replace(/id="bond-mobile-menu"/g, 'id="mobile-menu"');
  // Bond 1.0: fonts(1), skin(2), login(3) BEFORE default.css(5); splash.css at 130.
  const css = ['/legacy-asset/resources/css/fonts.css', '/legacy-asset/resources/css/skin.css', '/legacy-asset/resources/css/login.css', '/dnn/default.css'];
  if (fx.layout === 'splash') css.push('/legacy-asset/resources/css/splash.css');
  return page({ title: `legacy ${name}`, css, body: html, scripts: ['/legacy-asset/resources/js/login.js'] });
}

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function serveFile(res, base, relPath) {
  const abs = path.resolve(base, relPath);
  if (!abs.startsWith(base + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return send(res, 404, 'not found', 'text/plain');
  send(res, 200, fs.readFileSync(abs), TYPES[path.extname(abs)] || 'application/octet-stream');
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    try {
      if (parts[0] === 'dnn' && parts[1] === 'default.css') return serveFile(res, path.join(root, 'tests', 'fixtures', 'dnn'), 'default.css');
      if (parts[0] === 'publish') return serveFile(res, publish, parts.slice(1).join('/'));
      if (parts[0] === 'fixture' && parts.length === 3) {
        const html = themePage(parts[1], parts[2], { hostile: url.searchParams.get('module') === 'hostile' });
        return html ? send(res, 200, html) : send(res, 404, 'no fixture', 'text/plain');
      }
      if (parts[0] === 'blank' && parts.length === 3) {
        const html = themePage(parts[1], parts[2], { withTheme: false });
        return html ? send(res, 200, html) : send(res, 404, 'no fixture', 'text/plain');
      }
      if (parts[0] === 'gallery' && parts.length === 2) return send(res, 200, galleryPage(parts[1]));
      if (parts[0] === 'legacy' && parts.length === 2) {
        const html = legacyPage(parts[1]);
        return html ? send(res, 200, html) : send(res, 404, 'no fixture', 'text/plain');
      }
      if (parts[0] === 'legacy-asset') {
        const rel = parts.slice(1).join('/');
        // The legacy fonts.css points at ../font/MuseoSans/*; serve them from the current theme assets.
        if (rel.startsWith('resources/font/')) return serveFile(res, path.join(root, 'themes', 'bond', 'assets', 'font'), rel.slice('resources/font/'.length));
        if (rel.startsWith('resources/img/')) return serveFile(res, path.join(root, 'themes', 'bond', 'assets', 'img'), rel.slice('resources/img/'.length));
        const buf = legacyFile(rel);
        return buf ? send(res, 200, buf, TYPES[path.extname(rel)] || 'text/plain') : send(res, 404, 'not in git history', 'text/plain');
      }
      send(res, 404, 'not found', 'text/plain');
    } catch (err) {
      send(res, 500, String(err.stack || err), 'text/plain');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, '127.0.0.1', () => console.log(`bond test server on http://127.0.0.1:${PORT}`));
}
