/* ---------- undo ---------- */
const undoStack = [];
const cloneTables = () => tables.map(t => ({ A: cloneTable(t.A), B: cloneTable(t.B) }));
function snapshot() {
  return { A: state.A.slice(), B: state.B.slice(), C: state.C.slice(), morph: state.morph, spectral: state.spectral, links: { ...state.links }, linkMem: JSON.parse(JSON.stringify(state.linkMem)),
           oscType: state.oscType.slice(), fxType: state.fxType.slice(), fxOn: state.fxOn.slice(), dlSpill: state.dlSpill.slice(),
           tables: cloneTables(), seq: JSON.parse(JSON.stringify(state.seq)) };
}
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 30) undoStack.shift(); $('undo').disabled = false; }
$('undo').addEventListener('click', () => {
  const s = undoStack.pop(); if (!s) return;
  applyBulk(() => {
    Object.assign(state, { A: s.A, B: s.B, C: s.C, morph: s.morph, spectral: s.spectral, links: s.links, linkMem: s.linkMem,
      oscType: s.oscType, fxType: s.fxType, fxOn: s.fxOn, dlSpill: s.dlSpill, seq: s.seq });
    s.tables.forEach((t, k) => { tables[k] = t; });
  });
  $('undo').disabled = !undoStack.length;
});
function bulk(fn) { pushUndo(); applyBulk(fn); }
function applyBulk(fn) {
  fn(); analyzeAll(); updateIcons(); updateSlotsUI(); refreshAll(); updateBlendUI(); seqCache = null; drawLanes();
  if (sq.classList.contains('open')) { syncSeqControls(); drawRoll(); }
  if (ready) { sendAll(); send({ type:'morph', v: state.morph }); }
  if (ed.classList.contains('open')) {
    if (state.oscType[edSlot] !== 'wt') closeEditor();
    else { edFrame = Math.min(edFrame, tables[edSlot][edSide].frames.length - 1); if (tool === 'harm') loadHarm(); renderStrip(); drawEditor(); }
  }
  save();
}
// Copy covers the sound only: sequences and the Pattern knob stay as they are (slot types are shared anyway)
const copySound = (from, to) => bulk(() => {
  const ip = IX.pattern, keep = state[to][ip];
  state[to] = state[from].slice(); state[to][ip] = keep;
  tables.forEach(t => { t[to] = cloneTable(t[from]); });
});
$('copyAB').addEventListener('click', () => copySound('A', 'B'));
$('copyBA').addEventListener('click', () => copySound('B', 'A'));
$('swap').addEventListener('click', () => bulk(() => {
  let t = state.A; state.A = state.B; state.B = t; state.C = state.C.map(c => -c);
  tables.forEach(p => { const x = p.A; p.A = p.B; p.B = x; });
  t = state.seq.A; state.seq.A = state.seq.B; state.seq.B = t;
}));
$('resetAll').addEventListener('click', () => bulk(() => {
  state.A = DEFS.map((_, i) => defaultNorm('A', i)); state.B = DEFS.map((_, i) => defaultNorm('B', i)); state.C = DEFS.map(() => 0);
  state.spectral = true; state.links = DEFAULT_LINKS(); state.linkMem = {};
  state.oscType = DEFAULT_OSC(); state.fxType = DEFAULT_FX(); state.fxOn = [true, true, true, true]; state.dlSpill = [false, false, false, false];
  DEFAULT_TABLES().forEach((t, k) => { tables[k] = t; });
  state.seq = defaultSeqs();
}));
