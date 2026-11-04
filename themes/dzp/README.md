# DZP theme (scaffold)

> **This is not the production `Dnn.Skin.DZP` package.** The production DZP skin
> lives in the separate `Dnn.Extensions.DZP` repository and is Tailwind-based
> (including an in-browser Tailwind runtime). This folder is a scaffold, generated with
> `bond create-theme dzp` and extended with a dashboard layout. It proves that a second theme
> with its own brand, layouts, containers and layout-specific JS builds and deploys
> independently of Bond. Its package name (`DNN.Themes.DZP`) deliberately differs from
> the production one, so installing it can never overwrite the live skin.
> Migration plan: [docs/adding-new-theme.md#migrating-an-existing-skin](../../docs/adding-new-theme.md#migrating-an-existing-skin).

| Layout | Files | Loads |
| --- | --- | --- |
| `default.ascx` | skin.css + theme.js | top navigation, content pane |
| `dashboard.ascx` | skin.css + **dashboard.css** + theme.js + **dashboard.js** | sidebar navigation, content + aside panes |

Containers: `None.ascx`, `Title.ascx` (styled by `container.css`, which DNN loads
wherever these containers are used).

```bash
pnpm build dzp                                   # production build + install ZIP
node packages/build/bin/bond.mjs build dzp --mode development
```
