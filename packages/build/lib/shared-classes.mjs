// The shared design system and the Bond theme both use the `bond-` namespace
// (`dnn-` is taken by DNN itself: dnn-button, dnn-field, --dnn-color-*). So
// "is this a shared class?" is decided by BLOCK NAME, not prefix: a class is
// shared when its block (`bond-card` in `bond-card__title--x`) is defined in
// packages/*/src. Theme-only classes such as `.bond-header` are not shared.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, listFiles } from './util.mjs';

export const SHARED_PREFIX = 'bond';

let cache = null;

/** Set of shared block names, scanned from packages/<pkg>/src/**\/*.css. */
export function sharedBlocks() {
  if (cache) return cache;
  const blocks = new Set();
  const pkgRoot = path.join(repoRoot, 'packages');
  for (const pkg of fs.existsSync(pkgRoot) ? fs.readdirSync(pkgRoot) : []) {
    const src = path.join(pkgRoot, pkg, 'src');
    for (const f of listFiles(src).filter((x) => x.endsWith('.css'))) {
      const css = fs.readFileSync(path.join(src, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/\.(bond-[a-z0-9]+(?:-[a-z0-9]+)*)/g)) blocks.add(m[1]);
    }
  }
  cache = blocks;
  return blocks;
}

export const blockOf = (cls) => cls.split(/__|--/)[0];
export const isSharedClass = (cls) => sharedBlocks().has(blockOf(cls));
