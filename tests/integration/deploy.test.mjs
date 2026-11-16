// Acceptance test 10: local publish can only write into an explicitly
// configured LOCAL DNN site, only into this theme's two folders, and never
// over files it did not deploy itself.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir, run, treeHashes } from './helpers.mjs';

let P; let site; let decoy; let cfgDir;

function fakeDnnSite(dir) {
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Portals', '_default', 'Skins', 'Other.Skin'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Portals', '_default', 'Containers'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'web.config'), '<configuration><!-- DotNetNuke --></configuration>');
  fs.writeFileSync(path.join(dir, 'bin', 'DotNetNuke.dll'), '');
  fs.writeFileSync(path.join(dir, 'Portals', '_default', 'Skins', 'Other.Skin', 'default.ascx'), 'someone else');
  return dir;
}

// Writes a .env.json file. deploy = extra top-level keys (e.g. a misspelled one).
function writeJson(name, json) {
  const f = path.join(cfgDir, name || `cfg-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(f, typeof json === 'string' ? json : JSON.stringify(json, null, 2));
  return f;
}
function config({ siteRoot, prune, deploy = {} }, publishRoot = P) {
  const d = { siteRoot, ...deploy };
  if (prune !== undefined) d.prune = prune;
  return { BOND_LOCAL_CONFIG: writeJson(null, d), BOND_PUBLISH_ROOT: publishRoot };
}

before(() => {
  P = tempDir(); cfgDir = tempDir();
  site = fakeDnnSite(path.join(tempDir(), 'site'));
  decoy = fakeDnnSite(path.join(tempDir(), 'decoy'));
  assert.equal(run(['build', 'bond'], { BOND_PUBLISH_ROOT: P }).code, 0);
});

test('refuses without .env.json (the site is never guessed)', () => {
  const r = run(['deploy', 'bond'], { BOND_PUBLISH_ROOT: P, BOND_LOCAL_CONFIG: path.join(cfgDir, 'does-not-exist.json') });
  assert.equal(r.code, 1);
  assert.match(r.out, /BOND700/);
});

test('refuses a missing siteRoot, misspelled settings and invalid JSON', () => {
  const empty = writeJson('empty.json', { $comment: 'nothing set' });
  let r = run(['deploy', 'bond'], { BOND_LOCAL_CONFIG: empty, BOND_PUBLISH_ROOT: P });
  assert.equal(r.code, 1); assert.match(r.out, /BOND705/);
  r = run(['deploy', 'bond'], config({ siteRoot: site, deploy: { siteroot: 'C:/typo' } }));
  assert.equal(r.code, 1); assert.match(r.out, /BOND706/); assert.match(r.out, /did you mean "siteRoot"/);
  r = run(['deploy', 'bond'], config({ siteRoot: site, prune: 'yes' }));
  assert.equal(r.code, 1); assert.match(r.out, /prune must be true or false/);
  const bad = writeJson('bad.json', '{ "siteRoot": "C:' + String.fromCharCode(92) + 'DNN" }');
  r = run(['deploy', 'bond'], { BOND_LOCAL_CONFIG: bad, BOND_PUBLISH_ROOT: P });
  assert.equal(r.code, 1); assert.match(r.out, /BOND706/); assert.match(r.out, /forward slashes/);
});

test('reads Windows paths (backslashes escaped, or forward slashes) and $comment notes', () => {
  const f = writeJson('win.json', { $comment: 'my dev site', siteRoot: site, prune: false });
  let r = run(['deploy', 'bond', '--dry-run'], { BOND_LOCAL_CONFIG: f, BOND_PUBLISH_ROOT: P });
  assert.equal(r.code, 0, r.out);
  assert.ok(r.out.includes(site), 'deploy plan shows the configured site');
  const fwd = writeJson('fwd.json', { siteRoot: site.split(path.sep).join('/') });
  r = run(['deploy', 'bond', '--dry-run'], { BOND_LOCAL_CONFIG: fwd, BOND_PUBLISH_ROOT: P });
  assert.equal(r.code, 0, r.out);
});

test('refuses paths that are not DNN sites, UNC paths and relative paths', () => {
  const notDnn = tempDir();
  for (const [siteRoot, code] of [[notDnn, 'BOND704'], ['\\\\server\\share\\dnn', 'BOND702'], ['relative\\site', 'BOND701']]) {
    const r = run(['deploy', 'bond'], config({ siteRoot: siteRoot }));
    assert.equal(r.code, 1, siteRoot);
    assert.match(r.out, new RegExp(code), r.out);
  }
});

test('dry run writes nothing', () => {
  const before = treeHashes(site);
  const r = run(['deploy', 'bond', '--dry-run'], config({ siteRoot: site }));
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(treeHashes(site), before);
});

test('deploys only into Skins/<skin> and Containers/<container>; other skins and sites untouched', () => {
  const decoyBefore = treeHashes(decoy);
  const otherBefore = fs.readFileSync(path.join(site, 'Portals', '_default', 'Skins', 'Other.Skin', 'default.ascx'), 'utf8');
  const env = config({ siteRoot: site });
  const r = run(['deploy', 'bond'], env);
  assert.equal(r.code, 0, r.out);
  const skinDir = path.join(site, 'Portals', '_default', 'Skins', 'DNN.Themes.Bond');
  assert.ok(fs.existsSync(path.join(skinDir, 'skin.css')));
  assert.ok(fs.existsSync(path.join(site, 'Portals', '_default', 'Containers', 'DNN.Themes.Bond', 'None.ascx')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(skinDir, '.bond-deploy.json'), 'utf8')).theme, 'bond');
  assert.equal(fs.readFileSync(path.join(site, 'Portals', '_default', 'Skins', 'Other.Skin', 'default.ascx'), 'utf8'), otherBefore);
  assert.deepEqual(treeHashes(decoy), decoyBefore, 'unconfigured DNN site untouched');
  const top = fs.readdirSync(path.join(site, 'Portals', '_default', 'Skins')).sort();
  assert.deepEqual(top, ['DNN.Themes.Bond', 'Other.Skin']);
});

test('refuses to overwrite a folder it did not deploy, unless --adopt', () => {
  const dest = path.join(decoy, 'Portals', '_default', 'Skins', 'DNN.Themes.Bond');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'default.ascx'), 'installed from a ZIP');
  const env = config({ siteRoot: decoy });
  let r = run(['deploy', 'bond'], env);
  assert.equal(r.code, 1);
  assert.match(r.out, /BOND714/);
  assert.equal(fs.readFileSync(path.join(dest, 'default.ascx'), 'utf8'), 'installed from a ZIP');
  r = run(['deploy', 'bond', '--adopt'], env);
  assert.equal(r.code, 0, r.out);
  assert.notEqual(fs.readFileSync(path.join(dest, 'default.ascx'), 'utf8'), 'installed from a ZIP');
});

test('refuses a folder deployed by a different theme', () => {
  const dest = path.join(site, 'Portals', '_default', 'Skins', 'DNN.Themes.Bond');
  const marker = path.join(dest, '.bond-deploy.json');
  const original = fs.readFileSync(marker, 'utf8');
  fs.writeFileSync(marker, JSON.stringify({ theme: 'dzp', files: [] }));
  const r = run(['deploy', 'bond'], config({ siteRoot: site }));
  assert.equal(r.code, 1);
  assert.match(r.out, /BOND713/);
  fs.writeFileSync(marker, original);
});

test('--prune makes the skin folder mirror the build (also files added by hand), and touches nothing outside it', () => {
  const dest = path.join(site, 'Portals', '_default', 'Skins', 'DNN.Themes.Bond');
  const marker = path.join(dest, '.bond-deploy.json');
  const m = JSON.parse(fs.readFileSync(marker, 'utf8'));
  fs.writeFileSync(path.join(dest, 'old-from-bond.css'), 'stale');
  fs.writeFileSync(path.join(dest, 'default - Copy.ascx'), 'copied by hand');
  fs.mkdirSync(path.join(dest, 'empty-folder'));
  m.files.push('old-from-bond.css');
  fs.writeFileSync(marker, JSON.stringify(m));

  const dry = run(['deploy', 'bond', '--dry-run', '--prune'], config({ siteRoot: site }));
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /- default - Copy\.ascx/);
  assert.ok(fs.existsSync(path.join(dest, 'default - Copy.ascx')), 'dry run deletes nothing');

  const r = run(['deploy', 'bond', '--prune'], config({ siteRoot: site }));
  assert.equal(r.code, 0, r.out);
  assert.ok(!fs.existsSync(path.join(dest, 'old-from-bond.css')));
  assert.ok(!fs.existsSync(path.join(dest, 'default - Copy.ascx')), 'files the build does not have are removed');
  assert.ok(!fs.existsSync(path.join(dest, 'empty-folder')), 'empty folders are removed');
  assert.ok(fs.existsSync(marker), 'the marker stays');
  assert.equal(fs.readFileSync(path.join(site, 'Portals', '_default', 'Skins', 'Other.Skin', 'default.ascx'), 'utf8'), 'someone else', 'other skins are untouched');
});

test('a deploy without --prune lists extra files and leaves them; a later --prune still removes them', () => {
  const dest = path.join(site, 'Portals', '_default', 'Skins', 'DNN.Themes.Bond');
  const marker = path.join(dest, '.bond-deploy.json');
  const m = JSON.parse(fs.readFileSync(marker, 'utf8'));
  fs.mkdirSync(path.join(dest, 'gone', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'gone', 'deep', 'old.js'), 'stale');
  m.files.push('gone/deep/old.js', 'already-deleted.css');
  fs.writeFileSync(marker, JSON.stringify(m));

  let r = run(['deploy', 'bond'], config({ siteRoot: site }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1 file\(s\) in .* are not in the build; left in place/);
  assert.match(r.out, /\? gone\/deep\/old\.js/);
  assert.ok(fs.existsSync(path.join(dest, 'gone', 'deep', 'old.js')));
  const after = JSON.parse(fs.readFileSync(marker, 'utf8')).files;
  assert.ok(after.includes('gone/deep/old.js'), 'still owned by bond');
  assert.ok(!after.includes('already-deleted.css'), 'files no longer on disk are dropped');

  r = run(['deploy', 'bond', '--prune'], config({ siteRoot: site }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /- gone\/deep\/old\.js/);
  assert.ok(!fs.existsSync(path.join(dest, 'gone')), 'folders emptied by the prune are removed');
  assert.ok(!JSON.parse(fs.readFileSync(marker, 'utf8')).files.includes('gone/deep/old.js'));
});

test('refuses to deploy through a junction/symlink (could point into a repo or another site)', () => {
  const other = tempDir();
  const linkSite = fakeDnnSite(path.join(tempDir(), 'linked'));
  fs.symlinkSync(other, path.join(linkSite, 'Portals', '_default', 'Skins', 'DNN.Themes.Bond'), 'junction');
  const r = run(['deploy', 'bond', '--adopt'], config({ siteRoot: linkSite }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /BOND717/);
  assert.deepEqual(fs.readdirSync(other), [], 'nothing written through the link');
});

test('refuses to deploy files that changed in publish/ after the build', () => {
  const P2 = tempDir();
  assert.equal(run(['build', 'bond'], { BOND_PUBLISH_ROOT: P2 }).code, 0);
  fs.appendFileSync(path.join(P2, 'bond', 'theme', 'Skins', 'DNN.Themes.Bond', 'skin.css'), '\n.injected{}');
  const r = run(['deploy', 'bond'], config({ siteRoot: site }, P2));
  assert.equal(r.code, 1);
  assert.match(r.out, /BOND716/);
});

test('--prune is case-insensitive (a rename that only changes case keeps the file)', () => {
  const dest = path.join(site, 'Portals', '_default', 'Skins', 'DNN.Themes.Bond');
  const marker = path.join(dest, '.bond-deploy.json');
  const m = JSON.parse(fs.readFileSync(marker, 'utf8'));
  m.files = m.files.map((x) => (x === 'skin.css' ? 'SKIN.css' : x));
  fs.writeFileSync(marker, JSON.stringify(m));
  const r = run(['deploy', 'bond', '--prune'], config({ siteRoot: site }));
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.existsSync(path.join(dest, 'skin.css')));
});

test('.env.json: a theme may hold e2e settings; unknown or misspelled keys are rejected', () => {
  const ok = writeJson(null, { siteRoot: site, themes: { bond: { e2e: { baseUrl: 'http://x.dnndev.me' } } } });
  assert.equal(run(['deploy', 'bond', '--dry-run'], { BOND_LOCAL_CONFIG: ok, BOND_PUBLISH_ROOT: P }).code, 0);
  const typo = run(['deploy', 'bond', '--dry-run'], config({ siteRoot: site, deploy: { prunes: true } }));
  assert.equal(typo.code, 1);
  assert.match(typo.out, /BOND706/); assert.match(typo.out, /did you mean "prune"/);
  const top = writeJson(null, { Themes: {}, siteRoot: site });
  assert.match(run(['deploy', 'bond', '--dry-run'], { BOND_LOCAL_CONFIG: top, BOND_PUBLISH_ROOT: P }).out, /did you mean "themes"/);
});

test('per-theme sites: themes.<id>.siteRoot wins over siteRoot, and a theme without a site is refused', () => {
  const f = writeJson('per-theme.json', { siteRoot: decoy, themes: { bond: { siteRoot: site } } });
  const r = run(['deploy', 'bond', '--dry-run'], { BOND_LOCAL_CONFIG: f, BOND_PUBLISH_ROOT: P });
  assert.equal(r.code, 0, r.out);
  assert.ok(r.out.includes(`${site} (themes.bond.siteRoot)`), r.out);
  const only = writeJson('bond-only.json', { themes: { bond: { siteRoot: site } } });
  const d = run(['deploy', 'dzp', '--dry-run'], { BOND_LOCAL_CONFIG: only, BOND_PUBLISH_ROOT: P });
  assert.equal(d.code, 1);
  assert.match(d.out, /BOND705: No site for theme "dzp": set themes.dzp.siteRoot/);
});

test('per-theme typos and unknown themes in .env.json are reported', () => {
  for (const [entry, hint] of [[{ bond: { siteroot: 'C:/x' } }, /did you mean "siteRoot"/], [{ shop: { siteRoot: 'C:/x' } }, /no theme "shop"/], [{ dzp: { prunes: true } }, /did you mean "prune"/]]) {
    const f = writeJson(null, { siteRoot: site, themes: entry });
    const r = run(['deploy', 'bond', '--dry-run'], { BOND_LOCAL_CONFIG: f, BOND_PUBLISH_ROOT: P });
    assert.equal(r.code, 1, JSON.stringify(entry));
    assert.match(r.out, /BOND706/);
    assert.match(r.out, hint, JSON.stringify(entry));
  }
});
