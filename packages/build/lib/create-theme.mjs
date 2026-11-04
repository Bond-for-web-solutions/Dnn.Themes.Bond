// Scaffold a new theme from packages/build/templates/theme.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot, BondError, THEME_ID, PREFIX, DNN_NAME, listFiles, rel } from './util.mjs';

const TEMPLATE = fileURLToPath(new URL('../templates/theme/', import.meta.url));

export function createTheme(ws, { id, prefix, packageName, friendlyName }) {
  if (!THEME_ID.test(id || '')) throw new BondError(`Theme id must match ${THEME_ID}`, 'BOND960');
  prefix ||= id.replace(/-/g, '');
  if (!PREFIX.test(prefix) || prefix === 'bond') throw new BondError(`Prefix must match ${PREFIX} and not be "bond"`, 'BOND961');
  packageName ||= `DNN.Themes.${id.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')}`;
  if (!DNN_NAME.test(packageName) || /\s/.test(packageName)) throw new BondError('Package name may only contain letters, digits, ".", "_" and "-"', 'BOND962');
  friendlyName ||= packageName;
  const dest = path.join(repoRoot, 'themes', id);
  if (fs.existsSync(dest)) throw new BondError(`themes/${id} already exists`, 'BOND963');
  for (const t of ws.themes.keys()) {
    const cfg = JSON.parse(fs.readFileSync(path.join(ws.themes.get(t).dir, 'theme.json'), 'utf8'));
    if (cfg.prefix === prefix) throw new BondError(`Prefix "${prefix}" is already used by ${t}`, 'BOND964');
    if (cfg.dnn.packageName.toLowerCase() === packageName.toLowerCase()) throw new BondError(`Package name "${packageName}" is already used by ${t}`, 'BOND965');
  }
  const vars = { __THEME_ID__: id, __PREFIX__: prefix, __PACKAGE_NAME__: packageName, __FRIENDLY_NAME__: friendlyName };
  const subst = (s) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(k).join(v), s);
  for (const f of listFiles(TEMPLATE, { ignore: (n) => n === 'node_modules' })) {
    const to = path.join(dest, subst(f).replace(/\.tmpl$/, ''));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const src = path.join(TEMPLATE, f);
    if (/\.(png|jpe?g|gif|webp|woff2?|otf|ttf)$/i.test(f)) fs.copyFileSync(src, to);
    else fs.writeFileSync(to, subst(fs.readFileSync(src, 'utf8')));
  }
  console.log(`bond: created ${rel(dest)} (prefix "${prefix}", package ${packageName}).
Next:
  1. pnpm install                      (links the shared packages)
  2. edit ${rel(dest)}/theme.json      (owner, description)
  3. pnpm build ${id}                   (production build + install ZIP)
  No package.json or .vscode/tasks.json edits needed: VS Code lists themes/
  live whenever you pick a theme (Ctrl+Shift+B).`);
  return dest;
}
