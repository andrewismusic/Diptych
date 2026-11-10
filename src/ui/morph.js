/* ---------- morph ---------- */
const morphEl = $('morph');
function updateMorphUI() {
  const m = state.morph;
  morphEl.value = Math.round(m * 1000);
  document.documentElement.style.setProperty('--mix', (m * 100).toFixed(1) + '%');
  const pa = Math.round((1 - m) * 100), pb = 100 - pa;
  morphEl.setAttribute('aria-valuetext', `${pa}% A, ${pb}% B`);
  drawWaves();
}
morphEl.addEventListener('input', () => {
  state.morph = morphEl.value / 1000;
  updateMorphUI();
  DEFS.forEach((d, i) => updateKnob(i));
  if (ready) send({ type:'morph', v: state.morph });
  save();
});
/* ---------- side focus: A | Morph | B (see knobs.js) ---------- */
function setFocus(f) {
  if (f === focus) return;
  if (focus === 'M') focusMem = state.morph;
  focus = f;
  state.morph = f === 'A' ? 0 : f === 'B' ? 1 : focusMem;
  morphEl.disabled = f !== 'M';
  document.body.dataset.sidefocus = f;
  document.querySelectorAll('[data-focus]').forEach(b => b.setAttribute('aria-pressed', b.dataset.focus === f));
  updateMorphUI();
  DEFS.forEach((d, i) => updateKnob(i));
  if (ready) send({ type:'morph', v: state.morph });
  drawLanes();
  if (typeof updateDiceTarget === 'function') updateDiceTarget();
}
// tap A or B to edit only that side; tap it again (or the other) to come back to the morph or switch sides
document.querySelectorAll('[data-focus]').forEach(b => b.addEventListener('click', () => setFocus(focus === b.dataset.focus ? 'M' : b.dataset.focus)));
const savedMorph = () => (focus === 'M' ? state.morph : focusMem);
document.body.dataset.sidefocus = 'M';
