// CSS (Lightning CSS) and JS (esbuild) compilation with package-boundary checks.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { bundleAsync } from 'lightningcss';
import * as esbuild from 'esbuild';
import { BondError, repoRoot, rel, toPosix, isInside } from './util.mjs';

// Browser support baseline (docs/performance.md#browser-support). Lightning CSS
// encodes versions as (major << 16) | (minor << 8).
export const CSS_TARGETS = {
  chrome: 109 << 16, edge: 109 << 16, firefox: 115 << 16, safari: (15 << 16) | (4 << 8), ios_saf: (15 << 16) | (4 << 8),
};
export const JS_TARGETS = ['es2020', 'chrome109', 'edge109', 'firefox115', 'safari15.4'];

const SAFE_URL_PATH = /^[A-Za-z0-9._\-/]+$/;

/**
 * Resolves which workspace package (theme or shared package) owns a file.
 * @returns {(file: string) => {name: string, dir: string, kind: string, json: object} | null}
 */
export function makeOwnerLookup(ws) {
  const pkgs = [...ws.packages.values()].sort((a, b) => b.dir.length - a.dir.length);
  return (file) => pkgs.find((p) => isInside(p.dir, file) && !file.includes(`${path.sep}node_modules${path.sep}`)) || null;
}

function declaredDeps(pkg) {
  return new Set(Object.keys({ ...pkg.json.dependencies, ...pkg.json.peerDependencies }));
}

function bareName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Case-sensitive existence check (Windows/macOS file systems are case-insensitive, IIS is too, Linux CI is not). */
// Only segments below `baseDir` are checked: the casing of the checkout path
// itself (e.g. "c:\users\..." from an editor) is irrelevant to the artifact.
export function existsExactCase(abs, baseDir) {
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return false;
  if (!baseDir || !isInside(baseDir, abs)) return true;
  let cur = baseDir;
  for (const part of path.relative(baseDir, abs).split(path.sep)) {
    if (!fs.readdirSync(cur).includes(part)) return false;
    cur = path.join(cur, part);
  }
  return true;
}

function resolveImport(spec, from, ownerOf) {
  const owner = ownerOf(from);
  if (!owner) throw new BondError(`File is not inside a workspace package: ${from}`, 'BOND101', { file: from });
  if (/^([a-z]+:)?\/\//i.test(spec) || spec.startsWith('/')) {
    throw new BondError(`Remote/absolute @import "${spec}" is not allowed - bundle the file instead.`, 'BOND102', { file: from });
  }
  if (spec.startsWith('.')) {
    const abs = path.resolve(path.dirname(from), spec);
    if (!isInside(owner.dir, abs)) {
      throw new BondError(`Relative import "${spec}" escapes package ${owner.name}. Import shared code through its package name and public "exports".`, 'BOND103', { file: from });
    }
    if (!existsExactCase(abs, owner.dir)) throw new BondError(`Cannot resolve "${spec}" (missing file or wrong letter case).`, 'BOND104', { file: from });
    return abs;
  }
  const name = bareName(spec);
  if (!declaredDeps(owner).has(name)) {
    throw new BondError(`"${spec}" is imported by ${owner.name} but ${name} is not in its package.json dependencies.`, 'BOND105', { file: from });
  }
  try {
    return createRequire(from).resolve(spec);
  } catch {
    throw new BondError(`Cannot resolve "${spec}" - is it listed in ${name}'s package.json "exports"? Run pnpm install?`, 'BOND104', { file: from });
  }
}

function lightningError(err) {
  const file = err.fileName || err.filename;
  return new BondError(`CSS: ${err.message}`, 'BOND110', { file, line: err.loc?.line, column: err.loc?.column });
}

/**
 * Bundle one CSS entry point.
 * @param {object} o
 * @param {string} o.entry absolute source path
 * @param {string} o.outPath output path relative to the install root it lands in (posix)
 * @param {'production'|'development'} o.mode
 * @param {(file:string)=>object|null} o.ownerOf
 * @param {object} o.theme loaded theme (for asset placement + remote url policy)
 */
