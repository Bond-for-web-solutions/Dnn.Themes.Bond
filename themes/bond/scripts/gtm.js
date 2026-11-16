// Google Tag Manager, started late (performance: GTM + GA4 + the consent
// banner it loads cost 0.3-0.5 s main-thread time on phones). It starts at the
// visitor's first interaction (scroll, pointer, key, touch) or at the latest
// 4 s after the load event, whichever comes first (decided with Bond,
// 12-11-2026). Trade-off: a visitor who leaves within ~4 s without
// interacting is not counted; the cookie banner appears at that moment.
// The script URL comes from the header (data-bond-gtm, from Bond.resx
// "Analytics.GtmScript"): site configuration, so no remote host in the theme.
// Absent for administrators. If a GTM container is already on the page (DNN's
// GTM connector still switched on), do nothing: never load it twice.
const DELAY_AFTER_LOAD_MS = 4000;
const INTERACTIONS = ['scroll', 'pointerdown', 'keydown', 'touchstart'];

export function initGtm() {
  const src = document.querySelector('[data-bond-gtm]')?.dataset.bondGtm;
  if (!src) return;
  let url;
  try { url = new URL(src); } catch { return; }
  if (url.protocol !== 'https:') return;

  let started = false;
  let timer = 0;
  const start = () => {
    if (started) return;
    started = true;
    window.clearTimeout(timer);
    for (const type of INTERACTIONS) window.removeEventListener(type, start, { passive: true });
    const loaded = [...document.scripts].some((s) => s.src && s.src.includes(url.host) && new URL(s.src).pathname === url.pathname);
    if (loaded || window.google_tag_manager) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = document.createElement('script');
    script.async = true;
    script.src = url.href;
    document.head.append(script);
  };

  for (const type of INTERACTIONS) window.addEventListener(type, start, { once: true, passive: true });
  const afterLoad = () => { timer = window.setTimeout(start, DELAY_AFTER_LOAD_MS); };
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
}
