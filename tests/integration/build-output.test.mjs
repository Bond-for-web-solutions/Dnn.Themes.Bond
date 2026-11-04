// Acceptance tests 1–4: a production build produces a complete publish/<theme>
// folder, a valid DNN install ZIP, and includes shared packages automatically.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir, run, gitShow, hasGitRef } from './helpers.mjs';
import { readZip } from '../../packages/build/lib/zip.mjs';
import { checkManifestXml } from '../../packages/build/lib/manifest.mjs';

let P; // temp publish root
const skin = () => path.join(P, 'bond', 'theme', 'Skins', 'DNN.Themes.Bond');
const zipPath = () => path.join(P, 'bond', 'packages', 'DNN.Themes.Bond_01.01.00_Install.zip');

before(() => {
  P = tempDir();
  const r = run(['build', 'bond', '--mode', 'production'], { BOND_PUBLISH_ROOT: P });
  assert.equal(r.code, 0, r.out);
});

test('publish contract: staged theme, versioned package, checksums, reports', () => {
  for (const f of ['theme/Skins/DNN.Themes.Bond/default.ascx', 'theme/Skins/DNN.Themes.Bond/splash.ascx', 'theme/Containers/DNN.Themes.Bond/None.ascx',
    'packages/DNN.Themes.Bond_01.01.00_Install.zip', 'packages/SHA256SUMS', 'reports/build-manifest.json', 'reports/validation.json']) {
    assert.ok(fs.existsSync(path.join(P, 'bond', f)), `missing ${f}`);
  }
  const bm = JSON.parse(fs.readFileSync(path.join(P, 'bond', 'reports', 'build-manifest.json'), 'utf8'));
  assert.equal(bm.theme, 'bond');
  assert.equal(bm.dnnVersion, '01.01.00');
  assert.equal(bm.mode, 'production');
  assert.match(bm.git.sha, /^([0-9a-f]{40}|unknown)$/);
  assert.ok(bm.lockfileSha256, 'lockfile hash recorded');
  assert.deepEqual(bm.dependencies.map((d) => d.name).sort(), ['@bond-theme/bond', '@bond/components', '@bond/dnn', '@bond/foundation', '@bond/tokens']);
  assert.ok(bm.dependencies.every((d) => /^[0-9a-f]{64}$/.test(d.contentHash)));
  assert.equal(JSON.parse(fs.readFileSync(path.join(P, 'bond', 'reports', 'validation.json'), 'utf8')).status, 'passed');
  assert.ok(fs.readFileSync(path.join(P, 'bond', 'packages', 'SHA256SUMS'), 'utf8').startsWith(bm.package.sha256));
});

test('install ZIP: manifest, root files and nested archives match DNN expectations', () => {
  const entries = new Map(readZip(fs.readFileSync(zipPath())).map((e) => [e.name, e]));
  assert.deepEqual([...entries.keys()].sort(), ['License.txt', 'None.ascx', 'ReleaseNotes.txt', 'Resources.zip', 'default.ascx', 'manifest.dnn', 'splash.ascx']);
  const xml = entries.get('manifest.dnn').data.toString('utf8');
  const { problems, referenced } = checkManifestXml(xml);
  assert.deepEqual(problems, []);
  for (const r of referenced) assert.ok(entries.has(r), `manifest references ${r}`);
  assert.match(xml, /<package name="DNN.Themes.Bond" type="Skin" version="01.01.00">/);
  assert.match(xml, /<package name="DNN.Themes.Bond Containers" type="Container" version="01.01.00">/);
  assert.match(xml, /<skinFile>\s*<path><\/path>\s*<name>default\.ascx<\/name>/);
  assert.match(xml, /<skinFile>\s*<path><\/path>\s*<name>splash\.ascx<\/name>/);
  assert.match(xml, /<containerFile>\s*<path><\/path>\s*<name>None\.ascx<\/name>/);

  const res = readZip(entries.get('Resources.zip').data).map((e) => e.name);
  for (const f of ['menus/header/HeaderMenu.cshtml', 'menus/header/menudef.xml', 'menus/footer/FooterMenu.cshtml', 'menus/footer/menudef.xml',
    'partials/_includes.ascx', 'partials/_registers.ascx', 'skin.doctype.xml', 'skin.css', 'splash.css', 'resources/js/theme.js',
    'resources/img/bond-for-web-solutions-logo.png', 'resources/font/MuseoSans/MuseoSans_500.otf']) {
    assert.ok(res.includes(f), `Resources.zip lacks ${f}`);
  }
  assert.ok(!res.includes('default.ascx') && !res.includes('splash.ascx'), 'declared layouts live at the ZIP root only');
  assert.ok(!res.some((f) => /MuseoSans-\d/.test(f)), 'duplicate hyphenated fonts are not shipped');
  assert.ok(!res.some((f) => f.endsWith('.map') || f.endsWith('.md')), 'no source maps / docs in production');
  // Every menu template folder ships its menudef.xml.
  for (const dir of new Set(res.filter((f) => f.endsWith('.cshtml')).map((f) => path.posix.dirname(f)))) assert.ok(res.includes(`${dir}/menudef.xml`));
});

