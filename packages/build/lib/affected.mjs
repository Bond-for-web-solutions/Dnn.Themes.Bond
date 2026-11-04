// Impact analysis: which themes must be rebuilt / re-tested for a change set.
// A change to a shared package affects every theme that (transitively) depends
// on it; repo-wide build inputs affect everything; docs affect nothing.
import path from 'node:path';
import { repoRoot, toPosix, BondError } from './util.mjs';
import { dependents } from './workspace.mjs';
import { git } from './git.mjs';

// packages/build is the toolchain every theme is built with: changing it can change every artifact.
const GLOBAL_INPUTS = [/^packages\/build\//, /^\.gitattributes$/, /^pnpm-lock\.yaml$/, /^pnpm-workspace\.yaml$/, /^package\.json$/, /^\.node-version$/, /^tests\/(fixtures|visual|support|integration)\//, /^(tests\/)?playwright\.config\./, /^stylelint\.config\./, /^eslint\.config\./, /^\.github\/workflows\//];
const IGNORED = [/^docs\//, /^\.claude\//, /\.md$/i, /^CLAUDE\.md$/, /^\.vscode\//, /^LICENSE$/];

export function changedFiles(base) {
  const committed = git(['diff', '--name-only', `${base}...HEAD`]);
  if (committed === null) throw new BondError(`Cannot diff against "${base}" (fetch it, e.g. git fetch origin main).`, 'BOND950');
  const working = git(['status', '--porcelain', '--untracked-files=all']) || '';
  const files = new Set(committed.split('\n').filter(Boolean));
  for (const line of working.split('\n').filter(Boolean)) files.add(line.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''));
  return [...files].map(toPosix).sort();
}

export function affectedThemes(ws, files) {
  const deps = dependents(ws);
  const themes = new Set(); const reasons = {};
  const all = [...ws.themes.keys()];
  const mark = (id, why) => { themes.add(id); (reasons[id] ||= []).push(why); };
  const byDir = [...ws.packages.values()].map((p) => ({ p, dir: toPosix(path.relative(repoRoot, p.dir)) + '/' }));
  for (const f of files) {
    if (IGNORED.some((re) => re.test(f)) && !/^themes\/[^/]+\/package\//.test(f)) continue;
    if (GLOBAL_INPUTS.some((re) => re.test(f))) { for (const id of all) mark(id, `global input ${f}`); continue; }
    const hit = byDir.find(({ dir }) => f.startsWith(dir));
    if (!hit) continue;
    if (hit.p.kind === 'theme') mark(path.basename(hit.p.dir), f);
    else {
      for (const d of deps.get(hit.p.name)) {
        const pkg = ws.packages.get(d);
        if (pkg.kind === 'theme') mark(path.basename(pkg.dir), `${hit.p.name} (${f})`);
      }
    }
  }
  return { themes: [...themes].sort(), reasons };
}
