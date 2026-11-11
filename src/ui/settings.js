/* =====================================================================
   SETTINGS (2026-11-10): the cog in the header opens a sheet with the
   theme (Auto, Light, Dark), the colour scheme (the colours of A and B; the
   morph passes between them) and Mono / Poly for the keys. Per browser
   conveniences, kept in localStorage, not part of the patch.
   ===================================================================== */
const SCHEMES = [   // [name, A light, B light, A dark, B dark] (2026-11-11, sixth pass)
  ['Twin Flame', '#1F5FFF', '#E62E9C', '#5B8CFF', '#FF5CC2'],   // a true blue (not violet), and a magenta pink
  ['Ultra', '#0092B5', '#B0102E', '#3FD7F2', '#F23B57'],        // cyan, and ruby
  ['Iris', '#5A3FC4', '#108A55', '#9A86FF', '#3FD68F'],         // iris violet, and leaf green
  ['Seaglass', '#2DB58C', '#E8787A', '#7FF0C4', '#FF9E9B'],     // seafoam, and a coral-tinted pink
  ['Aurora', '#152A6E', '#14B86A', '#3B5BC8', '#4DFFA6'],       // a night-sky blue, and aurora green
  ['Volcano', '#2E2624', '#F01E10', '#7A6964', '#FF3B2B'],      // ember black, and a vivid lava red
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
let bgPref = pref('diptych-bg', 'subtle'), themePref = pref('diptych-theme', 'auto'), schemeIx = Math.max(0, Math.min(SCHEMES.length - 1, +pref('diptych-scheme3', '0') || 0));
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
  document.querySelectorAll('[data-scheme]').forEach(b => { b.setAttribute('aria-pressed', +b.dataset.scheme === schemeIx); const c = SCHEMES[+b.dataset.scheme], d = b.querySelectorAll('.dot'); d[0].style.background = dk ? c[3] : c[1]; d[1].style.background = dk ? c[4] : c[2]; });
  if (typeof glimColor !== 'undefined') glimColor = null;
  drawWaves();
}
$('schemes').innerHTML = SCHEMES.map(([n, a, b], k) => `<button type="button" class="key scheme" data-scheme="${k}" aria-label="${n}"><i class="dot" style="background:${a}"></i><i class="dot" style="background:${b}"></i><span>${n}</span></button>`).join('');
onPill($('themePill'), k => { themePref = ['auto', 'light', 'dark'][k]; setPref('diptych-theme', themePref); applyTheme(); });
document.querySelectorAll('[data-scheme]').forEach(b => b.addEventListener('click', () => { schemeIx = +b.dataset.scheme; setPref('diptych-scheme3', String(schemeIx)); applyTheme(); }));
onPill($('bgPill'), k => { bgPref = k ? 'vivid' : 'subtle'; setPref('diptych-bg', bgPref); applyTheme(); });
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

/* the grid and hexagon layouts (ui/keyboard.js): in key (the scale's notes only) or chromatic (all twelve, the notes in
   the key lit more brightly), and the interval between rows: a third, a fourth (the usual choice) or a fifth */
let kbChrom = pref('diptych-chrom', '0') === '1', kbRow = Math.max(0, Math.min(2, +pref('diptych-row', '1')));
const syncGridPrefs = () => { setPill($('chromPill'), kbChrom ? 1 : 0); setPill($('rowPill'), kbRow); };
onPill($('chromPill'), k => { kbChrom = k === 1; setPref('diptych-chrom', kbChrom ? '1' : '0'); syncGridPrefs(); if (typeof buildKeys === 'function') buildKeys(); });
onPill($('rowPill'), k => { kbRow = k; setPref('diptych-row', String(kbRow)); syncGridPrefs(); if (typeof buildKeys === 'function') buildKeys(); });
syncGridPrefs();
