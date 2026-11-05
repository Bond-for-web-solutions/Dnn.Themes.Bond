<!--#include file="partials/_registers.ascx" -->
<dnn:META ID="mobileScale" runat="server" Name="viewport" Content="width=device-width, initial-scale=1.0" />

<!-- Shared splash layout from @bond/splash ("website under construction").
     Every theme that depends on @bond/splash ships it; pick "splash" as the
     page or site layout in DNN while a site is being built. A theme can
     replace it with its own skin/splash.ascx.

     It is self-contained: no theme partials or theme JS, and splash.css (DNN
     loads it next to this file, only on this layout) does not read the
     theme's tokens.

     IMPORTANT: no inline ASP code render blocks (the percent-sign tags) -
     DNN injects server controls into skins and ASP.NET then throws
     "Controls collection cannot be modified", shown as a misleading 503.
     The build rejects them (BOND310). The logo is a CSS background for the
     same reason. -->

<div class="bond-splash">
    <div class="bond-splash__inner">

        <div class="bond-splash__logo" role="img" aria-label="bond for web solutions"></div>

        <h1 class="bond-splash__title">Er wordt aan deze website gewerkt</h1>

        <p class="bond-splash__text">
            We zijn op dit moment druk bezig met het bouwen van onze nieuwe website.
        </p>

        <!-- Optional modules (e.g. a contact form). Hidden while empty, so the
             splash looks unchanged; in edit mode DNN shows its drop zone here. -->
        <div id="ContentPane" class="bond-splash__contentpane" runat="server"></div>

        <hr class="bond-splash__rule" />

        <div class="bond-splash__footer">
            Website ontwikkeld door
            <a class="bond-splash__link" href="https://www.bondforwebsolutions.nl/" target="_blank" rel="noopener">bond for web solutions</a>
        </div>

    </div>
</div>
