// Acceptance test 9: broken input makes the build fail clearly (non-zero exit,
// a BOND code pointing at the source file), never a half-built "success".
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir, run, cloneTheme, treeHashes } from './helpers.mjs';

let X; let P;
before(() => { X = tempDir(); P = tempDir(); });

let n = 0;
function broken(from, mutate) {
  const id = `zz-case-${++n}`;
  const t = cloneTheme(from, id, X);
  mutate(t);
  return { id, ...run(['build', id], { BOND_EXTRA_THEMES: X, BOND_PUBLISH_ROOT: P }) };
}

const CASES = [
  ['missing manifest field (dnn.packageName)', 'BOND040', (t) => { const c = t.cfg(); delete c.dnn.packageName; t.setCfg(c); }],
  ['path traversal in skinName', 'BOND040', (t) => { const c = t.cfg(); c.dnn.skinName = '../Evil'; t.setCfg(c); }],
  ['missing CSS asset', 'BOND123', (t) => t.edit('styles/layout.css', (s) => `${s}\n.bond-x { background: url("../assets/img/missing.png"); }\n`)],
  // (An unclosed block is NOT an error: CSS closes open blocks at end of file.)
  ['CSS syntax error (bundling fails)', 'BOND110', (t) => t.edit('styles/layout.css', (s) => `${s}\n.bond-x { color red; }\n`)],
  ['JS syntax error (bundling fails)', 'BOND130', (t) => t.edit('scripts/header.js', (s) => `${s}\nexport const = ;\n`)],
  ['code render block in a layout', 'BOND310', (t) => t.edit('skin/default.ascx', (s) => `${s}\n<span><%= DateTime.Now %></span>\n`)],
  ['menu without menudef.xml', 'BOND319', (t) => fs.rmSync(path.join(t.dir, 'skin', 'menus', 'footer', 'menudef.xml'))],
  ['DnnJsInclude to a missing file', 'BOND317', (t) => t.edit('skin/partials/_includes.ascx', (s) => s.replace('resources/js/theme.js', 'resources/js/Theme.js'))],
  ['unregistered dnn: control', 'BOND315', (t) => t.edit('skin/default.ascx', (s) => `${s}\n<dnn:NOTREGISTERED runat="server" id="x" />\n`)],
  ['unallowlisted global selector', 'BOND354', (t) => t.edit('styles/layout.css', (s) => `${s}\na { color: red; }\n`)],
  ['@layer in theme CSS', 'BOND350', (t) => t.edit('styles/layout.css', (s) => `${s}\n@layer theme { .bond-y { color: red; } }\n`)],
  ['!important over budget', 'BOND351', (t) => t.edit('styles/layout.css', (s) => `${s}\n.bond-z { color: red !important; }\n`)],
  ['undeclared package import', 'BOND105', (t) => t.edit('styles/layout.css', (s) => `@import "@bond/build/stylelint-plugin";\n${s}`)],
  ['relative import escaping the theme', 'BOND103', (t) => t.edit('styles/layout.css', (s) => `@import "../../../packages/tokens/src/tokens.css";\n${s}`)],
  ['secret in a shipped file', 'BOND360', (t) => t.edit('skin/menus/footer/FooterMenu.cshtml', (s) => `${s}\n@* Server=db;User Id=sa;Password=Hunter2!; *@\n`)],
  ['inline event handler (CSP)', 'BOND330', (t) => t.edit('skin/default.ascx', (s) => s.replace('<main class="bond-main">', '<main class="bond-main" onclick="alert(1)">'))],
  ['size budget exceeded', 'BOND371', (t) => { const c = t.cfg(); c.budgets['skin.css'].brotli = 100; t.setCfg(c); }],
  ['remote url() dependency', 'BOND120', (t) => t.edit('styles/layout.css', (s) => `${s}\n.bond-r { background: url("https://cdn.example.com/x.png"); }\n`)],
  ['forbidden file type in skin/', 'BOND361', (t) => fs.writeFileSync(path.join(t.dir, 'skin', 'deploy.ps1'), 'Remove-Item -Recurse C:\\')],
  ['server-executable file (.aspx) in skin/', 'BOND361', (t) => fs.writeFileSync(path.join(t.dir, 'skin', 'page.aspx'), '<%@ Page %><%= 1 %>')],
  ['handler file (.ashx) in skin/', 'BOND361', (t) => fs.writeFileSync(path.join(t.dir, 'skin', 'run.ashx'), '<%@ WebHandler %>')],
  ['malformed url() encoding', 'BOND122', (t) => t.edit('styles/layout.css', (s) => `${s}\n.bond-u { background: url("img%zz.png"); }\n`)],
  ['pre-release version', 'BOND020', (t) => t.edit('package.json', (s) => s.replace('"1.1.0"', '"1.2.0-beta.1"'))],
];

