# Deployment, releases and rollback

Nothing in this repository deploys to a shared, staging or production DNN site.
Production installs are done by a person, through DNN's extension installer,
using a reviewed release ZIP.

## Local development site

1. Create `.env` (git-ignored) from `.env.example`:

   ```ini
   BOND_SITE_ROOT=C:\DNN\bond-dev   # the DNN site for theme "bond" (web.config, bin\, Portals\)
   DZP_SITE_ROOT=C:\DNN\dzp-dev     # one line per theme: folder name in themes/ in capitals
   BOND_PRUNE=true                  # optional, per theme: remove files bond deployed before that are gone now

   SITE_ROOT=C:\DNN\my-dev-site     # optional fallback for themes without their own line
   PRUNE=false                      # optional fallback for <THEME>_PRUNE
   ```

   Only this file is read (never shell environment variables), so a deploy target can't
   come from a stray variable. Other tools' variables in `.env` are ignored; near-misses of
   these settings (`BOND_SITEROOT`, `DZP_PRUNES`) and unknown theme names (`SHOP_SITE_ROOT`)
   are rejected.

2. Build, then copy: `pnpm build bond && pnpm deploy:local bond` (or VS Code
   **DNN: Publish Theme Locally…** and pick the theme). To preview first: `pnpm deploy:local bond --dry-run`.
3. Live loop: `node packages/build/bin/bond.mjs watch bond --deploy`.

### Local deploy guards

| Guard | Code |
| --- | --- |
| no `.env` → refuse (the site is never guessed) | BOND700 |
| no `<THEME>_SITE_ROOT` and no `SITE_ROOT` for the theme / misspelled setting or unknown theme | BOND705 / BOND706 |
| the site root must be absolute, not a UNC/network path, not overlapping the repo | BOND701–703 |
| the site root must look like DNN (`web.config`, `bin/DotNetNuke.dll`, `Portals/_default`) | BOND704 |
| build must exist, have passed validation, and not be followed by a failed rebuild | BOND709–711 |
| writes only to `Portals/_default/Skins/<skinName>` and `…/Containers/<containerName>` | BOND712/715 |
| existing folder without bond's `.bond-deploy.json` marker → refuse unless `--adopt` | BOND714 |
| marker belongs to another theme → refuse | BOND713 |
| no symbolic link or junction anywhere on the destination path; real-path containment before every write | BOND717/715 |
| `publish/` files must still match `build-manifest.json` hashes | BOND716 |
| `--prune` deletes only files bond deployed there previously (case-insensitive) | - |

After a file copy, DNN still serves cached URLs (`?cdv=<n>`). Enable debug
mode on the dev site, or increment the client resource version
(Settings → Servers → Client Resource Management in DNN 10's Persona Bar).

## Releasing a theme

Themes are versioned independently (semver in `themes/<id>/package.json` →
DNN `MM.mm.pp`). A Bond release does not require deploying DZP.

1. Branch, change, open a PR. CI must be green on Linux and Windows,
   reproducible, visual and security.
2. Bump `themes/<id>/package.json` `version` and update
   `themes/<id>/package/ReleaseNotes.txt` (list breaking or visible changes).
   Conventional Commit messages with a scope help: `feat(bond): …`,
   `fix(components): …`.
3. On `main`: `pnpm build <id>`, then `pnpm bond snapshot <id>`, and commit
   `themes/<id>/releases/<MM.mm.pp>.files.json`. The next version uses it to
   generate Cleanup entries for files it no longer ships.
4. Tag and push: `git tag <id>@<x.y.z> && git push origin <id>@<x.y.z>`.
   The **Release** workflow verifies that the tag matches `package.json`,
   rebuilds that one theme, attests provenance, and creates a **draft** GitHub
   release with the ZIP, `SHA256SUMS` and `build-manifest.json`. A
   maintainer publishes it. For an extra human gate, add required reviewers
   to the `release` environment.

Traceability: the ZIP's CSS/JS banner and `build-manifest.json` carry the
commit SHA. `gh attestation verify <zip> --repo <owner>/<repo>` proves the ZIP
came from that workflow run.

## Installing / upgrading on a DNN site

Host → Extensions → Install Extension → upload the ZIP.

- **Clean install:** creates `Portals/_default/Skins/<skinName>` and
  `Containers/<containerName>`.
- **Upgrade:** a higher version installs over the old one. `Cleanup`
  components remove files the previous release(s) shipped but this one does
  not (Bond 1.1.0 removes 11 legacy files). DNN increments the client resource
  version, so browsers fetch the new CSS/JS.
- Page layout assignments are stored by path. Keep layout file names stable
  between versions, or pages fall back to the site default.

## Rollback

DNN does not downgrade in place: installing a lower version is refused.

1. **Fast path:** install the previous release ZIP's files over the current
   ones by re-installing a *re-versioned* build of the previous tag:
   `git checkout <id>@<prev>`, set `version` to a new patch number above the
   broken one, build, and install. This is the only path that keeps DNN's
   package records consistent.
2. **Emergency path:** restore the `Portals/_default/Skins/<skinName>` and
   `Containers/<containerName>` folders from the site backup (or from the
   previous ZIP's `Resources.zip` contents plus root `.ascx` files), then
   increment the client resource version.
3. Because builds are deterministic, rebuilding an old tag reproduces the
   original ZIP byte-for-byte (same Node major), and its checksum can be
   compared with the archived release.

A failed *build* never damages anything: the previous `publish/<id>` stays
intact and deploy refuses while `last-failure.json` exists.
