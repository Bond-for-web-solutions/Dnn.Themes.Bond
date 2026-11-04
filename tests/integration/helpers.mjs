// Shared helpers for integration tests. Every test writes ONLY into OS temp
// folders named bond-test-* (BOND_PUBLISH_ROOT / BOND_EXTRA_THEMES are refused
// anywhere else), so running the suite never touches publish/ or themes/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const cli = path.join(root, 'packages', 'build', 'bin', 'bond.mjs');

export function tempDir() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bond-test-')));
}

export function run(args, env = {}) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}

export const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Map of relative path -> sha256 for every file under dir. */
export function treeHashes(dir) {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else out[path.relative(dir, abs).split(path.sep).join('/')] = sha(abs);
    }
  })(dir);
  return out;
}

/**
 * Copy a real theme into a temp "extra themes" root under a new id so tests can
 * break it freely. Its node_modules is a junction to the source theme's, so
 * @bond/* packages resolve exactly as they do for the real theme.
 */
export function cloneTheme(fromId, toId, extraRoot) {
  const src = path.join(root, 'themes', fromId);
  const dest = path.join(extraRoot, toId);
  fs.cpSync(src, dest, { recursive: true, filter: (s) => !s.split(path.sep).includes('node_modules') });
  fs.symlinkSync(path.join(src, 'node_modules'), path.join(dest, 'node_modules'), 'junction');
  const tj = path.join(dest, 'theme.json');
  const cfg = JSON.parse(fs.readFileSync(tj, 'utf8'));
  cfg.id = toId;
  cfg.dnn.packageName = `Test.${toId}`;
  cfg.dnn.skinName = `Test.${toId}`;
  if (cfg.dnn.containerName) { cfg.dnn.containerName = `Test.${toId}`; cfg.dnn.containerPackageName = `Test.${toId} Containers`; }
  fs.writeFileSync(tj, JSON.stringify(cfg, null, 2));
  const pj = path.join(dest, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
  pkg.name = `@bond-theme/${toId}`;
  fs.writeFileSync(pj, JSON.stringify(pkg, null, 2));
  return { dir: dest, edit: (rel, fn) => { const f = path.join(dest, rel); fs.writeFileSync(f, fn(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')); }, cfg: () => JSON.parse(fs.readFileSync(tj, 'utf8')), setCfg: (c) => fs.writeFileSync(tj, JSON.stringify(c, null, 2)) };
}

export function hasGitRef(ref) {
  return spawnSync('git', ['cat-file', '-e', ref], { cwd: root }).status === 0;
}

export function gitShow(spec) {
  const r = spawnSync('git', ['show', spec], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
}
