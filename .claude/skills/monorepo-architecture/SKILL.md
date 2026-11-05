---
name: monorepo-architecture
description: Package boundaries, dependency direction and independent theme deployment rules for this pnpm monorepo. Use when adding or moving a file between packages/* and themes/*, adding a dependency (internal or npm), creating a new shared package, changing package.json exports, or when "bond check" reports BOND9xx errors.
---

# Monorepo architecture

Rules and rationale: `docs/monorepo.md` and ADR-1/2 in `docs/architecture.md`.

## Decide where code goes

| It is… | Put it in |
| --- | --- |
| a token / breakpoint | `packages/tokens` |
| DNN-generic (identical ASCX partial, WebForms helper) | `packages/dnn` (`skin/` overlay or `src/`) |
| layout primitive or utility | `packages/foundation` |
| a whole layout every theme ships (splash) | its own package: `skin/` overlay + `bond.styles` (see `packages/splash`) |
| reusable UI with a contract | `packages/components/src/<name>/` |
| specific to one site/brand | `themes/<id>/` |
| build/validation tooling | `packages/build` |

Promote theme code to a shared package only when a *second* theme needs it.

## Rules (all enforced)

1. Layers point down (`bond.layer` in package.json): tokens/dnn 1 → foundation 2 → components 3 → themes.
2. Themes never import other themes; packages never import themes.
3. Internal deps: `"@bond/x": "workspace:*"`. Packages are `"private": true`.
4. Import by package name through the `exports` map; add new public files to `exports`.
5. New npm deps: exact version, ≥ 7 days old, no install script (pnpm `strictDepBuilds`).
   Prefer zero new runtime deps; browser bundles may only contain `@bond/*` code.
6. Theme identities (`prefix`, `packageName`, `skinName`, `containerName`) are unique.

## Validate

```bash
corepack pnpm install          # after any package.json change
pnpm check                     # BOND900–BOND922
pnpm bond affected --base origin/main
pnpm build:all && pnpm test
```
