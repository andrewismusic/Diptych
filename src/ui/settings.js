/* =====================================================================
   SETTINGS (2026-11-10): the cog in the header opens a sheet with the
   theme (Auto, Light, Dark), the colour scheme (the colours of A and B; the
   morph passes between them) and Mono / Poly for the keys. Per browser
   conveniences, kept in localStorage, not part of the patch.
   ===================================================================== */
const SCHEMES = [   // [name, A light, B light, A dark, B dark] (2026-11-11: blue & pink, ruby & cyan, indigo & emerald, aquamarine & baby pink, sky & coral)
  ['Twin Flame', '#4F6FE0', '#E3308F', '#7F9BFF', '#FF5AAE'],
  ['Garnet Tide', '#C2183F', '#0092B5', '#FF4D73', '#3FD7F2'],
  ['Night Garden', '#4B3FC4', '#108A55', '#8C80FF', '#3FD68F'],
  ['Sea Glass Blush', '#14A386', '#DE6A9E', '#5FE3C6', '#FFB3D1'],
  ['Harbour Dusk', '#0E8FC2', '#E0503A', '#53C6F2', '#FF7F66'],
];
/* the cog, drawn evenly: eight identical teeth around a ring, and the hole in the middle */
const COG = (() => {
  const P = (r, a) => `${(12 + r * Math.sin(a)).toFixed(2)} ${(12 - r * Math.cos(a)).toFixed(2)}`, n = 8, st = 2 * Math.PI / n, ro = 10.2, ri = 7.6;
  let d = '';
  for (let k = 0; k < n; k++) {
    const c = k * st;
    d += `${k ? 'L' : 'M'}${P(ri, c - st / 2 + 0.06)} L${P(ri, c - 0.36)} L${P(ro, c - 0.2)} L${P(ro, c + 0.2)} L${P(ri, c + 0.36)} `;
  }
  return `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="${d}Z"/><circle cx="12" cy="12" r="3.1"/></svg>`;
})();
$('setBtn').innerHTML = COG;
const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
let bgPref = pref('diptych-bg', 'subtle'), themePref = pref('diptych-theme', 'auto'), schemeIx = Math.max(0, Math.min(SCHEMES.length - 1, +pref('diptych-scheme2', '0') || 0));
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (themePref === 'auto' ? darkMQ.matches : themePref === 'dark');
function applyTheme() {
  const root = document.documentElement;
  if (themePref === 'auto') delete root.dataset.theme; else root.dataset.theme = themePref;
  const sc = SCHEMES[schemeIx], dk = isDark();
  root.style.setProperty('--a', dk ? sc[3] : sc[1]); root.style.setProperty('--b', dk ? sc[4] : sc[2]);
  setPill($('themePill'), ['auto', 'light', 'dark'].indexOf(themePref));
  document.body.classList.toggle('vivid', bgPref === 'vivid');
  setPill($('bgPill'), bgPref === 'vivid' ? 1 : 0);
  document.querySelectorAll('[data-scheme]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.scheme === schemeIx));
  if (typeof glimColor !== 'undefined') glimColor = null;
  drawWaves();
}
$('schemes').innerHTML = SCHEMES.map(([n, a, b], k) => `<button type="button" class="key scheme" data-scheme="${k}" aria-label="${n}"><i style="background:linear-gradient(90deg,${a},${b})"></i><span>${n}</span></button>`).join('');
$('themePill').addEventListener('click', () => { themePref = ['light', 'dark', 'auto'][['auto', 'light', 'dark'].indexOf(themePref)]; setPref('diptych-theme', themePref); applyTheme(); });   // Auto, Light, Dark in turn
document.querySelectorAll('[data-scheme]').forEach(b => b.addEventListener('click', () => { schemeIx = +b.dataset.scheme; setPref('diptych-scheme2', String(schemeIx)); applyTheme(); }));
$('bgPill').addEventListener('click', () => { bgPref = bgPref === 'vivid' ? 'subtle' : 'vivid'; setPref('diptych-bg', bgPref); applyTheme(); });
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
  const b = e.target.closest('button, .key'); if (!b || b.disabled || b.closest('.knob, .dicetrack, .morph-slider') || b.classList.contains('lock') || b.classList.contains('gname')) return;
  b.classList.add('down'); const t0 = performance.now();
  const up = () => { document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); setTimeout(() => b.classList.remove('down'), Math.max(0, 90 - (performance.now() - t0))); };
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
}, true);
