---
name: dnn-architecture
description: DNN 10 theme/skin internals for this repo - ASCX layouts, panes, containers, DDRMenu menus, page-level layout selection, client resource loading order and cache busting, packaging and install behaviour. Use when editing anything under themes/*/skin or themes/*/containers, adding a layout, debugging a DNN page error (503 "No sites currently exist", "Illegal characters in path", missing styles), or deciding where CSS/JS must be loaded.
---

# DNN architecture

Ground truth (verified in DNN source and a local DNN 10.4 install) is in
`docs/dnn-integration.md`; packaging in `docs/build-system.md`. Don't guess
DNN behaviour: if something is not covered there, read DNN Platform source
(github.com/dnnsoftware/Dnn.Platform) before relying on it.

## Facts to apply

- CSS priorities: `default.css` 5 → module CSS 10 → **`skin.css` 15 (auto, every
  layout)** → **`<layout>.css` 20 (auto, that layout only)** → container CSS 25/30 → `portal.css` 35.
  Never `DnnCssInclude` `skin.css` (BOND316). Never use `Priority` < 15 for theme CSS.
- URLs are versioned by `?cdv=<CRM version>`; DNN bumps it on upgrade installs.
  File names stay stable; no hashes.
- DNN 10.2+ resource manager does not bundle or minify.
- Layout = root-level `.ascx` in `skin/`. It must include
  `partials/_registers.ascx` (shared from `@bond/dnn`) and
  `partials/_includes.ascx`, and contain `<div id="ContentPane" runat="server">`
  (or be listed in `theme.json` `layoutsWithoutContentPane`).
- **No `<% %>` / `<%= %>` / `<%: %>` / `<%# %>`** anywhere in layouts, partials or containers
  (even in HTML comments). DNN injects controls, ASP.NET throws "Controls collection cannot be
  modified", and DNN shows a misleading 503. Use server controls, CSS backgrounds, or DnnJsInclude.
- DDRMenu: `MenuStyle="menus/x"` needs `menus/x/menudef.xml` with a `<template>` that exists,
  or DDRMenu fails with "Illegal characters in path".
- Layout-only JS: add a `scripts` entry in `theme.json` and a `DnnJsInclude … PathNameAlias="SkinPath"
  ForceProvider="DnnFormBottomProvider"` in that layout only.
- Enhancement JS must survive UpdatePanel partial postbacks: `onDnnReady()` from `@bond/dnn/ready.js`.
- Containers can be used under other themes' skins: container CSS has no `:root` tokens (BOND353).
- Package identity (`packageName`, `skinName`, `containerName`) must never change (it breaks upgrades).

## Validate

```bash
node packages/build/bin/bond.mjs build <id> --mode development   # BOND3xx = DNN rule violations, with file:line
pnpm test:visual -g "<id>"                                      # fixtures in themes/<id>/tests/fixtures
```

For real DNN, run `tests/e2e` against a *local* site (see `docs/testing.md`).
Deploy only via `bond deploy` with `.env`, never by copying into `C:\DNN\*`.
