<!--#include file="partials/_registers.ascx" -->
<!--#include file="partials/_includes.ascx" -->
<%
    // Sitenaam (portaltitel) uit DNN
    string siteTitle = DotNetNuke.Entities.Portals.PortalSettings.Current.PortalName;
%>

<%-- Splash-specifieke stijlen (staan niet in _includes.ascx, dus apart laden). --%>
<link rel="stylesheet" href="<%= SkinPath %>resources/css/splash.css" />

<div class="bond-splash">
    <div class="bond-splash__inner">

        <img class="bond-logo" src="<%= SkinPath %>resources/img/bond-for-web-solutions-logo.png" alt="bond for web solutions" />

        <h1 class="bond-splash__title">Er wordt aan deze website gewerkt</h1>

        <p class="bond-splash__text">
            We zijn op dit moment druk bezig met het bouwen van de nieuwe website
            van <%= Server.HtmlEncode(siteTitle) %>.
        </p>

        <hr class="bond-splash__rule" />

        <div class="bond-splash__footer">
            Website ontwikkeld door
            <a href="https://www.bondforwebsolutions.nl/" target="_blank" rel="noopener">bond for web solutions</a>
        </div>
        
    </div>
</div>
