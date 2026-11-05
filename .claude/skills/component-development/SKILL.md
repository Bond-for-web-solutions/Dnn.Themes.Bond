---
name: component-development
description: Create or change a shared, themeable, accessible UI component in packages/components (CSS + contract.json + optional progressive-enhancement JS). Use when adding a component, adding a modifier or token, changing component visuals or JS, or when the contract tests in tests/integration/units.test.mjs fail.
---

# Component development

Guidelines: `docs/component-guidelines.md`. Specificity/token rules: `docs/css-architecture.md`.

## New component checklist

1. `packages/components/src/<name>/<name>.css`: block `.bond-<name>`, elements `__x`, modifiers `--y`;
   tokens `--bond-<name>-*` with fallbacks to shared tokens; `:is(a, button, input)` for interactive roots;
   `margin: 0` on headings; reduced-motion handling; a visible focus style.
2. `contract.json`: block, elements, modifiers, tokens, accessibility notes, and `examples` (these feed
   the visual gallery for every theme).
3. Optional `<name>.js`: export an `init…()` that uses `onDnnReady()`, is idempotent, fails open when
   markup is missing, uses `textContent` only, and lists the DNN selectors it depends on in the contract.
4. Add the files to `exports` in `packages/components/package.json`.
5. Import the component in each theme that uses it (`styles/skin.css`, `scripts/theme.js`).

## Changing an existing component

- Classify the change first: additive (minor), visual default change (affects themes that don't override
  the token), or breaking (removed/renamed class or token → bump `contractVersion`, update every theme,
  note it in their ReleaseNotes).
- Run the visual suite: diffs show exactly which themes change. Review each theme's diff; only update
  baselines for intended changes.

## Validate

```bash
node --test tests/integration/units.test.mjs     # contract <-> CSS, both directions
pnpm lint
pnpm build:all
pnpm test:visual
```
