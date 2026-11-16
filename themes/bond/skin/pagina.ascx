<!--#include file="partials/_registers.ascx" -->
<!--#include file="partials/_includes.ascx" -->

<%--
  "pagina" layout: content pages built from 2sxc modules (huisstijl 2027).

  Pane names match the BondBS5 layouts, so a page can switch to this layout
  without moving modules:
    HeaderPane   full width: the coloured page head (2sxc), container None (edge to edge)
    BannerPane   full width, container None (edge to edge)
    ContentPane  each module in the Standaard container (content width, rhythm)
    BottonPane   full width (sic: BondBS5's pane name), container None (edge to edge)
    FluidPane    full width, container None (edge to edge)
  Modules with an explicit container keep it. No Bootstrap: Koi reports the
  framework "bond" (koi.json); content styling is pagina.css + content.css.
--%>

<!-- Header -->
<dnn:MENU runat="server" id="dnnMENU" MenuStyle="menus/header" NodeSelector="*,0,2" />

<main id="bond-main" class="bond-main bond-pagina" tabindex="-1">
  <%-- Kruimelpad (brandbook: max 3 levels); DNN hides it on top-level pages. --%>
  <nav class="bond-kruimel" aria-label="Kruimelpad">
    <div class="bond-container">
      <dnn:BREADCRUMB runat="server" id="dnnBreadcrumb" CssClass="bond-kruimel__link" Separator=" / " RootLevel="0" HideWithNoBreadCrumb="true" />
    </div>
  </nav>
  <div id="HeaderPane" class="bond-pagina__kop" runat="server" containertype="G" containername="DNN.Themes.Bond" containersrc="None.ascx"></div>
  <div id="BannerPane" class="bond-pagina__breed" runat="server" containertype="G" containername="DNN.Themes.Bond" containersrc="None.ascx"></div>
  <div id="ContentPane" class="bond-pagina__inhoud" runat="server" containertype="G" containername="DNN.Themes.Bond" containersrc="Standaard.ascx"></div>
  <div id="BottonPane" class="bond-pagina__breed" runat="server" containertype="G" containername="DNN.Themes.Bond" containersrc="None.ascx"></div>
  <div id="FluidPane" class="bond-pagina__breed" runat="server" containertype="G" containername="DNN.Themes.Bond" containersrc="None.ascx"></div>
</main>

<!-- Footer -->
<dnn:MENU runat="server" id="dnnMENU_Footer" MenuStyle="menus/footer" NodeSelector="*,0,1" />