for (const [name, code, mutate] of CASES) {
  test(`fails clearly: ${name} (${code})`, () => {
    const r = broken('bond', mutate);
    assert.equal(r.code, 1, `expected failure, got:\n${r.out}`);
    assert.match(r.out, new RegExp(`${code}:`), r.out);
    // Problem-matcher format: absolute path(line,col): error CODE: message
    assert.match(r.out, new RegExp(`^.+\\(\\d+,\\d+\\): error ${code}: `, 'm'));
    assert.ok(!fs.existsSync(path.join(P, r.id, 'packages')), 'no package produced');
  });
}

test('a failed rebuild keeps the previous good output and blocks deploy', () => {
  const id = 'zz-keep';
  const t = cloneTheme('dzp', id, X);
  assert.equal(run(['build', id], { BOND_EXTRA_THEMES: X, BOND_PUBLISH_ROOT: P }).code, 0);
  const good = treeHashes(path.join(P, id));
  t.edit('styles/layout.css', (s) => `${s}\n.dzp-x { color red; }\n`);
  const r = run(['build', id], { BOND_EXTRA_THEMES: X, BOND_PUBLISH_ROOT: P });
  assert.equal(r.code, 1);
  const after = treeHashes(path.join(P, id));
  for (const [k, v] of Object.entries(good)) assert.equal(after[k], v, `${k} was modified by a failed build`);
  const failure = JSON.parse(fs.readFileSync(path.join(P, id, 'reports', 'last-failure.json'), 'utf8'));
  assert.equal(failure.status, 'failed');
  assert.ok(failure.errors.some((e) => e.code === 'BOND110'));
  const v = run(['validate', id], { BOND_EXTRA_THEMES: X, BOND_PUBLISH_ROOT: P });
  assert.equal(v.code, 1);
  assert.match(v.out, /BOND601/);
  // Leftover staging folders are cleaned up.
  assert.deepEqual(fs.readdirSync(path.join(P, '.staging')), []);
});

test('unexpected errors still mark the old output stale and do not stop other themes', () => {
  const bad = cloneTheme('dzp', 'zz-unexpected', X);
  cloneTheme('dzp', 'zz-sibling', X);
  assert.equal(run(['build', 'zz-unexpected'], { BOND_EXTRA_THEMES: X, BOND_PUBLISH_ROOT: P }).code, 0);
  fs.rmSync(path.join(bad.dir, 'package', 'License.txt')); // ENOENT while packaging, not a BondError
  const r = run(['build', 'zz-unexpected', 'zz-sibling'], { BOND_EXTRA_THEMES: X, BOND_PUBLISH_ROOT: P });
  assert.equal(r.code, 1);
  assert.match(r.out, /error BOND999: /);
  assert.ok(fs.existsSync(path.join(P, 'zz-unexpected', 'reports', 'last-failure.json')), 'stale marker written');
  assert.ok(fs.existsSync(path.join(P, 'zz-sibling', 'packages')), 'the next theme was still built');
  assert.equal(run(['validate', 'zz-unexpected'], { BOND_EXTRA_THEMES: X, BOND_PUBLISH_ROOT: P }).code, 1);
});

test('validate detects tampering with published files', () => {
  const id = 'zz-tamper';
  cloneTheme('dzp', id, X);
  assert.equal(run(['build', id], { BOND_EXTRA_THEMES: X, BOND_PUBLISH_ROOT: P }).code, 0);
  assert.equal(run(['validate', id], { BOND_EXTRA_THEMES: X, BOND_PUBLISH_ROOT: P }).code, 0);
  const css = path.join(P, id, 'theme', 'Skins', `Test.${id}`, 'skin.css');
  fs.appendFileSync(css, '\n.injected{}');
  fs.writeFileSync(path.join(P, id, 'theme', 'Skins', `Test.${id}`, 'extra.js'), 'alert(1)');
  const r = run(['validate', id], { BOND_EXTRA_THEMES: X, BOND_PUBLISH_ROOT: P });
  assert.equal(r.code, 1);
  assert.match(r.out, /BOND606/);
  assert.match(r.out, /BOND604/);
});
