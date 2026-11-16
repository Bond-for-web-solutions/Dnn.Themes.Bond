// Scroll-in micro-animations (huisstijl 2027) for elements marked
// data-bond-reveal, e.g. section blocks and cards in 2sxc views.
// Each element fades up once, when it enters the viewport. Without JS, with
// prefers-reduced-motion or without IntersectionObserver nothing is hidden:
// the hidden start state only applies under body.bond-reveal-aan, which this
// script sets. Content that arrives later (2sxc, paging) is picked up by a
// MutationObserver. Idempotent: safe to call more than once.
const SELECTOR = '[data-bond-reveal]';

export function initReveal() {
  const body = document.body;
  if (!body || body.classList.contains('bond-reveal-aan')) return;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-zichtbaar');
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });

  const watch = () => {
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (el.dataset.bondRevealWatched) continue;
      el.dataset.bondRevealWatched = 'true';
      io.observe(el);
    }
  };

  body.classList.add('bond-reveal-aan');
  watch();

  let frame = 0;
  new MutationObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; watch(); });
  }).observe(body, { childList: true, subtree: true });
}
