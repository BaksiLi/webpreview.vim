// Loaded as a blocking script so the chosen theme applies before first paint.
// System follows the browser. Light and Dark persist in one host cookie, which,
// unlike localStorage, every reader shares even though each session has its own port.
(() => {
  const root = document.documentElement, system = matchMedia('(prefers-color-scheme: dark)');
  const choice = () => document.cookie.match(/(?:^|; )webpreview-theme=(light|dark)(?:;|$)/)?.[1] || 'system';
  function apply(chosen = choice()) {
    root.dataset.theme = chosen === 'system' ? (system.matches ? 'dark' : 'light') : chosen;
    for (const button of document.querySelectorAll('[data-theme-choice]')) {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === chosen));
    }
  }
  apply();
  system.addEventListener('change', () => apply());
  // Another reader may have changed the choice while this tab was hidden or unfocused.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
  addEventListener('focus', () => apply());
  document.addEventListener('DOMContentLoaded', () => apply());
  document.addEventListener('click', event => {
    const chosen = event.target.closest?.('[data-theme-choice]')?.dataset.themeChoice;
    if (!chosen) return;
    document.cookie = `webpreview-theme=${chosen}; Path=/; SameSite=Strict; Max-Age=${chosen === 'system' ? 0 : 31536000}`;
    apply(chosen);
  });
})();
