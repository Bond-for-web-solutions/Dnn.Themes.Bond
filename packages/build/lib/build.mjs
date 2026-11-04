// Theme build pipeline:
//   resolve deps -> overlay shared skin files -> compile CSS/JS -> stage
//   -> validate -> package -> verify package -> reports -> atomic swap
// into publish/<theme>/. See docs/build-system.md.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import {
  repoRoot, publishRoot, Diagnostics, paint, BondError, listFiles, readNormalized, sha256, sizes, writeJson, readJson,
  rmrf, renameRetry, toPosix, rel, compareDnnVersion, isText,
} from './util.mjs';
import { loadTheme, dependencyClosure, contentHash } from './workspace.mjs';
import { compileCss, compileJs, makeOwnerLookup } from './compile.mjs';
import { checkAscx, checkMenus } from './dnn-checks.mjs';
import { auditCss } from './css-audit.mjs';
import { generateManifest, checkManifestXml } from './manifest.mjs';
import { createZip, readZip } from './zip.mjs';
import { gitInfo, buildEpoch } from './git.mjs';

const require = createRequire(import.meta.url);
const BUILD_VERSION = readJson(fileURLToPath(new URL('../package.json', import.meta.url))).version;
const LIGHTNINGCSS_VERSION = readJson(path.join(path.dirname(require.resolve('lightningcss')), '..', 'package.json')).version;

