// Unit-level tests for the building blocks: ZIP, versions, manifest escaping,
// specificity, impact analysis, workspace checks, component contracts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createZip, readZip } from '../../packages/build/lib/zip.mjs';
import { toDnnVersion, isInside } from '../../packages/build/lib/util.mjs';
import { generateManifest, checkManifestXml } from '../../packages/build/lib/manifest.mjs';
import { auditCss } from '../../packages/build/lib/css-audit.mjs';
import { loadWorkspace } from '../../packages/build/lib/workspace.mjs';
import { affectedThemes } from '../../packages/build/lib/affected.mjs';
import { checkWorkspace } from '../../packages/build/lib/check.mjs';
import { root } from './helpers.mjs';

test('zip: round-trips, is deterministic, rejects unsafe names (zip-slip)', () => {
  const entries = [{ name: 'b/c.txt', data: Buffer.from('hello '.repeat(50)) }, { name: 'a.bin', data: Buffer.from([1, 2, 3]) }];
  const mtime = new Date(Date.UTC(2026, 0, 2, 3, 4, 6));
  const z1 = createZip(entries, { mtime }); const z2 = createZip([...entries].reverse(), { mtime });
  assert.ok(z1.equals(z2), 'entry order does not matter');
  assert.deepEqual(readZip(z1).map((e) => [e.name, e.data.toString('hex')]), [['a.bin', '010203'], ['b/c.txt', Buffer.from('hello '.repeat(50)).toString('hex')]]);
  for (const bad of ['../x', '/abs', 'C:/x', 'a\\b', 'a/../b', 'a//b', '']) {
    assert.throws(() => createZip([{ name: bad, data: Buffer.alloc(0) }], { mtime }), /Unsafe ZIP entry/);
  }
  assert.throws(() => createZip([{ name: 'A.txt', data: Buffer.alloc(0) }, { name: 'a.txt', data: Buffer.alloc(0) }], { mtime }), /Duplicate/);
  const corrupt = Buffer.from(z1); corrupt[40] ^= 0xff;
  assert.throws(() => readZip(corrupt));
});

test('versions: semver -> DNN, pre-releases refused', () => {
  assert.equal(toDnnVersion('1.2.3'), '01.02.03');
  assert.equal(toDnnVersion('10.0.12'), '10.00.12');
  for (const bad of ['1.2', '1.2.3-beta', '100.0.0', 'x']) assert.throws(() => toDnnVersion(bad));
});

test('manifest: values are XML-escaped and the structure is valid', () => {
  const xml = generateManifest({
    dnn: { packageName: 'A&B', friendlyName: '<x>', description: '"q" & \'a\'', skinName: 'A.B', containerName: 'A.B', containerPackageName: 'A.B C', coreVersion: '10.00.00', owner: { name: 'n&m' } },
    version: '01.00.00', layouts: ['default.ascx'], containers: ['None.ascx'], hasSkinResources: true, hasContainerResources: false,
    cleanup: { skin: ['resources/css/old.css'], container: [] },
  });
  const { problems, referenced } = checkManifestXml(xml);
  assert.deepEqual(problems, []);
  assert.ok(xml.includes('A&amp;B') && xml.includes('&lt;x&gt;'));
  assert.deepEqual(referenced.sort(), ['License.txt', 'None.ascx', 'ReleaseNotes.txt', 'Resources.zip', 'default.ascx']);
  assert.match(xml, /<path>resources\\css<\/path>\s*<name>old\.css<\/name>/);
  assert.ok(checkManifestXml(xml.replace('</packages>', '')).problems.length > 0);
});

test('css audit: specificity, globals, layers, !important, foreign prefixes', () => {
  const a = auditCss({
    code: ':root{--x:1}.bond-a .bond-b:hover{color:red}a:visited{color:red}.bond-c:is(a,button){x:1}@layer l{.bond-d{color:red}}.dzp-e{color:red!important}',
    filename: 't.css', ownPrefix: 'bond', foreignPrefixes: ['dzp'],
  });
  assert.deepEqual(a.globalSelectors, [':root', 'a:visited', '.dzp-e'].sort());
  assert.deepEqual(a.foreignClasses, ['dzp-e']);
  assert.equal(a.layers, 1);
  assert.equal(a.important, 1);
  assert.deepEqual(a.maxSpecificity, [0, 3, 0]);
});

test('css audit: a class nested in :not()/:is()/:has() does not count as scoping', () => {
  const a = auditCss({ code: ':not(.bond-x) p{color:red}:is(.bond-x,h1){color:red}html:has(.bond-x) div{color:red}.bond-ok:is(a,button){color:red}', filename: 't.css', ownPrefix: 'bond', foreignPrefixes: [] });
  assert.equal(a.globalSelectors.length, 3, JSON.stringify(a.globalSelectors));
});

