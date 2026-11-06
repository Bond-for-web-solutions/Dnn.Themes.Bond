# Build system

Everything goes through one CLI, `packages/build/bin/bond.mjs`. The terminal
(`pnpm …`), VS Code tasks (`.vscode/tasks.json`) and GitHub Actions run the
same commands. There is no IDE-only build logic.

## Prerequisites

- Both can be installed with `scripts\setup.cmd` (Windows) or `sh scripts/setup.sh`
  (macOS/Linux): versions are read from the files below; an existing Node ≥ 22.12 is kept,
  otherwise fnm/nvm or the checksum-verified official nodejs.org build is used (user-level, no admin).
- Node.js **24** (`.node-version`; engines `>=22.12`).
- pnpm **12.14.0** (`packageManager` in `package.json`):
  install once with `npm install -g pnpm@12.14.0 --allow-scripts=pnpm` (pnpm 12 is a native
  binary set up by its own install script, which npm skips by default), or use
  `corepack pnpm …` on Node 22/24 without installing (Node 25+ no longer bundles Corepack).
  On Windows PowerShell with the default *Restricted* policy, `pnpm.ps1` is blocked:
  use the Command Prompt terminal or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- No MSBuild, Visual Studio or .NET SDK is needed any more.

## Commands

| Command | CLI | VS Code task |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | DNN: Install Dependencies |
| **Pick a command + theme** | `pnpm menu` (arrow keys in the terminal) | **Ctrl+Shift+B**: VS Code lists the commands, then the themes |
| Development build | `pnpm build <theme> --mode development` | — (terminal only) |
| Any theme, production | `pnpm build <theme>` (no theme → pick from `themes/`) | DNN: Build Theme… (lists `themes/` at run time) |
| All themes | `pnpm build:all` | DNN: Build All (Production) |
| Watch | `pnpm dev <theme>` (`--deploy`) | — (terminal only) |
| Clean | `pnpm clean <theme>` / `pnpm clean --all` | — (terminal only) |
| Re-verify output | `pnpm validate` | — (terminal only) |
| Local deploy | `pnpm deploy:local <theme>` (`--dry-run`, `--adopt`, `--prune`; site from `.env`) | DNN: Publish Theme Locally… |
| Architecture checks | `pnpm check` | DNN: Check Architecture |
| Impact analysis | `pnpm bond affected --base origin/main` | - |
| New theme | `pnpm bond create-theme <id> --prefix <p>` | - |
| Release snapshot | `pnpm bond snapshot <id>` | - |

The theme pickers in VS Code are **live**: `tasks.json` stores no theme. When a picker
opens, VS Code runs `bond list-themes`, which scans `themes/` at that moment, so a new or
removed theme folder shows up immediately. This uses the **Tasks Shell Input** extension
(`augustocdias.tasks-shell-input`, recommended in `.vscode/extensions.json`); without it the
theme tasks fail with "command 'shellCommand.execute' not found". The terminal alternative
without any extension is `pnpm build` / `pnpm menu`.

VS Code tasks are `"type": "process"` and call `node` directly: no shell
quoting (paths with spaces work), no PowerShell execution policy, and no
`pnpm.ps1` shim. Errors are printed as
`C:\path\file.css(12,5): error BOND123: message`, which the tasks' problem
matcher turns into Problems-panel entries on the **source** file (not the
temporary staging copy). Watch mode prints
`bond: watch build started` / `finished` for the background matcher.

## Development vs production

| | development | production |
| --- | --- | --- |
| CSS/JS | readable, source maps (`.map`) | minified; no maps (shipping one is an error, BOND362) |
| Install ZIP | **not created** (add `--package` for `…_Install-dev.zip`) | created + verified |
| Budgets | not enforced | enforced (BOND371) |
| Banner | `/*! DNN.Themes.Bond 1.1.0 | <sha>[+dirty] | development */` | same with `production` |

## The publish/ contract

```text
publish/<theme>/
├── theme/
│   ├── Skins/<skinName>/          == Portals/_default/Skins/<skinName>/ after install
│   │   ├── default.ascx, splash.ascx, partials/, menus/, skin.doctype.xml
│   │   ├── skin.css               theme bundle (auto-loaded by DNN, priority 15)
│   │   ├── <layout>.css           layout bundles (auto-loaded on that layout, priority 20)
│   │   └── resources/js/…, resources/font/…, resources/img/…, resources/vendor/<pkg>/…
│   └── Containers/<containerName>/  == Portals/_default/Containers/<containerName>/
├── packages/
│   ├── <PackageName>_<MM.mm.pp>_Install.zip
│   └── SHA256SUMS
└── reports/
    ├── build-manifest.json        theme, version, mode, git SHA/dirty, toolchain, lockfile hash,
    │                              dependency content hashes, layouts, cleanup, CSS audit, budgets,
    │                              every output with sha256 + gzip/brotli sizes
    ├── validation.json            status, warnings
    ├── verify.json                written by `bond validate`
    └── last-failure.json          only after a failed rebuild (deploy refuses while present)
```

`publish/` is a staging area, **not** the root of the install ZIP.

