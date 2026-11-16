// Mobile menu toggle for menus/header/HeaderMenu.cshtml (replaces Bond 1.0's
// inline onclick + inline <script>, which a strict CSP would block).
const DESKTOP = '(min-width: 1200px)'; // keep in sync with --bond-nav-wide in styles/header.css

// Compact header: once the page has scrolled a little, the sticky bar gets
// .bond-header--compact (lower, smaller wordmark, soft shadow; styles/header.css).
// Passive listener, at most one class toggle per frame; idempotent.
const COMPACT_FROM = 40; // px scrolled

export function initCompactHeader() {
  const header = document.querySelector('.bond-header');
  if (!header || header.dataset.bondCompactReady) return;
  header.dataset.bondCompactReady = 'true';

  let frame = 0;
  const update = () => {
    frame = 0;
    header.classList.toggle('bond-header--compact', window.scrollY > COMPACT_FROM);
  };
  window.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(update);
  }, { passive: true });
  update();
}

export function initHeader() {
  const button = document.querySelector('[data-bond-menu-toggle]');
  if (!button || button.dataset.bondReady) return;
  const menu = document.getElementById(button.getAttribute('aria-controls') || '');
  if (!menu) return;
  button.dataset.bondReady = 'true';

  const setOpen = (open) => {
    button.classList.toggle('is-open', open);
    menu.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
  };

  button.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));

  // Close when the viewport grows to desktop (the menu is hidden there anyway).
  window.matchMedia(DESKTOP).addEventListener('change', (e) => { if (e.matches) setOpen(false); });

  // Escape closes the menu and returns focus to the toggle.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) {
      setOpen(false);
      button.focus();
    }
  });
}
