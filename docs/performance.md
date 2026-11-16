# Performance

## Measured (Bond, production build, this repository)

Sizes from `publish/bond/reports/build-manifest.json`. gzip at level 9,
brotli at quality 11. These are transfer sizes *if* IIS compresses
(see below); they are not timings.

| Asset loaded on a default Bond page | Bond 1.0 | Bond 1.1 |
| --- | --- | --- |
| CSS requests | 3 (`fonts.css`, `skin.css`, `login.css`) | **1** (`skin.css`) |
| CSS bytes (raw) | 17,175 (unminified) | 20,126 (minified; includes shared components + tokens) |
| CSS gzip / brotli | 4,613 / 3,847 | **3,993 / 3,526** |
| JS requests | 1 (`login.js`) | 1 (`theme.js`, includes the former inline header script) |
| JS raw / gzip / brotli | 9,736 / 2,842 / 2,382 | **4,977 / 1,962 / 1,675** |
| Inline `<script>` in the page | 1 (header menu) | **0** |
| Render-blocking JS | `login.js` default provider | **none** (form-bottom provider) |
| Splash page extra CSS (gzip / brotli) | 1,577 / 1,367 | **1,070 / 888** |
| Install ZIP | 501,678 B | **324,534 B** (duplicate fonts no longer shipped) |

Raw CSS grew because the bundle now carries the shared design-system tokens
and components. Compressed, it is smaller, and it is one request instead of
three. Lab metrics (FCP/LCP/CLS/INP) were **not measured**: that needs a
running DNN site, which was not available. Run Lighthouse against a local site
after installing the package.

## Budgets

`theme.json` `"budgets"` (brotli bytes) fail production builds when exceeded:
Bond `skin.css` 4,500 · `splash.css` 1,500 · `theme.js` 2,500. Raise them
deliberately in review, never silently.

## Minification ≠ compression

| Step | Where | Notes |
| --- | --- | --- |
| CSS minification | Lightning CSS (build) | also lowers nesting / `@custom-media` for the baseline |
| JS minification | esbuild (build) | dead code within the bundle is dropped |
| Tree shaking | esbuild (JS), import-based (CSS: import only the components you use) | |
| Asset bundling | one CSS + one JS per theme, plus optional per-layout bundles | |
| Asset pruning | only `url()`-referenced files are packaged | |
| Brotli / gzip | **IIS**, at request time | the build only *reports* compressed sizes |
| Caching | IIS `clientCache` + DNN `?cdv=` | |

## HTTP compression on IIS (DNN)

DNN does not compress static files; IIS does. Recommended setup (server
admins, site-level, **not** part of a theme package):

1. Install Microsoft's **IIS Compression** module (adds `iisbrotli` and
   `iiszlib`). Without it, IIS only does gzip/deflate.
2. In `applicationHost.config` / site `web.config`:

```xml
<system.webServer>
  <urlCompression doStaticCompression="true" doDynamicCompression="true" />
  <httpCompression>
    <scheme name="br" dll="%windir%\system32\inetsrv\iisbrotli.dll" />
    <scheme name="gzip" dll="%windir%\system32\inetsrv\iiszlib.dll" />
    <staticTypes>
      <add mimeType="text/css" enabled="true" />
      <add mimeType="application/javascript" enabled="true" />
      <add mimeType="text/javascript" enabled="true" />
      <add mimeType="image/svg+xml" enabled="true" />
      <add mimeType="font/otf" enabled="true" />
      <add mimeType="*/*" enabled="false" />
    </staticTypes>
  </httpCompression>
  <staticContent>
    <remove fileExtension=".woff2" /><mimeMap fileExtension=".woff2" mimeType="font/woff2" />
    <remove fileExtension=".otf" /><mimeMap fileExtension=".otf" mimeType="font/otf" />
  </staticContent>
</system.webServer>
```

IIS sets `Content-Encoding` and `Vary: Accept-Encoding` itself and caches
compressed static files on disk.

