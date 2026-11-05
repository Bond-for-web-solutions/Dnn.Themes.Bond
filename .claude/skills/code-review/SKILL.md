---
name: dnn-code-review
description: Architecture-aware review of changes in this DNN themes monorepo - DNN compatibility, CSS isolation, package boundaries, component contracts, build/packaging correctness, tests, performance and maintainability. Use when asked to review a diff, branch or PR in this repo, or before declaring a change done.
---

# Code review (DNN themes)

Review `git diff origin/main...` (or the given range). Report findings ranked by severity, each with
file:line, the concrete failure scenario and a fix. Skip style nits that the linters already enforce.

## What to check

1. **DNN:** code blocks in ASCX; panes/ContentPane; registrations; `MenuStyle` ↔ `menudef.xml`; CSS
   loaded in the right slot (no `Priority` < 15, no second `skin.css`); layout-only assets stay
   layout-only; UpdatePanel-safe JS; package identity unchanged (`dnn-architecture` skill).
2. **CSS:** scoped selectors, no `!important`/ids/`@layer`, tokens instead of literals, new globals
   allowlisted on purpose, no targeting of shared classes (blocks defined in packages/) outside overrides.css (`css-architecture` skill).
3. **Boundaries:** imports by package name, layers, `workspace:` deps, no theme → theme coupling
   (`monorepo-architecture` skill).
4. **Components:** contract updated; breaking changes declared; examples cover new variants.
5. **Build/release:** determinism (no timestamps or random values in artifacts), atomic writes, path
   guards, correct BOND codes, docs updated when behaviour changes.
6. **Tests:** new behaviour has a test at the right level; baseline updates are justified.
7. **Security:** see the `dnn-security-review` skill checklist.
8. **Maintainability:** simplest thing that works; no dependency without a clear purpose; no
   duplication that a shared package already covers; nothing that won't scale to 20+ themes.

## Verify claims before reporting

Run what you can: `pnpm check`, `pnpm lint`, `pnpm build:all`, `pnpm test`, and the relevant
`pnpm test:visual -g …`. Mark anything you could not run as unverified.
