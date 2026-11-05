---
name: dnn-security-review
description: Security review for this DNN themes repo - DOM XSS in theme JS, Razor encoding in DDRMenu templates, secrets in shipped files, dependency and supply-chain risks (pnpm settings, new packages, GitHub Actions pinning), unsafe deploy/clean/path handling, CSP compatibility. Use before merging changes to scripts/, *.cshtml, package.json/pnpm files, .github/workflows, or packages/build/lib/{ops,util,zip}.mjs, or when asked for a security review of this repo.
---

# Security review (DNN themes)

Controls and rationale: `docs/security.md`. Review the diff (`git diff origin/main...`) against this list
and report concrete findings with file:line. Don't speculate.

## Checklist

- **Theme JS:** no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/`eval`/string timers/`on*`
  properties; only `http(s)` URLs copied from the DOM; no secrets or environment values.
- **Razor (`*.cshtml`):** output stays encoded (`@value`); `Html.Raw` only with non-user data; attributes
  built from strings are a bug (they get encoded); `target="_blank"` has `rel="noopener"`.
- **ASCX:** no code blocks, inline scripts or handlers (BOND310/330/331).
- **Dependencies:** exact versions ≥ 7 days old, no install scripts (`allowBuilds`), `workspace:` for
  internal ones, lockfile updated by pnpm only; the `pnpm-workspace.yaml` hardening must stay intact.
- **Workflows:** actions pinned to full SHAs; minimal `permissions`; no `pull_request_target` with a
  checkout of untrusted code; no secrets in logs; releases stay drafts; nothing deploys to servers.
- **File operations:** every delete/write passes `assertInside`/`isInside`; ids and names are validated
  by the regexes in `util.mjs`; ZIP names via `assertSafeEntryName`; deploy guards (BOND700–715) unchanged.
- **Artifacts:** no `.map`, `.env`, keys, scripts or binaries in `publish/` (BOND360–362).

## Validate

```bash
pnpm lint && pnpm check
node --test tests/integration/failures.test.mjs tests/integration/deploy.test.mjs
corepack pnpm audit --audit-level high
docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1 git /repo --redact   # if Docker is available
```
