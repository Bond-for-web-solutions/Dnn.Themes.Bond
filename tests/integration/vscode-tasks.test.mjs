// VS Code tasks must exist, call the SAME CLI as the terminal and CI, and the
// production task must produce a valid publish/<theme> folder. The task's
// command line is executed exactly as VS Code would run a "process" task.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, tempDir, cloneTheme } from './helpers.mjs';

const tasks = JSON.parse(fs.readFileSync(path.join(root, '.vscode', 'tasks.json'), 'utf8'));
const byLabel = new Map(tasks.tasks.map((t) => [t.label, t]));
const REQUIRED = ['DNN: Build Theme…', 'DNN: Build All (Production)', 'DNN: Publish Theme Locally…'];

const resolve = (s, inputs = {}) => s.replaceAll('${workspaceFolder}', root).replace(/\$\{input:([a-zA-Z]+)\}/g, (_, id) => inputs[id]);

test('all required tasks exist and use the shared CLI (no IDE-only build logic)', () => {
  for (const label of REQUIRED) {
    const t = byLabel.get(label);
    assert.ok(t, `missing task "${label}"`);
    assert.equal(t.type, 'process', `${label} should be a process task (no shell quoting / execution-policy issues)`);
    assert.equal(t.command, 'node');
    assert.equal(resolve(t.args[0]), path.join(root, 'packages', 'build', 'bin', 'bond.mjs').replaceAll('\\', '/').replace(root.replaceAll('\\', '/'), root));
  }
  // No task may name a concrete theme: every theme comes from the generated picker.
  const themeIds = fs.readdirSync(path.join(root, 'themes'));
  for (const t of tasks.tasks) assert.ok(!(t.args || []).some((a) => themeIds.includes(a)), `${t.label} hard-codes a theme`);
  assert.deepEqual(byLabel.get('DNN: Build Theme…').args.slice(1), ['build', '${input:theme}', '--mode', 'production'], 'Build Theme… always builds for production');
  // No default build task: Ctrl+Shift+B then shows VS Code's own picker of every build-group task.
  assert.equal(tasks.tasks.filter((t) => t.group?.isDefault).length, 0, 'no default build task');
  for (const gone of ['DNN: Publish Theme Locally (dry run)…', 'DNN: Record Release Snapshot…', 'DNN: Clean Publish', 'DNN: Validate Packages', 'DNN: Build Theme (Development)…', 'DNN: Watch Theme…', 'DNN: Affected Themes', 'DNN: Menu (terminal)', 'DNN: Build Bond (Development)']) {
    assert.ok(!byLabel.has(gone), `${gone} was removed on request`);
  }
  const buildGroup = tasks.tasks.filter((t) => (t.group?.kind || t.group) === 'build').map((t) => t.label);
  for (const label of ['DNN: Build Theme…', 'DNN: Build All (Production)', 'DNN: Publish Theme Locally…', 'DNN: Check Architecture', 'DNN: Lint']) {
    assert.ok(buildGroup.includes(label), `${label} is offered by Ctrl+Shift+B`);
  }
});

test('package.json scripts and tasks run the same commands, with no per-theme entries', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const norm = (a) => a.join(' ');
  // `pnpm build <theme>` = the production task's command line with the theme as argument.
  assert.equal(`${pkg.scripts.build} \${input:theme} --mode production`, `node packages/build/bin/bond.mjs ${norm(byLabel.get('DNN: Build Theme…').args.slice(1))}`);
  assert.equal(pkg.scripts['build:all'], `node packages/build/bin/bond.mjs ${norm(byLabel.get('DNN: Build All (Production)').args.slice(1))}`);
  const themes = fs.readdirSync(path.join(root, 'themes'));
  const perTheme = Object.keys(pkg.scripts).filter((k) => themes.some((t) => k.endsWith(`:${t}`)));
  assert.deepEqual(perTheme, [], 'adding a theme must not require new package.json scripts');
});

test('theme pickers are live: tasks.json stores no theme, the list comes from `bond list-themes`', () => {
  const input = (id) => tasks.inputs.find((i) => i.id === id);
  for (const [id, extra] of [['theme', []]]) {
    const i = input(id);
    assert.equal(i.type, 'command');
    assert.equal(i.command, 'shellCommand.execute', 'Tasks Shell Input extension runs the scan when the picker opens');
    assert.deepEqual(i.args.commandArgs, ['packages/build/bin/bond.mjs', 'list-themes', ...extra]);
    assert.equal(i.args.fieldSeparator, '|');
    assert.ok(!('options' in i), `${id} must not store a theme list`);
  }
  for (const label of ['DNN: Build Theme…', 'DNN: Publish Theme Locally…']) assert.ok(byLabel.get(label).args.includes('${input:theme}'), label);
  const ext = JSON.parse(fs.readFileSync(path.join(root, '.vscode', 'extensions.json'), 'utf8'));
  assert.ok(ext.recommendations.includes('augustocdias.tasks-shell-input'), 'VS Code prompts to install the picker extension');
});

