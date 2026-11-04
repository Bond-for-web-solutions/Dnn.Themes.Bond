// Shared helpers: repository paths, safe filesystem operations, diagnostics.
// Everything that touches the filesystem outside of a build's private staging
// directory goes through the guards in this file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root = nearest ancestor of this file that has pnpm-workspace.yaml. */
export const repoRoot = (() => {
  let dir = here;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Cannot locate repository root (pnpm-workspace.yaml).');
    dir = parent;
  }
})();

/** Root of all generated artifacts. Tests may redirect it into the OS temp dir only. */
export const publishRoot = (() => {
  const override = process.env.BOND_PUBLISH_ROOT;
  if (!override) return path.join(repoRoot, 'publish');
  const abs = path.resolve(override);
  const tmp = fs.realpathSync(os.tmpdir());
  const parent = fs.existsSync(path.dirname(abs)) ? fs.realpathSync(path.dirname(abs)) : path.dirname(abs);
  if (!isInside(tmp, parent) || !path.basename(abs).startsWith('bond-test-')) {
    throw new Error(`BOND_PUBLISH_ROOT must be a "bond-test-*" folder inside the OS temp dir, got ${abs}`);
  }
  return abs;
})();

export const toPosix = (p) => p.split(path.sep).join('/');
export const rel = (p) => toPosix(path.relative(repoRoot, p));

/** True when `child` is `parent` itself or below it (after resolution). */
export function isInside(parent, child) {
  const r = path.relative(path.resolve(parent), path.resolve(child));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

export function assertInside(parent, child, what = 'path') {
  if (!isInside(parent, child) || path.resolve(parent) === path.resolve(child)) {
    throw new BondError(`Refusing to touch ${what} outside ${parent}: ${child}`, 'BOND010');
  }
}

/** Identifiers that become folder names / CSS prefixes. */
export const THEME_ID = /^[a-z][a-z0-9-]{1,30}$/;
export const PREFIX = /^[a-z][a-z0-9]{1,11}$/;
/** DNN package / skin names: no path separators, no traversal. */
export const DNN_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{1,99}$/;

/**
 * ANSI colours for terminals (VS Code task terminals included). Off when the
 * stream is not a TTY (pipes, CI logs, tests) or NO_COLOR is set; FORCE_COLOR=1
 * forces them on. The VS Code problem matcher tolerates the escape codes.
 */
const colorOn = (stream) => !process.env.NO_COLOR && (process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== '0' : !!stream?.isTTY);
const wrap = (open, close) => (text, stream = process.stdout) => (colorOn(stream) ? `\x1b[${open}m${text}\x1b[${close}m` : text);
export const paint = { red: wrap(31, 39), yellow: wrap(33, 39), green: wrap(32, 39), dim: wrap(2, 22), bold: wrap(1, 22) };

export class BondError extends Error {
  constructor(message, code = 'BOND001', loc = {}) {
    super(message);
    this.code = code;
    this.loc = loc;
  }
}

/**
 * Collects diagnostics and prints them in an msbuild-like format that the
 * VS Code problem matcher in .vscode/tasks.json understands:
 *   C:\abs\file.css(12,5): error BOND201: message
 */
export class Diagnostics {
  constructor() {
    this.items = [];
    this.seen = new Set();
    /** Optional hook: maps a staged file back to the source file a developer edits. */
    this.mapFile = null;
  }
  add(level, code, message, loc = {}) {
    let file = loc.file ? path.resolve(loc.file) : undefined;
    if (file && this.mapFile) file = this.mapFile(file) || file;
    const item = { level, code, message, file, line: loc.line || 1, column: loc.column || 1 };
    const key = `${level}|${code}|${message}|${file}|${item.line}|${item.column}`;
    if (this.seen.has(key)) return item; // a shared partial is checked once per layout
    this.seen.add(key);
    this.items.push(item);
    const where = item.file ? `${item.file}(${item.line},${item.column})` : 'bond';
    const out = `${where}: ${level} ${code}: ${message}`;
    if (level === 'error') console.error(paint.red(out, process.stderr));
    else console.log(level === 'warning' ? paint.yellow(out) : paint.dim(out));
    return item;
  }
  error(code, message, loc) { return this.add('error', code, message, loc); }
  warn(code, message, loc) { return this.add('warning', code, message, loc); }
  info(code, message, loc) { return this.add('info', code, message, loc); }
  get errors() { return this.items.filter((i) => i.level === 'error'); }
  get warnings() { return this.items.filter((i) => i.level === 'warning'); }
  get ok() { return this.errors.length === 0; }
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function sizes(buf) {
  return {
    bytes: buf.length,
    gzip: zlib.gzipSync(buf, { level: 9 }).length,
    brotli: zlib.brotliCompressSync(buf, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length },
    }).length,
  };
}

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/** Recursively list files (posix, relative to dir), sorted, skipping ignored names. */
export function listFiles(dir, { ignore = DEFAULT_IGNORE } = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ignore(ent.name)) continue;
      const abs = path.join(d, ent.name);
      if (ent.isSymbolicLink()) continue; // never follow links out of the tree
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) out.push(toPosix(path.relative(dir, abs)));
    }
  })(dir);
  return out.sort(compareOrdinal);
}

export const DEFAULT_IGNORE = (name) =>
  name === 'node_modules' || name === '.git' || name === 'Thumbs.db' || name === '.DS_Store' || name.startsWith('.');

export const compareOrdinal = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Text files are normalised to LF so artifacts are identical on Windows and Linux checkouts. */
const TEXT_EXT = new Set(['.ascx', '.cshtml', '.vbhtml', '.xml', '.css', '.js', '.mjs', '.txt', '.json', '.html', '.htm', '.resx', '.svg', '.dnn', '.map', '.config', '.md']);
export const isText = (file) => TEXT_EXT.has(path.extname(file).toLowerCase());

export function readNormalized(file) {
  const buf = fs.readFileSync(file);
  if (!isText(file)) return buf;
  return Buffer.from(buf.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');
}

export function rmrf(target, guardRoot) {
  assertInside(guardRoot, target, 'delete target');
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/**
 * Directory rename that tolerates Windows' transient locks: antivirus (Defender)
 * scans freshly written ZIPs and holds handles for a few seconds, making
 * rename fail with EPERM. Retries for up to `budgetMs`, then falls back to
 * copy + delete (not atomic, but still only after a fully successful build).
 */
export function renameRetry(from, to, budgetMs = 20000) {
  const started = Date.now();
  for (let wait = 25; ; wait = Math.min(wait * 2, 250)) {
    try { fs.renameSync(from, to); return 'renamed'; } catch (err) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      if (Date.now() - started > budgetMs) {
        fs.cpSync(from, to, { recursive: true, errorOnExist: true, force: false });
        fs.rmSync(from, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        return 'copied';
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
}

/** Semver "1.2.3" -> DNN "01.02.03". DNN versions cannot carry pre-release tags. */
export function toDnnVersion(semver) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver || '');
  if (!m) throw new BondError(`Version "${semver}" must be plain MAJOR.MINOR.PATCH (DNN has no pre-release versions).`, 'BOND020');
  return m.slice(1).map((n) => { if (+n > 99) throw new BondError(`Version part ${n} > 99 cannot be expressed as a DNN version.`, 'BOND020'); return String(+n).padStart(2, '0'); }).join('.');
}

export function compareDnnVersion(a, b) {
  const pa = a.split('.').map(Number); const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export const xmlEscape = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

/** 1-based line/column for an offset in a string. */
export function lineCol(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return { line, column: index - before.lastIndexOf('\n') };
}
