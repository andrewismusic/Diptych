/* =====================================================================
   SLOTS
   Engine and effect pickers, fixed slot heights, and showing only the
   current type's controls. Types are shared by both sides.
   ===================================================================== */
// which type containers a slot of type t shows: its own, plus '*' (Level, Pan, Bypass) on any oscillator that isn't Off
const engShown = (eng, t) => eng === t || (eng === '*' && t !== 'off');
function updateSlotsUI() {
  for (let s = 0; s < 4; s++) {
    const t = state.oscType[s], sec = sections[`Osc ${s + 1}`];
    sec.querySelector('.typesel').value = t;
    sec.dataset.type = t;
    sec.classList.toggle('slotoff', t === 'off');
    sec.querySelectorAll('.eng').forEach(e => { e.hidden = !engShown(e.dataset.eng, t); });
    sec.querySelectorAll('.wtcard[data-wt]').forEach(b => { b.disabled = t !== 'wt'; });
    const f = state.fxType[s], fsec = sections[`FX ${s + 1}`];
    fsec.querySelector('.typesel').value = f;
    fsec.querySelectorAll('.eng').forEach(e => { e.hidden = e.dataset.eng !== f; });
  }
}
/* Slots sit in fixed positions: each slot's body is as tall as the largest type it can hold, measured on the
   page (so it follows the screen width), and switching type never moves anything below it. */
function fixSlotHeights() {
  DEFS.forEach((d, i) => { if (d.kind) updateKnob(i); });   // hidden types' knobs need their text to measure true
  for (const sec of Object.values(sections)) {
    const kind = sec.dataset.kind; if (kind !== 'osc' && kind !== 'fx') continue;
    const body = sec.querySelector('.gbody'), engs = [...body.querySelectorAll('.eng')], was = engs.map(e => e.hidden);
    body.style.minHeight = '';
    let max = 0;
    for (const [t] of kind === 'osc' ? OSC_TYPES : FX_TYPES) {
      engs.forEach(e => { e.hidden = kind === 'osc' ? !engShown(e.dataset.eng, t) : e.dataset.eng !== t; });
      max = Math.max(max, body.offsetHeight);
    }
    engs.forEach((e, k) => { e.hidden = was[k]; });
    body.style.minHeight = max + 'px';
  }
}
let fixTimer = null;
window.addEventListener('resize', () => { clearTimeout(fixTimer); fixTimer = setTimeout(fixSlotHeights, 150); });
if (document.fonts) document.fonts.ready.then(fixSlotHeights);
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
