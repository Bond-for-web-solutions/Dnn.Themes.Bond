// Dashboard layout only (included by dashboard.ascx; never loaded elsewhere).
import { onDnnReady } from '@bond/dnn/ready.js';

onDnnReady(() => {
  const root = document.querySelector('[data-dzp-dashboard]');
  const toggle = root && root.querySelector('[data-dzp-sidebar-toggle]');
  if (!toggle || toggle.dataset.dzpReady) return;
  toggle.dataset.dzpReady = 'true';
  toggle.addEventListener('click', () => {
    const collapsed = root.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });
});
