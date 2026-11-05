# CSS architecture

Goal: no theme, shared package or layout can accidentally restyle DNN, a
module, another layout or another theme. And when a shared change *does*
alter a theme, it shows up before release.

## How DNN loads CSS (the facts everything else rests on)

DNN sorts stylesheets by priority (`FileOrder.Css`, verified in DNN source):

| Priority | Stylesheet | Notes |
| ---: | --- | --- |
| 5 | `Resources/Shared/stylesheets/dnndefault/10.0.0/default.css` | **unlayered**, contains an element reset (`div{margin:0;padding:0;border:0}`, `a,a:visited{color;text-decoration:underline}`, `h1..h6{font-family:Arial}`) |
| 10 | module stylesheets (`module.css`) | third-party, unknown quality |
| **15** | **`<skin>/skin.css`** | auto-registered on every layout of the skin → our theme bundle |
| **20** | **`<skin>/<layout>.css`** | auto-registered only for that layout → our layout bundles |
| 25 / 30 | `<container>/container.css` / `<container>/<name>.css` | wherever the container is used - possibly under another theme |
| 35 | `Portals/<n>/portal.css` | the site admin's custom CSS - intentionally last |
| 100 | `DnnCssInclude` without `Priority` | |

Bond 1.0 included its CSS with `Priority="1..3"`, i.e. **before**
`default.css`. Every equal-specificity element rule it wrote (`body` font and
background) was overridden by DNN. The new layout uses slots 15 and 20.

## Why no cascade layers

Unlayered declarations beat layered ones regardless of specificity (CSS
Cascade 5). DNN's `default.css` and every module stylesheet are unlayered. If
a theme put its CSS in `@layer`, then `div{padding:0}` from `default.css`
would erase `.bond-card{padding:…}`, and `a{color}` would recolour every
`.bond-button` link. We can't move DNN's CSS into a layer (DNN emits the
`<link>`). Layers are therefore **banned** (Stylelint `at-rule-disallowed-list`,
build audit BOND350). Revisit when DNN ships a layered `default.css`.

## Tiers (order inside each bundle)

```text
tokens (@bond/tokens)        :root custom properties, @custom-media
theme tokens                brand values override shared defaults
base (opt-in)               the only element selectors; allowlisted per theme
layout primitives/utilities .bond-container, .bond-stack, .bond-u-*
shared components           .bond-button, .bond-card, …
theme                       .bond-header, .bond-footer, …
layout bundle               <layout>.css - separate file, separate page
overrides.css (optional)    the only place a theme may target shared component classes
```

Order is source order inside one unlayered bundle. Because every rule is
scoped by a class and specificity is kept low and flat, order only matters
where it is meant to (tokens → theme tokens; component → overrides).

## Naming

`<prefix>-<block>[__<element>][--<modifier>]`, lowercase, hyphenated.

| Prefix | Owner | Example |
| --- | --- | --- |
| `bond-` | shared packages (the design system) | `.bond-button--secondary`, `.bond-auth__card`, `.bond-container` |
| `bond-u-` | utilities | `.bond-u-visually-hidden` |
| `<theme prefix>-` | the theme (`theme.json` `prefix`) | `.bond-nav-link` (Bond), `.dzp-sidebar` (DZP) |

Why `bond-` and not `dnn-`: DNN itself already uses `dnn-` classes
(`dnn-button`, `dnn-field` in the Persona Bar) and `--dnn-color-*` variables
(written by Site Settings → Styles). A `dnn-` namespace would restyle DNN's
admin UI and override the admin's colours.

The Bond theme shares the `bond-` prefix with the design system. Shared and
theme classes are therefore told apart by **block name**, not prefix: a class
is shared when its block (`bond-card` in `bond-card__title`) is defined in
`packages/*/src` (`packages/build/lib/shared-classes.mjs`). Theme blocks must
not reuse a shared block name. Other themes may use shared classes, but never
the Bond theme's own (`.bond-header` in DZP is reported as foreign).
| `is-*` / `has-*` | state, only together with an owned class | `.bond-nav-link.is-selected` |
| `--bond-*`, `--<prefix>-*` | custom properties | `--bond-color-accent`, `--bond-cyan-500` |
| `--_bond-*` | private component variables | `--_bond-alert-fg` |