**Precompressed `.br`/`.gz` files are deliberately not shipped.** IIS has no
native "serve the precompressed sibling" feature. Doing it needs URL Rewrite
rules plus outbound header rewrites for `Content-Encoding`, `Content-Type`
and `Vary`, which are easy to get wrong in ways that break pages for some
clients. IIS static compression already compresses each file once and serves
it from its cache, so the gain would only be first-request CPU.

## Caching

The local DNN 10.4 site serves static files with `max-age=365 days`. That is
safe because every theme URL is versioned by `?cdv=`, and installing an
upgrade increments the CRM version. After a *manual* file copy (local
deploy), increment the version or use debug mode.

## Fonts

- `font-display: swap` everywhere, and only referenced weights are packaged.
- MuseoSans ships as **WOFF2** (~25 KB per weight; the OTFs were ~62 KB).
  Converted 12-11-2026 with fontTools 4.56.0 from the OTFs in
  `themes/bond/assets/font/MuseoSans/` (outlines and name/licence tables
  unchanged, `fsType` 0); Bond confirmed the licence allows web-font
  conversion. Only the WOFF2 files are referenced, so only they are packaged.
- `<i>` is italic by default: empty icon `<i>`s (Font Awesome is not loaded on
  Bond pages) made Chrome download the italic face. `pagina.css` sets them to
  normal and hides the empty ones.
- Font preloading was tried (Link header) and did **not** improve Lighthouse
  LCP; not added.

## Lighthouse (local site, 12-11-2026)

Measured with Lighthouse 12.8.2 on the local site behind a small proxy that
mirrors production's transport (HTTPS, HTTP/2, gzip, HSTS, 301 from HTTP;
the local IIS has no compression module or https binding). Usercentrics is
blocked during runs (it traps focus in headless Chrome); it now loads after
the page anyway, through GTM. What moved mobile Performance from 54-72 (first
measurement) to a median of 92 (86-96):

| Change | Where |
| --- | --- |
| No Adobe Fonts `@import` chain (two render-blocking third-party CSS files; same font loaded twice) | site `portal.css` |
| Font Awesome JS (356 KB) not activated where no icon is used | 2sxc Blog6 `parts/Assets.cshtml` |
| Swiper script at the end of the form; first slide `loading=eager` + `fetchpriority=high` | 2sxc Swiper2 |
| First blog card image eager on /kennis; content images `loading=lazy` | 2sxc Blog6, Content |
| WOFF2 fonts, no stray italic face | theme |
| GTM at first interaction or 4 s after load (theme.js), DNN connector off | theme + site |
| `unload` → `pagehide` for ASP.NET AJAX (Best Practices "deprecated APIs") | theme `pagehide.js` |

Remaining fixed costs on every DNN page: jQuery + jQuery Migrate, ASP.NET
AJAX and dnncore.js are parser-blocking (DNN core). Bootstrap is gone (Koi
framework `bond`), which saves ~30 KB gzip CSS on the `pagina` layout.

Also in the table's spirit: `:root:has(.bond-main) { scrollbar-gutter: stable }`
(the scrollbar appearing after first paint shifted the whole page: CLS up to
0.12 on /inloggen, 0.7 once on /kennis), metric-matched "MuseoSans Fallback"
faces, WOFF2 also under the Adobe family name "museo-sans" (portal.css and 2sxc
CSS still ask for it), the login card built before first paint, content images
as WebP with srcset and the first one eager.

Result of the last full run (36 pages): Accessibility 100 and Best Practices
100 on every page, desktop and mobile; SEO 100 except /inloggen (noindex on
purpose); desktop Performance 90+ on 35 of 36 (one run with a one-off CLS);
mobile Performance median 92, 26 of 36 at 90+, the rest 86-89. Mobile scores
vary 2-5 points per run; which pages fall under 90 changes between runs. The
gap is DNN's fixed cost above (FCP ~2.8 s on simulated slow 4G).

## Browser baseline

Chrome/Edge 109+, Firefox 115+, Safari/iOS 15.4+ (`CSS_TARGETS` /
`JS_TARGETS` in `packages/build/lib/compile.mjs`). Lightning CSS lowers newer
syntax (nesting, `@custom-media`) for these targets.
