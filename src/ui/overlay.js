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

let fullView = false;
try { fullView = localStorage.getItem('diptych-view') === 'full'; } catch (e) {}
function setView(full) {
  closeOverlay();
  fullView = full; document.body.classList.toggle('full', full);
  $('viewBasic').setAttribute('aria-pressed', !full); $('viewFull').setAttribute('aria-pressed', full);
  try { localStorage.setItem('diptych-view', full ? 'full' : 'basic'); } catch (e) {}
  if (typeof applyLayout === 'function') applyLayout();
}
$('viewBasic').addEventListener('click', () => setView(false));
$('viewFull').addEventListener('click', () => setView(true));
document.body.classList.toggle('full', fullView);
$('viewBasic').setAttribute('aria-pressed', !fullView); $('viewFull').setAttribute('aria-pressed', fullView);
