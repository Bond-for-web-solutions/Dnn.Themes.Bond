# Bond huisstijl 2027 in DNN.Themes.Bond

Source of truth: `docs\Huisstijl` on the Bond site (Brandbook 2027, Besluiten 2027,
website mockups in `11 Website`). Reference page on the site: **/bond-huisstijl**
(hidden from the menu, noindex). Decision 12-11-2026: the facet's third colour is
**petrol** (the brandbook PDF still shows turquoise).

## Where things are

| What | File |
| --- | --- |
| Tokens (palette, type scale, rhythm, facet, strook) | `themes/bond/styles/tokens.css` |
| Editor building blocks | `themes/bond/styles/content.css` |
| Header / footer | `styles/header.css`, `styles/footer.css`, `skin/menus/*/*.cshtml`; identical to the design's "Kop" and "Voet" artboards (24px gradient strook, colour blocks 6px apart, bottom row Privacy · Nieuwsbrief · Inloggen without "Algemene voorwaarden", footer rises in on scroll). One deliberate difference: below 1200px the menu sits behind the hamburger (submenus and login/logout), where the design wraps the items |
| Texts and contact details | `skin/App_LocalResources/Bond.resx` |
| Layout for 2sxc content pages | `skin/pagina.ascx`, `styles/layouts/pagina.css`, `containers/Standaard.ascx`, `containers/None.ascx` |
| Scroll-in animation, compact header | `scripts/reveal.js` (`data-bond-reveal`), `scripts/header.js` (`.bond-header--compact`) |

## Building blocks

| Class | Use |
| --- | --- |
| `bond-label` | eyebrow in spaced caps, koraal-diep |
| `bond-h1` / `bond-h2` / `bond-h3`, `bond-groot` | heading sizes on any element |
| `bond-lead`, `bond-tekst`, `bond-klein` | lead, body (16/26 light), small |
| `bond-mark` (= `bond-markeer`), `--papier` (= `bond-markeer--creme`) | one keyword per heading on a highlight |
| `bond-facet`, `bond-facet--rustig` | first letter facet; every h1 on the pagina layout gets it automatically |
| `bond-knop`, `--koraal`, `--papier`, `--klein`; `bond-knoppen` | pill buttons: one koraal per screen, the rest outline; papier on koraal |
| `bond-more` | "Lees meer" link with arrow |
| `bond-pil` | fact pill |
| `bond-sectie` + `--wit/--zand/--abrikoos/--oker/--koraal/--petrol`, `bond-sectie__inner` | full-width section, 96px rhythm, 1248px content |
| `bond-raster` (`--twee`), `bond-tegel` (`--koraal/--abrikoos/--turquoise`), `__titel/__tekst/__voet` | card grid |
| `bond-ring` | dubbele ring icon |
| `bond-feiten`, `bond-feit__getal/__tekst` | big numbers |
| `bond-citaat` (`--abrikoos`) | quote frame with citaattekens |
| `bond-waarden` (on an `ol`) | numbered values |
| `bond-tabel`, `bond-tabel-wrap` | table, scrolls inside its wrapper |
| `bond-op-koraal` | everything antraciet on a koraal field |
| `bond-strook`, `bond-vlakken`, `bond-beeld` | graphic elements |

## The pagina layout and 2sxc

No Bootstrap, anywhere. `skin/koi.json` declares the CSS framework **`bond`**, so
2sxc (polymorphism `Koi?cssFramework`) picks the `bond/` edition of an app when it
has one: the Blog6 app has `Blog6/bond/`, the new **Bond** app is written for it only.
Older Content/Gallery/Swiper views have no `bond/` edition and fall back to their
registered view, without Bootstrap's grid and buttons (migrate them to the Bond app).
`pagina.css` only sets content typography (h1-h6, facet first letter, links, focus,
quotes), scoped by `.bond-pagina` (the `<main>`), so header, footer and DNN admin UI
are untouched. Spacing is flex/grid `gap` only: margins are reset to 0 and containers
centre with one padding shorthand (`.bond-container`). Module containers:
HeaderPane/BannerPane/BottonPane/FluidPane use `None` (edge to edge, no wrapper), ContentPane
uses `Standaard` (`.bond-container` + rhythm). Every container and layout has a preview image (`<name>.png`, `thumbnail_<name>.png`) for the DNN picker.

DNN gotcha: a module with **DisplayTitle = false** gets "No Container" for visitors
(`Pane.LoadNoContainer`), whatever the container settings. Keep DisplayTitle on; the
containers render no title.

## portal.css on the Bond site

The site's `portal.css` (loads last, priority 35) defined the same editor classes for
BondBS5. Since 12-11-2026 those rules are prefixed with
`:where(body:not(:has(.bond-header)))`: no specificity change on BondBS5 pages, no
effect on pages that use this theme. Log: `docs\Huisstijl\11 Website\CSS-logboek`.

## Tests

- `pnpm check && pnpm lint && pnpm test && pnpm test:visual` (fixtures; 156 tests).
- Real site, opt-in: `BOND_E2E_BUNDLED=1 BOND_E2E_BASE_URL=http://bondforwebsolutions.dnndev.me pnpm test:e2e`
  runs `tests/e2e/huisstijl.e2e.mjs`: 5 pages x 8 viewports (overflow, brand colours,
  font, header, text over kleurvlakken, screenshots), menu, dropdown, skip link, form
  validation, focus ring, touch targets, reduced motion and axe WCAG 2.2 AA.
  `"bundled": true` (`BOND_E2E_BUNDLED=1`) uses Playwright's Chromium: the system Chrome on the dev
  machine blocks `*.dnndev.me` (ERR_BLOCKED_BY_CLIENT). The site's Usercentrics
  banner is blocked in these tests (it traps focus; not part of the theme).
- `tests/e2e/site.e2e.mjs`: every page from the site's `/sitemap.aspx` (plus
  `themes.bond.e2e.site.extra`) at desktop, tablet and mobile: Bond theme, HTTP OK, no
  horizontal scroll, no error text, no broken images, one h1, no JS errors.
- `tests/e2e/site-capture.mjs <out> <tabs.json>`: screenshots + content metrics of
  all pages, to compare a site before and after a theme change.
- Settings: copy `.env.example.json` to `.env.json` (git-ignored) and fill in a local test
  account in `themes.bond.e2e` (`login.user`, `login.password`, `login.path` `/inloggen`). Then
  `pnpm test:e2e` needs no shell variables. `tests/e2e/admin.e2e.mjs` logs in, logs out,
  logs in again, checks every pilot page signed in (Persona Bar, 2sxc edit context, no
  errors; screenshots in `tests/test-results/huisstijl-admin/`) and tries DNN edit mode.
  With a password set, Playwright traces are off (a trace would record it).
- Screenshot baselines are per platform and git-ignored; after a deliberate visual
  change, look at the new screenshots before `--update-snapshots`.
