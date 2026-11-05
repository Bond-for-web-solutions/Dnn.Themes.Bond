// The lint rules must actually fire. Each sample is linted as if it lived in a
// real location (codeFilename), so ownership-dependent rules apply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import stylelint from 'stylelint';
import { ESLint } from 'eslint';
import { root } from './helpers.mjs';

async function css(code, rel) {
  const res = await stylelint.lint({ code, codeFilename: path.join(root, rel), configFile: path.join(root, 'stylelint.config.mjs') });
  return res.results[0].warnings.map((w) => w.rule);
}

test('stylelint: unscoped selectors are rejected in shared packages and themes', async () => {
  assert.ok((await css('a { color: red; }\n', 'packages/components/src/button/x.css')).includes('bond/selector-namespace'));
  assert.ok((await css('.header { color: red; }\n', 'themes/bond/styles/x.css')).includes('bond/selector-namespace'));
  assert.deepEqual(await css('.bond-header { color: red; }\n', 'themes/bond/styles/x.css'), []);
  assert.deepEqual(await css(':root { --bond-x: 1px; }\n', 'themes/bond/styles/x.css'), []);
});

test('stylelint: a class inside :not()/:is()/:has() does not scope a selector', async () => {
  for (const sel of [':not(.bond-x) p', ':is(.bond-x, h1)', 'html:has(.bond-x) div']) {
    assert.ok((await css(`${sel} { color: red; }\n`, 'themes/bond/styles/x.css')).includes('bond/selector-namespace'), sel);
  }
  assert.deepEqual(await css('.bond-a:is(:hover, :focus) { color: red; }\n', 'themes/bond/styles/x.css'), []);
});

test('stylelint: themes may not restyle shared component internals outside overrides.css', async () => {
  assert.ok((await css('.bond-page .bond-button { color: red; }\n', 'themes/bond/styles/x.css')).includes('bond/selector-namespace'));
  assert.deepEqual(await css('.bond-page .bond-button { color: red; }\n', 'themes/bond/styles/overrides.css'), []);
});

test('stylelint: another theme\'s namespace is rejected', async () => {
  assert.ok((await css('.bond-a .dzp-b { color: red; }\n', 'themes/bond/styles/x.css')).includes('bond/selector-namespace'));
});

test('stylelint: specificity, !important, ids, @layer, naming', async () => {
  const rules = await css([
    '.bond-a { color: red !important; }',
    '#main .bond-b { color: red; }',
    '@layer theme { .bond-c { color: red; } }',
    '.bond-d .bond-e .bond-f .bond-g { color: red; }',
    '.Bond_Bad { color: red; }',
    '@keyframes fade { from { opacity: 0; } }',
  ].join('\n') + '\n', 'themes/bond/styles/x.css');
  for (const r of ['declaration-no-important', 'selector-max-id', 'at-rule-disallowed-list', 'selector-max-specificity', 'selector-class-pattern', 'keyframes-name-pattern']) {
    assert.ok(rules.includes(r), `${r} did not fire (got ${rules.join(', ')})`);
  }
});

test('stylelint: disable comments need a reason', async () => {
  const res = await stylelint.lint({
    code: '/* stylelint-disable-next-line bond/selector-namespace */\nbody { margin: 0; }\n',
    codeFilename: path.join(root, 'themes/bond/styles/x.css'), configFile: path.join(root, 'stylelint.config.mjs'),
  });
  assert.ok(res.results[0].warnings.some((w) => /description/i.test(w.text) || w.rule === '--report-descriptionless-disables'), JSON.stringify(res.results[0].warnings));
});

test('eslint: DOM XSS sinks and eval are rejected in shipped browser code', async () => {
  const eslint = new ESLint({ cwd: root });
  const [r] = await eslint.lintText([
    'export function f(el, s) {',
    '  el.innerHTML = s;',
    '  el.insertAdjacentHTML("beforeend", s);',
    '  document.write(s);',
    '  eval(s);',
    '  el.onclick = () => {};',
    '  location.href = "javascript:alert(1)";',
    '}',
  ].join('\n'), { filePath: path.join(root, 'themes', 'bond', 'scripts', 'sample.js') });
  const ids = r.messages.map((m) => m.ruleId);
  for (const id of ['no-unsanitized/property', 'no-unsanitized/method', 'no-restricted-properties', 'no-eval', 'no-restricted-syntax', 'no-script-url']) {
    assert.ok(ids.includes(id), `${id} did not fire (got ${ids.join(', ')})`);
  }
});