## The install ZIP (matches the verified Bond 1.0 layout)

```text
DNN.Themes.Bond_01.01.00_Install.zip
├── manifest.dnn                generated from theme.json
├── License.txt, ReleaseNotes.txt
├── default.ascx, splash.ascx   every root layout, declared as <skinFile>
├── None.ascx                   every root container, declared as <containerFile>
├── Resources.zip               everything else in Skins/<skinName>/
└── ContainerResources.zip      everything else in Containers/<name>/ (omitted when empty)
```

DNN's SkinInstaller copies declared `.ascx` files verbatim. Only `.htm/.html`
skins are parsed (verified in `SkinFileProcessor`), so include-based layouts
are safe.

## Pipeline guarantees

- **Fail fast, fail clearly.** Any compile error, validation rule or package
  verification failure exits 1 with a BOND code. The previous good
  `publish/<theme>` stays untouched, and `reports/last-failure.json` marks it as stale.
- **Atomic.** Builds happen in `publish/.staging/<id>-*` and are renamed into
  place only on success. On Windows, Defender briefly locks fresh ZIPs, so the
  rename retries for up to 20 s and then falls back to copy+delete. Bond's
  production build takes ~6 s locally because of this; Linux takes under 2 s.
- **Deterministic.** Sorted ZIP entries, timestamps from `SOURCE_DATE_EPOCH`
  or the HEAD commit time, LF-normalised text, a fixed toolchain. Only
  `reports/` contains wall-clock data. Byte-identical output requires the same
  Node major (zlib) and lockfile.
- **Assets are tree-shaken.** Only files referenced from CSS `url()` are
  copied (Bond: 10 of 16 font files; six were byte-identical duplicates).
  Theme assets live in `themes/<id>/assets/` and map to `resources/…`; shared
  package assets map to `resources/vendor/<pkg>/…`.

## Shared layouts (package `skinOverlay` + `bond.styles`)

A shared package can ship a whole layout to every theme that depends on it.
`@bond/splash` does this for `splash.ascx` ("website under construction"):

```json
"bond": { "layer": 2, "skinOverlay": "skin", "styles": { "splash.css": "src/splash.css" } }
```

- `skinOverlay` copies `skin/splash.ascx` to the skin root, so DNN offers it as a layout.
- `bond.styles` makes the build compile `src/splash.css` to `<skin>/splash.css` for every
  dependent theme, with the same audit and budgets as theme CSS. DNN loads it only on that layout.
- A theme replaces either one with its own `skin/splash.ascx` or a `theme.json` `styles`
  entry with the same output name (logged as BOND202).
- `bond check` rejects a malformed `bond.styles` entry (BOND912).

The splash reads none of the theme's tokens and brings its own font and logo, so it looks
the same in every theme (integration test "shared splash", visual test "shared splash looks
the same in every theme"). To use it while a site is being built: DNN → Settings → Site
Settings → default page layout `splash` (or per page: Page Settings → Appearance).

## Validation rules (DNN-specific)

| Code | Rule | Why |
| --- | --- | --- |
| BOND310 | no `<% %>`, `<%= %>`, `<%: %>`, `<%# %>` in layouts/partials/containers | DNN injects controls; ASP.NET then throws "Controls collection cannot be modified", shown as a misleading 503 "No sites currently exist" |
| BOND311/312 | exactly one `<%@ Control %>`, correct `Inherits` | parser error / wrong base class |
| BOND313 | `ContentPane` exists (opt-out: `layoutsWithoutContentPane`) | modules fall back to ContentPane |
| BOND315 | every `dnn:` tag is registered | parser error |
| BOND316/317 | `DnnCssInclude`/`DnnJsInclude` targets exist (case-sensitive); no second `skin.css` | 404 / double load |
| BOND319–322 | `MenuStyle` folders have `menudef.xml` and its template | DDRMenu: "Illegal characters in path" |
| BOND330–332 | no inline handlers, inline scripts, `javascript:` URLs | strict CSP compatibility |
| BOND340 | root CSS that DNN won't auto-load | dead file |
| BOND350–354 | compiled CSS audit | see [css-architecture.md](css-architecture.md) |
| BOND360–364 | secrets, file types outside the allowlist (no `.aspx/.ashx/.config`/scripts/binaries), source maps in prod, `web.config`, unresolved `url()` | supply chain / correctness |
| BOND999 | unexpected exception (I/O, lock, bug) | still marks `publish/<id>` stale; other themes keep building |
| BOND371 | size budgets | performance |
| BOND520–526 | ZIP ↔ manifest ↔ staged files | installability |

## Watch mode and hot reload

`bond watch <id>` rebuilds on changes in the theme or any shared package in its
dependency closure. `--deploy` copies each successful build to the configured
local site. There is **no hot module replacement**: IIS renders the ASCX
server-side and DNN serves the CSS. With the DNN host setting *Debug Mode* on,
the resource manager uses a timestamp instead of the CRM version, so a browser
refresh shows the new CSS/JS. `.ascx`/`.cshtml` edits need no app-pool recycle.
