---
name: testing-and-regression
description: Write and run tests for DNN themes - integration tests (node:test) for build/packaging/failure modes, Playwright visual baselines per theme, CSS isolation guarantees G1–G5, JS behaviour on DNN-shaped fixtures, legacy parity, and opt-in end-to-end tests on a real DNN site. Use when adding a theme/layout/component, when a test fails, when updating screenshot baselines, or when asked whether a shared change affects other themes.
---

# Testing and regression

Reference: `docs/testing.md`.

## Pick the right level

| Change | Add / run |
| --- | --- |
| build, packaging, validation rule, CLI | `tests/integration/*.test.mjs` (use `helpers.mjs`: `tempDir`, `run`, `cloneTheme`) |
| new layout | fixture `themes/<id>/tests/fixtures/<layout>.html` (`<!-- layout: x -->` on line 1) |
| new component / example | `contract.json` `examples` (gallery screenshots for every theme) |
| theme JS | `tests/visual/behavior.spec.mjs` |
| CSS that could leak | `tests/visual/isolation.spec.mjs` (G1–G5) |
| real DNN behaviour | `tests/e2e/dnn.e2e.mjs` against a local site |

Rules: tests write only to `bond-test-*` temp folders; failure tests break a clone, never the real
theme; assert on BOND codes, not message text.

## Shared change impact

```bash
pnpm bond affected --base origin/main     # conservative: every dependent theme
pnpm test:visual                          # precise: which themes actually change
```

A theme that overrides the changed token shows no diff. Review every failing screenshot in the
Playwright report; update baselines (`pnpm test:visual:update`, plus the Linux Docker command in
docs/testing.md) only for intended changes, and say so in the PR.

## Full run

```bash
pnpm check && pnpm lint && pnpm build:all && pnpm validate && pnpm test && pnpm test:visual
```
