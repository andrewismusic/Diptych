/* =====================================================================
   SETTINGS (2026-11-10): the cog in the header opens a sheet with the
   theme (Auto, Light, Dark), the colour scheme (the colours of A and B; the
   morph passes between them) and Mono / Poly for the keys. Per browser
   conveniences, kept in localStorage, not part of the patch.
   ===================================================================== */
const SCHEMES = [   // [name, A light, B light, A dark, B dark]
  ['Blue & pink', '#4F6FE0', '#E3308F', '#7F9BFF', '#FF5AAE'],
  ['Teal & amber', '#11907D', '#D7861A', '#3DD9B8', '#FFAA3D'],
  ['Violet & lime', '#7C5CE6', '#5E9410', '#A98BFF', '#B5E048'],
  ['Sky & coral', '#0E8FC2', '#E0503A', '#53C6F2', '#FF7F66'],
  ['Ink & rose', '#3B4A6B', '#C2416B', '#9DB0D8', '#FF8FB4'],
];
const COG = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
$('setBtn').innerHTML = COG;
const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
let themePref = pref('diptych-theme', 'auto'), schemeIx = Math.max(0, Math.min(SCHEMES.length - 1, +pref('diptych-scheme', '0') || 0));
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (themePref === 'auto' ? darkMQ.matches : themePref === 'dark');
function applyTheme() {
  const root = document.documentElement;
  if (themePref === 'auto') delete root.dataset.theme; else root.dataset.theme = themePref;
  const sc = SCHEMES[schemeIx], dk = isDark();
  root.style.setProperty('--a', dk ? sc[3] : sc[1]); root.style.setProperty('--b', dk ? sc[4] : sc[2]);
  document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', b.dataset.themeSet === themePref));
  document.querySelectorAll('[data-scheme]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.scheme === schemeIx));
  if (typeof glimColor !== 'undefined') glimColor = null;
  drawWaves();
}
$('schemes').innerHTML = SCHEMES.map(([n, a, b], k) => `<button type="button" class="key scheme" data-scheme="${k}" aria-label="${n}"><i style="background:linear-gradient(90deg,${a},${b})"></i><span>${n}</span></button>`).join('');
document.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => { themePref = b.dataset.themeSet; setPref('diptych-theme', themePref); applyTheme(); }));
document.querySelectorAll('[data-scheme]').forEach(b => b.addEventListener('click', () => { schemeIx = +b.dataset.scheme; setPref('diptych-scheme', String(schemeIx)); applyTheme(); }));
darkMQ.addEventListener('change', applyTheme);
applyTheme();
const openSettings = () => { $('settings').hidden = false; $('setDone').focus({ preventScroll: true }); };
const closeSettings = () => { $('settings').hidden = true; $('setBtn').focus({ preventScroll: true }); };
$('setBtn').addEventListener('click', openSettings);
$('setDone').addEventListener('click', closeSettings);
$('settings').addEventListener('click', e => { if (e.target === $('settings')) closeSettings(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('settings').hidden) closeSettings(); });
