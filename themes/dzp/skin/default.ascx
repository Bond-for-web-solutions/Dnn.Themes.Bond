<!--#include file="partials/_registers.ascx" -->
<!--#include file="partials/_includes.ascx" -->

<div class="dzp-page">
    <dnn:MENU runat="server" id="dnnMainMenu" MenuStyle="menus/main" NodeSelector="*,0,1" />

    <main class="dzp-main bond-container">
        <div id="ContentPane" class="dzp-pane" runat="server"></div>
    </main>

    <footer class="dzp-footer bond-container">
        <dnn:COPYRIGHT runat="server" id="dnnCopyright" CssClass="dzp-footer__copyright" />
    </footer>
</div>