test('zip: corrupt offsets raise BOND513, not a RangeError', () => {
  const z = createZip([{ name: 'a.txt', data: Buffer.from('x'.repeat(100)) }], { mtime: new Date(0) });
  const bad = Buffer.from(z); bad.writeUInt32LE(0x7fffffff, bad.length - 6);
  assert.throws(() => readZip(bad), (e) => e.code === 'BOND513');
  assert.throws(() => readZip(z.subarray(0, 10)), (e) => e.code === 'BOND513');
});

test('impact analysis: shared change -> all dependents; theme change -> that theme; docs -> none', () => {
  const ws = loadWorkspace();
  assert.deepEqual(affectedThemes(ws, ['packages/components/src/button/button.css']).themes, ['bond', 'dzp']);
  assert.deepEqual(affectedThemes(ws, ['packages/tokens/src/tokens.css']).themes, ['bond', 'dzp']);
  assert.deepEqual(affectedThemes(ws, ['themes/bond/styles/header.css']).themes, ['bond']);
  assert.deepEqual(affectedThemes(ws, ['themes/dzp/skin/dashboard.ascx']).themes, ['dzp']);
  assert.deepEqual(affectedThemes(ws, ['docs/architecture.md', '.claude/skills/x/SKILL.md', 'README.md']).themes, []);
  assert.deepEqual(affectedThemes(ws, ['pnpm-lock.yaml']).themes, ['bond', 'dzp']);
  assert.deepEqual(affectedThemes(ws, ['packages/build/lib/zip.mjs']).themes, ['bond', 'dzp'], 'toolchain changes affect every theme');
  assert.deepEqual(affectedThemes(ws, ['.gitattributes']).themes, ['bond', 'dzp']);
  assert.deepEqual(affectedThemes(ws, ['themes/bond/package/ReleaseNotes.txt']).themes, ['bond']);
});

test('workspace architecture check passes for the repository', () => {
  const d = checkWorkspace(loadWorkspace());
  assert.equal(d.errors.length, 0, d.errors.map((e) => e.message).join('\n'));
});

test('path guard: isInside', () => {
  assert.ok(isInside('/a/b', '/a/b/c'));
  assert.ok(!isInside('/a/b', '/a/bc'));
  assert.ok(!isInside('/a/b', '/a/b/../c'));
});

// --- Component contracts: the public API of each shared component -----------
const componentsDir = path.join(root, 'packages', 'components', 'src');
for (const name of fs.readdirSync(componentsDir)) {
  const cfile = path.join(componentsDir, name, 'contract.json');
  if (!fs.existsSync(cfile)) continue;
  test(`contract: ${name} - CSS classes and tokens match contract.json exactly`, () => {
    const contract = JSON.parse(fs.readFileSync(cfile, 'utf8'));
    const code = fs.readFileSync(path.join(componentsDir, name, `${name}.css`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const classes = new Set([...code.matchAll(/\.(bond-[a-z0-9_-]+)/g)].map((m) => m[1]).filter((c) => c.startsWith(contract.block)));
    const expected = new Set([
      contract.block,
      ...contract.elements.map((e) => `${contract.block}__${e}`),
      ...contract.modifiers.map((m) => `${contract.block}--${m}`),
      ...(contract.elementModifiers || []).map((m) => `${contract.block}__${m}`),
    ]);
    // Removing a class = breaking change; adding one without documenting it = undocumented API.
    for (const c of expected) assert.ok(classes.has(c), `contract lists .${c} but the CSS no longer defines it (breaking change)`);
    for (const c of classes) assert.ok(expected.has(c), `.${c} is not documented in ${name}/contract.json`);
    const tokensRead = new Set([...code.matchAll(/var\((--bond-[a-z0-9-]+)/g)].map((m) => m[1]).filter((t) => t.startsWith(`--bond-${name === 'auth-card' ? 'auth' : name}-`)));
    for (const t of tokensRead) assert.ok(contract.tokens.includes(t), `${t} is read by the CSS but not documented as a token`);
    for (const t of contract.tokens) assert.ok(tokensRead.has(t), `contract token ${t} is no longer used (breaking for themes that set it)`);
    // Examples only use documented classes.
    for (const ex of contract.examples) for (const m of ex.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) {
      if (c.startsWith(contract.block)) assert.ok(expected.has(c), `example uses undocumented .${c}`);
    }
  });
}
