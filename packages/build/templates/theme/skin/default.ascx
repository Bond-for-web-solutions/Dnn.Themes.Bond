<!--#include file="partials/_registers.ascx" -->
<!--#include file="partials/_includes.ascx" -->

<div class="__PREFIX__-page">
    <dnn:MENU runat="server" id="dnnMainMenu" MenuStyle="menus/main" NodeSelector="*,0,1" />

    <main class="__PREFIX__-main bond-container">
        <div id="ContentPane" class="__PREFIX__-pane" runat="server"></div>
    </main>

    <footer class="__PREFIX__-footer bond-container">
        <dnn:COPYRIGHT runat="server" id="dnnCopyright" CssClass="__PREFIX__-footer__copyright" />
    </footer>
</div>
