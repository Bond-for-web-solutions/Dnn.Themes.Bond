// Loads the e2e settings of ONE theme from .env.json (repo root, git-ignored;
// copy .env.example.json) into BOND_E2E_* environment variables, which the
// tests read. Variables already set in the shell win over the file.
// BOND_LOCAL_CONFIG points at another file (same override as `bond deploy`).
//
//   "themes": {
//     "bond": {
//       "siteRoot": "C:/DNN/bond-dev",               -> BOND_E2E_SITE_ROOT (the site's folder)
//       "e2e": {
//         "baseUrl": "http://mysite.dnndev.me",     -> BOND_E2E_BASE_URL (required, else everything skips)
//         "bundled": true,                          -> BOND_E2E_BUNDLED: Playwright's Chromium, not the system Chrome
//         "pages": { "default": "/" },              -> BOND_E2E_PAGES: layout -> a page that uses it
//         "huisstijlPages": { "huisstijl": "/x" },   -> BOND_E2E_HUISSTIJL_PAGES
//         "site": { "extra": [], "allowH1": [] },   -> BOND_E2E_SITE_EXTRA / BOND_E2E_SITE_ALLOW_H1
//         "login": { "path": "/inloggen", "user": "", "password": "" }  -> BOND_E2E_LOGIN_PATH / _USER / _PASSWORD
//       } } }
//
// Which theme: BOND_E2E_THEME=<id> (e.g. `BOND_E2E_THEME=dzp pnpm test:e2e`), else the
// only theme with an "e2e" section. The chosen id becomes BOND_E2E_THEME.
import fs from 'node:fs';
import path from 'node:path';

const KEYS = {
  baseUrl: 'BOND_E2E_BASE_URL',
  bundled: 'BOND_E2E_BUNDLED',
  pages: 'BOND_E2E_PAGES',
  huisstijlPages: 'BOND_E2E_HUISSTIJL_PAGES',
  'site.extra': 'BOND_E2E_SITE_EXTRA',
  'site.allowH1': 'BOND_E2E_SITE_ALLOW_H1',
  'login.path': 'BOND_E2E_LOGIN_PATH',
  'login.user': 'BOND_E2E_USER',
  'login.password': 'BOND_E2E_PASSWORD',
};

const file = process.env.BOND_LOCAL_CONFIG
  ? path.resolve(process.env.BOND_LOCAL_CONFIG)
  : path.resolve(import.meta.dirname, '..', '..', '.env.json');

const set = (name, v) => {
  if (process.env[name] !== undefined || v === undefined || v === '' || v === false || v === null) return;
  process.env[name] = v === true ? '1' : typeof v === 'object' ? JSON.stringify(v) : String(v);
};

if (fs.existsSync(file)) {
  const name = path.basename(file);
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\s+/, ''));
  } catch (e) {
    throw new Error(`Cannot read ${name}: ${e.message}`, { cause: e });
  }
  const themes = json.themes ?? {};
  const withE2e = Object.keys(themes).filter((id) => !id.startsWith('$') && themes[id]?.e2e);
  const id = process.env.BOND_E2E_THEME || (withE2e.length === 1 ? withE2e[0] : '');
  if (!id && withE2e.length > 1) {
    throw new Error(`Several themes in ${name} have e2e settings (${withE2e.join(', ')}): choose one with BOND_E2E_THEME=<id>.`);
  }
  if (id) {
    const theme = themes[id];
    if (!theme) throw new Error(`BOND_E2E_THEME=${id}, but ${name} has no themes.${id}.`);
    set('BOND_E2E_THEME', id);
    set('BOND_E2E_SITE_ROOT', theme.siteRoot || json.siteRoot);
    const unknown = [];
    const walk = (obj, prefix) => {
      for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith('$')) continue; // "$comment" notes
        const key = prefix ? `${prefix}.${k}` : k;
        if (KEYS[key]) set(KEYS[key], v);
        else if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(KEYS).some((x) => x.startsWith(`${key}.`))) walk(v, key);
        else unknown.push(`themes.${id}.e2e.${key}`);
      }
    };
    walk(theme.e2e ?? {}, '');
    if (unknown.length) throw new Error(`Unknown setting(s) in ${name}: ${unknown.join(', ')}`);
  }
}
