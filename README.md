# DNN themes monorepo

Independently deployable **DNN Platform 10** themes built on one shared design
system. Each theme compiles into its own self-contained DNN install package;
shared code is bundled in at build time, so no site ever depends on another
theme's files.

| Theme | Package | Layouts | Status |
| --- | --- | --- | --- |
| [`themes/bond`](themes/bond) | `DNN.Themes.Bond` 1.1.0 | `default`, `splash` + `None` container | migrated from the legacy Bond repo ([assessment](docs/migration/bond-legacy-assessment.md)) |
| [`themes/dzp`](themes/dzp) | `DNN.Themes.DZP` 1.0.0 | `default`, `dashboard` + `None`, `Title` containers | scaffold, **not** the production `Dnn.Skin.DZP` |

## Quick start

Requirements: Node.js 24 (see `.node-version`) and pnpm 12.14.0, the version
in `package.json`. No Visual Studio or MSBuild needed.

Run the setup script once per machine. It installs that Node and pnpm, keeping a
Node you already have if it is ≥ 22.12, and needs no admin/sudo:

| OS | Command |
| --- | --- |
| Windows | `scripts\setup.cmd` |
| macOS / Linux | `sh scripts/setup.sh` |

It uses fnm/nvm when installed, otherwise the official nodejs.org build
(SHA-256 checked) in `%LOCALAPPDATA%\Programs\node` or `~/.local/node`. Pass
`-Force` / `--force` to reinstall Node. Then open a new terminal and:

```bash
# manual alternative to the setup script, with Node already installed:
# npm install -g pnpm@12.14.0 --allow-scripts=pnpm
pnpm install --frozen-lockfile
pnpm build bond                            # -> publish/bond/packages/DNN.Themes.Bond_01.01.00_Install.zip
```

Install the ZIP in DNN: *Settings → Extensions → Install Extension*. Then
choose **DNN.Themes.Bond – default** as the site theme, or pick a layout per page under
*Page Settings → Appearance*.

`--allow-scripts=pnpm` is needed because pnpm 12 is a native program that its own
install script sets up, and recent npm versions skip install scripts by default.
On Windows, use the **Command Prompt** terminal, or allow local scripts in PowerShell
(`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`): the default *Restricted*
policy blocks `pnpm.ps1`. Without a global install, `corepack pnpm …` also works on Node 22/24.

In VS Code, **Ctrl+Shift+B** shows VS Code's list of commands (build, watch, validate, deploy, clean, check,
lint, tests…); pick one, then pick the theme from a second list. Every task
in `.vscode/tasks.json` calls the same CLI as the terminal and CI.

## Commands

| | |
| --- | --- |
| **Ctrl+Shift+B** in VS Code, or `pnpm menu` in a terminal | pick any command below and a theme from lists, no typing |
| `pnpm build <theme>` / `pnpm build:all` | production build, validate, package, verify (no theme → pick from `themes/`) |
| `node packages/build/bin/bond.mjs build bond --mode development` | readable CSS/JS + source maps, no ZIP |
| `pnpm dev <theme>` | watch a theme and its shared packages |
| `pnpm validate` | re-verify `publish/` (files, ZIPs, checksums) |
| `pnpm deploy:local <theme>` | copy to a **local** DNN site set in `.env` |
| `pnpm check` · `pnpm lint` · `pnpm test` · `pnpm test:visual` | architecture · Stylelint/ESLint · integration · Playwright |
| `pnpm bond affected --base origin/main` | which themes a change affects |
| `pnpm bond create-theme <id> --prefix <p>` | scaffold a new theme |

## Repository

```text
packages/tokens       design tokens + breakpoints          packages/components  button, field, card, alert, auth-card
packages/foundation   opt-in base, layout, utilities       packages/dnn         shared DNN skin files, onDnnReady()
packages/splash       shared splash.ascx + splash.css ("under construction" layout, same in every theme)
packages/build        bond CLI, validation, packaging, Stylelint rule, theme template
themes/<id>/          skin/ containers/ styles/ scripts/ assets/ package/ releases/ tests/ theme.json
tests/                integration (node:test) · visual + isolation (Playwright) · e2e on real DNN (opt-in)
publish/              generated: <theme>/{theme, packages, reports}  (git-ignored)
```

## Documentation

[Architecture & decisions](docs/architecture.md) ·
[Monorepo](docs/monorepo.md) ·
[CSS architecture](docs/css-architecture.md) ·
[Components](docs/component-guidelines.md) ·
[Build system](docs/build-system.md) ·
[DNN integration](docs/dnn-integration.md) ·
[Performance](docs/performance.md) ·
[Security](docs/security.md) ·
[Testing](docs/testing.md) ·
[Deployment & rollback](docs/deployment.md) ·
[Adding a theme](docs/adding-new-theme.md) ·
[Validation results](docs/validation-results.md)

## License

MIT - see [LICENSE](LICENSE). Each theme ships its own `package/License.txt`.
The MuseoSans fonts are third-party; check their licence before redistributing.
