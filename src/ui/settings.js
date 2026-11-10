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
const COG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M10.3 2.8h3.4l.5 2.6 1.6.9 2.5-.9 1.7 2.9-2 1.8v1.8l2 1.8-1.7 2.9-2.5-.9-1.6.9-.5 2.6h-3.4l-.5-2.6-1.6-.9-2.5.9-1.7-2.9 2-1.8v-1.8l-2-1.8 1.7-2.9 2.5.9 1.6-.9z"/><circle cx="12" cy="12" r="3"/></svg>';   // Pixy's
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

/* Touchy's press: a key sinks into its side on pointerdown and stays down for at least 90 ms, so a quick tap still shows */
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('button, .key'); if (!b || b.disabled || b.closest('.knob, .dicetrack') || b.classList.contains('lock') || b.classList.contains('gname')) return;
  b.classList.add('down'); const t0 = performance.now();
  const up = () => { document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); setTimeout(() => b.classList.remove('down'), Math.max(0, 90 - (performance.now() - t0))); };
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
}, true);
