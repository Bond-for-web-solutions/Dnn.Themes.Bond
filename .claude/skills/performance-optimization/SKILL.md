---
name: performance-optimization
description: Review and improve theme asset size, request count, bundling, minification, compression (IIS Brotli/gzip), caching and font/image loading for DNN themes. Use when a size budget (BOND371) fails, when adding fonts/images/JS, when asked about page speed or Core Web Vitals, or when configuring IIS compression for a DNN site.
---

# Performance optimisation

Reference and measured baseline: `docs/performance.md`.

## Procedure

1. Measure from the build report, not guesses:
   ```bash
   pnpm build <id>
   node -e "for (const o of require('./publish/<id>/reports/build-manifest.json').outputs) if (o.brotli) console.log(o.path, o.bytes, o.gzip, o.brotli)"
   ```
2. Check against `theme.json` budgets. Raise a budget only with a justification in review.
3. Typical wins, in order: drop unused component imports from `styles/skin.css`; move layout-only CSS/JS
   into layout bundles; avoid new JS (DNN pages are server-rendered); self-host and subset fonts
   (WOFF2 from the vendor; respect the licence); size images and give them width/height (CLS).
4. Keep the distinctions straight: minification happens in the build (Lightning CSS/esbuild);
   **compression is IIS's job** (IIS Compression module, `iisbrotli`). Don't ship precompressed `.br/.gz`
   files (see `docs/performance.md#http-compression-on-iis-dnn`). Caching = IIS `clientCache` + DNN `?cdv=`.
5. Don't trade maintainability for a few bytes (no hand-minified CSS, no hashed file names).

## Validate

`pnpm build:all` (budgets enforced) and `pnpm test:visual` (no visual regressions). For real metrics,
run Lighthouse against a **local** DNN site after `bond deploy`; report numbers only if actually measured.
