---
name: css-architecture
description: CSS isolation rules for DNN themes - namespaced BEM, specificity budget, design tokens, allowlisted global selectors, why cascade layers are banned, container CSS rules. Use whenever writing or reviewing CSS in packages/* or themes/*, when Stylelint (bond/selector-namespace) or the build audit (BOND350–354) fails, or when a style "doesn't apply" or leaks into DNN modules.
---

# CSS architecture

Full rules: `docs/css-architecture.md`. Key facts:

- DNN's `default.css` and module CSS are **unlayered**, so `@layer` would lose to them.
  Never use `@layer`.
- Theme CSS loads after `default.css` (5) and module CSS (10); `portal.css` (35) wins over us on purpose.
- DNN styles `a, a:visited` (0,1,1) and has an element reset (`div{padding:0}`, `h1{font-family:Arial}`).

## Writing CSS

1. Scope every selector by an owned class: `.bond-*` in packages, `.<prefix>-*` in a theme. Never use `dnn-`
   (DNN owns `dnn-` classes and `--dnn-color-*`). Shared vs Bond-theme classes are told apart by block name.
2. BEM: `<prefix>-block__element--modifier`; state: `is-*`/`has-*` combined with an owned class.
3. Values come from tokens: `var(--bond-space-4)`, `var(--bond-color-text)`; brand values live in
   `themes/<id>/styles/tokens.css`. Breakpoints: `@media (--bond-lg)` (import `@bond/tokens/media.css`).
4. Links: style `:is(:link, :visited)`. Interactive components: `.x:is(a, button, input)` (0,1,1).
5. No `!important`, ids, `@layer`; max specificity (0,3,1). Variants change custom properties only.
6. Element selectors only in `styles/base.css`, with a described stylelint-disable, and the exact
   selector added to `theme.json` `globalSelectors`.
7. Customise shared components through `--bond-<component>-*` tokens. Targeting shared classes (e.g. `.bond-button`) from a theme is
   only allowed in `styles/overrides.css`, with a comment explaining why.
8. Layout-only CSS goes into `styles/layouts/<layout>.css`, mapped to `<layout>.css` in `theme.json`.
9. Container CSS: no `:root`, every `var()` with a fallback.

## Validate

```bash
pnpm lint:css
node packages/build/bin/bond.mjs build <id>         # compiled-bundle audit BOND350–354
pnpm test:visual -g "G1|G2|G3|G4|<id>"             # isolation guarantees + screenshots
```

If a screenshot changes, inspect the diff in the Playwright report before running `pnpm test:visual:update`.
