# Architecture

One repository holds every DNN theme plus the shared frontend infrastructure
they are built from. Each theme compiles into its own self-contained DNN
install package. Shared code is shared **at build time**, never at runtime: a
DNN site never loads anything from another theme.

```text
dnn-themes/
├── packages/                 shared, versioned with the repo, never published to npm
│   ├── tokens/        L1     design tokens (CSS custom properties) + @custom-media breakpoints
│   ├── dnn/           L1     DNN integration: shared skin files (_registers.ascx, doctype), onDnnReady()
│   ├── foundation/    L2     opt-in base, layout primitives (.bond-container), utilities
│   ├── components/    L3     button, field, card, alert, auth-card - CSS + optional JS + contract.json
│   └── build/         tool   bond CLI: compile, validate, package, deploy; Stylelint plugin; theme template
├── themes/                   one folder per independently deployable theme (leaves of the graph)
│   ├── bond/                 DNN.Themes.Bond (migrated legacy theme)
│   └── dzp/                  scaffold dashboard theme (NOT the production Dnn.Skin.DZP)
├── tests/                    integration (node:test), visual + isolation (Playwright), e2e (real DNN, opt-in)
├── docs/                     this documentation
├── .claude/skills/           Claude Code skills for this repo
├── .vscode/tasks.json        IDE tasks -> the same CLI
└── publish/                  generated artifacts (git-ignored)
```

## Dependency graph

```text
            ┌──────────── themes/bond ─────────────┐   ┌──── themes/dzp ────┐
            │                                       │   │                    │
            ▼                                       ▼   ▼                    ▼
   @bond/components (L3) ──► @bond/dnn (L1)      @bond/foundation (L2)   (same packages)
            │                                       │
            └──────────────► @bond/tokens (L1) ◄─────┘

   @bond/splash (L2) ──► @bond/dnn, @bond/tokens: the shared splash layout, in every theme.
   @bond/build (tooling) - runs the build; nothing imports it at runtime.
```

