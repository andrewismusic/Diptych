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
  DEFS.forEach((d, i) => { if (isActive(d)) updateKnob(i); });
  if (ready) send({ type:'morph', v: state.morph });
  save();
});