test('shared packages are compiled in automatically; no runtime dependency on other skins', () => {
  const css = fs.readFileSync(path.join(skin(), 'skin.css'), 'utf8');
  for (const needle of ['.bond-button', '.bond-auth__card', '.bond-container', '--bond-space-4', '--bond-cyan-500', '@font-face']) assert.ok(css.includes(needle), `skin.css lacks ${needle}`);
  assert.ok(!css.includes('@import'), 'imports are bundled');
  assert.ok(!css.includes('@custom-media') && !/@media[^{]*\(--/.test(css), 'custom media resolved at build time');
  const js = fs.readFileSync(path.join(skin(), 'resources', 'js', 'theme.js'), 'utf8');
  assert.ok(js.includes('bond-auth__card'), 'theme.js bundles the shared auth-card component');
  assert.ok(js.includes('[data-bond-menu-toggle]'), 'theme.js bundles Bond header code');
  assert.ok(js.includes('add_endRequest'), 'theme.js bundles @bond/dnn onDnnReady');
  assert.ok(!/\bimport\s*[{*\w]|\brequire\(/.test(js), 'no unresolved module imports');
  // Shared ASCX overlay from @bond/dnn arrived without copying it into the theme.
  assert.ok(fs.existsSync(path.join(skin(), 'partials', '_registers.ascx')));
  assert.ok(!fs.existsSync(path.join(import.meta.dirname, '..', '..', 'themes', 'bond', 'skin', 'partials', '_registers.ascx')));
  // Nothing references another extension's folder or a remote host.
  for (const f of ['skin.css', 'splash.css', 'resources/js/theme.js', 'default.ascx', 'splash.ascx', 'partials/_includes.ascx']) {
    const text = fs.readFileSync(path.join(skin(), f), 'utf8');
    assert.ok(!/Portals\/|\/Skins\/|https?:\/\/(?!www\.bondforwebsolutions\.nl)/.test(text.replace(/\/\*![^*]*\*\//, '')), `${f} references something outside the theme`);
  }
});

test('production assets are minified; sizes recorded with gzip and brotli', () => {
  const css = fs.readFileSync(path.join(skin(), 'skin.css'), 'utf8');
  assert.ok(css.split('\n').length <= 3, 'skin.css is minified');
  assert.ok(!css.includes('/* '), 'non-legal comments stripped');
  const bm = JSON.parse(fs.readFileSync(path.join(P, 'bond', 'reports', 'build-manifest.json'), 'utf8'));
  const out = bm.outputs.find((o) => o.path.endsWith('/skin.css'));
  assert.ok(out.brotli < out.gzip && out.gzip < out.bytes);
  assert.ok(bm.budgets['skin.css'].brotli <= bm.budgets['skin.css'].budget.brotli);
});

test('upgrade from 1.0.0: Cleanup removes exactly the files 1.1.0 no longer ships', () => {
  const xml = readZip(fs.readFileSync(zipPath())).find((e) => e.name === 'manifest.dnn').data.toString('utf8');
  const cleanup = /<component type="Cleanup" version="01\.01\.00">([\s\S]*?)<\/component>/.exec(xml);
  assert.ok(cleanup, 'cleanup component present');
  const files = [...cleanup[1].matchAll(/<path>([^<]*)<\/path>\s*<name>([^<]+)<\/name>/g)].map((m) => `${m[1].replace(/\\/g, '/')}/${m[2]}`).sort();
  assert.deepEqual(files, [
    'resources/css/fonts.css', 'resources/css/login.css', 'resources/css/skin.css', 'resources/css/splash.css',
    'resources/font/MuseoSans/MuseoSans-100.otf', 'resources/font/MuseoSans/MuseoSans-100Italic.otf', 'resources/font/MuseoSans/MuseoSans-300.otf',
    'resources/font/MuseoSans/MuseoSans-300Italic.otf', 'resources/font/MuseoSans/MuseoSans-700Italic.otf', 'resources/font/MuseoSans/MuseoSans-900Italic.otf',
    'resources/js/login.js',
  ]);
  // Never delete something the new version still installs.
  const res = readZip(readZip(fs.readFileSync(zipPath())).find((e) => e.name === 'Resources.zip').data).map((e) => e.name.toLowerCase());
  for (const f of files) assert.ok(!res.includes(f.toLowerCase()));
});

test('package identity is unchanged from the legacy Bond 1.0 manifest', { skip: !hasGitRef('0600865:manifest.dnn') && 'legacy commit not available' }, () => {
  const legacy = gitShow('0600865:manifest.dnn');
  const current = readZip(fs.readFileSync(zipPath())).find((e) => e.name === 'manifest.dnn').data.toString('utf8');
  const ident = (xml) => ({
    packages: [...xml.matchAll(/<package name="([^"]+)" type="([^"]+)"/g)].map((m) => `${m[1]}|${m[2]}`),
    basePaths: [...new Set([...xml.matchAll(/<basePath>([^<]+)<\/basePath>/g)].map((m) => m[1]))].sort(),
    skinName: /<skinName>([^<]+)/.exec(xml)[1],
    containerName: /<containerName>([^<]+)/.exec(xml)[1],
    core: /<dependency type="CoreVersion">([^<]+)/.exec(xml)[1],
    containers: [...xml.matchAll(/<containerFile>\s*<path>[^<]*<\/path>\s*<name>([^<]+)/g)].map((m) => m[1]),
    resourceZips: [...xml.matchAll(/<resourceFile>\s*<name>([^<]+)/g)].map((m) => m[1]),
  });
  const a = ident(legacy); const b = ident(current);
  assert.deepEqual(b.packages, a.packages);
  assert.deepEqual(b.basePaths, a.basePaths);
  assert.equal(b.skinName, a.skinName);
  assert.equal(b.containerName, a.containerName);
  assert.equal(b.core, a.core);
  assert.deepEqual(b.containers, a.containers);
  assert.ok(b.resourceZips.includes('Resources.zip'));
  // ContainerResources.zip is omitted on purpose: its only file (None.ascx) is already a declared containerFile.
});

test('development build: readable output with source maps and no install ZIP', () => {
  const D = tempDir();
  const r = run(['build', 'bond', '--mode', 'development'], { BOND_PUBLISH_ROOT: D });
  assert.equal(r.code, 0, r.out);
  const s = path.join(D, 'bond', 'theme', 'Skins', 'DNN.Themes.Bond');
  assert.ok(fs.readFileSync(path.join(s, 'skin.css'), 'utf8').split('\n').length > 100);
  assert.ok(fs.existsSync(path.join(s, 'skin.css.map')) && fs.existsSync(path.join(s, 'resources', 'js', 'theme.js.map')));
  assert.ok(!fs.existsSync(path.join(D, 'bond', 'packages')), 'no ZIP by default in development');
  const r2 = run(['build', 'bond', '--mode', 'development', '--package'], { BOND_PUBLISH_ROOT: D });
  assert.equal(r2.code, 0, r2.out);
  assert.ok(fs.existsSync(path.join(D, 'bond', 'packages', 'DNN.Themes.Bond_01.01.00_Install-dev.zip')));
});
