// Stylelint rule "bond/selector-namespace" - every selector must be scoped by a
// class owned by the file's package, so CSS cannot leak globally:
//   packages/*      -> a `bond-` class
//   themes/<id>/*   -> a `<prefix>-` class (prefix from theme.json)
// Themes may not style shared classes (any `.bond-*` block defined in
// packages/, e.g. .bond-button) except in a file named overrides.css, and may
// never reference another theme's classes. The Bond theme shares the `bond-`
// prefix with the design system; its own blocks (.bond-header…) never collide
// with shared block names.
// State classes (is-*, has-*) and DNN core classes (dnn*, DNN*) are allowed as
// context, never as the only scoping class.
// Deliberate global rules opt out with a described disable comment:
//   /* stylelint-disable-next-line bond/selector-namespace -- why */
import fs from 'node:fs';
import path from 'node:path';
import stylelint from 'stylelint';
import selectorParser from 'postcss-selector-parser';
import { isSharedClass } from '../lib/shared-classes.mjs';

const ruleName = 'bond/selector-namespace';
const messages = stylelint.utils.ruleMessages(ruleName, {
  unscoped: (sel, prefix) => `Selector "${sel}" is not scoped by a ".${prefix}-*" class (global CSS leaks into DNN modules and other layouts).`,
  internals: (cls) => `Theme styles shared component class ".${cls}" (defined in packages/). Customise it via --bond-* tokens, or move this rule to overrides.css.`,
  foreign: (cls, prefix) => `".${cls}" belongs to another namespace; this file may only use its own ".${prefix}-*" classes, is-/has- states and DNN classes.`,
});

const ownerCache = new Map();
function ownerOf(file) {
  if (!file) return null;
  let dir = path.dirname(path.resolve(file));
  if (ownerCache.has(dir)) return ownerCache.get(dir);
  const start = dir;
  for (;;) {
    const theme = path.join(dir, 'theme.json');
    if (fs.existsSync(theme)) {
      const r = { kind: 'theme', prefix: JSON.parse(fs.readFileSync(theme, 'utf8')).prefix };
      ownerCache.set(start, r); return r;
    }
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg) && JSON.parse(fs.readFileSync(pkg, 'utf8')).name?.startsWith('@bond/')) {
      const r = { kind: 'package', prefix: 'bond' };
      ownerCache.set(start, r); return r;
    }
    const parent = path.dirname(dir);
    if (parent === dir) { ownerCache.set(start, null); return null; }
    dir = parent;
  }
}

const isState = (c) => /^(is|has)-[a-z0-9-]+$/.test(c);
const isDnn = (c) => /^(dnn|DNN|Dnn)[A-Za-z0-9_-]*$/.test(c);

const rule = (enabled) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, ruleName, { actual: enabled, possible: [true, false] }) || !enabled) return;
  const file = root.source?.input?.file;
  const owner = ownerOf(file);
  if (!owner) return;
  const isOverrides = path.basename(file || '') === 'overrides.css';
  root.walkRules((r) => {
    if (r.parent?.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return;
    // Token definitions: `:root { --x: … }` with ONLY custom properties is allowed.
    if (r.selector.trim() === ':root' && r.nodes.every((n) => n.type === 'comment' || (n.type === 'decl' && n.prop.startsWith('--')))) return;
    let parsed;
    try { parsed = selectorParser().astSync(r.selector); } catch { return; }
    parsed.each((sel) => {
      const classes = [];
      sel.walkClasses((c) => { classes.push(c.value); });
      // Only classes in top-level compounds scope a selector; one nested in a
      // pseudo-class (`:not(.bond-x) p`, `html:has(.bond-x) div`) does not.
      const topLevel = sel.nodes.filter((n) => n.type === 'class').map((n) => n.value);
      // A shared class (block defined in packages/, e.g. .bond-button) is never a
      // theme's own scope, even for the Bond theme whose prefix is also "bond".
      const isShared = (c) => owner.kind === 'theme' && isSharedClass(c);
      const own = topLevel.filter((c) => c.startsWith(`${owner.prefix}-`) && !isShared(c));
      for (const c of classes) {
        if (isShared(c)) {
          if (!isOverrides) stylelint.utils.report({ ruleName, result, node: r, message: messages.internals(c), word: c });
          continue;
        }
        if (c.startsWith(`${owner.prefix}-`) || isState(c) || isDnn(c)) continue;
        stylelint.utils.report({ ruleName, result, node: r, message: messages.foreign(c, owner.prefix), word: c });
      }
      const scopedByOverride = owner.kind === 'theme' && isOverrides && topLevel.some(isShared);
      if (!own.length && !scopedByOverride) {
        stylelint.utils.report({ ruleName, result, node: r, message: messages.unscoped(sel.toString().trim(), owner.prefix), word: sel.toString().trim() });
      }
    });
  });
};

rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = { url: 'docs/css-architecture.md#automated-protections' };

export default stylelint.createPlugin(ruleName, rule);
