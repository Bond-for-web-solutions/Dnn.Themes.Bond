# Component guidelines

A shared component lives in `packages/components/src/<name>/` and consists of:

| File | Required | Purpose |
| --- | --- | --- |
| `<name>.css` | yes | styles, scoped by `.bond-<block>` |
| `contract.json` | yes | public API: block, elements, modifiers, tokens, a11y notes, examples |
| `<name>.js` | no | progressive enhancement only (see below) |

Then add it to `exports` in `packages/components/package.json`. Themes opt in
by importing it in `styles/skin.css` (dependencies first) and, for JS, in
`scripts/theme.js`.

## Markup: where it comes from

DNN renders HTML on the server (ASCX, DDRMenu Razor, modules, HTML module
content). Components are therefore **class contracts**, not render functions.
The same `.bond-button` works in a Razor menu, an ASCX layout, an editor's
HTML module, and in JS-generated markup. JavaScript only enhances markup DNN
already produced (e.g. `auth-card` wraps DNN's login form). It must fail open:
if the expected markup isn't there, it does nothing.

## Contracts

```json
{
  "component": "button",
  "contractVersion": 1,
  "block": "bond-button",
  "elements": [],
  "modifiers": ["block", "secondary", "ghost", "sm"],
  "tokens": ["--bond-button-bg", "..."],
  "accessibility": "…",
  "examples": ["<button type=\"button\" class=\"bond-button\">Primary</button>"]
}
```

`tests/integration/units.test.mjs` fails when the CSS and the contract
disagree, in either direction:
- a contract class or token disappears from the CSS → **breaking change** detected;
- the CSS gains an undocumented class or `--bond-<component>-*` token → undocumented API.

`examples` feed the component gallery, which is screenshotted under **every**
theme (`tests/visual/visual.spec.mjs`).

### Changing a component

| Change | Contract | Version note |
| --- | --- | --- |
| New modifier/token | add it | minor |
| Visual tweak of defaults | - | expect visual diffs in themes that don't override that token; review them per theme |
| Remove/rename class or token | update contract, bump `contractVersion`, update every theme | **breaking**: list it in each affected theme's ReleaseNotes |

## Rules

- Scope everything by the block class; no element selectors.
- Read tokens with fallbacks to shared tokens:
  `var(--bond-button-bg, var(--bond-color-accent))`.
- Variants change custom properties only, never selectors with higher specificity.
- Interactive elements: `:is(a, button, input)` for (0,1,1) - see
  [css-architecture.md](css-architecture.md#specificity-rules).
- Links: style `:is(:link, :visited)` explicitly (DNN styles `a:visited`).
- Headings inside components: set `margin: 0` (DNN's `default.css` adds heading margins).
- Motion: respect `@media (--bond-reduced-motion)`.
- Focus: visible `:focus-visible` (or a transparent outline next to a
  box-shadow ring so forced-colors mode still shows focus).
- JS: no `innerHTML`/`insertAdjacentHTML`/`document.write` (ESLint
  `no-unsanitized`); `textContent` and DOM properties only; `addEventListener`
  only (no `on*` properties); idempotent initialisers; use `onDnnReady()` from
  `@bond/dnn/ready.js` so enhancements survive UpdatePanel postbacks.
- Accessibility: labels for inputs, names for buttons and links, `aria-*`
  state on toggles, keyboard support (Enter, Escape), colour is never the only signal.
- DNN dependencies (ids, classes the JS relies on) are listed in
  `contract.json` `javascript.dnnDependencies`, because DNN upgrades can change them.

## Theming a component

See [css-architecture.md](css-architecture.md#customising-without-editing-shared-code).
For example, Bond keeps its 1.0 login look purely through tokens in
`themes/bond/styles/tokens.css` (`--bond-button-radius: 0.625rem`, …).
