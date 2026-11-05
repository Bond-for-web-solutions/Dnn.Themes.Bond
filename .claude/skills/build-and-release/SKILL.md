---
name: build-and-release
description: Build one or all DNN themes, read build reports, package and verify DNN install ZIPs, deploy to a local DNN dev site safely, and cut a release (version bump, snapshot, tag, draft GitHub release, rollback). Use for "build bond", "package dzp", "why did the build fail (BONDnnn)", "deploy locally", "release/tag a theme", or VS Code task questions.
---

# Build and release

References: `docs/build-system.md` (commands, publish/ contract, BOND codes) and `docs/deployment.md`
(local deploy guards, releases, rollback).

## Build

```bash
pnpm build <id>                                          # production + ZIP + reports
node packages/build/bin/bond.mjs build <id> --mode development [--package]
pnpm build:all
pnpm validate                                            # re-verify publish/ (files, ZIP, checksums)
```

On failure, read the first `error BONDnnn` line: it names the source file and line. Fix the source, never
`publish/`. A failed build leaves the previous output and writes `reports/last-failure.json`.

## Local deploy (development sites only)

Requires `.env` (git-ignored) with `<THEME>_SITE_ROOT` (e.g. `BOND_SITE_ROOT`) or the fallback `SITE_ROOT` pointing at a local DNN site. Always dry-run first:
`node packages/build/bin/bond.mjs deploy <id> --dry-run`. Never copy files into `C:\DNN\*` by hand,
never use `--adopt` without the user confirming the folder is this theme, and never deploy to
shared/staging/production servers.

## Release a theme

1. Version bump in `themes/<id>/package.json`; update `themes/<id>/package/ReleaseNotes.txt` (list visible
   and breaking changes).
2. `pnpm build <id>` then `pnpm bond snapshot <id>`; commit `themes/<id>/releases/<ver>.files.json`.
3. After merge to main: `git tag <id>@<x.y.z>` and push the tag. The Release workflow creates a
   **draft** release with ZIP + SHA256SUMS + build-manifest + provenance. A human publishes it.
   Ask before pushing tags.
4. Rollback = re-release the previous tag's content under a higher patch version (DNN refuses
   downgrades); see `docs/deployment.md#rollback`.