export async function compileCss({ entry, outPath, mode, ownerOf, theme }) {
  const prod = mode === 'production';
  let result;
  try {
    result = await bundleAsync({
      filename: entry,
      minify: prod,
      sourceMap: !prod,
      targets: CSS_TARGETS,
      drafts: { customMedia: true },
      analyzeDependencies: true,
      errorRecovery: false,
      resolver: {
        read: (file) => fs.readFileSync(file, 'utf8'),
        resolve: (spec, from) => resolveImport(spec, from, ownerOf),
      },
    });
  } catch (err) {
    if (err instanceof BondError) {
      // Lightning CSS overwrites `loc` on errors thrown from the resolver and
      // stores the importing file in `fileName`; restore a complete location.
      err.loc = { file: err.loc?.file || err.fileName, line: err.loc?.line, column: err.loc?.column };
      throw err;
    }
    throw lightningError(err);
  }

  let code = result.code.toString('utf8');
  const assets = [];
  for (const dep of result.dependencies || []) {
    if (dep.type !== 'url') continue;
    const from = dep.loc.filePath;
    const loc = { file: from, line: dep.loc.start.line, column: dep.loc.start.column };
    const url = dep.url;
    let replacement = url;
    if (/^data:/i.test(url) || url.startsWith('#')) {
      replacement = url;
    } else if (/^([a-z]+:)?\/\//i.test(url)) {
      if (!theme.config.allowRemoteUrls) throw new BondError(`Remote url(${url}) creates a runtime dependency on another host. Self-host the asset or set "allowRemoteUrls" in theme.json.`, 'BOND120', loc);
    } else if (url.startsWith('/') || url.startsWith('~')) {
      throw new BondError(`Site-absolute url(${url}) depends on files outside this theme. Reference a file inside the package instead.`, 'BOND121', loc);
    } else {
      const m = /^([^?#]*)(.*)$/.exec(url);
      let decoded;
      try { decoded = decodeURIComponent(m[1]); } catch { throw new BondError(`url(${url}) is not a valid URL-encoded path.`, 'BOND122', loc); }
      const abs = path.resolve(path.dirname(from), decoded);
      const owner = ownerOf(from);
      if (!owner || !isInside(owner.dir, abs)) throw new BondError(`url(${url}) escapes its package.`, 'BOND122', loc);
      if (!existsExactCase(abs, owner.dir)) throw new BondError(`url(${url}) not found (missing file or wrong letter case).`, 'BOND123', loc);
      let out;
      if (owner.kind === 'theme') {
        const assetsDir = path.join(owner.dir, 'assets');
        if (!isInside(assetsDir, abs)) throw new BondError(`Theme assets referenced from CSS must live under ${rel(assetsDir)}/`, 'BOND124', loc);
        out = 'resources/' + toPosix(path.relative(assetsDir, abs));
      } else {
        out = `resources/vendor/${owner.name.replace(/^@[^/]+\//, '')}/` + toPosix(path.relative(owner.dir, abs));
      }
      if (!SAFE_URL_PATH.test(out)) throw new BondError(`Asset path "${out}" may only contain [A-Za-z0-9._-/].`, 'BOND125', loc);
      assets.push({ src: abs, out });
      replacement = path.posix.relative(path.posix.dirname(outPath), out) + m[2];
    }
    code = code.split(dep.placeholder).join(replacement);
  }

  let map;
  if (result.map) {
    const json = JSON.parse(result.map.toString('utf8'));
    json.sources = json.sources.map((s) => 'bond:///' + rel(path.resolve(s)));
    json.file = path.posix.basename(outPath);
    map = JSON.stringify(json);
  }
  const warnings = (result.warnings || []).map((w) => ({ message: w.message, file: w.loc?.filename, line: w.loc?.line, column: w.loc?.column }));
  return { code, map, assets, warnings };
}

function boundaryPlugin(ownerOf) {
  return {
    name: 'bond-boundaries',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point' || !args.importer) return undefined;
        const owner = ownerOf(args.importer);
        if (!owner) return { errors: [{ text: `Importer outside workspace packages: ${args.importer}` }] };
        if (args.path.startsWith('.')) {
          const abs = path.resolve(args.resolveDir, args.path);
          if (!isInside(owner.dir, abs)) return { errors: [{ text: `Relative import "${args.path}" escapes package ${owner.name}; import it by package name.` }] };
          return undefined;
        }
        const name = bareName(args.path);
        if (!declaredDeps(owner).has(name)) return { errors: [{ text: `"${args.path}" is not a declared dependency of ${owner.name}.` }] };
        return undefined;
      });
    },
  };
}

/** Bundle one JS entry point into a classic (IIFE) script for DnnJsInclude. */
export async function compileJs({ entry, outAbs, mode, banner, ownerOf }) {
  const prod = mode === 'production';
  try {
    const res = await esbuild.build({
      entryPoints: [entry],
      outfile: outAbs,
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: JS_TARGETS,
      minify: prod,
      sourcemap: prod ? false : 'linked',
      sourcesContent: true,
      legalComments: prod ? 'none' : 'inline',
      banner: { js: banner },
      charset: 'utf8',
      metafile: true,
      logLevel: 'silent',
      absWorkingDir: repoRoot,
      define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
      drop: prod ? ['debugger'] : [],
      plugins: [boundaryPlugin(ownerOf)],
    });
    const warnings = res.warnings.map((w) => ({ message: w.text, file: w.location && path.resolve(repoRoot, w.location.file), line: w.location?.line, column: w.location?.column }));
    const js = res.outputFiles.find((f) => f.path.endsWith('.js'));
    const map = res.outputFiles.find((f) => f.path.endsWith('.map'));
    const inputs = Object.keys(res.metafile.inputs).sort();
    return { code: Buffer.from(js.contents), map: map && Buffer.from(map.contents), inputs, warnings };
  } catch (err) {
    const e = err.errors?.[0];
    if (!e) throw err;
    throw new BondError(`JS: ${e.text}`, 'BOND130', { file: e.location && path.resolve(repoRoot, e.location.file), line: e.location?.line, column: e.location?.column });
  }
}
