<%@ Control AutoEventWireup="false" Explicit="True" Inherits="DotNetNuke.UI.Containers.Container" %>
<%@ Register TagPrefix="dnn" TagName="TITLE" Src="~/Admin/Containers/Title.ascx" %>
<section class="__PREFIX__-box">
    <h2 class="__PREFIX__-box__title"><dnn:TITLE runat="server" id="dnnTITLE" CssClass="__PREFIX__-box__title-text" /></h2>
    <div id="ContentPane" class="__PREFIX__-box__body" runat="server"></div>
</section>
