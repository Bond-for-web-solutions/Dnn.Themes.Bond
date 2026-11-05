// Workspace-wide architecture checks: package boundaries, dependency direction,
// identity collisions between themes. Fast; runs before every CI build.
import fs from 'node:fs';
import path from 'node:path';
import { Diagnostics, paint, listFiles, lineCol, readJson, isInside, rel } from './util.mjs';
import { workspaceDeps, dependencyClosure, loadTheme } from './workspace.mjs';

const THEME_LAYER = 100;

function layerOf(p) { return p.kind === 'theme' ? THEME_LAYER : p.bond.layer; }

export function checkWorkspace(ws) {
  const diag = new Diagnostics();

  for (const p of ws.packages.values()) {
    const loc = { file: p.file };
    if (p.json.private !== true) diag.error('BOND900', `${p.name} must be "private": true (nothing in this repo is published to npm; prevents accidental publish and dependency confusion).`, loc);
    if (p.kind === 'package' && !p.name.startsWith('@bond/')) diag.error('BOND901', `Shared packages must use the @bond/ scope (${p.name}).`, loc);
    if (p.kind === 'package' && !Number.isInteger(p.bond.layer)) diag.error('BOND902', `${p.name} needs an integer "bond.layer" in package.json.`, loc);
    if (p.kind === 'package' && !p.json.exports && p.name !== '@bond/build') diag.error('BOND903', `${p.name} needs an "exports" map - it is the package's public API.`, loc);
    // "bond.styles": CSS outputs a package adds to every dependent theme's skin (e.g. splash.css for a shared layout).
    if (p.kind === 'package' && p.bond.styles !== undefined) {
      const styles = p.bond.styles;
      if (!styles || typeof styles !== 'object' || Array.isArray(styles)) diag.error('BOND912', `${p.name}: "bond.styles" must be an object of output -> source.`, loc);
      else {
        for (const [out, src] of Object.entries(styles)) {
          const abs = typeof src === 'string' ? path.join(p.dir, src) : '';
          if (!/^[A-Za-z0-9_.\-/]+\.css$/.test(out) || out.startsWith('/') || out.split('/').includes('..')) diag.error('BOND912', `${p.name}: "bond.styles" output "${out}" must be a relative .css path.`, loc);
          if (!abs || !isInside(path.join(p.dir, 'src'), abs) || !fs.existsSync(abs)) diag.error('BOND912', `${p.name}: "bond.styles" source "${src}" must be an existing file under src/.`, loc);
        }
      }
    }

    const all = { ...p.json.dependencies, ...p.json.devDependencies, ...p.json.peerDependencies };
    for (const [dep, spec] of Object.entries(all)) {
      const target = ws.packages.get(dep);
      if (dep.startsWith('@bond/') && !target) diag.error('BOND904', `${dep} is not a workspace package (typo, or a dependency-confusion risk).`, loc);
      if (!target) continue;
      if (!String(spec).startsWith('workspace:')) diag.error('BOND905', `${dep} must use the workspace: protocol so it can never resolve from a registry.`, loc);
      if (target.kind === 'theme') diag.error('BOND906', `${p.name} depends on theme ${dep}. Themes are leaves: share code through packages/.`, loc);
      else if (p.kind === 'package' && layerOf(target) >= layerOf(p)) {
        diag.error('BOND907', `Layer violation: ${p.name} (layer ${layerOf(p)}) may only depend on lower layers; ${dep} is layer ${layerOf(target)}. See docs/monorepo.md#dependency-rules.`, loc);
      }
    }
    try { dependencyClosure(ws, p); } catch (e) { diag.error(e.code, e.message, loc); }

    // Source-level import scan (CSS @import + JS import/require) for relative escapes and undeclared deps.
    const srcDirs = p.kind === 'theme' ? ['styles', 'scripts'] : ['src'];
    for (const sd of srcDirs) {
      const dir = path.join(p.dir, sd);
      for (const f of listFiles(dir).filter((x) => /\.(css|js|mjs)$/.test(x))) {
        const abs = path.join(dir, f);
        const text = fs.readFileSync(abs, 'utf8');
        const re = /(?:@import\s+(?:url\()?\s*["']([^"']+)["']|^\s*(?:import|export)\s[^;'"]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["'])/gm;
        for (const m of text.matchAll(re)) {
          const spec = m[1] || m[2] || m[3];
          const l = { file: abs, ...lineCol(text, m.index) };
          if (spec.startsWith('.')) {
            if (!isInside(p.dir, path.resolve(path.dirname(abs), spec))) diag.error('BOND910', `"${spec}" reaches outside ${p.name}; import shared code by package name.`, l);
          } else if (!/^[a-z]+:/.test(spec)) {
            const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
            if (!(name in { ...p.json.dependencies, ...p.json.peerDependencies })) diag.error('BOND911', `"${spec}" is not declared in ${rel(p.file)} dependencies.`, l);
          }
        }
      }
    }
  }

  // Themes: valid config + unique identities (a clash would overwrite another theme on install).
  const seen = { prefix: new Map(), packageName: new Map(), skinName: new Map(), containerName: new Map(), containerPackageName: new Map() };
  for (const id of ws.themes.keys()) {
    let t;
    try { t = loadTheme(ws, id); } catch (e) { diag.error(e.code, e.message, e.loc); continue; }
    const vals = { prefix: t.config.prefix, packageName: t.config.dnn.packageName, skinName: t.config.dnn.skinName, containerName: t.config.dnn.containerName, containerPackageName: t.config.dnn.containerPackageName };
    for (const [k, v] of Object.entries(vals)) {
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen[k].has(key)) diag.error('BOND920', `${k} "${v}" is used by both ${seen[k].get(key)} and ${id}.`, { file: t.configFile });
      seen[k].set(key, id);
    }
    for (const dep of workspaceDeps(ws, t.pkg)) if (ws.packages.get(dep).kind === 'theme') diag.error('BOND906', `Theme ${id} depends on theme ${dep}.`, { file: t.pkg.file });
    const lic = path.join(t.dir, t.config.dnn.license);
    if (!fs.existsSync(lic)) diag.error('BOND921', `License file ${t.config.dnn.license} missing.`, { file: t.configFile });
    if (/example\.(com|org)/i.test(JSON.stringify(t.config.dnn.owner))) diag.warn('BOND922', 'dnn.owner still contains placeholder example.com values.', { file: t.configFile });
  }
  console.log(`bond: check ${diag.ok ? paint.green('passed') : paint.red('FAILED')} (${ws.packages.size} packages, ${ws.themes.size} themes, ${diag.errors.length} error(s), ${diag.warnings.length} warning(s))`);
  return diag;
}

export function readLayers(ws) {
  return [...ws.packages.values()].map((p) => ({ name: p.name, kind: p.kind, layer: layerOf(p), deps: workspaceDeps(ws, p) }));
}

export { readJson };
