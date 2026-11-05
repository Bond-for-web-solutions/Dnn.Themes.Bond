<%@ Control AutoEventWireup="false" Explicit="True" Inherits="DotNetNuke.UI.Containers.Container" %>
<%@ Register TagPrefix="dnn" TagName="TITLE" Src="~/Admin/Containers/Title.ascx" %>
<section class="dzp-box">
    <h2 class="dzp-box__title"><dnn:TITLE runat="server" id="dnnTITLE" CssClass="dzp-box__title-text" /></h2>
    <div id="ContentPane" class="dzp-box__body" runat="server"></div>
</section>
