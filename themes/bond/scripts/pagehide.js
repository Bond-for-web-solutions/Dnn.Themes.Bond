// DNN.Themes.Bond - early head script (-> resources/js/pagehide.js).
// DNN core puts ASP.NET AJAX (MicrosoftAjax.js) on every page, and it listens
// to window "unload". Chrome deprecates unload (Lighthouse Best Practices:
// "Uses deprecated APIs"); it also keeps pages out of the back/forward cache.
// This must run before DNN's ScriptResource.axd files, so it is the one script
// in <head> (DnnPageHeaderProvider). It routes unload listeners to "pagehide".
//
// Same behaviour as before: unload used to keep every page out of the
// back/forward cache, so a page that comes back from that cache with ASP.NET
// AJAX on it (disposed by pagehide) is reloaded instead of shown half-dead.
const add = window.addEventListener;
const remove = window.removeEventListener;
const route = (type) => (type === 'unload' ? 'pagehide' : type);

window.addEventListener = function addEventListener(type, ...rest) {
  return add.call(this, route(type), ...rest);
};
window.removeEventListener = function removeEventListener(type, ...rest) {
  return remove.call(this, route(type), ...rest);
};

add.call(window, 'pageshow', (event) => {
  if (event.persisted && window.Sys && window.Sys.Application) window.location.reload();
});