## Specificity rules

- Components: single class (0,1,0). Interactive elements commonly targeted by
  module CSS (`a`, `button`, `input`) use `:is(a, button, input)` for exactly
  (0,1,1). That ties with sloppy rules such as `.SomeModule button`, and the
  theme wins ties because `skin.css` (15) loads after module CSS (10).
- Links: `:is(:link, :visited)` (0,2,0) outranks DNN's `a:visited` (0,1,1).
  This is what Bond 1.0's `!important`s were compensating for.
- Variants only set custom properties, so they never raise specificity.
- Limits: no ids, no `!important` (budget 0 per theme), max specificity
  (0,3,1), max 4 compound selectors.

## Global rules

The only element selectors that ship are the ones a theme explicitly lists in
`theme.json` `"globalSelectors"` (Bond: `*`, `::before`, `::after`, `:root`,
`body`, `body > form`, `img`). The build audits the **compiled** bundle and
fails on any other unscoped selector (BOND354), including one introduced by a
shared package. `@bond/foundation/base.css` ships only `box-sizing:border-box`.
There are no margin, list or heading resets: `default.css` already resets, and
anything more would restyle third-party modules.

## Customising without editing shared code

1. Set tokens in `themes/<id>/styles/tokens.css` (brand colours, fonts, radii).
2. Set component tokens (`--bond-button-radius`, `--bond-field-padding-y`, …).
   Each component's `contract.json` lists them.
3. Use documented modifiers (`bond-button--secondary`).
4. Last resort: `styles/overrides.css`, the only file where Stylelint allows
   shared component classes (e.g. `.bond-button`) in a theme. Each override should carry a comment explaining it.

## Guarantees (tested in a real browser against DNN's real default.css)

| ID | Guarantee | Test |
| --- | --- | --- |
| G1 | A theme does not change the box model of DNN core module UI (`.dnnForm`, grids, actions) | `isolation.spec.mjs` |
| G2 | Components survive `default.css` (visited links, heading margins) | `isolation.spec.mjs` |
| G3 | Components win ties against third-party module CSS; the theme does not fight module CSS globally | `isolation.spec.mjs` |
| G4 | Layout bundles load and apply only on their layout | `isolation.spec.mjs` |
| G5 | No console errors or failed requests | `isolation.spec.mjs` |

Known global effect: `box-sizing: border-box` (opted into by Bond, as in
Bond 1.0) changes how DNN core inputs that set both `width` and `padding`
are sized. G1 deliberately does not compare `box-sizing`.

## Automated protections

| Layer | What | Where |
| --- | --- | --- |
| Source lint | namespace per owner (`bond/selector-namespace`; a class inside `:not()/:is()/:has()` does not count as scoping), BEM pattern, no `!important`/ids/`@layer`, specificity/compound limits, prefixed keyframes and custom properties, described disable comments | `stylelint.config.mjs`, `packages/build/stylelint/plugin.mjs` |
| Compiled audit | unscoped selectors vs allowlist, `@layer`, `!important` budget, foreign theme prefixes, `:root` in container CSS | `packages/build/lib/css-audit.mjs` (BOND350–354) |
| Contracts | component classes and tokens match `contract.json` exactly | `tests/integration/units.test.mjs` |
| Visual | per-theme page + component baselines (Windows + Linux) | `tests/visual/visual.spec.mjs` |
| Isolation | G1–G5 above | `tests/visual/isolation.spec.mjs` |

## Containers

Container CSS is loaded wherever the container is used, possibly under
another theme's skin. It therefore must not define `:root` tokens (BOND353),
and every `var()` should carry a fallback (see the template's
`styles/container.css`).
