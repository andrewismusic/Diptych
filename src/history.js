/* ---------- undo ---------- */
const undoStack = [];
const cloneTables = () => tables.map(t => ({ A: cloneTable(t.A), B: cloneTable(t.B) }));
function snapshot() {
  return { A: state.A.slice(), B: state.B.slice(), C: state.C.slice(), morph: typeof savedMorph === 'function' ? savedMorph() : state.morph, spectral: state.spectral, links: { ...state.links }, linkMem: JSON.parse(JSON.stringify(state.linkMem)),
           oscOn: state.oscOn.slice(), fxOn: state.fxOn.slice(), smp: JSON.parse(JSON.stringify(state.smp)),
           tables: cloneTables(), seq: JSON.parse(JSON.stringify(state.seq)) };
}
/* Undo and redo (30 levels). Everything that changes the sound or the sequences pushes a step: randomizing, knob
   gestures (one step per drag), sequence edits. A new change clears the redo list. */
const redoStack = [];
const ICON_UNDO = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 4.5 4 8l3.5 3.5"/><path d="M4.5 8H12a4 4 0 0 1 0 8H8.5"/></svg>';
const ICON_REDO = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 4.5 16 8l-3.5 3.5"/><path d="M15.5 8H8a4 4 0 0 0 0 8h3.5"/></svg>';
$('undo').innerHTML = ICON_UNDO; $('redo').innerHTML = ICON_REDO;
const updateUndoUI = () => { $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length; };
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 30) undoStack.shift(); redoStack.length = 0; updateUndoUI(); }
function restore(s) {
  applyBulk(() => {
    Object.assign(state, { A: s.A, B: s.B, C: s.C, morph: s.morph, spectral: s.spectral, links: s.links, linkMem: s.linkMem,
      oscOn: s.oscOn, fxOn: s.fxOn, smp: s.smp, seq: s.seq });
    s.tables.forEach((t, k) => { tables[k] = t; });
    if (typeof focus !== 'undefined' && focus !== 'M') { focusMem = s.morph; state.morph = focus === 'A' ? 0 : 1; }   // side focus keeps its side
  });
}
$('undo').addEventListener('click', () => { const s = undoStack.pop(); if (!s) return; redoStack.push(snapshot()); restore(s); updateUndoUI(); });
document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.target.closest('input,select,textarea')) return;
  e.preventDefault(); $(e.shiftKey ? 'redo' : 'undo').click();
});
$('redo').addEventListener('click', () => { const s = redoStack.pop(); if (!s) return; undoStack.push(snapshot()); restore(s); updateUndoUI(); });
function bulk(fn) { pushUndo(); applyBulk(fn); }
function applyBulk(fn) {
  fn(); syncPair(); analyzeAll(); resolveSamples(); updateIcons(); updateSamplerUI(); updateFxUI(); refreshAll(); updateBlendUI(); seqCache = null; drawLanes(); syncScaleUI();
  if (sq.classList.contains('open')) { syncSeqControls(); drawRoll(); }
  if (ready) { sendAll(); send({ type:'morph', v: state.morph }); }
  if (ed.classList.contains('open')) { edFrame = Math.min(edFrame, tables[edSlot][edSide].frames.length - 1); if (tool === 'harm') loadHarm(); renderStrip(); drawEditor(); }
  save();
}
// Reset the patch to its defaults (used by the developer view and tests; the player's view has no Reset since 2026-11-10)
function resetPatch() {
  bulk(() => {
    state.A = DEFS.map((_, i) => defaultNorm('A', i)); state.B = DEFS.map((_, i) => defaultNorm('B', i)); state.C = DEFS.map(() => 0);
    state.spectral = true; state.links = DEFAULT_LINKS(); state.linkMem = {};
    state.oscOn = DEFAULT_OSCON(); state.fxOn = DEFAULT_FXON(); state.smp = DEFAULT_SMP();
    DEFAULT_TABLES().forEach((t, k) => { tables[k] = t; });
    state.seq = defaultSeqs();
  });
}
/* Capture (hold MORPH and tap A or B, 2026-11-11; it was Set A / Set B, 2026-11-10, DESIGN.md section 15 "capture the midpoint"): what you hear at the current morph becomes
   side A (or B). Every morphing value takes the value heard now (Wave included, so a side can hold a blend of the two
   tables); each side's own settings (table positions, the sequencer's) and the Pattern knob stay. The morph then moves to
   that end, so the sound doesn't change: the sweet spot is now the slider's destination. */
function captureSound(side, noUndo) {
  (noUndo ? applyBulk : bulk)(() => {
    const heard = DEFS.map((d, i) => resolveNorm(i));
    DEFS.forEach((d, i) => { if (!d.single && !d.seq && !d.pair && d.group !== 'Sequencer' && !isLinked(i)) state[side][i] = heard[i]; });
    if (focus === 'M') state.morph = side === 'A' ? 0 : 1;
  });
}
