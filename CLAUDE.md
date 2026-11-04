# DNN themes monorepo

Independently deployable DNN 10 themes (`themes/*`) built from shared,
build-time-only packages (`packages/*`). One CLI, `packages/build/bin/bond.mjs`,
is used by the terminal, VS Code tasks and CI. Read `docs/architecture.md` first.

## Commands

```bash
pnpm install --frozen-lockfile             # pnpm not found? npm install -g pnpm@12.14.0 --allow-scripts=pnpm
pnpm menu                                  # pick command + theme in the terminal (VS Code: Ctrl+Shift+B)
pnpm build <theme> | build:all             # production -> publish/<theme>/{theme,packages,reports}; no theme = pick from a list
node packages/build/bin/bond.mjs build <id> --mode development   # readable + maps, no ZIP
pnpm dev <theme>                           # watch
pnpm check && pnpm lint && pnpm test       # architecture, Stylelint/ESLint, 75 integration tests
pnpm test:visual                           # Playwright: screenshots, CSS isolation, behaviour, Bond 1.0 parity
pnpm bond affected --base origin/main       # which themes a change touches
```

## Hard rules

- **Never write to a DNN site directly.** Local deploy only via
  `bond deploy <id>` with the site set in `.env`
  (`<THEME>_SITE_ROOT` per theme, e.g. `BOND_SITE_ROOT`; git-ignored). The machine has several real client sites
  under `C:\DNN\*`; do not touch them otherwise. Never deploy to production.
- `publish/` is generated. Never edit it. Fix the source and rebuild.
- ASCX layouts/partials/containers: **no `<% %>` code blocks** (DNN then
  503s with a misleading message). Use server controls or CSS.
- CSS: everything scoped by an owned class (`bond-` in packages, the theme
  `prefix` in themes); BEM; no `!important`, ids or `@layer`. Element
  selectors only in a theme's `base.css` and listed in `theme.json`
  `globalSelectors`. Themes customise shared components through `--bond-*`
  tokens, not by targeting shared classes such as `.bond-button` (except in `styles/overrides.css`).
  The shared namespace is `bond-` because DNN already owns `dnn-` (classes and `--dnn-color-*`).
- Shared code is imported by package name through `exports`; never by a
  relative path into another package. New internal deps use `workspace:*`.
- Component changes: keep `contract.json` in sync (tests fail otherwise). A
  visual diff in another theme is a real impact: review it, don't just update baselines.
- Theme JS: `textContent`/properties only (no `innerHTML`), `addEventListener`,
  idempotent initialisers via `onDnnReady()`; no inline scripts or handlers in markup.
- Never change a theme's `dnn.packageName`/`skinName`/`containerName`:
  that breaks upgrades of installed sites.
- New npm dependencies need a clear purpose, an exact pinned version at least
  7 days old (pnpm enforces `minimumReleaseAge`), and no install scripts.

## Where things are

| Need | Look at |
| --- | --- |
| DNN loading, priorities, packaging facts | `docs/dnn-integration.md`, `docs/build-system.md` |
| CSS rules and why | `docs/css-architecture.md` |
| Error code `BONDnnn` | `docs/build-system.md#validation-rules-dnn-specific`, `packages/build/lib/*.mjs` |
| Bond history / visible changes | `docs/migration/bond-legacy-assessment.md` |
| What is verified vs not | `docs/validation-results.md` |

Skills in `.claude/skills/` cover specialised workflows (architecture, CSS,
components, performance, security review, build and release, testing, code
review, new themes).

## Environment notes

Windows dev machine: Defender holds new ZIPs for a few seconds, which makes
Bond production builds take ~6 s (handled by retries). Playwright uses the
system Chrome locally (`channel: chrome`) and bundled Chromium in CI;
baselines are per platform.
