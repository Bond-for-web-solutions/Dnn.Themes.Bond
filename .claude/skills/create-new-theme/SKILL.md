---
name: create-new-theme
description: Add a new DNN theme (or migrate an existing DNN skin) into this monorepo with the generator, correct shared dependencies, unique DNN identity, branding tokens, layouts, containers, VS Code tasks, fixtures and visual baselines. Use when asked to create, scaffold, add or migrate a theme/skin for a site or customer.
argument-hint: "<theme-id> [--prefix p] [--package-name Name]"
---

# Create a new theme

Reference: `docs/adding-new-theme.md`.

## Steps

1. Confirm the inputs with the user if not given: theme id (`^[a-z][a-z0-9-]{1,30}$`), CSS prefix
   (short, unique, not `bond`), DNN package name. **When migrating an installed skin, the package
   name, skin name and container name must equal the installed ones and the version must be higher.**
2. Scaffold and build:
   ```bash
   pnpm bond create-theme <id> --prefix <p> --package-name <Name> --friendly-name "<Friendly>"
   corepack pnpm install
   pnpm bond build <id>
   ```
3. Set `dnn.owner`/`description` in `themes/<id>/theme.json`; brand in `styles/tokens.css`.
4. Layouts in `skin/*.ascx` (follow the `dnn-architecture` skill); layout-only CSS/JS via
   `theme.json` `styles`/`scripts` entries.
5. Nothing to register: the VS Code theme picker runs `bond list-themes` (scans `themes/`) each time it
   opens. Never add tasks that name a concrete theme (a test forbids it).
6. Fixtures: `tests/fixtures/<layout>.html` per layout + `admin.html` (copy from Bond). Create baselines
   (Windows + Linux, see `docs/testing.md#updating-baselines`).
7. Migration only: write `releases/<installed version>.files.json` from the installed `Resources.zip`;
   compare old vs new computed styles like `tests/visual/migration.spec.mjs`.

## Done when

`pnpm check`, `pnpm lint`, `pnpm build <id>`, `pnpm validate`, `pnpm test` and `pnpm test:visual` pass,
and `publish/<id>/packages/` contains the install ZIP.