// ALLOWLIST of file types a theme may ship. Anything else (.aspx/.ashx/.asmx/.svc
// handlers IIS would execute, scripts, binaries, keys, sources) is refused.
// web.config is allowed by exact name only (BOND363 warns about it).
const ALLOWED_EXT = new Set(['.ascx', '.cshtml', '.vbhtml', '.xml', '.css', '.js', '.map', '.json', '.resx', '.txt', '.html', '.htm',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico', '.woff2', '.woff', '.otf', '.ttf', '.eot']);
const SOURCE_ONLY = (name) => /\.(md|markdown)$/i.test(name);
const SECRET_PATTERNS = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, 'Slack token'],
  [/\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/, 'Stripe live key'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, 'JSON Web Token'],
  [/(?:^|[;"'\s])(?:password|pwd)\s*=\s*[^;"'\s<>]{3,}\s*;/i, 'connection-string password'],
  [/\bAccountKey=[A-Za-z0-9+/=]{20,}/, 'Azure storage key'],
];

export function themePaths(id) {
  const out = path.join(publishRoot, id);
  return { out, theme: path.join(out, 'theme'), packages: path.join(out, 'packages'), reports: path.join(out, 'reports') };
}

class Stage {
  constructor(roots) { this.roots = roots; this.files = new Map(); }
  key(root, p) { return `${root}:${p}`; }
  put(root, p, data, origin, diag, src) {
    const k = this.key(root, p);
    const lower = [...this.files.keys()].find((x) => x.toLowerCase() === k.toLowerCase() && x !== k);
    if (lower) throw new BondError(`"${p}" collides with "${lower.split(':')[1]}" on case-insensitive file systems (IIS/Windows).`, 'BOND201');
    const prev = this.files.get(k);
    if (prev && prev.origin !== origin) diag?.info('BOND202', `${root}/${p} from ${prev.origin} overridden by ${origin}`);
    this.files.set(k, { root, path: p, data, origin, src });
  }
  list(root) { return [...this.files.values()].filter((f) => f.root === root).sort((a, b) => (a.path < b.path ? -1 : 1)); }
  write() {
    for (const f of this.files.values()) {
      const abs = path.join(this.roots[f.root], ...f.path.split('/'));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, f.data);
    }
  }
}

function copyTree(stage, srcDir, root, origin, { mode }) {
  for (const f of listFiles(srcDir)) {
    const name = path.posix.basename(f);
    if (SOURCE_ONLY(name) || (mode === 'production' && name.endsWith('.map'))) continue;
    const src = path.join(srcDir, ...f.split('/'));
    stage.put(root, f, readNormalized(src), origin, null, src);
  }
}

function loadSnapshots(theme) {
  const dir = path.join(theme.dir, 'releases');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d{2}\.\d{2}\.\d{2}\.files\.json$/.test(f)).map((f) => readJson(path.join(dir, f)));
}

/** Files shipped by an earlier release but no longer produced -> DNN Cleanup component. */
function computeCleanup(theme, stage) {
  const current = { skin: new Set(stage.list('skin').map((f) => f.path.toLowerCase())), container: new Set(stage.list('container').map((f) => f.path.toLowerCase())) };
  const removed = { skin: new Set(), container: new Set() };
  for (const snap of loadSnapshots(theme)) {
    if (compareDnnVersion(snap.version, theme.dnnVersion) >= 0) continue;
    for (const kind of ['skin', 'container']) for (const f of snap[kind] || []) if (!current[kind].has(f.toLowerCase())) removed[kind].add(f);
  }
  return { skin: [...removed.skin].sort(), container: [...removed.container].sort() };
}

function scanSecrets(stage, roots, diag) {
  for (const f of stage.files.values()) {
    if (!isText(f.path)) continue;
    const text = f.data.toString('utf8');
    for (const [re, label] of SECRET_PATTERNS) {
      if (re.test(text)) diag.error('BOND360', `Possible ${label} in shipped file - remove it; secrets must never reach a theme package.`, { file: path.join(roots[f.root], f.path) });
    }
  }
}

function validateStage({ theme, stage, roots, diag, mode, ownPrefix, foreignPrefixes, cssOutputs }) {
  const cspLevel = theme.config.csp?.inlineScripts ?? 'warning';
  const skinFiles = new Set(stage.list('skin').map((f) => f.path));
  const layouts = [...skinFiles].filter((f) => !f.includes('/') && f.toLowerCase().endsWith('.ascx') && !f.startsWith('_')).sort();
  const containers = stage.list('container').map((f) => f.path).filter((f) => !f.includes('/') && f.toLowerCase().endsWith('.ascx')).sort();
  if (!layouts.length) diag.error('BOND300', 'No layouts: expected at least one *.ascx at the root of skin/.', { file: path.join(theme.dir, 'skin') });

  const noPane = new Set((theme.config.layoutsWithoutContentPane || []).map((x) => x.toLowerCase()));
  for (const l of layouts) checkAscx({ root: roots.skin, relFile: l, kind: 'layout', diag, stagedFiles: skinFiles, cspLevel, contentPaneOptional: noPane.has(l.toLowerCase()) });
  const containerSet = new Set(stage.list('container').map((f) => f.path));
  for (const c of containers) checkAscx({ root: roots.container, relFile: c, kind: 'container', diag, stagedFiles: containerSet, cspLevel });
  checkMenus({ root: roots.skin, diag, stagedFiles: skinFiles, cspLevel });

  // DNN auto-registers <skin>/skin.css (priority 15) and <skin>/<layout>.css (20).
  const layoutNames = new Set(layouts.map((l) => l.replace(/\.ascx$/i, '').toLowerCase()));
  for (const f of skinFiles) {
    if (f.includes('/') || !f.endsWith('.css') || f === 'skin.css') continue;
    if (!layoutNames.has(f.replace(/\.css$/, '').toLowerCase())) {
      diag.warn('BOND340', `${f} sits at the skin root but matches no layout, so DNN will not auto-load it. Move it under resources/ and include it explicitly.`, { file: path.join(roots.skin, f) });
    }
  }

  for (const f of stage.files.values()) {
    const abs = path.join(roots[f.root], f.path);
    const ext = path.extname(f.path).toLowerCase();
    const isWebConfig = path.posix.basename(f.path).toLowerCase() === 'web.config';
    if (!ALLOWED_EXT.has(ext) && !isWebConfig) diag.error('BOND361', `File type "${ext || '(none)'}" is not allowed in a theme package (allowlist in build.mjs; server-executable types such as .aspx/.ashx are never shipped).`, { file: abs });
    if (mode === 'production' && ext === '.map') diag.error('BOND362', 'Source maps are not shipped in production builds.', { file: abs });
    if (path.posix.basename(f.path).toLowerCase() === 'web.config') diag.warn('BOND363', 'web.config inside a theme changes IIS/ASP.NET behaviour for that folder - make sure it is intentional.', { file: abs });
    if (ext === '.css') {
      const text = f.data.toString('utf8');
      for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
        const u = m[2].trim();
        if (/^(data:|#|[a-z]+:\/\/|\/\/)/i.test(u)) continue;
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(f.path), u.replace(/[?#].*$/, '')));
        const exists = stage.files.has(stage.key(f.root, target));
        if (!exists) diag.error('BOND364', `url(${u}) does not resolve to a staged file.`, { file: abs });
      }
    }
  }
  scanSecrets(stage, roots, diag);

  // Compiled CSS audit.
  const audits = {};
  const allowGlobals = new Set(theme.config.globalSelectors || []);
  const maxImportant = theme.config.maxImportant ?? 0;
  for (const o of cssOutputs) {
    const file = stage.files.get(stage.key(o.root, o.path));
    const a = auditCss({ code: file.data.toString('utf8'), filename: o.path, ownPrefix, foreignPrefixes, container: o.root === 'container' });
    audits[`${o.root}/${o.path}`] = a;
    const loc = { file: path.join(theme.dir, o.src) };
    if (a.layers) diag.error('BOND350', `@layer found (${a.layers}). DNN's default.css and module CSS are unlayered, so layered theme rules lose to all of them - see docs/css-architecture.md#why-no-cascade-layers.`, loc);
    if (a.important > maxImportant) diag.error('BOND351', `${a.important} !important declaration(s) (budget ${maxImportant}).`, loc);
    if (a.foreignClasses.length) diag.error('BOND352', `Classes owned by another theme leak into this bundle: ${a.foreignClasses.slice(0, 8).join(', ')}`, loc);
    if (a.container && a.rootCustomProperties) diag.error('BOND353', 'Container CSS defines :root custom properties; containers can be used under other skins and must not redefine tokens.', loc);
    const unexpected = a.globalSelectors.filter((s) => !allowGlobals.has(s));
    if (unexpected.length) diag.error('BOND354', `Unscoped selectors not allowlisted in theme.json "globalSelectors": ${unexpected.slice(0, 10).map((s) => `"${s}"`).join(', ')}${unexpected.length > 10 ? ' …' : ''}`, loc);
  }
  return { layouts, containers, audits };
}

function checkBudgets(theme, stage, roots, diag) {
  const results = {};
  for (const [out, budget] of Object.entries(theme.config.budgets || {})) {
    const f = stage.files.get(stage.key('skin', out)) || stage.files.get(stage.key('container', out));
    if (!f) { diag.warn('BOND370', `Budget configured for "${out}" but no such output.`, { file: theme.configFile }); continue; }
    const s = sizes(f.data);
    results[out] = { ...s, budget };
    for (const k of ['bytes', 'gzip', 'brotli']) {
      if (budget[k] != null && s[k] > budget[k]) diag.error('BOND371', `${out} is ${s[k]} ${k} bytes; budget is ${budget[k]}.`, { file: theme.configFile });
    }
  }
  return results;
}

function packageTheme({ theme, stage, layouts, containers, cleanup, mtime, diag, mode }) {
  const d = theme.config.dnn;
  const skinRes = stage.list('skin').filter((f) => !layouts.includes(f.path));
  const contRes = stage.list('container').filter((f) => !containers.includes(f.path));
  const manifest = generateManifest({ dnn: d, version: theme.dnnVersion, layouts, containers, hasSkinResources: skinRes.length > 0, hasContainerResources: contRes.length > 0, cleanup });
  const entries = [
    { name: 'manifest.dnn', data: Buffer.from(manifest, 'utf8') },
    { name: 'License.txt', data: readNormalized(path.join(theme.dir, d.license)) },
    { name: 'ReleaseNotes.txt', data: readNormalized(path.join(theme.dir, d.releaseNotes)) },
  ];
  const rootNames = new Set(entries.map((e) => e.name.toLowerCase()));
  for (const f of [...layouts.map((l) => stage.files.get(stage.key('skin', l))), ...containers.map((c) => stage.files.get(stage.key('container', c)))]) {
    if (rootNames.has(f.path.toLowerCase())) throw new BondError(`"${f.path}" exists as both a layout and a container (or clashes with a package file); DNN installs both from the ZIP root. Rename one.`, 'BOND500');
    rootNames.add(f.path.toLowerCase());
    entries.push({ name: f.path, data: f.data });
  }
  const nested = {};
  if (skinRes.length) {
    nested['Resources.zip'] = skinRes.map((f) => f.path);
    entries.push({ name: 'Resources.zip', data: createZip(skinRes.map((f) => ({ name: f.path, data: f.data })), { mtime }) });
  }
  if (contRes.length) {
    nested['ContainerResources.zip'] = contRes.map((f) => f.path);
    entries.push({ name: 'ContainerResources.zip', data: createZip(contRes.map((f) => ({ name: f.path, data: f.data })), { mtime }) });
  }
  const zip = createZip(entries, { mtime });
  const safe = d.packageName.replace(/[^A-Za-z0-9._-]/g, '_');
  const fileName = `${safe}_${theme.dnnVersion}_Install${mode === 'production' ? '' : '-dev'}.zip`;
  verifyPackage({ zip, theme, stage, layouts, containers, nested, diag, fileName });
  return { zip, fileName, manifest, nested };
}

/** Re-read what we just wrote and prove it is what DNN expects. */
export function verifyPackage({ zip, stage, layouts, containers, nested, diag, fileName }) {
  const loc = { file: fileName };
  const entries = new Map(readZip(zip).map((e) => [e.name, e]));
  const manifest = entries.get('manifest.dnn');
  if (!manifest) { diag.error('BOND520', 'Install ZIP has no manifest.dnn at its root.', loc); return; }
  const { problems, referenced } = checkManifestXml(manifest.data.toString('utf8'));
  for (const p of problems) diag.error('BOND521', `manifest.dnn: ${p}`, loc);
  for (const r of referenced) if (!entries.has(r)) diag.error('BOND522', `manifest.dnn references "${r}" but the ZIP does not contain it.`, loc);
  const expectedRoot = new Set(['manifest.dnn', 'License.txt', 'ReleaseNotes.txt', ...layouts, ...containers, ...Object.keys(nested)]);
  for (const name of entries.keys()) if (!expectedRoot.has(name)) diag.error('BOND523', `Unexpected file in install ZIP: ${name}`, loc);
  for (const [zipName, files] of Object.entries(nested)) {
    const root = zipName === 'Resources.zip' ? 'skin' : 'container';
    const inner = new Map(readZip(entries.get(zipName).data).map((e) => [e.name, e]));
    if (inner.size !== files.length) diag.error('BOND524', `${zipName} has ${inner.size} entries, expected ${files.length}.`, loc);
    for (const f of files) {
      const e = inner.get(f);
      if (!e) diag.error('BOND525', `${zipName} is missing ${f}.`, loc);
      else if (!e.data.equals(stage.files.get(stage.key(root, f)).data)) diag.error('BOND526', `${zipName}:${f} differs from the staged file.`, loc);
    }
  }
}

/**
 * Build one theme.
 * @param {object} ws workspace
 * @param {string} id theme id
 * @param {{mode?: 'production'|'development', package?: boolean}} opts
 */
export async function buildTheme(ws, id, opts = {}) {
  const started = performance.now();
  const mode = opts.mode || 'production';
  const diag = new Diagnostics();
  const theme = loadTheme(ws, id);
  const prod = mode === 'production';
  const makePackage = prod || !!opts.package;
  const closure = dependencyClosure(ws, theme.pkg);
  const ownerOf = makeOwnerLookup(ws);
  const info = gitInfo();
  const d = theme.config.dnn;
  const ownPrefix = theme.config.prefix;
  const foreignPrefixes = [...ws.themes.keys()].filter((t) => t !== id).map((t) => {
    try { return readJson(path.join(ws.themes.get(t).dir, 'theme.json')).prefix; } catch { return null; }
  }).filter((p) => p && p !== ownPrefix);
  const banner = `/*! ${d.packageName} ${theme.version} | ${info.short}${info.dirty ? '+dirty' : ''} | ${mode} */`;

  console.log(`bond: building ${id} ${theme.version} (${mode}) with ${closure.length - 1} shared package(s): ${closure.slice(0, -1).map((p) => p.name).join(', ') || '-'}`);

  const staging = path.join(publishRoot, '.staging');
  fs.mkdirSync(staging, { recursive: true });
  const work = fs.mkdtempSync(path.join(staging, `${id}-`));
  try {
    const out = path.join(work, id);
    const roots = {
      skin: path.join(out, 'theme', 'Skins', d.skinName),
      container: path.join(out, 'theme', 'Containers', d.containerName || `${d.skinName}`),
    };
    const stage = new Stage(roots);

    // 1. Shared skin overlays (dependency order), then the theme's own files win.
    for (const p of closure.slice(0, -1)) {
      if (p.bond.skinOverlay) copyTree(stage, path.join(p.dir, p.bond.skinOverlay), 'skin', p.name, { mode });
    }
    const themeSkin = path.join(theme.dir, 'skin');
    for (const f of listFiles(themeSkin)) {
      const name = path.posix.basename(f);
      if (SOURCE_ONLY(name) || (prod && name.endsWith('.map'))) continue;
      const src = path.join(themeSkin, ...f.split('/'));
      stage.put('skin', f, readNormalized(src), theme.pkg.name, diag, src);
    }
    if (theme.hasContainers) copyTree(stage, path.join(theme.dir, 'containers'), 'container', theme.pkg.name, { mode });

    // 2. CSS entry points.
    const cssOutputs = [];
    const assetSources = new Map();
    for (const [root, map] of [['skin', theme.config.styles || {}], ['container', theme.config.containerStyles || {}]]) {
      for (const [outPath, src] of Object.entries(map)) {
        const entry = path.join(theme.dir, src);
        const res = await compileCss({ entry, outPath, mode, ownerOf, theme });
        for (const w of res.warnings) diag.warn('BOND111', w.message, w);
        let code = `${banner}\n${res.code}`;
        if (res.map) {
          stage.put(root, `${outPath}.map`, Buffer.from(res.map), 'compiler');
          code += `\n/*# sourceMappingURL=${path.posix.basename(outPath)}.map */\n`;
        }
        stage.put(root, outPath, Buffer.from(code, 'utf8'), 'compiler', diag, entry);
        cssOutputs.push({ root, path: outPath, src });
        for (const a of res.assets) {
          const k = `${root}:${a.out}`;
          if (assetSources.has(k) && assetSources.get(k) !== a.src) throw new BondError(`Two different files map to ${a.out}: ${rel(assetSources.get(k))} and ${rel(a.src)}`, 'BOND126');
          assetSources.set(k, a.src);
          stage.put(root, a.out, fs.readFileSync(a.src), 'asset', null, a.src);
        }
      }
    }

    // 3. JS entry points.
    const jsInputs = {};
    for (const [outPath, src] of Object.entries(theme.config.scripts || {})) {
      const outAbs = path.join(roots.skin, outPath);
      const res = await compileJs({ entry: path.join(theme.dir, src), outAbs, mode, banner, ownerOf });
      for (const w of res.warnings) diag.warn('BOND131', w.message, w);
      stage.put('skin', outPath, res.code, 'compiler', diag, path.join(theme.dir, src));
      if (res.map) stage.put('skin', `${outPath}.map`, res.map, 'compiler');
      jsInputs[outPath] = res.inputs;
    }

    stage.write();
    // Report problems against the files developers edit, not the temp staging copy.
    const bySrc = new Map([...stage.files.values()].map((f) => [path.join(roots[f.root], ...f.path.split('/')), f.src]));
    diag.mapFile = (abs) => bySrc.get(abs) || (abs.startsWith(work) ? theme.configFile : abs);

    // 4. Validate the staged runtime files.
    const { layouts, containers, audits } = validateStage({ theme, stage, roots, diag, mode, ownPrefix, foreignPrefixes, cssOutputs });
    const budgets = prod ? checkBudgets(theme, stage, roots, diag) : {};
    if (!diag.ok) throw new BondError(`Validation failed with ${diag.errors.length} error(s).`, 'BOND390', { file: theme.configFile });

    // 5. Package.
    const mtime = buildEpoch(info);
    const cleanup = computeCleanup(theme, stage);
    let pkgInfo = null;
    if (makePackage) {
      const { zip, fileName, nested } = packageTheme({ theme, stage, layouts, containers, cleanup, mtime, diag, mode });
      if (!diag.ok) throw new BondError(`Package verification failed with ${diag.errors.length} error(s).`, 'BOND590', { file: theme.configFile });
      const pkgDir = path.join(out, 'packages');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, fileName), zip);
      const hash = sha256(zip);
      fs.writeFileSync(path.join(pkgDir, 'SHA256SUMS'), `${hash}  ${fileName}\n`);
      pkgInfo = { file: `packages/${fileName}`, bytes: zip.length, sha256: hash, nested: Object.fromEntries(Object.entries(nested).map(([k, v]) => [k, v.length])) };
    }

    // 6. Reports (the only non-deterministic files: they record time and durations).
    const lock = path.join(repoRoot, 'pnpm-lock.yaml');
    const outputs = [...stage.files.values()].map((f) => {
      const base = f.root === 'skin' ? `Skins/${d.skinName}` : `Containers/${d.containerName}`;
      const s = /\.(css|js|svg|json|xml|ascx|cshtml|otf|ttf)$/i.test(f.path) ? sizes(f.data) : { bytes: f.data.length };
      return { path: `${base}/${f.path}`, origin: f.origin, sha256: sha256(f.data), ...s };
    }).sort((a, b) => (a.path < b.path ? -1 : 1));
    const reports = path.join(out, 'reports');
    writeJson(path.join(reports, 'build-manifest.json'), {
      schema: 1,
      theme: id,
      packageName: d.packageName,
      version: theme.version,
      dnnVersion: theme.dnnVersion,
      mode,
      git: info,
      toolchain: { node: process.version, esbuild: esbuild.version, lightningcss: LIGHTNINGCSS_VERSION, buildTool: BUILD_VERSION },
      lockfileSha256: fs.existsSync(lock) ? sha256(readNormalized(lock)) : null,
      dependencies: closure.map((p) => ({ name: p.name, version: p.version, contentHash: contentHash(p.dir) })),
      layouts, containers,
      cleanup,
      jsInputs,
      cssAudit: audits,
      budgets,
      package: pkgInfo,
      outputs,
      builtAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - started),
    });
    writeJson(path.join(reports, 'validation.json'), {
      status: 'passed',
      theme: id,
      mode,
      errors: [],
      warnings: diag.warnings.map(({ code, message, file, line }) => ({ code, message, file: file && toPosix(path.relative(repoRoot, file)), line })),
      info: diag.items.filter((i) => i.level === 'info').map(({ code, message }) => ({ code, message })),
    });
    if (theme.hasContainers === false) fs.rmSync(path.join(out, 'theme', 'Containers'), { recursive: true, force: true });

    // 7. Atomic swap into publish/<id>.
    const final = themePaths(id).out;
    const trash = path.join(staging, `${id}-old-${process.pid}-${Date.now()}`);
    if (fs.existsSync(final)) renameRetry(final, trash);
    try {
      renameRetry(out, final);
    } catch (err) {
      // Put the previous good output back rather than leaving publish/<id> missing.
      if (fs.existsSync(trash) && !fs.existsSync(final)) renameRetry(trash, final);
      throw new BondError(`Could not move the new build into ${rel(final)}: ${err.message}. Previous output restored.`, 'BOND391', { file: theme.configFile });
    }
    if (fs.existsSync(trash)) rmrf(trash, publishRoot);
    const ms = Math.round(performance.now() - started);
    console.log(`bond: ${id} ${paint.green('OK')} in ${ms} ms -> ${rel(final)}${pkgInfo ? ` (${pkgInfo.file}, sha256 ${pkgInfo.sha256.slice(0, 12)}…)` : ' (no package: development build; pass --package to create one)'}`);
    return { ok: true, diag, pkg: pkgInfo, out: final };
  } catch (err) {
    // Unexpected exceptions (I/O, antivirus locks, bugs) are failures too: they must
    // still mark publish/<id> as stale and must not abort `build --all`.
    if (!(err instanceof BondError)) diag.error('BOND999', `Unexpected error: ${err && err.stack ? err.stack : err}`, { file: theme.configFile });
    else if (err.code !== 'BOND390' && err.code !== 'BOND590') diag.error(err.code, err.message, err.loc);
    const reports = themePaths(id).reports;
    if (fs.existsSync(reports)) {
      writeJson(path.join(reports, 'last-failure.json'), {
        status: 'failed', theme: id, mode, at: new Date().toISOString(),
        errors: diag.errors.map(({ code, message, file, line }) => ({ code, message, file: file && toPosix(path.relative(repoRoot, file)), line })),
        note: 'The artifacts in this folder are from the previous successful build. Deploy refuses to run while this file exists.',
      });
    }
    console.error(`bond: ${id} ${paint.red('FAILED', process.stderr)} (${diag.errors.length} error(s)); previous output in ${rel(themePaths(id).out)} left untouched.`);
    return { ok: false, diag };
  } finally {
    if (fs.existsSync(work)) rmrf(work, publishRoot);
  }
}
