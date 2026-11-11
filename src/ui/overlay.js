/* =====================================================================
   BASIC VIEW AND SECTION OVERLAYS
   Basic view: every section shows its key controls (BASIC in knobs.js) in a
   fixed place. Tapping a section's name opens all its controls in an overlay
   on top of the page (the section keeps its size underneath, so nothing
   moves); the bottom panel stays playable. Full view shows everything, as
   before. The choice is a per-browser convenience, not part of the patch.
   ===================================================================== */
const ovlBack = document.createElement('div');
ovlBack.className = 'ovlback'; ovlBack.hidden = true;
document.body.appendChild(ovlBack);
let ovlOpen = null;
// each section's name says how many more controls its overlay holds
for (const sec of Object.values(sections)) {
  const n = sec.querySelectorAll('.kn.adv, .adv .kn, .swrow.adv').length;
  sec.querySelector('.more').textContent = n ? `+${n}` : '';
  if (!n) sec.querySelector('.gname').disabled = true;
  sec.querySelector('h2').insertAdjacentHTML('beforeend', '<button type="button" class="gdone">Done</button>');
}
function openOverlay(sec) {
  if (ovlOpen) closeOverlay();
  sec.style.minHeight = sec.getBoundingClientRect().height / (parseFloat($('app').style.zoom) || 1) + 'px';   // keep its place
  sec.classList.add('open'); ovlBack.hidden = false; ovlOpen = sec;
  sec.querySelector('.gname').setAttribute('aria-expanded', 'true');
  DEFS.forEach((d, i) => { if (d.group === sec.dataset.group) updateKnob(i); });
  drawWaves();
  sec.querySelector('.gdone').focus({ preventScroll: true });
}
function closeOverlay() {
  const sec = ovlOpen; if (!sec) return;
  sec.classList.remove('open'); sec.style.minHeight = ''; ovlBack.hidden = true; ovlOpen = null;
  sec.querySelector('.gname').setAttribute('aria-expanded', 'false');
  drawWaves();
}
document.addEventListener('click', e => {
  const name = e.target.closest('.gname');
  if (name && !document.body.classList.contains('full')) { const sec = name.closest('.group'); if (sec === ovlOpen) closeOverlay(); else openOverlay(sec); return; }
  if (e.target.closest('.gdone') || e.target === ovlBack) closeOverlay();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ovlOpen) closeOverlay(); });

/* The player's view (2026-11-06, owner: "too much to offer the full parameter view; the synth is based on chance and
   randomness"): only the Sound card (the four macros) and the Sequence card, plus the bottom panel. Every other section
   is hidden. The developer view (open the page with ?dev, remembered until ?dev=0) shows everything, with the Basic and
   Full views, for tuning the engines and the randomizer. */
let devView = false;
try {
  const q = new URLSearchParams(location.search).get('dev');
  if (q !== null) localStorage.setItem('diptych-dev', q === '0' ? '0' : '1');
  devView = localStorage.getItem('diptych-dev') === '1';
} catch (e) { devView = /[?&]dev(=1)?(&|$)/.test(location.search); }
document.body.classList.toggle('dev', devView);
let fullView = false;
try { fullView = localStorage.getItem('diptych-view') === 'full'; } catch (e) {}
function setView(full) {
  closeOverlay();
  fullView = full; document.body.classList.toggle('full', full);
  setPill($('viewPill'), full ? 1 : 0);
  try { localStorage.setItem('diptych-view', full ? 'full' : 'basic'); } catch (e) {}
  if (typeof applyLayout === 'function') applyLayout();
}
onPill($('viewPill'), k => setView(k === 1));
document.body.classList.toggle('full', fullView && devView);
setPill($('viewPill'), fullView ? 1 : 0);
