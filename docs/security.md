# Security

## Threats and controls

| Threat | Control | Enforced by |
| --- | --- | --- |
| Malicious / compromised npm release | `minimumReleaseAge: 10080` (7 days); pinned exact versions; Dependabot `cooldown` 7 days | `pnpm-workspace.yaml`, `.github/dependabot.yml` |
| Install-time code execution | lifecycle scripts blocked; `strictDepBuilds` makes an unreviewed build script **fail** the install; `allowBuilds` is explicit (esbuild: false) | pnpm |
| Trust downgrade (e.g. a release without provenance) | `trustPolicy: no-downgrade` | pnpm |
| Git/tarball dependencies sneaking in transitively | `blockExoticSubdeps: true` | pnpm |
| Dependency confusion (`@bond/*` resolving from npm) | all internal deps use `workspace:`; every package is `private` | `bond check` (BOND900/904/905) |
| Lockfile drift | `pnpm install --frozen-lockfile` in CI; lockfile hash in each build report | CI, `build-manifest.json` |
| Known vulnerabilities | `pnpm audit --audit-level high` | CI `security` job |
| Secrets in Git history | gitleaks over the full history | CI `security` job |
| Secrets in shipped files | pattern scan of every staged text file (private keys, cloud/GitHub/Slack/Stripe tokens, JWTs, connection-string passwords) | build (BOND360) |
| Dangerous files in a theme | extension **allowlist** (markup, styles, scripts, images, fonts, data); server-executable `.aspx/.ashx/.asmx`, scripts, binaries and keys are refused; `web.config` warned | build (BOND361/363) |
| Third-party runtime JS | only `@bond/*` workspace imports are bundled; any other bare import must be a declared dependency, and remote `url()`/`@import` are refused | build (BOND102/105/120) |
| DOM XSS in theme JS | `no-unsanitized` (innerHTML, outerHTML, insertAdjacentHTML, document.write), no eval/new Function/string timers, no `javascript:` URLs, no `on*` property handlers | ESLint |
| XSS in Razor menu templates | Razor encodes by default; `Html.Raw` is flagged (BOND333); a broken encoded `target` attribute was fixed | build + review |
| Reverse tabnabbing | `rel="noopener"` added when a menu item opens in a new window | Razor templates |
| Path traversal / zip-slip | entry names validated on write and read (`..`, absolute, drive letters, backslashes, duplicates); theme ids/names regex-checked; all deletes asserted inside `publish/` | `zip.mjs`, `util.mjs` |
| Writing to the wrong DNN site, or through a junction | see [deployment.md](deployment.md#local-deploy-guards); links refused, real paths checked | `ops.mjs deploy` |
| Tampered artifacts | SHA-256 for every output and the ZIP; `bond validate` re-verifies; release ZIPs get a GitHub build-provenance attestation | build, CI |
| Over-privileged CI | `permissions: contents: read` by default; only the release job gets `contents: write` + `id-token`; actions pinned to commit SHAs; `persist-credentials: false` | workflows |

## Frontend code rules

- Text in via `textContent`/properties only; never build HTML from strings.
- Copy only `http(s)` hrefs from DNN's markup (auth card).
- No inline event handlers or inline scripts in layouts/menus (BOND330/331).
  Bond's inline `onclick` and `<script>` were removed.
- No secrets, API keys or environment values in bundles. There is no
  `process.env` passthrough apart from `NODE_ENV`.

## Content-Security-Policy

DNN (WebForms) needs `'unsafe-inline'` for scripts: `__doPostBack` handlers,
ScriptManager blocks and module scripts are emitted inline by the platform.
A strict nonce-based CSP is therefore **not achievable** on DNN today, and
DNN 10.4's resource manager has no nonce support (verified in source).
What the themes do:

- add no inline script or handler of their own (validated), so they never
  widen what the platform already needs;
- load everything same-origin (`'self'`), with no CDNs, so SRI is unnecessary;
- leave headers to the site: a theme package must not change `web.config`.

Suggested starting point, set by the site admin in **Report-Only** mode first
and adjusted for installed modules:

```text
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-ancestors 'self';
  base-uri 'self'; form-action 'self'; object-src 'none'
```

**Trusted Types** cannot be enforced: DNN core and jQuery assign HTML strings.
Our own code is compatible, since it uses no HTML sinks.

## Accessibility-related security

The login card keeps real labels and `autocomplete` hints (`username`,
`current-password`), so password managers work and users aren't pushed to
weak passwords. The native DNN form stays in the DOM for validators.

## Reporting

Report suspected vulnerabilities privately to the repository owners, not in a
public issue.
