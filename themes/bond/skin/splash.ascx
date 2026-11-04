<!--#include file="partials/_registers.ascx" -->
<!--#include file="partials/_includes.ascx" -->

<!-- Splash-specific stylesheet. IMPORTANT: this skin must contain NO inline
     ASP code render blocks (the percent-sign tags) anywhere. DNN injects server
     controls (Meta / CSS-JS includes / control panel) into the skin, and ASP.NET
     forbids modifying the Controls collection of a control that holds code
     blocks — that threw "Controls collection cannot be modified..." and bounced
     /splash to DNN's 503 error page. So splash.css is loaded as a server include
     below, and the logo is a CSS background (no SkinPath expression needed). -->
<dnn:DnnCssInclude runat="server" FilePath="resources/css/splash.css" Priority="130" PathNameAlias="SkinPath" />

<div class="bond-splash">
    <div class="bond-splash__inner">

        <div class="bond-logo" role="img" aria-label="bond for web solutions"></div>

        <h1 class="bond-splash__title">Er wordt aan deze website gewerkt</h1>

        <p class="bond-splash__text">
            We zijn op dit moment druk bezig met het bouwen van onze nieuwe website.
        </p>

        <hr class="bond-splash__rule" />

        <div class="bond-splash__footer">
            Website ontwikkeld door
            <a href="https://www.bondforwebsolutions.nl/" target="_blank" rel="noopener">bond for web solutions</a>
        </div>

    </div>
</div>