Rules (enforced by `bond check`, see [monorepo.md](monorepo.md#dependency-rules)):
a package may depend only on lower layers, themes never depend on themes, all
internal dependencies use the `workspace:` protocol, and a package's public
API is its `package.json` `exports` map. pnpm's strict `node_modules` means
undeclared imports fail to resolve, and the build rejects them explicitly (BOND105).

## How a theme is built

```text
bond build bond
  ├─ resolve dependency closure (tokens, dnn, foundation, splash, components)
  ├─ overlay shared skin files (@bond/dnn/skin -> partials/_registers.ascx, skin.doctype.xml;
  │   @bond/splash/skin -> splash.ascx)
  ├─ copy themes/bond/skin/ and containers/ (text normalised to LF)
  ├─ Lightning CSS: bundle styles/skin.css (+ layouts/*.css, + package "bond.styles" such as
  │   @bond/splash -> splash.css), resolve @bond/* imports,
  │   lower nesting/custom-media for the browser baseline, minify, copy url() assets
  ├─ esbuild: bundle scripts/theme.js (+ layout scripts) into IIFE classic scripts
  ├─ validate: ASCX/DNN rules, menus, CSS audit, budgets, secrets, forbidden files
  ├─ package: Resources.zip, [ContainerResources.zip], manifest.dnn, install ZIP (deterministic)
  ├─ verify: re-read the ZIP and prove it matches the manifest and the staged files
  ├─ reports: build-manifest.json (git SHA, dependency hashes, sizes), validation.json
  └─ atomic swap into publish/bond/ (a failed build leaves the previous output untouched)
```

Details: [build-system.md](build-system.md).

## Architecture decisions

Each decision lists what was chosen, what was rejected, and why. These are
the ADRs for the repository. Add new ones at the end with the next number.

### ADR-1 Monorepo with pnpm workspaces; no Turborepo/Nx (yet)

- **Chosen:** pnpm workspaces plus a small purpose-built CLI (`@bond/build`).
- **Why:** pnpm gives strict dependency isolation (undeclared imports fail),
  content-addressed installs, and supply-chain controls in
  `pnpm-workspace.yaml` (`minimumReleaseAge`, `strictDepBuilds`, `trustPolicy`,
  `blockExoticSubdeps`). A theme build takes 0.4–1.5 s. Shared packages are
  *source* packages with nothing to pre-compile, so there is no task graph for
  Turborepo to cache.
- **Rejected:** Turborepo and Nx. They add a daemon and config surface to cache
  work that is already cheap. npm/Yarn workspaces have weaker isolation.
- **Revisit when:** themes gain expensive steps (image optimisation, many
  layouts) and `build:all` exceeds a minute. `bond build <id>` is already a
  pure per-theme command that a Turborepo task could wrap.

### ADR-2 Shared packages are uncompiled source; each theme bundles them

- **Chosen:** `@bond/*` packages export CSS/JS source. The theme build bundles
  what it imports. That is what "shared packages compile automatically" means:
  there is no separate prebuild to forget.
- **Rejected:** prebuilt `dist/` per package (stale artifacts, ordering
  problems) and runtime sharing through a common "library skin" folder. With
  runtime sharing, an upgrade of one theme would break others, and DNN has no
  dependency resolution between skins.

### ADR-3 Lightning CSS + esbuild; no Vite, Sass, PostCSS or Terser

- **Lightning CSS:** a single native binary (no install scripts) that bundles
  `@import`, resolves `@custom-media`, lowers nesting for the browser baseline,
  minifies, and reports `url()` dependencies so assets can be copied and
  verified. Sass would add a language without solving a problem that tokens,
  custom properties and `@custom-media` don't already solve. PostCSS would
  mean a plugin chain to maintain.
- **esbuild:** bundles the small amount of theme JS into classic IIFE scripts
  for `DnnJsInclude`. Its minifier is sufficient, so Terser is unnecessary.
- **Vite rejected:** its value is the dev server and HMR for client-rendered
  apps. DNN renders ASCX server-side through IIS, so Vite cannot serve the page.
  Its production build would just wrap esbuild/Rollup.

### ADR-4 Use DNN's automatic stylesheet registration

- **Chosen:** each theme emits `skin.css` (the theme bundle) and `<layout>.css`
  at the skin root. DNN registers `<SkinPath>skin.css` at priority 15 on every
  layout and `<layout>.css` at priority 20 only on that layout. This was
  verified in DNN's `DefaultPage.cs` (develop) and the `FileOrder` enum.
- **Why:** it is the correct cascade slot (after `default.css` 5 and module CSS
  10, before containers 25 and the admin's `portal.css` 35), it gives
  page-level layout CSS with zero registration code, and it removes the
  legacy bug where Bond's includes at priorities 1–3 loaded *before* DNN's
  `default.css` (see [migration assessment](migration/bond-legacy-assessment.md)).

### ADR-5 Stable file names + DNN's `?cdv=` version; no content hashes in names

- DNN appends `?cdv=<CRM version>` to every registered resource
  (`ResourceBase.GetVersionedPath`), and `Installer.Install()` increments the
  CRM version on every upgrade or repair install. With the site's
  `clientCache` of 365 days, this is what busts caches.
- Hashed names were rejected. DNN does not delete files from an older version
  on upgrade, so they would pile up unless every release generated Cleanup
  entries for them. They also force ASCX rewriting, and the resource manager
  de-duplicates by path.
- Files removed between releases *are* cleaned up: see ADR-8.

### ADR-6 Unlayered CSS with namespaced BEM and a specificity budget; no `@layer`

DNN 10's `default.css` and all module CSS are **unlayered**. Unlayered rules
beat every layered rule regardless of specificity, so a theme written in
`@layer` would lose to `default.css`'s element reset (`div{padding:0}`,
`a{color;text-decoration}`, `h1{font-family:Arial}`). Isolation therefore
comes from namespaces (`bond-` for the shared design system and the Bond theme, `dzp-` for DZP), single-class BEM selectors,
DNN's load order, and automated audits. Full rationale:
[css-architecture.md](css-architecture.md#why-no-cascade-layers).

### ADR-7 Components = CSS contract + optional progressive-enhancement JS; markup stays in the theme

DNN renders markup server-side (ASCX, Razor/DDRMenu, modules). A JS component
framework would mean client-side rendering on top of WebForms postbacks.
Shared components are therefore class contracts (`contract.json`) that any
markup source can use: ASCX, Razor menus, HTML module content, or JS that
enhances DNN's own markup (`auth-card`). Markup that differs per theme (menus,
layouts) lives in the theme. Markup that is identical everywhere
(`_registers.ascx`, `skin.doctype.xml`) is a shared overlay in `@bond/dnn`.

### ADR-8 Generated manifest and release snapshots

`manifest.dnn` is generated from `theme.json`, so layouts and containers can
never drift from what is packaged. It keeps the legacy structure (Skin package
+ Container package, each with a ResourceFile ZIP). `bond snapshot` records each
release's file list in `themes/<id>/releases/`, and the next build emits a DNN
`Cleanup` component for files that disappeared, so upgrades remove stale files.

### ADR-9 Deterministic, self-verifying packages

The build uses its own small ZIP writer: sorted entries, timestamps from
`SOURCE_DATE_EPOCH` or the commit time, LF-normalised text, no extra fields.
It then re-reads the ZIP and verifies it against the manifest and the staged
files. Same commit + lockfile + Node version gives byte-identical ZIPs on
Windows and Linux (CI job `reproducible`).

## Research references

| Topic | Source (verified) |
| --- | --- |
| Skin CSS auto-registration and priorities | DNN Platform `Website/Default.aspx.cs` (`RegisterStylesheet(… "skin.css", FileOrder.Css.SkinCss)`, `SkinSrc.Replace(".ascx", ".css")`), `DotNetNuke.Web.Client/FileOrder.cs` |
| Client resource manager (replaces ClientDependency; no bundling/minification) | DNN `DotNetNuke.Web.Client.ResourceManager/ClientResourceController.cs`, `Models/ResourceBase.cs`; [dnncommunity.org: Replacing the Client Dependency Framework](https://dnncommunity.org/blogs/Post/20895/Replacing-the-Client-Dependency-Framework); `DotNetNuke.Web.Client.ResourceManager.dll` present in a local DNN 10.4.0 install |
| CRM version bump on upgrade | DNN `Services/Installer/Installer.cs` (`IncrementCrmVersion` when `PackageID > -1`) |
| SkinInstaller only rewrites .htm/.html skins | DNN `UI/Skins/SkinFileProcessor.cs`, `Installers/SkinInstaller.cs` |
| Cleanup component (`files`, `fileName`, `glob`) | DNN `Installers/CleanupInstaller.cs` |
| Panes = runat=server containers with an id | DNN `UI/Skins/Skin.cs` `LoadPanes()` |
| default.css 10.0.0 is unlayered with an element reset | `Resources/Shared/stylesheets/dnndefault/10.0.0/default.css` (vendored in `tests/fixtures/dnn/`) |
| pnpm supply-chain settings | [pnpm.io/supply-chain-security](https://pnpm.io/supply-chain-security), [pnpm.io/settings](https://pnpm.io/settings) |
| Claude Code skills format | [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) |
| Cascade layers vs unlayered styles | CSS Cascading and Inheritance Level 5, §6.4 (unlayered styles win over layered styles for normal declarations) |