test('`bond list-themes` scans themes/ on every call (a new folder appears immediately)', () => {
  const run = (extraEnv = {}, args = []) => spawnSync(process.execPath, [path.join(root, 'packages', 'build', 'bin', 'bond.mjs'), 'list-themes', ...args], { cwd: root, env: { ...process.env, ...extraEnv }, encoding: 'utf8' });
  const themes = fs.readdirSync(path.join(root, 'themes')).filter((t) => fs.existsSync(path.join(root, 'themes', t, 'theme.json'))).sort();
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', 'nothing on stderr (the extension would warn)');
  const lines = r.stdout.trim().split('\n');
  assert.deepEqual(lines.map((l) => l.split('|')[0]), themes);
  for (const l of lines) assert.equal(l.split('|').length, 3, `value|label|description: ${l}`);
  assert.equal(run({}, ['--all']).stdout.trim().split('\n').at(-1).split('|')[0], '--all');
  const X = tempDir();
  cloneTheme('dzp', 'zz-newtheme', X);
  assert.ok(run({ BOND_EXTRA_THEMES: X }).stdout.split('\n').some((l) => l.startsWith('zz-newtheme|')), 'new theme listed without any sync step');
});

test('--pick reads the theme list from themes/ and builds the chosen one', () => {
  const P = tempDir();
  const r = spawnSync(process.execPath, [path.join(root, 'packages', 'build', 'bin', 'bond.mjs'), 'build', '--pick'], {
    cwd: root, input: 'dzp\n', env: { ...process.env, BOND_PUBLISH_ROOT: P }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const t of fs.readdirSync(path.join(root, 'themes'))) assert.match(r.stdout, new RegExp(`\\) ${t}\\b`));
  assert.ok(fs.existsSync(path.join(P, 'dzp', 'packages')));
  const ci = spawnSync(process.execPath, [path.join(root, 'packages', 'build', 'bin', 'bond.mjs'), 'build'], { cwd: root, input: '', encoding: 'utf8' });
  assert.equal(ci.status, 1, 'without a theme and without a terminal it must fail instead of waiting');
  assert.match(ci.stderr, /BOND002/);
});

test('problem matcher regex parses bond diagnostics', () => {
  const re = new RegExp(byLabel.get('DNN: Build Theme…').problemMatcher.pattern.regexp);
  const m = re.exec('C:\\Users\\me\\My Repos\\dnn themes\\themes\\bond\\styles\\a.css(12,5): error BOND123: url(x.png) not found');
  assert.ok(m);
  assert.equal(m[1], 'C:\\Users\\me\\My Repos\\dnn themes\\themes\\bond\\styles\\a.css');
  assert.deepEqual([m[2], m[3], m[4], m[5]], ['12', '5', 'error', 'BOND123']);
  // Coloured output (terminals) must parse to the same problem, without escape codes in the groups.
  const ESC = String.fromCharCode(27);
  const file = 'C:/repo/themes/bond/skin/splash.ascx';
  const c = re.exec(`${ESC}[33m${file}(1,1): warning BOND313: No ContentPane${ESC}[39m`);
  assert.ok(c, 'coloured line matches');
  assert.deepEqual([c[1], c[2], c[3], c[4], c[5], c[6]], [file, '1', '1', 'warning', 'BOND313', 'No ContentPane']);
});

test('running "DNN: Build Theme…" (theme picked: bond) exactly as VS Code does produces a valid package', () => {
  const t = byLabel.get('DNN: Build Theme…');
  const P = tempDir();
  const r = spawnSync(t.command === 'node' ? process.execPath : t.command, t.args.map((a) => resolve(a, { theme: 'bond' })), {
    cwd: resolve(t.options.cwd), env: { ...process.env, BOND_PUBLISH_ROOT: P }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(P, 'bond', 'packages', 'DNN.Themes.Bond_01.01.00_Install.zip')));
  const v = spawnSync(process.execPath, [path.join(root, 'packages', 'build', 'bin', 'bond.mjs'), 'validate', '--all'], { cwd: root, env: { ...process.env, BOND_PUBLISH_ROOT: P }, encoding: 'utf8' });
  // validate --all also checks dzp, which was not built in this temp root -> expect exactly that failure.
  assert.match(v.stdout + v.stderr, /validate bond: passed/);
});

test('"DNN: Publish Theme Locally…" refuses when no local target is configured', () => {
  const t = byLabel.get('DNN: Publish Theme Locally…');
  const P = tempDir();
  const r = spawnSync(process.execPath, t.args.map((a) => resolve(a, { theme: 'bond' })), { cwd: root, env: { ...process.env, BOND_PUBLISH_ROOT: P, BOND_LOCAL_CONFIG: path.join(P, 'none.env') }, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /BOND700/);
});

test('`bond menu` lists every theme and runs the chosen command', () => {
  const t = { args: ['${workspaceFolder}/packages/build/bin/bond.mjs', 'menu'] };
  const P = tempDir();
  const r = spawnSync(process.execPath, t.args.map((a) => resolve(a)), {
    cwd: root, input: 'build-dev\ndzp\n', env: { ...process.env, BOND_PUBLISH_ROOT: P }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const theme of fs.readdirSync(path.join(root, 'themes'))) assert.ok(r.stdout.includes(`) ${theme}`), `theme ${theme} offered`);
  assert.match(r.stdout, /> bond build dzp --mode development/);
  assert.ok(fs.existsSync(path.join(P, 'dzp', 'theme')));
});
