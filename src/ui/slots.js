/* =====================================================================
   SLOTS
   Engine and effect pickers, folding sections, and showing only the
   current type's controls. Types are shared by both sides.
   ===================================================================== */
function updateSlotsUI() {
  for (let s = 0; s < 4; s++) {
    const t = state.oscType[s], sec = sections[`Osc ${s + 1}`];
    sec.querySelector('.typesel').value = t;
    sec.classList.toggle('slotoff', t === 'off');
    sec.querySelectorAll('.eng').forEach(e => { e.hidden = e.dataset.eng === '*' ? t === 'off' : e.dataset.eng !== t; });
    const f = state.fxType[s], fsec = sections[`FX ${s + 1}`];
    fsec.querySelector('.typesel').value = f;
    fsec.querySelectorAll('.eng').forEach(e => { e.hidden = e.dataset.eng !== f; });
  }
  for (const [g, sec] of Object.entries(sections)) {
    const f = !!state.folded[g];
    sec.classList.toggle('folded', f);
    sec.querySelector('.fold').setAttribute('aria-expanded', !f);
  }
}
// Knobs of a type that has just been shown were not kept up to date while hidden
const refreshSlot = (kind, slot) => DEFS.forEach((d, i) => { if (d.kind === kind && d.slot === slot && isActive(d)) updateKnob(i); });

document.addEventListener('change', e => {
  const sel = e.target.closest('.typesel'); if (!sel) return;
  pushUndo();
  if (sel.dataset.osc !== undefined) {
    const s = +sel.dataset.osc; state.oscType[s] = sel.value;
    if (sel.value !== 'wt' && ed.classList.contains('open') && edSlot === s) closeEditor();
    updateSlotsUI(); refreshSlot('osc', s);
  } else {
    const s = +sel.dataset.fxsel; state.fxType[s] = sel.value;
    updateSlotsUI(); refreshSlot('fx', s);
  }
  sendSlots(); drawWaves(); save();
});
document.addEventListener('click', e => {
  const b = e.target.closest('.fold'); if (!b) return;
  const g = b.closest('.group').dataset.group;
  state.folded[g] = !state.folded[g]; if (!state.folded[g]) delete state.folded[g];
  updateSlotsUI(); drawWaves(); save();
});
