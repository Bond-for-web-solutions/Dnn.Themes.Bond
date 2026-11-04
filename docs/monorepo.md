# Monorepo

## Layout and ownership

| Path | Owns | Public API | May depend on |
| --- | --- | --- | --- |
| `packages/tokens` (L1) | design tokens, breakpoints | `tokens.css`, `media.css` | - |
| `packages/dnn` (L1) | DNN integration: shared skin overlay, `onDnnReady()` | `ready.js`, `skin/` overlay | - |
| `packages/foundation` (L2) | opt-in base, `.bond-container`, `.bond-stack`, `.bond-u-*` | `base.css`, `layout.css`, `utilities.css` | tokens |
| `packages/components` (L3) | button, field, card, alert, auth-card | one entry per component (see `exports`) | tokens, dnn |
| `packages/build` (tooling) | `bond` CLI, Stylelint rule, theme template, schema | CLI commands | (npm tooling only) |
| `themes/<id>` (leaf) | one DNN extension | its install ZIP | any `@bond/*` package |

Shared packages are `"private": true` and versioned with the repository. A
theme's `build-manifest.json` records the exact content hash of every shared
package it was built from. That hash is the release snapshot: two builds with
equal hashes contain identical shared code.

## Dependency rules

Enforced by `pnpm bond check` (CI step "Architecture checks") and at build time:

1. **Layers point down.** A package may only depend on packages with a lower
   `bond.layer` (BOND907). Themes are layer 100 and are never depended on (BOND906).
2. **No cycles** (BOND031).
3. **`workspace:` protocol** for every internal dependency (BOND905), so an
   internal name can never resolve from a registry (dependency confusion).
4. **Public API only.** Imports go through package names and their `exports`
   map. A relative import that escapes the package fails (BOND103/BOND910).
   Bare imports must be declared in `package.json` (BOND105/BOND911), and pnpm's
   strict `node_modules` enforces the same at resolution time.
5. **Unique identities.** Theme prefix, DNN package name, skin and container
   folder names are unique across themes (BOND920). A clash would let one theme
   overwrite another on install.

## Why changes to one theme can't affect another

- Theme folders are leaves: nothing imports from `themes/`.
- `bond build bond` writes only to `publish/bond/` via an atomic swap. Building
  DZP is proven not to change a single byte of Bond's output (integration test).
- At runtime a theme only references files inside its own skin and container
  folders. The build rejects site-absolute and remote URLs (BOND120/BOND121/BOND318).
- Shared changes *do* affect every dependent theme. That is intended, and it
  is made visible before release by impact analysis (`bond affected`) and
  per-theme visual baselines ([testing.md](testing.md#shared-component-changes)).

## Everyday commands

```bash
npm install -g pnpm@12.14.0 --allow-scripts=pnpm   # once per machine
pnpm install --frozen-lockfile
pnpm build bond          # = node packages/build/bin/bond.mjs build bond (production)
pnpm build               # no theme: pick one from themes/ (interactive terminals only)
pnpm build:all
pnpm dev bond            # watch: rebuild Bond on Bond/shared changes
pnpm bond affected --base origin/main
pnpm verify              # check + lint + build:all + validate + integration tests
```
