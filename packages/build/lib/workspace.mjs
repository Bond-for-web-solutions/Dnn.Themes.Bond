// Workspace model: shared packages, themes, their dependency graph and the
// theme.json contract. Pure data loading - no build side effects.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  repoRoot, readJson, listFiles, readNormalized, BondError, THEME_ID, PREFIX, DNN_NAME, toDnnVersion, isInside,
} from './util.mjs';

const RESERVED_PREFIXES = new Set(['dnn', 'ui', 'u', 'is', 'has', 'js']);

function readPackage(dir, kind) {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) return null;
  const pkg = readJson(file);
  return { kind, dir, file, name: pkg.name, version: pkg.version, json: pkg, bond: pkg.bond || {} };
}

/**
 * Integration tests may add disposable themes from BOND_EXTRA_THEMES, which must
 * be a "bond-test-*" folder inside the OS temp dir (never the repo).
 */
function extraThemeRoots() {
  const dir = process.env.BOND_EXTRA_THEMES;
  if (!dir) return [];
  const abs = fs.realpathSync(path.resolve(dir));
  if (!isInside(fs.realpathSync(os.tmpdir()), abs) || !path.basename(abs).startsWith('bond-test-')) {
    throw new BondError(`BOND_EXTRA_THEMES must be a bond-test-* folder in the OS temp dir: ${abs}`, 'BOND003');
  }
  return [abs];
}

export function loadWorkspace() {
  const packages = new Map();
  for (const base of ['packages', 'themes', ...extraThemeRoots()]) {
    const root = path.isAbsolute(base) ? base : path.join(repoRoot, base);
    if (!fs.existsSync(root)) continue;
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name.startsWith('_')) continue;
      const p = readPackage(path.join(root, ent.name), base === 'packages' ? 'package' : 'theme');
      if (!p) continue;
      if (packages.has(p.name)) throw new BondError(`Duplicate workspace package name ${p.name}`, 'BOND030', { file: p.file });
      packages.set(p.name, p);
    }
  }
  const themes = new Map();
  for (const p of packages.values()) {
    if (p.kind !== 'theme') continue;
    const id = path.basename(p.dir);
    themes.set(id, { id, pkg: p, dir: p.dir });
  }
  return { packages, themes };
}

/** Workspace dependencies of a package (names), from dependencies + devDependencies. */
export function workspaceDeps(ws, pkg) {
  const all = { ...pkg.json.dependencies, ...pkg.json.devDependencies };
  return Object.keys(all).filter((n) => ws.packages.has(n)).sort();
}

/** Transitive closure in dependency-first (topological) order. Detects cycles. */
export function dependencyClosure(ws, pkg) {
  const order = []; const state = new Map();
  (function visit(p, trail) {
    const s = state.get(p.name);
    if (s === 'done') return;
    if (s === 'visiting') throw new BondError(`Dependency cycle: ${[...trail, p.name].join(' -> ')}`, 'BOND031', { file: p.file });
    state.set(p.name, 'visiting');
    for (const d of workspaceDeps(ws, p)) visit(ws.packages.get(d), [...trail, p.name]);
    state.set(p.name, 'done');
    order.push(p);
  })(pkg, []);
  return order; // last element is pkg itself
}

/** Reverse dependency map: name -> Set of dependents (transitive). */
export function dependents(ws) {
  const direct = new Map([...ws.packages.keys()].map((n) => [n, new Set()]));
  for (const p of ws.packages.values()) for (const d of workspaceDeps(ws, p)) direct.get(d).add(p.name);
  const closure = new Map();
  for (const name of ws.packages.keys()) {
    const seen = new Set(); const stack = [name];
    while (stack.length) for (const n of direct.get(stack.pop())) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    closure.set(name, seen);
  }
  return closure;
}

/** Content hash of a package folder (normalised line endings, ignores node_modules/dotfiles). */
export function contentHash(dir) {
  const h = crypto.createHash('sha256');
  for (const f of listFiles(dir)) {
    h.update(f + '\0');
    h.update(readNormalized(path.join(dir, f)));
    h.update('\0');
  }
  return h.digest('hex');
}

