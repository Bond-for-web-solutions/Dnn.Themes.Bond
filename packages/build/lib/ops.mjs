// clean / validate (re-verify published output) / deploy (guarded local copy) / snapshot.
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import {
  repoRoot, publishRoot, Diagnostics, paint, BondError, listFiles, sha256, readJson, writeJson, rmrf, isInside, THEME_ID, rel, toPosix,
} from './util.mjs';
import { loadTheme } from './workspace.mjs';
import { themePaths, verifyPackage } from './build.mjs';
import { readZip } from './zip.mjs';

// ---------------------------------------------------------------------------
// clean
// ---------------------------------------------------------------------------
export function clean(ws, ids, { all = false } = {}) {
  if (!fs.existsSync(publishRoot)) { console.log('bond: nothing to clean'); return true; }
  const targets = all ? [...ws.themes.keys(), '.staging'] : ids;
  for (const id of targets) {
    if (id !== '.staging' && !THEME_ID.test(id)) throw new BondError(`Invalid theme id "${id}"`, 'BOND041');
    if (id !== '.staging' && !ws.themes.has(id)) throw new BondError(`Unknown theme "${id}"`, 'BOND041');
    const dir = path.join(publishRoot, id);
    if (!fs.existsSync(dir)) continue;
    rmrf(dir, publishRoot); // asserts dir is strictly inside publish/
    console.log(`bond: removed ${rel(dir)}`);
  }
  if (all) {
    const leftovers = fs.readdirSync(publishRoot);
    if (leftovers.length) console.log(`bond: left unknown entries in ${rel(publishRoot)} untouched: ${leftovers.join(', ')}`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// validate: re-verify an existing publish/<theme> without rebuilding
// ---------------------------------------------------------------------------
export function validatePublished(ws, id) {
  const diag = new Diagnostics();
  const theme = loadTheme(ws, id);
  const p = themePaths(id);
  const loc = { file: theme.configFile };
  const bm = path.join(p.reports, 'build-manifest.json');
  if (!fs.existsSync(bm)) { diag.error('BOND600', `No build output for ${id}; run "bond build ${id}" first.`, loc); return diag; }
  if (fs.existsSync(path.join(p.reports, 'last-failure.json'))) diag.error('BOND601', `The last build of ${id} failed; publish/${id} holds stale artifacts.`, { file: path.join(p.reports, 'last-failure.json') });
  const manifest = readJson(bm);
  const v = readJson(path.join(p.reports, 'validation.json'));
  if (v.status !== 'passed') diag.error('BOND602', 'validation.json status is not "passed".', loc);
  if (manifest.version !== theme.version) diag.warn('BOND603', `Published version ${manifest.version} differs from source version ${theme.version} - rebuild.`, loc);

  // Every recorded output must still exist byte-for-byte; nothing extra may appear.
  const recorded = new Map(manifest.outputs.map((o) => [o.path, o]));
  const actual = listFiles(p.theme);
  for (const f of actual) if (!recorded.has(f)) diag.error('BOND604', `Unexpected file in published theme: ${f}`, { file: path.join(p.theme, f) });
  for (const [f, o] of recorded) {
    const abs = path.join(p.theme, ...f.split('/'));
    if (!fs.existsSync(abs)) diag.error('BOND605', `Missing published file: ${f}`, loc);
    else if (sha256(fs.readFileSync(abs)) !== o.sha256) diag.error('BOND606', `Published file changed since build: ${f}`, { file: abs });
  }

  if (manifest.package) {
    const zipPath = path.join(p.out, manifest.package.file);
    if (!fs.existsSync(zipPath)) diag.error('BOND607', `Package missing: ${manifest.package.file}`, loc);
    else {
      const zip = fs.readFileSync(zipPath);
      const hash = sha256(zip);
      if (hash !== manifest.package.sha256) diag.error('BOND608', 'Package checksum differs from build-manifest.json.', { file: zipPath });
      const sums = path.join(p.packages, 'SHA256SUMS');
      if (!fs.existsSync(sums) || !fs.readFileSync(sums, 'utf8').startsWith(hash)) diag.error('BOND609', 'SHA256SUMS missing or out of date.', { file: sums });
      // Rebuild a stage view from the published folder and verify ZIP contents against it.
      const d = theme.config.dnn;
      const stage = { files: new Map(), key: (r, f) => `${r}:${f}` };
      const roots = { skin: path.join(p.theme, 'Skins', d.skinName), container: path.join(p.theme, 'Containers', d.containerName || '') };
      for (const [r, dir] of Object.entries(roots)) for (const f of listFiles(dir)) stage.files.set(`${r}:${f}`, { data: fs.readFileSync(path.join(dir, f)) });
      const nested = {};
      for (const e of readZip(zip)) {
        if (e.name === 'Resources.zip' || e.name === 'ContainerResources.zip') nested[e.name] = readZip(e.data).map((x) => x.name);
      }
      verifyPackage({ zip, stage, layouts: manifest.layouts, containers: manifest.containers, nested, diag, fileName: zipPath });
      // Every staged file must be in exactly one place in the package.
      const packed = new Set([...(nested['Resources.zip'] || []).map((f) => `skin:${f}`), ...(nested['ContainerResources.zip'] || []).map((f) => `container:${f}`), ...manifest.layouts.map((f) => `skin:${f}`), ...manifest.containers.map((f) => `container:${f}`)]);
      for (const k of stage.files.keys()) if (!packed.has(k)) diag.error('BOND610', `Published file ${k} is not in the install package.`, { file: zipPath });
    }
  } else if (manifest.mode === 'production') {
    diag.error('BOND611', 'Production build without a package.', loc);
  }
  writeJson(path.join(p.reports, 'verify.json'), {
    status: diag.ok ? 'passed' : 'failed', theme: id, at: new Date().toISOString(),
    errors: diag.errors.map(({ code, message }) => ({ code, message })),
  });
  console.log(`bond: validate ${id}: ${diag.ok ? paint.green('passed') : paint.red(`FAILED (${diag.errors.length} error(s))`)}`);
  return diag;
}

// ---------------------------------------------------------------------------
// deploy: copy a validated build into an explicitly configured LOCAL DNN site
// ---------------------------------------------------------------------------
const MARKER = '.bond-deploy.json';

const SETTINGS = ['SITE_ROOT', 'PRUNE'];
// Near-misses of a setting name (SITEROOT, site-root, THEME, PRUNES…) are treated as typos.
const squash = (k) => k.toUpperCase().replace(/[^A-Z]/g, '').replace(/S$/, '');
const SQUASHED = new Map(SETTINGS.map((k) => [squash(k), k]));
/** Theme folder name -> .env key prefix: "bond" -> BOND, "my-shop" -> MY_SHOP. */
export const envKey = (id) => id.toUpperCase().replace(/[^A-Z0-9]/g, '_');

/**
 * Local DNN development sites to deploy to, from .env (git-ignored). Only this
 * file is read, never the shell environment, so a deploy target can't come
 * from a stray variable.
 *   <THEME>_SITE_ROOT=C:\DNN\bond-dev   the site for one theme (BOND_SITE_ROOT, DZP_SITE_ROOT, …)
 *   <THEME>_PRUNE=true                  prune setting for one theme
 *   SITE_ROOT=C:\DNN\my-dev-site        fallback for themes without their own line
 *   PRUNE=true                          fallback prune setting
 * @param {string[]} themeIds folders in themes/ (to recognise per-theme keys and typos)
 */
export function loadLocalConfig(themeIds = []) {
  const file = process.env.BOND_LOCAL_CONFIG ? path.resolve(process.env.BOND_LOCAL_CONFIG) : path.join(repoRoot, '.env');
  if (!fs.existsSync(file)) {
    throw new BondError('No local DNN site configured. Copy .env.example to .env (git-ignored) and set <THEME>_SITE_ROOT (e.g. BOND_SITE_ROOT) to your local DNN site. The site is never guessed.', 'BOND700', { file: path.join(repoRoot, '.env.example') });
  }
  const loc = { file };
  let vars;
  try { vars = parseEnv(fs.readFileSync(file, 'utf8')); } catch (e) { throw new BondError(`Cannot read ${path.basename(file)}: ${e.message}`, 'BOND706', loc); }

  // .env may hold other tools' variables; only things that look like OUR settings are checked.
  const known = new Set([...SETTINGS, ...themeIds.flatMap((id) => [`${envKey(id)}_SITE_ROOT`, `${envKey(id)}_PRUNE`])]);
  const problems = [];
  for (const k of Object.keys(vars)) {
    if (known.has(k)) continue;
    const sq = squash(k);
    if (SQUASHED.has(sq)) { problems.push(`${k} (did you mean ${SQUASHED.get(sq)}?)`); continue; }
    const m = /^(.+?)(SITEROOT|PRUNE)$/.exec(sq);
    if (!m) continue;
    const setting = m[2] === 'SITEROOT' ? 'SITE_ROOT' : 'PRUNE';
    const id = themeIds.find((t) => envKey(t).replace(/_/g, '') === m[1]);
    problems.push(id ? `${k} (did you mean ${envKey(id)}_${setting}?)` : `${k} (there is no theme "${m[1].toLowerCase()}" in themes/: ${themeIds.join(', ') || 'none'})`);
  }
  if (problems.length) throw new BondError(`Unrecognised setting(s) in ${path.basename(file)}: ${problems.join(', ')}.`, 'BOND706', loc);

  const val = (k) => (vars[k] || '').trim();
  return {
    file,
    /** { key, value } of the site root that applies to a theme ('' when none). */
    siteRootFor: (id) => (val(`${envKey(id)}_SITE_ROOT`) ? { key: `${envKey(id)}_SITE_ROOT`, value: val(`${envKey(id)}_SITE_ROOT`) } : { key: 'SITE_ROOT', value: val('SITE_ROOT') }),
    pruneFor: (id) => /^(1|true|yes)$/i.test(val(`${envKey(id)}_PRUNE`) || val('PRUNE')),
  };
}

/**
 * Refuse symlinks/junctions anywhere from `root` down to `target` (inclusive):
 * string-based containment checks are meaningless if a folder on the way is a
 * link to somewhere else (e.g. a skin folder junctioned to a git checkout).
 */
function assertNoLinks(root, target, loc) {
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new BondError(`Refusing to touch ${target}: outside ${root}`, 'BOND715', loc);
  let cur = root;
  for (const seg of ['', ...rel.split(path.sep).filter(Boolean)]) {
    cur = seg ? path.join(cur, seg) : cur;
    let st;
    try { st = fs.lstatSync(cur); } catch { return; } // the rest does not exist yet
    if (st.isSymbolicLink()) throw new BondError(`${cur} is a symbolic link or junction; bond only deploys into real folders.`, 'BOND717', loc);
  }
}

function assertDnnSite(siteRoot, loc) {
  if (!path.isAbsolute(siteRoot)) throw new BondError(`siteRoot must be an absolute path: ${siteRoot}`, 'BOND701', loc);
  if (siteRoot.startsWith('\\\\') || siteRoot.startsWith('//')) throw new BondError('Network (UNC) paths are refused: local deploy is for a development site on this machine.', 'BOND702', loc);
  if (isInside(repoRoot, siteRoot) || isInside(siteRoot, repoRoot)) throw new BondError('siteRoot may not overlap the repository.', 'BOND703', loc);
  const must = ['web.config', path.join('bin', 'DotNetNuke.dll'), path.join('Portals', '_default')];
  for (const m of must) if (!fs.existsSync(path.join(siteRoot, m))) throw new BondError(`${siteRoot} does not look like a DNN site (missing ${m}).`, 'BOND704', loc);
  // Same overlap rule on real paths (siteRoot itself may be a junction).
  const real = fs.realpathSync(siteRoot); const realRepo = fs.realpathSync(repoRoot);
  if (isInside(realRepo, real) || isInside(real, realRepo)) throw new BondError('siteRoot (resolved) may not overlap the repository.', 'BOND703', loc);
}

/** Every file about to be deployed must still match build-manifest.json (no edits/injections in publish/). */
function assertUntouched(p, bm, loc) {
  const recorded = new Map(bm.outputs.map((o) => [o.path, o.sha256]));
  const actual = listFiles(p.theme);
  for (const f of actual) {
    if (!recorded.has(f)) throw new BondError(`publish contains a file the build did not produce: ${f}. Rebuild before deploying.`, 'BOND716', loc);
    if (sha256(fs.readFileSync(path.join(p.theme, ...f.split('/')))) !== recorded.get(f)) throw new BondError(`Published file changed since build: ${f}. Rebuild before deploying.`, 'BOND716', loc);
  }
  for (const f of recorded.keys()) if (!actual.includes(f)) throw new BondError(`Published file missing: ${f}. Rebuild before deploying.`, 'BOND716', loc);
}

/**
 * @param {{dryRun?: boolean, adopt?: boolean, prune?: boolean}} opts
 */
export function deploy(ws, id, opts = {}) {
  const theme = loadTheme(ws, id);
  const config = loadLocalConfig([...ws.themes.keys()]);
  const loc = { file: config.file };
  const { key, value: raw } = config.siteRootFor(id);
  if (!raw) throw new BondError(`No site for theme "${id}": set ${envKey(id)}_SITE_ROOT (or SITE_ROOT for every theme) in ${path.basename(config.file)}.`, 'BOND705', loc);
  if (/^(\\\\|\/\/)/.test(raw)) throw new BondError('Network (UNC) paths are refused: local deploy is for a development site on this machine.', 'BOND702', loc);
  if (!path.isAbsolute(raw)) throw new BondError(`${key} must be an absolute path: ${raw}`, 'BOND701', loc);
  const siteRoot = path.resolve(raw);
  assertDnnSite(siteRoot, loc);

  const p = themePaths(id);
  if (!fs.existsSync(path.join(p.reports, 'validation.json'))) throw new BondError(`No build for ${id}. Run "bond build ${id}" first.`, 'BOND709', loc);
  if (fs.existsSync(path.join(p.reports, 'last-failure.json'))) throw new BondError(`Last build of ${id} failed; refusing to deploy stale artifacts.`, 'BOND710', loc);
  if (readJson(path.join(p.reports, 'validation.json')).status !== 'passed') throw new BondError('Build validation did not pass.', 'BOND711', loc);
  const bm = readJson(path.join(p.reports, 'build-manifest.json'));
  assertUntouched(p, bm, loc);

  const d = theme.config.dnn;
  const pairs = [
    { src: path.join(p.theme, 'Skins', d.skinName), dest: path.join(siteRoot, 'Portals', '_default', 'Skins', d.skinName), base: path.join(siteRoot, 'Portals', '_default', 'Skins') },
  ];
  if (d.containerName && fs.existsSync(path.join(p.theme, 'Containers', d.containerName))) {
    pairs.push({ src: path.join(p.theme, 'Containers', d.containerName), dest: path.join(siteRoot, 'Portals', '_default', 'Containers', d.containerName), base: path.join(siteRoot, 'Portals', '_default', 'Containers') });
  }
  const plan = [];
  for (const pair of pairs) {
    if (!isInside(pair.base, pair.dest) || path.dirname(pair.dest) !== pair.base) throw new BondError(`Computed destination escapes ${pair.base}: ${pair.dest}`, 'BOND712', loc);
    assertNoLinks(siteRoot, pair.dest, loc);
    const markerFile = path.join(pair.dest, MARKER);
    let previous = null;
    if (fs.existsSync(pair.dest)) {
      if (fs.existsSync(markerFile)) {
        previous = readJson(markerFile);
        if (previous.theme !== id) throw new BondError(`${pair.dest} was deployed by theme "${previous.theme}", not "${id}".`, 'BOND713', loc);
      } else if (!opts.adopt) {
        throw new BondError(`${pair.dest} exists but was not deployed by bond (no ${MARKER}). It may be an installed package or another theme. Re-run with --adopt once you have confirmed it is this theme.`, 'BOND714', loc);
      }
    }
    const files = listFiles(pair.src);
    // Case-insensitive: on NTFS "theme.js" and "Theme.js" are the same file.
    const current = new Set(files.map((f) => f.toLowerCase()));
    const leftover = (previous?.files || []).map(String).filter((f) => !current.has(f.toLowerCase()));
    const prune = opts.prune || config.pruneFor(id);
    const stale = prune ? leftover : [];
    // Without pruning, files bond deployed before stay bond's: keep them in the
    // marker so a later --prune can still remove them.
    const kept = prune ? [] : leftover.filter((f) => isInside(pair.dest, path.join(pair.dest, ...f.split('/'))) && fs.existsSync(path.join(pair.dest, ...f.split('/'))));
    plan.push({ ...pair, files, stale, kept, markerFile });
  }

  console.log(`bond: deploy ${id} ${bm.version} (${bm.mode}, ${bm.git.short}) -> ${siteRoot} (${key})${opts.dryRun ? ' [dry run]' : ''}`);
  for (const step of plan) {
    console.log(`  ${step.files.length} file(s) -> ${step.dest}${step.stale.length ? `; prune ${step.stale.length} stale file(s) previously deployed by bond` : ''}`);
    for (const f of step.stale) console.log(`    - ${f}`);
    if (step.kept.length) console.log(`  ${step.kept.length} file(s) from an earlier deploy are no longer in the build; kept (use --prune or ${envKey(id)}_PRUNE=true to remove them)`);
    if (opts.dryRun) continue;
    for (const f of step.files) {
      const to = path.join(step.dest, ...f.split('/'));
      if (!isInside(step.dest, to)) throw new BondError(`Refusing to write outside ${step.dest}: ${f}`, 'BOND715', loc);
      assertNoLinks(siteRoot, to, loc);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      if (!isInside(fs.realpathSync(step.dest), fs.realpathSync(path.dirname(to)))) throw new BondError(`Refusing to write outside ${step.dest}: ${f}`, 'BOND715', loc);
      fs.copyFileSync(path.join(step.src, ...f.split('/')), to);
    }
    for (const f of step.stale) {
      const victim = path.join(step.dest, ...f.split('/'));
      if (!isInside(step.dest, victim) || !fs.existsSync(victim)) continue;
      assertNoLinks(siteRoot, victim, loc);
      fs.rmSync(victim);
      // Remove folders the prune emptied (never dest itself, never a folder with other files).
      for (let dir = path.dirname(victim); dir !== step.dest && isInside(step.dest, dir); dir = path.dirname(dir)) {
        if (fs.readdirSync(dir).length) break;
        fs.rmdirSync(dir);
      }
    }
    writeJson(step.markerFile, { theme: id, version: bm.version, mode: bm.mode, git: bm.git.sha, deployedAt: new Date().toISOString(), files: [...step.files, ...step.kept] });
  }
  if (!opts.dryRun) {
    console.log('bond: deployed. DNN caches client resources as ?cdv=<CRM version>: with debug mode on, a refresh is enough; otherwise increment the client resource version (or reinstall the ZIP) to bust caches.');
  }
  return plan;
}

// ---------------------------------------------------------------------------
// snapshot: record the shipped file list of a release (drives DNN Cleanup)
// ---------------------------------------------------------------------------
export function snapshot(ws, id) {
  const theme = loadTheme(ws, id);
  const p = themePaths(id);
  const bmFile = path.join(p.reports, 'build-manifest.json');
  if (!fs.existsSync(bmFile)) throw new BondError(`Build ${id} in production mode first.`, 'BOND800');
  const bm = readJson(bmFile);
  if (bm.mode !== 'production' || bm.version !== theme.version) throw new BondError('Snapshot requires a production build of the current version.', 'BOND801');
  const d = theme.config.dnn;
  const skin = listFiles(path.join(p.theme, 'Skins', d.skinName));
  const container = d.containerName ? listFiles(path.join(p.theme, 'Containers', d.containerName)) : [];
  const file = path.join(theme.dir, 'releases', `${theme.dnnVersion}.files.json`);
  writeJson(file, { version: theme.dnnVersion, git: bm.git.sha, package: bm.package?.sha256, skin, container });
  console.log(`bond: wrote ${toPosix(path.relative(repoRoot, file))}`);
  return file;
}
