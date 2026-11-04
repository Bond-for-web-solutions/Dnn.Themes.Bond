<!--#include file="partials/_registers.ascx" -->
<!--#include file="partials/_includes.ascx" -->

<!-- Dashboard layout. dashboard.css (next to this file) is loaded by DNN only
     on pages using this layout; dashboard.js is included only here. -->
<dnn:DnnJsInclude runat="server" FilePath="resources/js/dashboard.js" PathNameAlias="SkinPath" ForceProvider="DnnFormBottomProvider" />

<div class="dzp-dashboard" data-dzp-dashboard>
    <aside class="dzp-sidebar" id="dzp-sidebar" aria-label="Dashboard navigation">
        <div class="dzp-sidebar__brand">
            <dnn:LOGO runat="server" id="dnnLOGO" />
        </div>
        <dnn:MENU runat="server" id="dnnSidebarMenu" MenuStyle="menus/sidebar" NodeSelector="*,0,2" />
    </aside>

    <div class="dzp-dashboard__main">
        <header class="dzp-topbar">
            <button type="button" class="dzp-topbar__toggle" data-dzp-sidebar-toggle aria-controls="dzp-sidebar" aria-expanded="true">
                <span class="bond-u-visually-hidden">Toggle sidebar</span>
                <span class="dzp-topbar__toggle-icon" aria-hidden="true"></span>
            </button>
            <dnn:USER runat="server" id="dnnUSER" CssClass="dzp-topbar__user" />
            <dnn:LOGIN runat="server" id="dnnLOGIN" CssClass="dzp-topbar__login" />
        </header>

        <div class="dzp-dashboard__panes">
            <div id="ContentPane" class="dzp-dashboard__content" runat="server"></div>
            <aside id="AsidePane" class="dzp-dashboard__aside" runat="server"></aside>
        </div>
    </div>
</div>
