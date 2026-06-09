# DNN.Themes.Bond

A clean, modern skin (theme) for **DNN 10**, built with **hand-written native CSS**: no CSS framework, no client-side runtime, and no build step for styling. It ships two skins - a sticky-header site layout and an animated "under construction" splash page - in a warm cream palette with a cyan accent.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![DNN](https://img.shields.io/badge/DNN-10%2B-blue)
![CSS](https://img.shields.io/badge/CSS-native%20(no%20framework)-5abcd2)

---

## Table of Contents

- [What Is This?](#what-is-this)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [How the Skin Works](#how-the-skin-works)
  - [Skins](#skins)
  - [Layout (Content Panes)](#layout-content-panes)
  - [Header & Navigation](#header--navigation)
  - [Footer](#footer)
  - [Containers](#containers)
  - [Styling (Native CSS)](#styling-native-css)
  - [Menus](#menus)
- [Customization Guide](#customization-guide)
  - [Change Colors](#change-colors)
  - [Change Fonts](#change-fonts)
  - [Change the Logo](#change-the-logo)
  - [Edit the Layout](#edit-the-layout)
  - [Edit the Splash Page](#edit-the-splash-page)
  - [Create a New Container](#create-a-new-container)
- [Build the Install Package](#build-the-install-package)
- [Apply the Skin in DNN](#apply-the-skin-in-dnn)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## What Is This?

In **DNN (DotNetNuke)**, a "skin" controls how your site looks - the header, footer, layout, colors, and fonts. **DNN.Themes.Bond** gives your DNN 10 site a modern, warm look.

All styling is **plain, hand-written CSS** you can edit directly. There is no Tailwind/SCSS/PostCSS pipeline and no in-browser CSS engine - editing a `.css` file is all it takes to change the look. You only run a build when you want to repackage the skin for installation.

The package contains **two skins**:

| Skin        | File          | Purpose                                                                 |
| ----------- | ------------- | ----------------------------------------------------------------------- |
| **default** | `default.ascx`| The main site layout: sticky header with dropdown navigation, content panes, and a footer. |
| **Splash**  | `Splash.ascx` | A standalone, animated "under construction" / coming-soon page (logo, message, animated progress divider). Pulls the site name automatically. |

---

## Requirements

| Requirement      | Version / Notes                                                        |
| ---------------- | ---------------------------------------------------------------------- |
| DNN Platform     | 10.0.0 or later                                                        |
| Browser          | Any modern browser (Chrome, Firefox, Edge, Safari)                     |
| Build (optional) | Visual Studio or MSBuild Build Tools - only needed to build the install `.zip` |

No runtime dependencies, no external JavaScript libraries, no font/CDN requirements beyond Google Fonts (Inter / Noto Sans).

---

## Quick Start

### Step 1: Build the Package

From the project root, run the build script (requires MSBuild / Visual Studio Build Tools):

```powershell
.\.vscode\build.ps1
```

This produces the installable package at:

```
install/DNN.Themes.Bond_01.00.00_Install.zip
```

### Step 2: Install in DNN

1. Log in to your DNN site as **Host** (Super Admin).
2. Go to **Settings -> Extensions**.
3. Click **Install Extension** and upload `DNN.Themes.Bond_01.00.00_Install.zip`.
4. Follow the wizard until installation completes.

### Step 3: Apply the Skin

1. Go to **Settings -> Site Settings -> Appearance**.
2. Under **Site Skin**, select **DNN.Themes.Bond - default**.
3. Under **Site Container**, select **DNN.Themes.Bond - None**.
4. Click **Save**.

To use the maintenance page, set a single page's skin to **DNN.Themes.Bond - Splash** (see [Apply the Skin in DNN](#apply-the-skin-in-dnn)).

---

## Project Structure

```
DNN.Themes.Bond/
├── default.ascx               ← Main site skin (sticky header, panes, footer)
├── Splash.ascx                ← Standalone "under construction" splash skin
├── manifest.dnn               ← DNN package manifest (what gets installed)
├── DNN.Themes.Bond.proj       ← MSBuild project that builds the install package
├── skin.doctype.xml           ← Sets the HTML5 doctype
├── License.txt                ← MIT License
├── ReleaseNotes.txt           ← Version history
│
├── .vscode/
│   ├── build.ps1              ← Build helper (finds MSBuild and builds the .proj)
│   └── tasks.json             ← VS Code build task
│
├── containers/
│   └── None.ascx              ← Container without a module title (bare content pane)
│
├── partials/
│   ├── _registers.ascx        ← DNN control registrations + the <%@ Control %> directive
│   └── _includes.ascx         ← <head> includes: viewport meta, Google Font (Inter), skin.css
│
├── resources/
│   ├── css/
│   │   ├── skin.css           ← Site styles: header, footer, navigation, layout, containers
│   │   └── splash.css         ← Splash-page styles + entrance/progress animations
│   └── img/
│       └── bond-for-web-solutions-logo.png   ← Splash logo
│
└── menus/                     ← DDRMenu Razor templates (navigation rendering)
    ├── header/
    │   ├── HeaderMenu.cshtml   ← Desktop nav with dropdowns + mobile menu
    │   └── menudef.xml         ← Tells DDRMenu which template to use
    └── footer/
        ├── FooterMenu.cshtml   ← Flat footer links
        └── menudef.xml
```

---

## How the Skin Works

### Skins

- **`default.ascx`** is the main skin. It includes `partials/_registers.ascx` (control registrations + the page `Control` directive) and `partials/_includes.ascx` (the `<head>` includes), renders the header and footer via DDRMenu, and exposes content panes for your modules.
- **`Splash.ascx`** is a self-contained skin for a maintenance / coming-soon page. It loads its own `splash.css`, shows the logo, a headline, a short message that automatically includes the **site (portal) name**, and an animated progress divider. It has no login form and no navigation.

### Layout (Content Panes)

The main layout lives in `default.ascx`. **Content panes** are areas where you drop DNN modules:

| Pane Name     | Description                                          |
| ------------- | ---------------------------------------------------- |
| `BannerPane`  | Full-width area at the top, ideal for a hero/banner  |
| `ContentPane` | Centered main content area (max-width container)     |
| `FluidPane`   | Full-width area below the content                    |

To add content: edit the page in DNN, click **Add Module** on a pane, and place your module.

### Header & Navigation

The header is rendered by the DDRMenu template `menus/header/HeaderMenu.cshtml` and styled in `resources/css/skin.css`:

- **Top bar** - user / login links (desktop only).
- **Main header** - site logo + desktop navigation with hover dropdown submenus.
- **Mobile menu** - a hamburger button that toggles the menu on small screens.

The header is **sticky** (stays at the top while scrolling).

### Footer

The footer is rendered by `menus/footer/FooterMenu.cshtml`:

- Footer navigation links.
- Terms of Use / Privacy links and a copyright line (small, uppercase, letter-spaced).
- A cyan accent bar and a faded logo watermark on large screens.

### Containers

Containers wrap individual DNN modules. This skin ships one:

| Container | File        | Use When...                                          |
| --------- | ----------- | ---------------------------------------------------- |
| **None**  | `None.ascx` | You want a bare module with no container title/chrome |

To change a module's container: edit the page, open the module's settings, and under **Module Container** choose `DNN.Themes.Bond - None`.

### Styling (Native CSS)

All styling is plain CSS - **there is no utility-class framework and no in-browser compiler**. Markup uses semantic, `bond-`prefixed class names (e.g. `.bond-header`, `.bond-nav-link`, `.bond-footer`, `.bond-splash`) defined in two files:

| File                       | What It Styles                                                              |
| -------------------------- | --------------------------------------------------------------------------- |
| `resources/css/skin.css`   | The main site: base/reset, layout, sticky header, top bar, navigation + dropdowns, hamburger, mobile menu, and footer. |
| `resources/css/splash.css` | The splash page: layout, typography, the animated progress divider, and entrance animations. |

Design notes:

- **Palette** - warm cream backgrounds (`#faf5ee` / `#f4ede4` / `#efe6d9`) with a cyan accent (`#5abcd2`) and soft borders (`#e6ddd0`).
- **Fonts** - Inter on the main skin (loaded in `_includes.ascx`), Noto Sans on the splash (imported in `splash.css`).
- **Responsive** - fluid `clamp()` sizing, a mobile hamburger menu, and `100dvh` so the splash fills the screen correctly on mobile.
- **Motion** - the splash has tasteful entrance animations and an animated progress bar; the header/footer have no decorative motion (only functional hover/menu transitions). All motion respects `prefers-reduced-motion`.

### Menus

Navigation uses DNN's **DDRMenu** system. Each menu folder contains a Razor `.cshtml` template that renders your DNN page tree, plus a `menudef.xml` that points DDRMenu at the template:

| Menu           | Location         | Used For                                  |
| -------------- | ---------------- | ----------------------------------------- |
| **HeaderMenu** | `menus/header/`  | Desktop navigation with dropdown submenus |
| **FooterMenu** | `menus/footer/`  | Flat footer links                         |

> **Important:** both the `.cshtml` template **and** its `menudef.xml` must be packaged, or DDRMenu fails with "Illegal characters in path." The build includes `*.xml`, so this works out of the box.

---

## Customization Guide

### Change Colors

Colors are plain hex values in `resources/css/skin.css` and `resources/css/splash.css`. The core palette:

| Token            | Value     | Used For                              |
| ---------------- | --------- | ------------------------------------- |
| Accent (cyan)    | `#5abcd2` | Links/hover, splash progress bar, footer accent |
| Accent (deep)    | `#0e7490` | Active/hover nav text                 |
| Cream (light)    | `#faf5ee` | Header background                     |
| Cream (base)     | `#f4ede4` | Page background                       |
| Cream (deep)     | `#efe6d9` | Top bar, footer background            |
| Border           | `#e6ddd0` | Header/footer borders                 |
| Text             | `#2b2b2b` | Headings / primary text               |
| Muted            | `#8a8175` | Footer/secondary text                 |

To rebrand the accent, search-replace `#5abcd2` (and `#0e7490`) across the two CSS files.

### Change Fonts

- **Main skin:** change `font-family` on `body` in `skin.css`, and update the Google Fonts `<link>` in `partials/_includes.ascx`.
- **Splash:** change `font-family` on `.bond-splash` in `splash.css`, and update the `@import` at the top of that file.

### Change the Logo

Replace `resources/img/bond-for-web-solutions-logo.png` (used by the splash). The header/footer logos use the **portal logo** configured in DNN (Site Settings), so set that in DNN directly.

### Edit the Layout

Open `default.ascx`. Each `<div runat="server">` with an `id` is a content pane:

```html
<div id="ContentPane" class="bond-content" runat="server"></div>
```

Adjust the `.bond-content` / `.bond-main` rules in `skin.css` to change width, padding, etc.

### Edit the Splash Page

Open `Splash.ascx` to change the headline and message (the site name is inserted automatically via `PortalSettings`). Tune the look and animations in `resources/css/splash.css`.

### Create a New Container

1. Add a new `.ascx` in `containers/`, e.g. `Title.ascx`:

```html
<%@ Control AutoEventWireup="false" Explicit="True" Inherits="DotNetNuke.UI.Containers.Container" %>
<%@ Register TagPrefix="dnn" TagName="TITLE" Src="~/Admin/Containers/Title.ascx" %>
<div class="bond-container-card">
    <h3><dnn:TITLE runat="server" id="dnnTITLE" /></h3>
    <div id="ContentPane" runat="server"></div>
</div>
```

2. Add it to `manifest.dnn` inside `<containerFiles>`:

```xml
<containerFile>
    <path></path>
    <name>Title.ascx</name>
</containerFile>
```

3. Rebuild and reinstall the package.

---

## Build the Install Package

Run the build helper from the project root (it locates MSBuild via `vswhere` and builds `DNN.Themes.Bond.proj`):

```powershell
.\.vscode\build.ps1
```

You can also run the **build task** from VS Code (Terminal -> Run Task).

**What the build does:**

1. Packages the skin files (`.ascx`, `partials/`, `menus/`, `resources/css`, `resources/img`, `*.xml`) into `Resources.zip`.
2. Packages the container(s) from `containers/` into `ContainerResources.zip`.
3. Combines everything with `manifest.dnn`, `License.txt`, and `ReleaseNotes.txt` into the final install zip.

**Output:**

```
install/DNN.Themes.Bond_01.00.00_Install.zip
```

---

## Apply the Skin in DNN

### Apply to the Entire Site

1. Go to **Settings -> Site Settings -> Appearance**.
2. Set **Site Skin** to `DNN.Themes.Bond - default`.
3. Set **Site Container** to `DNN.Themes.Bond - None`.
4. Click **Save**.

### Apply to a Single Page (e.g. the Splash page)

1. Open **Page Settings** for the page.
2. Under **Appearance**, set **Page Skin** to `DNN.Themes.Bond - default` (or `DNN.Themes.Bond - Splash` for the maintenance page).
3. Click **Save**.

### Apply a Container to a Single Module

1. Edit the page and open the module's settings.
2. Under **Module Container**, choose `DNN.Themes.Bond - None`.
3. Click **Update**.

---

## Troubleshooting

| Problem | Solution |
| ------- | -------- |
| Page looks unstyled | Confirm `resources/css/skin.css` (and `splash.css` for the splash) deployed into the skin folder, and that the `<link>` / `DnnCssInclude` paths resolve. Hard-refresh (Ctrl+F5) to clear cached CSS. |
| Menu error: "Illegal characters in path" | The `menudef.xml` files were not deployed. Make sure the build includes `*.xml` (it does) and reinstall so `menus/header/menudef.xml` and `menus/footer/menudef.xml` are present. |
| Splash logo is broken | Ensure `resources/img/` was deployed (the build packages images by extension). |
| Mobile menu doesn't open | Check the hamburger `onclick` targets `#mobile-menu` and that the `<div id="mobile-menu">` exists. |
| Navigation dropdowns don't show | Ensure the `menus/header/` folder (template + `menudef.xml`) is installed and the DDRMenu module is present. |
| Build fails | Make sure Visual Studio / MSBuild Build Tools are installed; `build.ps1` locates MSBuild via `vswhere`. Run from the project root. |
| Package won't install | Verify `manifest.dnn` is well-formed XML and that every file it lists exists in the package. Check the DNN event log. |

---

## License

This project is licensed under the **MIT License** - see [License.txt](License.txt) for details.
