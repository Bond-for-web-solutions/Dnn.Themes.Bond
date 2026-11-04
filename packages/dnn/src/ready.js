/**
 * Run `fn` once the DOM is ready AND again after every ASP.NET AJAX partial
 * postback (DNN renders many modules - e.g. login - inside UpdatePanels, which
 * replace their DOM and drop anything we enhanced).
 *
 * @param {() => void} fn idempotent initialiser
 */
export function onDnnReady(fn) {
  const run = () => {
    try {
      fn();
    } catch (err) {
      // Never let a theme enhancement break DNN's own scripts.
      if (typeof console !== 'undefined') console.error('[bond] init failed', err);
    }
  };
  const hookPartialPostbacks = () => {
    const prm = window.Sys && window.Sys.WebForms && window.Sys.WebForms.PageRequestManager;
    if (prm && !hookPartialPostbacks.done) {
      prm.getInstance().add_endRequest(run);
      hookPartialPostbacks.done = true;
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { run(); hookPartialPostbacks(); }, { once: true });
  } else {
    run();
    hookPartialPostbacks();
  }
}

/** True while the page is in DNN edit mode (module editing UI visible). */
export function isDnnEditMode() {
  return document.body.classList.contains('dnnEditState');
}
