export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'treelot-theme';

// Runs synchronously in <head> before any paint. Reads the stored preference
// (or system fallback) and stamps `data-theme` on <html> so the first paint
// is already in the right palette — no flash.
export const themeBootScript = `
(function() {
  try {
    var saved = localStorage.getItem('${THEME_STORAGE_KEY}');
    var pref = saved === 'light' || saved === 'dark' ? saved : 'system';
    var resolved = pref === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : pref;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;
