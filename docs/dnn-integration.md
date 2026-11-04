# DNN integration

Target: **DNN Platform 10.x** (`coreVersion 10.00.00`). Behaviour verified
against DNN source (develop branch) and a local DNN 10.4.0 installation.

## Skins, layouts, containers

| DNN concept | In this repo | Installed to |
| --- | --- | --- |
| Skin package (theme) | `themes/<id>/` | `Portals/_default/Skins/<skinName>/` |
| Layout (`.ascx` at skin root) | `themes/<id>/skin/*.ascx` | same folder, root |
| Partials | `themes/<id>/skin/partials/` + overlay from `@bond/dnn/skin/partials/` | `partials/` |
| DDRMenu templates | `skin/menus/<name>/{*.cshtml, menudef.xml}` | `menus/<name>/` |
| Container | `themes/<id>/containers/*.ascx` | `Portals/_default/Containers/<containerName>/` |

A layout must: include `partials/_registers.ascx` (the one `<%@ Control %>`
directive plus registrations, shared via `@bond/dnn`), include
`partials/_includes.ascx`, contain no code render blocks, and contain a
`<div id="ContentPane" runat="server">`. Panes are any `div/section/main/…`
with `runat="server"` and an id (DNN `Skin.LoadPanes()`).

## Page-level layouts

DNN lets every page choose its layout (Page Settings → Appearance), and pages
may even use layouts from different themes.

- **CSS:** DNN registers `skin.css` on every layout of the theme and
  `<layout>.css` only on that layout. So `splash.css` (Bond) and
  `dashboard.css` (DZP) never load elsewhere (test G4).
- **JS:** `resources/js/theme.js` is included from `_includes.ascx` on every
  layout. Every initialiser is a no-op when its markup is absent. A layout that
  needs more JS includes its own script (`dashboard.ascx` →
  `resources/js/dashboard.js`), so other pages never download it.
- **Sharing:** `skin.css`/`theme.js` are one cached file per theme across all
  its layouts. Build-time sharing (`@bond/*` bundled into each theme) is
  separate from browser-time sharing, which happens within a theme only.

## Client resources

- DNN 10.2+ replaced ClientDependency with `IClientResourceController`
  (`DotNetNuke.Web.Client.ResourceManager.dll` ships in 10.4). It **does not
  bundle or minify**, so themes must ship optimised assets (we do).
- URLs get `?cdv=<CRM version>`. The version increments on every package
  upgrade or repair install (`Installer.Install`), and in debug mode a
  timestamp is used. Theme file names are stable on purpose (ADR-5).
- `DnnJsInclude … ForceProvider="DnnFormBottomProvider"` puts scripts at the
  end of the form: non-blocking, and after ASP.NET AJAX (`Sys.WebForms`) is available.
- Duplicates are removed by resolved path, so including the same file twice is harmless but wasteful.

## WebForms lifecycle

Modules such as Login render inside UpdatePanels. Partial postbacks replace
their DOM, so enhancements must re-run: `onDnnReady(fn)` (from
`@bond/dnn/ready.js`) runs `fn` on DOMContentLoaded and on every
`Sys.WebForms.PageRequestManager` `endRequest`. Initialisers must be idempotent.

The auth card never re-implements authentication. It mirrors input into
DNN's hidden controls and clicks DNN's own `cmdLogin`/`cmdSendPassword`, so
`__doPostBack`, validators, captcha and auth providers keep working. If DNN's
markup changes, it leaves the native form alone.

## Edit mode and administration

Nothing in the themes targets `.dnnEditState`, the Persona Bar (an iframe),
action menus or module settings. The sticky header uses `z-index: 50`, far
below DNN's admin chrome. `default.css` rules for admin UI keep working
because theme CSS is scoped (test G1 compares DNN form/grid/action styles with
and without the theme).

## Installing several themes on one site

Themes coexist because their identities differ (package name, skin folder,
container folder, CSS prefix; checked by `bond check`). Containers can be used
under another theme's skin, so container CSS must not define tokens and must
use `var()` fallbacks.

## Validation rules

See [build-system.md](build-system.md#validation-rules-dnn-specific).

## Known limits

- The fixture pages in `tests/visual` approximate DNN's rendered HTML. They
  verify CSS/JS behaviour against the real `default.css`, but are not a
  substitute for the real-DNN suite in `tests/e2e` (run it against a local site).
- Razor conditional attributes (`target="@x"` omitted when `x` is null) are
  used in DDRMenu templates. They are supported by the Web Pages 3 Razor
  engine DNN uses, but have not been exercised on a live DNN site in this repo yet.
- Strict CSP is not achievable on WebForms DNN (inline `__doPostBack`, script
  blocks from core). See [security.md](security.md#content-security-policy).
