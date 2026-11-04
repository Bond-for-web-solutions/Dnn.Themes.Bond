# Testing

| Suite | Command | Runs in CI | What it proves |
| --- | --- | --- | --- |
| Architecture | `pnpm check` | yes | boundaries, layers, cycles, identities |
| Lint | `pnpm lint` | yes | CSS namespace/specificity rules, JS security rules |
| Integration (75 tests) | `pnpm test` | yes (Linux + Windows) | publish contract, ZIP/manifest, shared code included, isolation between themes, determinism, scoped clean, 23 failure modes, deploy guards, contracts, lint rules fire, VS Code tasks |
| Visual + browser (47 tests) | `pnpm test:visual` | yes (Linux) | page + component screenshots per theme, CSS guarantees G1–G5, JS behaviour, Bond 1.0 parity |
| End-to-end on real DNN | `pnpm test:e2e` | no (opt-in) | layouts per page, resource loading, login card, admin |

Integration tests write only to `bond-test-*` folders in the OS temp dir
(`BOND_PUBLISH_ROOT`, `BOND_EXTRA_THEMES` are refused elsewhere). Failure cases
break a disposable *clone* of a real theme. Your working tree is never modified.

## Fixtures

`themes/<id>/tests/fixtures/*.html` approximate DNN's rendered markup for a
layout (`<!-- layout: name -->` on line 1). `tests/support/server.mjs` serves
each one the way DNN would: vendored DNN 10 `default.css` → (module CSS) →
`skin.css` → `<layout>.css` → `container.css`, with the theme scripts at the
end of the form. `admin.html` holds DNN core form markup for the
"theme must not change DNN UI" test.

## Shared component changes

The critical scenario, "I changed the shared button used by five themes", is
covered at three levels:

1. **Impact analysis:** `bond affected --base origin/main` lists every theme
   whose dependency closure changed. CI writes it to the PR summary.
2. **Contracts:** removing or renaming a documented class or token fails
   `units.test.mjs`.
3. **Visual baselines per theme:** the component gallery and page fixtures are
   screenshotted under each theme. A theme that overrides the changed token
   shows no diff; a theme that inherits it fails, naming the exact screenshots.

Recorded run (letter-spacing default of `.bond-button` changed, then reverted):
`bond affected` flagged bond + dzp. Visual tests: **6 DZP screenshots failed**
(button and card galleries, both DZP pages); **all 11 Bond screenshots passed**,
because Bond sets `--bond-button-letter-spacing`.

Screenshots use an absolute budget (`maxDiffPixels: 20`). A ratio hid a
two-link colour change on a full page during development.

## Updating baselines

Only after reviewing the diff in the Playwright report:

```bash
pnpm test:visual:update                 # Windows baselines (system Chrome)
# Linux baselines, identical to CI:
docker run --rm -v "$PWD:/src:ro" -v "$PWD/tests/visual/__screenshots__:/out" \
  mcr.microsoft.com/playwright:v1.64.1-noble bash -c 'cp -r /src /work && cd /work && rm -rf node_modules */*/node_modules && npm i -g pnpm@12.14.0 && pnpm install --frozen-lockfile && CI=1 pnpm exec playwright test --update-snapshots && cp -r tests/visual/__screenshots__/linux /out/'
```

Baselines live in `tests/visual/__screenshots__/<platform>/<project>/` and
are committed. Review them as images.

## Real DNN end-to-end

```bash
BOND_E2E_BASE_URL=http://mysite.dnndev.me \
BOND_E2E_PAGES='{"default":"/","splash":"/coming-soon"}' \
pnpm test:e2e
```

Checks per page: not DNN's error page, `skin.css?cdv=` loaded after DNN's
`default.css`, other layouts' CSS **not** loaded, `theme.js` present, no 4xx
for theme assets. Login: the card replaces the native form. With
`BOND_E2E_USER`/`BOND_E2E_PASSWORD` (environment only), it also logs in and
checks that the Persona Bar appears.

## Accessibility

`behavior.spec.mjs` checks alt text, accessible names, labelled inputs,
labelled navigation landmarks, keyboard behaviour (Escape closes the menu,
focus opens submenus, Enter submits login). Not automated: colour contrast.
Bond's subtle text `#8a8175` on `#faf5ee` is about 3.5:1, below WCAG AA for
small text. It is a brand decision and is listed in the migration assessment.
