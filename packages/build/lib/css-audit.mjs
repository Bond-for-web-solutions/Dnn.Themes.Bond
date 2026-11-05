// Audits *compiled* CSS (after shared packages are bundled in). Source linting
// (Stylelint) catches mistakes per file; this catches what actually ships:
// global selectors, specificity, cascade layers, foreign theme prefixes.
// See docs/css-architecture.md#automated-protections.
import { transform } from 'lightningcss';
import { isSharedClass, SHARED_PREFIX } from './shared-classes.mjs';

const NESTED_KINDS = new Set(['is', 'not', 'has', 'where', 'any', 'matches', 'nth-child', 'nth-last-child']);

function nestedSelectors(comp) {
  return comp.selectors || comp.value?.selectors || comp.of || null;
}

export function specificity(selector) {
  let a = 0, b = 0, c = 0;
  for (const comp of selector) {
    switch (comp.type) {
      case 'id': a++; break;
      case 'class': case 'attribute': b++; break;
      case 'type': c++; break;
      case 'pseudo-element': c++; break;
      case 'pseudo-class': {
        const nested = nestedSelectors(comp);
        if (comp.kind === 'where') break;
        if (NESTED_KINDS.has(comp.kind) && Array.isArray(nested) && nested.length) {
          const best = nested.map(specificity).sort(cmpSpec).at(-1);
          a += best[0]; b += best[1]; c += best[2];
          if (comp.kind.startsWith('nth')) b++;
        } else b++;
        break;
      }
      default: break;
    }
  }
  return [a, b, c];
}

export const cmpSpec = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

function classes(selector, out = []) {
  for (const comp of selector) {
    if (comp.type === 'class') out.push(comp.name);
    const nested = comp.type === 'pseudo-class' ? nestedSelectors(comp) : null;
    if (Array.isArray(nested)) for (const s of nested) if (Array.isArray(s)) classes(s, out);
  }
  return out;
}

/** Classes in top-level compounds only - NOT inside :not()/:is()/:has()/:where().
 *  `:not(.bond-x) p` or `html:has(.bond-x) div` style unscoped elements, so a
 *  class nested in a pseudo-class never counts as scoping. */
function topLevelClasses(selector) {
  return selector.filter((c) => c.type === 'class').map((c) => c.name);
}

function selectorText(selector) {
  // "*::before" and "::before" are the same selector; minifiers drop the "*".
  const comps = selector.filter((c, i) => !(c.type === 'universal' && selector[i + 1] && selector[i + 1].type !== 'combinator'));
  return comps.map((c) => {
    switch (c.type) {
      case 'combinator': return { descendant: ' ', child: ' > ', 'next-sibling': ' + ', 'later-sibling': ' ~ ' }[c.value] ?? ' ';
      case 'class': return `.${c.name}`;
      case 'id': return `#${c.name}`;
      case 'type': return c.name;
      case 'universal': return '*';
      case 'pseudo-class': return `:${c.kind}${nestedSelectors(c) ? '(…)' : ''}`;
      case 'pseudo-element': return `::${c.kind}`;
      case 'attribute': return `[${c.name}]`;
      default: return '';
    }
  }).join('').trim();
}

/**
 * @param {{code: string, filename: string, ownPrefix: string, foreignPrefixes: string[], container?: boolean}} o
 */
export function auditCss({ code, filename, ownPrefix, foreignPrefixes, container = false }) {
  const r = { rules: 0, selectors: 0, maxSpecificity: [0, 0, 0], maxSelector: '', important: 0, layers: 0, rootCustomProperties: 0, globalSelectors: new Set(), foreignClasses: new Set(), unprefixedClasses: new Set() };
  const allowed = [`${SHARED_PREFIX}-`, `${ownPrefix}-`];
  const isOwn = (cls) => allowed.some((p) => cls.startsWith(p));
  const foreign = foreignPrefixes.map((p) => `${p}-`);
  transform({
    filename,
    code: Buffer.from(code),
    errorRecovery: true,
    visitor: {
      Rule: {
        'layer-block'() { r.layers++; },
        'layer-statement'() { r.layers++; },
        style(rule) {
          r.rules++;
          const decls = rule.value.declarations || {};
          r.important += (decls.importantDeclarations || []).length;
          const isRoot = rule.value.selectors.some((s) => s.length === 1 && s[0].type === 'pseudo-class' && s[0].kind === 'root');
          if (isRoot) {
            r.rootCustomProperties += [...(decls.declarations || []), ...(decls.importantDeclarations || [])].filter((d) => d.property === 'custom').length;
          }
          for (const sel of rule.value.selectors) {
            r.selectors++;
            const s = specificity(sel);
            if (cmpSpec(s, r.maxSpecificity) > 0) { r.maxSpecificity = s; r.maxSelector = selectorText(sel); }
            const cls = classes(sel);
            for (const c of cls) {
              // Shared classes (.bond-button) are fine in every theme; other themes' own classes are not.
              if (foreign.some((p) => c.startsWith(p)) && !isSharedClass(c)) r.foreignClasses.add(c);
            }
            if (!topLevelClasses(sel).some(isOwn)) r.globalSelectors.add(selectorText(sel));
          }
          return undefined;
        },
      },
    },
  });
  return {
    ...r,
    container,
    globalSelectors: [...r.globalSelectors].sort(),
    foreignClasses: [...r.foreignClasses].sort(),
    unprefixedClasses: [...r.unprefixedClasses].sort(),
  };
}
