# Bond legacy assessment and migration (1.0.0 → 1.1.0)

**Inspected:** this repository *is* `Bond-for-web-solutions/Dnn.Themes.Bond`
(`origin`). Its full source at commit `0600865` was reviewed locally,
together with the legacy build output `install/DNN.Themes.Bond_01.00.00_Install.zip`
(the authoritative record of what 1.0.0 installed). Nothing on GitHub was
inaccessible.

## What the legacy repo actually contained (vs. its README)

| README claim | Reality |
| --- | --- |
| build with `.vscode/build.ps1` (MSBuild via vswhere) | file did not exist (removed in `0a4b00f`); `.vscode/tasks.json` ran `dotnet build DNN.Themes.Bond.proj -c Release` |
| Inter / Noto Sans from Google Fonts | self-hosted MuseoSans (`resources/css/fonts.css`) |
| `Splash.ascx` | `splash.ascx` (lower case) |
| `BuildScripts/ModulePackage.targets` builds the package | unused: a leftover from a module template ("Newsletters"), together with `MSBuild.Community.Tasks.dll/.Targets` and a hard-coded `C:\DNN\dzp\bin\` path |
| ships `Resources.zip` + `ContainerResources.zip` + install ZIP | **verified**: default.ascx at the ZIP root *and* inside Resources.zip; None.ascx at the root and in ContainerResources.zip |

## Defects found in 1.0.0

| # | Defect | Effect | Fixed in 1.1.0 |
| --- | --- | --- | --- |
| 1 | CSS included with `Priority="1/2/3"`, **before** DNN's `default.css` (5) | DNN's `body{font-family:inherit;background-color:…}` overrode Bond: default pages rendered in **Arial on white**, not MuseoSans on cream (confirmed in a browser by `migration.spec.mjs`) | yes: `skin.css` is auto-loaded at 15 |
| 2 | `!important` on nav links and the splash body | workaround for #1 and for DNN's `a:visited` (0,1,1) | removed; `:is(:link,:visited)` instead |
| 3 | visited footer/submenu/top-bar links | turned DNN-blue and underlined (`a:visited` beat single-class rules) | yes |
| 4 | Razor `@attrTarget` where the string was `target="…"` | HTML-encoded to `target=&quot;_blank&quot;` (broken attribute; all new-window links shared one named window) | conditional attribute + `rel="noopener"` |
| 5 | hamburger used an inline `onclick` plus an inline `<script>` | blocks a strict CSP; global id `mobile-menu` | moved to `theme.js`; id `bond-mobile-menu`; Escape closes |
| 6 | 6 byte-identical duplicate fonts (`MuseoSans-*.otf`) shipped | +390 KB per install | removed (git rm); unreferenced assets are never packaged |
| 7 | `splash.ascx` not declared in the manifest | not registered as a skin file (worked only via Resources.zip) | all root layouts declared |
| 8 | dead `javascript:void(0)` href code in menus | none at runtime | removed |
| 9 | splash had no ContentPane (only dead `.bond-splash__contentpane` CSS remained) | modules could not be added to the splash page | yes: `ContentPane` restored, hidden while empty so the page looks unchanged |
| 10 | the theme description still says "built with Bond CSS 4.1" | misleading metadata in DNN's extension list | **kept verbatim**; owner decision |
| 11 | `owner` url/email are `example.com` placeholders | shown in DNN | **kept verbatim**; `bond check` warns |

## Retained (semantics unchanged)

- DNN package identity: package names `DNN.Themes.Bond` (Skin) and
  `DNN.Themes.Bond Containers` (Container), skin/container folder
  `DNN.Themes.Bond`, base paths, `CoreVersion 10.00.00`
  (asserted by `build-output.test.mjs` against the legacy manifest).
- Layouts `default.ascx` and `splash.ascx`, panes `BannerPane`,
  `ContentPane`, `FluidPane`, container `None.ascx`.
- `partials/_registers.ascx` (now shared from `@bond/dnn`, byte-identical
  content) and `partials/_includes.ascx` (viewport meta, JS include).
- DDRMenu templates and `menudef.xml` files, node selectors, markup
  structure and class names, apart from `bond-container` → `bond-container`
  and the menu id.
- All colours, spacing, radii, shadows, typography sizes and animations:
  values moved into tokens unchanged. The login card is now the shared
  `bond-auth` component, themed by tokens to the same values.
- Login/reset-password behaviour (`login.js` → `@bond/components/auth-card.js`): same
  mirroring of fields into DNN's hidden controls, same postback path, same
  UpdatePanel handling.

## Replaced

| Legacy | New | Why |
| --- | --- | --- |
| MSBuild `.proj` + `dotnet build` | `bond` CLI (Node) | cross-platform, no Visual Studio, deterministic, validated |
| hand-written `manifest.dnn` | generated from `theme.json` | layouts can't drift from the package; generated Cleanup |
| 4 CSS files via `DnnCssInclude` | `skin.css` + `splash.css` (DNN auto-load) | correct cascade slot, 1 request |
| `login.js` + inline header script | `resources/js/theme.js` (bundled, form-bottom) | CSP, one request, non-blocking |
| `install/` output folder | `publish/bond/{theme,packages,reports}` | staging + reports + checksums |

## Visible changes (need sign-off before releasing 1.1.0)

| Change | Where | Evidence |
| --- | --- | --- |
| Body text renders in **MuseoSans** (was Arial due to defect 1) | all default-layout pages | `migration.spec.mjs` "documented change" test |
| Page background is **cream `#f4ede4`** (was white due to defect 1) | default-layout pages, between header and footer | same |
| Visited links keep their colour, no underline | header, footer, top bar | defect 3 |
| Submenus also open on keyboard focus; Escape closes the mobile menu | header | `behavior.spec.mjs` |

Headings in module content stay Arial, exactly as in 1.0 (DNN's `h1..h6`
rule, which Bond never overrode). To brand headings, add
`h1, h2, h3 { font-family: var(--bond-font-heading) }` to `styles/base.css` and
allowlist the selectors.

All other computed styles of the header, navigation, submenu, footer, login
card and splash elements match 1.0 exactly. The only other differences are
1–22 px height changes from the font switch, and two invisible ones (flex gap
on a text-only button, colour of a 0-width border), all listed in `migration.spec.mjs`.

## Upgrade path for existing 1.0.0 installs

Install `DNN.Themes.Bond_01.01.00_Install.zip` over 1.0.0. The generated
`Cleanup` deletes the 11 files 1.1.0 no longer ships (`resources/css/*.css`,
`resources/js/login.js`, the 6 duplicate fonts). DNN increments the client
resource version. Page layout assignments are unaffected (same paths).
**Not yet exercised on a live DNN site**; see
[validation-results.md](../validation-results.md#not-verified).

## Remaining risks

- **Font licence:** MuseoSans `.otf` files are committed and shipped. Confirm
  the licence permits redistribution in a (possibly public) repository and web
  embedding. No licence file is included.
- **Contrast:** subtle text `#8a8175` on `#faf5ee` ≈ 3.5:1 (< WCAG AA 4.5:1).
- **DZP:** the production `Dnn.Skin.DZP` (Tailwind, in-browser
  `tailwind4.js` runtime) was **not** migrated. `themes/dzp` is a scaffold
  with a different package name, so it can never overwrite the live skin.
