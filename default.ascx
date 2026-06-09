<!--#include file="partials/_registers.ascx" -->
<!--#include file="partials/_includes.ascx" -->

<!-- Header -->
<dnn:MENU runat="server" id="dnnMENU" MenuStyle="menus/header" NodeSelector="*,0,2" />

<!-- Main Content -->
<main class="bond-main">
  <div id="BannerPane" runat="server"></div>
  <div id="ContentPane" class="bond-content" runat="server"></div>
  <div id="FluidPane" runat="server"></div>
</main>

<!-- Footer -->
<dnn:MENU runat="server" id="dnnMENU_Footer" MenuStyle="menus/footer" NodeSelector="*,0,1" />