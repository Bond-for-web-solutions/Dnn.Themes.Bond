# Adding a new theme

```bash
pnpm bond create-theme acme --prefix acme --package-name DNN.Themes.Acme --friendly-name "Acme"
corepack pnpm install            # links @bond/* into themes/acme/node_modules
pnpm build acme                   # production build + install ZIP in publish/acme/
```

That is a complete, installable theme: a `default.ascx` layout, a DDRMenu
menu, `None` and `Title` containers, a `container.css`, tokens, a JS entry,
a visual fixture and an MIT licence placeholder. DZP was created exactly this way.

Then:

1. **`themes/acme/theme.json`:** set `dnn.owner` and `dnn.description`.
   `bond check` warns while placeholders remain. `prefix`, `packageName`,
   `skinName` and `containerName` must be unique across themes.
2. **Brand:** edit `styles/tokens.css` (colours, fonts, radii, component tokens).
3. **Layouts:** add `skin/<layout>.ascx`. For layout-only CSS, add
   `"<layout>.css": "styles/layouts/<layout>.css"` to `styles`; DNN loads it
   only on that layout. For layout-only JS, add a `scripts` entry and a
   `DnnJsInclude` in that layout.
4. **Components:** import the ones you use in `styles/skin.css` (dependencies
   first), and the JS ones in `scripts/theme.js`.
5. **Fixtures:** one `tests/fixtures/<layout>.html` per layout, plus a copy of
   `themes/bond/tests/fixtures/admin.html` for the isolation test. Create
   baselines with `pnpm test:visual:update` (and the Linux command in
   [testing.md](testing.md#updating-baselines)).
6. **Nothing to register.** VS Code's theme picker scans `themes/` each time it opens,
   so the new theme shows up in Ctrl+Shift+B → command → theme right away.
   `pnpm build acme` and `pnpm dev acme` work immediately.
7. **Global selectors:** if you add element-level rules, add the exact
   selectors to `globalSelectors`. The build lists any it finds.

## Migrating an existing skin

(Applies to the production `Dnn.Skin.DZP` in the `Dnn.Extensions.DZP` repo, and similar.)

1. Scaffold with **the same `packageName`, `skinName`, `containerName` and a
   higher version** as the installed skin, so DNN treats it as an upgrade
   rather than a second extension.
2. Move `.ascx`/menus/containers into `skin/` and `containers/`. Remove code
   render blocks (BOND310) and inline scripts (BOND330/331).
3. Move CSS into `styles/`, rename classes to the prefix, and replace hex values with tokens.
4. Record the currently installed file list as
   `releases/<installed version>.files.json` (from its `Resources.zip`), so the
   upgrade's Cleanup removes leftovers.
5. Add fixtures, then compare old vs new computed styles as
   `tests/visual/migration.spec.mjs` does for Bond.
6. Runtime CSS frameworks, such as an in-browser Tailwind build, must become
   build-time CSS or go away. DNN serves no build step at runtime, and an
   in-browser compiler costs every page load.
