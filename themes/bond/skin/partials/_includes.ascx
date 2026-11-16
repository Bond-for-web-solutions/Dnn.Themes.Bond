<dnn:META ID="mobileScale" runat="server" Name="viewport" Content="width=device-width, initial-scale=1.0" />

<!-- Stylesheets are NOT included here: DNN registers skin.css (theme bundle:
     fonts, tokens, shared components, Bond styles) on every layout and
     <layout>.css (e.g. splash.css) on its own layout automatically, at the
     correct priority after DNN's default.css. -->

<!-- unload -> pagehide for DNN's ASP.NET AJAX (see scripts/pagehide.js). The only
     script in <head>: it has to run before DNN's ScriptResource.axd files. ~0.3 KB. -->
<dnn:DnnJsInclude runat="server" FilePath="resources/js/pagehide.js" PathNameAlias="SkinPath" ForceProvider="DnnPageHeaderProvider" Priority="1" />

<!-- Theme behaviour (header menu toggle, login/reset card). Loaded at the end
     of the form so it never blocks rendering. -->
<dnn:DnnJsInclude runat="server" FilePath="resources/js/theme.js" PathNameAlias="SkinPath" ForceProvider="DnnFormBottomProvider" />
