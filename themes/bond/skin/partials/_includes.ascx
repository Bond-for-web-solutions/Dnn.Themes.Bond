<dnn:META ID="mobileScale" runat="server" Name="viewport" Content="width=device-width, initial-scale=1.0" />

<!-- Self-hosted MuseoSans web fonts (loaded before skin.css) -->
<dnn:DnnCssInclude runat="server" FilePath="resources/css/fonts.css" Priority="1" PathNameAlias="SkinPath" />

<!-- Native skin stylesheet -->
<dnn:DnnCssInclude runat="server" FilePath="resources/css/skin.css" Priority="2" PathNameAlias="SkinPath" />

<!-- Auth restyle (hides native login + reset-password forms, JS builds a flex card) -->
<dnn:DnnCssInclude runat="server" FilePath="resources/css/login.css" Priority="3" PathNameAlias="SkinPath" />
<dnn:DnnJsInclude runat="server" FilePath="resources/js/login.js" PathNameAlias="SkinPath" />