// ---------------------------------------------------------------------------
// theme.json contract
// ---------------------------------------------------------------------------

const req = (cond, msg, file) => { if (!cond) throw new BondError(msg, 'BOND040', { file }); };

function checkOutputMap(map, label, file, ext) {
  req(map && typeof map === 'object' && !Array.isArray(map), `"${label}" must be an object of output -> source`, file);
  for (const [out, src] of Object.entries(map)) {
    req(/^[A-Za-z0-9_.\-/]+$/.test(out) && !out.split('/').includes('..') && !out.startsWith('/'), `${label}: invalid output path "${out}"`, file);
    req(out.endsWith(ext), `${label}: output "${out}" must end with ${ext}`, file);
    req(typeof src === 'string' && !path.isAbsolute(src) && !src.split(/[\\/]/).includes('..'), `${label}: invalid source path "${src}"`, file);
  }
}

export function loadTheme(ws, id) {
  if (!THEME_ID.test(id || '')) throw new BondError(`Invalid theme id "${id}" (expected ${THEME_ID}).`, 'BOND041');
  const theme = ws.themes.get(id);
  if (!theme) {
    throw new BondError(`Unknown theme "${id}". Known: ${[...ws.themes.keys()].join(', ') || '(none)'}`, 'BOND041');
  }
  const file = path.join(theme.dir, 'theme.json');
  req(fs.existsSync(file), `Missing theme.json for theme ${id}`, theme.pkg.file);
  const cfg = readJson(file);
  req(cfg.id === id, `theme.json "id" must equal the folder name "${id}"`, file);
  req(PREFIX.test(cfg.prefix || '') && !RESERVED_PREFIXES.has(cfg.prefix), `"prefix" must match ${PREFIX} and not be reserved (${[...RESERVED_PREFIXES].join(', ')})`, file);
  const d = cfg.dnn || {};
  for (const k of ['packageName', 'friendlyName', 'description', 'skinName', 'coreVersion', 'license', 'releaseNotes']) {
    req(typeof d[k] === 'string' && d[k].trim(), `dnn.${k} is required`, file);
  }
  for (const k of ['packageName', 'skinName']) req(DNN_NAME.test(d[k]), `dnn.${k} "${d[k]}" contains unsupported characters`, file);
  req(!/[ ]/.test(d.skinName), 'dnn.skinName becomes a folder name under Portals/_default/Skins and may not contain spaces', file);
  req(/^\d{2}\.\d{2}\.\d{2}$/.test(d.coreVersion), 'dnn.coreVersion must look like 10.00.00', file);
  req(d.owner && typeof d.owner === 'object', 'dnn.owner {name, organization, url, email} is required', file);
  const hasContainers = fs.existsSync(path.join(theme.dir, 'containers'));
  if (hasContainers) {
    for (const k of ['containerPackageName', 'containerName']) {
      req(typeof d[k] === 'string' && DNN_NAME.test(d[k]), `dnn.${k} is required when the theme has containers/`, file);
    }
    req(!/[ ]/.test(d.containerName), 'dnn.containerName may not contain spaces', file);
  }
  checkOutputMap(cfg.styles || {}, 'styles', file, '.css');
  checkOutputMap(cfg.containerStyles || {}, 'containerStyles', file, '.css');
  checkOutputMap(cfg.scripts || {}, 'scripts', file, '.js');
  for (const [, src] of [...Object.entries(cfg.styles || {}), ...Object.entries(cfg.scripts || {}), ...Object.entries(cfg.containerStyles || {})]) {
    const abs = path.join(theme.dir, src);
    req(isInside(theme.dir, abs) && fs.existsSync(abs), `Entry point "${src}" does not exist`, file);
  }
  const version = theme.pkg.version;
  let dnnVersion;
  try { dnnVersion = toDnnVersion(version); } catch (e) { throw new BondError(e.message, e.code, { file: theme.pkg.file }); }
  return {
    ...theme,
    configFile: file,
    config: { csp: { inlineScripts: 'warning' }, budgets: {}, allowRemoteUrls: false, ...cfg },
    version,
    dnnVersion,
    hasContainers,
  };
}
