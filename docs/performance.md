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
- **Recommendation (not done):** MuseoSans ships as `.otf` (~65 KB each).
  WOFF2 versions would be roughly 40–50% smaller, but converting a commercial
  font may be restricted by its licence. Get WOFF2 files from the vendor
  (exljbris/MyFonts webfont kit), then swap the `src` in
  `themes/bond/styles/fonts.css`.
- Font preloading would help LCP for the 500 weight, but needs a `<link
  rel=preload>` from the skin. DNN 10.4's resource manager has a `FontResource`
  model with no skin control yet, so it was not added.

## Browser baseline

Chrome/Edge 109+, Firefox 115+, Safari/iOS 15.4+ (`CSS_TARGETS` /
`JS_TARGETS` in `packages/build/lib/compile.mjs`). Lightning CSS lowers newer
syntax (nesting, `@custom-media`) for these targets.
