# Validation results

Recorded on 2026-11-04 on Windows 11 (Node 24.16.0, pnpm 12.14.0, Chrome
stable), plus Linux in Docker (`node:24-bookworm`,
`mcr.microsoft.com/playwright:v1.64.1-noble`). Branch `feat/dnn-themes-monorepo`
(uncommitted working tree on top of `0600865`, hence `+dirty` in banners).

## Summary

| Check | Result |
| --- | --- |
| `pnpm check` (architecture) | pass: 7 packages, 2 themes, 0 errors; 1 warning (Bond owner placeholders kept verbatim) |
| `pnpm lint` (Stylelint + ESLint) | pass |
| `pnpm build:all` | pass: Bond ~6 s (Windows Defender lock on the fresh ZIP; < 2 s on Linux), DZP 0.2–0.5 s |
| `pnpm validate` | pass (both themes) |
| `pnpm test`, integration | **75 / 75 pass** on Windows and on Linux (`node:24-bookworm`) |
| `pnpm test:visual`, Playwright | **144 / 144 pass** (48 tests × Chrome, Edge, Firefox) on Windows (system Chrome) and on Linux (Playwright image); baselines stable on re-run |
| `pnpm audit --audit-level high` | pass; 1 **moderate**: `minimatch <11.0.1` (GHSA-g3hv-75wg-m249) via ESLint, dev-only, inputs are our own config globs, accepted |
| Cross-OS determinism | Bond `fa1b3e9c…bc9f3fb`, DZP `16295efe…560b035`: byte-identical on Windows and Linux |

## Acceptance tests

| # | Scenario | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Clean install of deps, then *DNN: Build Theme…* (theme picked) / identical CLI | pass | `vscode-tasks.test.mjs` runs the task's exact command line |
| 2 | `publish/bond/` has staged files, reports, versioned ZIP | pass | `build-output.test.mjs` "publish contract" |
| 3 | ZIP + manifest: nested archives, declarations, layouts, every menu `.cshtml` + `menudef.xml`, containers, images, CSS/JS references | pass | `build-output.test.mjs` "install ZIP …"; build validators BOND317/319/364 |
| 4 | Shared styles/scripts present without manual copying; no runtime dependency on another skin | pass | "shared packages are compiled in automatically …" |
| 5 | Build DZP afterwards → Bond output byte-identical | pass | `isolation-determinism.test.mjs` (hashes + ZIP mtime) |
| 6 | Change a shared component → rebuild shows it; unaffected themes not deployed | pass | manual run, see [testing.md](testing.md#shared-component-changes): 6 DZP screenshots failed, 0 Bond; deploys only happen via an explicit `bond deploy <id>` |
| 7 | Two production builds → identical artifacts | pass | `isolation-determinism.test.mjs`; also identical across Windows/Linux |
| 8 | Real DNN: install, layouts per page, navigation, panes, containers, module editing, resource loading | **not run** | no local DNN test site exists (see below); suite ready in `tests/e2e/` |
| 9 | Broken manifest / missing asset / failed bundling → task fails clearly | pass | `failures.test.mjs`: 23 failure modes plus unexpected-exception handling, each with exit 1 and a problem-matcher-formatted `file(line,col): error BONDnnn` |
| 10 | Publish/clean cannot touch an unconfigured installation | pass | `deploy.test.mjs` (decoy site untouched; BOND700–715), clean tests |

## Independent review: findings and fixes

A separate reviewer (read-only, not anchored on the implementation) reported 11 issues. All were fixed, and each has a regression test:

| # | Finding | Fix | Test |
| --- | --- | --- | --- |
| 1 | deploy guards compared path strings, so a junction/symlink could redirect writes and deletes | refuse links on every path segment (BOND717); realpath overlap check; realpath containment before each write | `deploy.test.mjs` junction test |
| 2 | `.aspx`/`.ashx` (IIS-executable) files could ship | extension **allowlist** (BOND361) | `failures.test.mjs` |
| 3 | non-BOND exceptions skipped `last-failure.json` and aborted `build --all` | wrapped as BOND999, stale marker always written, per-theme isolation in the CLI; malformed `url()` encoding → BOND122 | `failures.test.mjs` |
| 4 | `:not(.x) p`, `:is(.x, h1)`, `html:has(.x) div` passed both isolation layers | only top-level classes count as scoping (audit + Stylelint) | `units`, `lint-rules` |
| 5 | `--prune` deleted a just-deployed file after a case-only rename | case-insensitive stale list | `deploy.test.mjs` |
| 6 | `--deploy` without a value was unusable | boolean `--deploy` (the site comes from `.env`) | - |
| 7 | toolchain changes reported no affected themes | `packages/build/` and `.gitattributes` are global inputs | `units.test.mjs` |
| 8 | auth card hid captcha/verification controls and left the native form focusable | fails open on unmirrored controls or a missing login button; native form gets `hidden`; Register link mirrored | `behavior.spec.mjs` |
| 9 | deploy did not re-check output hashes | refuses if `publish/` differs from `build-manifest.json` (BOND716) | `deploy.test.mjs` |
| 10 | `readZip` threw RangeError on corrupt offsets | bounds checks → BOND513 | `units.test.mjs` |
| 11 | `${{ }}` interpolated into `run:`; gitleaks pinned by tag | values passed via `env:`; image pinned by digest | - |

## Not verified

- **Installing on a real DNN site.** That covers acceptance 8: clean install,
  upgrade 1.0.0 → 1.1.0 including `Cleanup`, page-level layouts, edit mode
  and Persona Bar, and the Razor conditional-attribute change in the DDRMenu
  templates. The former test site `C:\DNN\dnn_test` no longer exists. The
  other local DNN sites belong to client projects and were deliberately left
  untouched. To run it: install the ZIP on a disposable DNN 10 site, assign
  `splash` to one page, and run `pnpm test:e2e` with `BOND_E2E_BASE_URL` /
  `BOND_E2E_PAGES` (see [testing.md](testing.md#real-dnn-end-to-end)).
- **GitHub Actions** workflows were written and their actions pinned to
  verified commit SHAs, but they have not run on GitHub yet: no push was made.
  The gitleaks container command and Dependabot's pnpm 12 support are unverified.
- **VS Code UI:** tasks were validated by executing their exact command lines
  and by unit-testing the problem matcher regex, not by clicking them in VS Code.
- **Lab performance metrics** (FCP/LCP/CLS/INP): not measured, as that needs a running DNN site.
- **Safari / WebKit** (Chrome, Edge and Firefox are covered by the Playwright suite).

## Remaining risks

See [migration assessment](migration/bond-legacy-assessment.md#remaining-risks)
(font licence, contrast, DZP not migrated) and
[security.md](security.md#content-security-policy) (CSP limits of WebForms DNN).
