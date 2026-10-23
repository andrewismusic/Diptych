/* ---------- undo ---------- */
const undoStack = [];
const cloneTables = () => tables.map(t => ({ A: cloneTable(t.A), B: cloneTable(t.B) }));
function snapshot() {
  return { A: state.A.slice(), B: state.B.slice(), C: state.C.slice(), morph: state.morph, spectral: state.spectral, links: { ...state.links }, linkMem: JSON.parse(JSON.stringify(state.linkMem)),
           oscOn: state.oscOn.slice(), fxOn: state.fxOn.slice(), smp: JSON.parse(JSON.stringify(state.smp)),
           tables: cloneTables(), seq: JSON.parse(JSON.stringify(state.seq)) };
}
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 30) undoStack.shift(); $('undo').disabled = false; }
$('undo').addEventListener('click', () => {
  const s = undoStack.pop(); if (!s) return;
  applyBulk(() => {
    Object.assign(state, { A: s.A, B: s.B, C: s.C, morph: s.morph, spectral: s.spectral, links: s.links, linkMem: s.linkMem,
      oscOn: s.oscOn, fxOn: s.fxOn, smp: s.smp, seq: s.seq });
    s.tables.forEach((t, k) => { tables[k] = t; });
  });
  $('undo').disabled = !undoStack.length;
});
function bulk(fn) { pushUndo(); applyBulk(fn); }
function applyBulk(fn) {
  fn(); analyzeAll(); resolveSamples(); updateIcons(); updateSamplerUI(); updateFxUI(); refreshAll(); updateBlendUI(); seqCache = null; drawLanes();
  if (sq.classList.contains('open')) { syncSeqControls(); drawRoll(); }
  if (ready) { sendAll(); send({ type:'morph', v: state.morph }); }
  if (ed.classList.contains('open')) { edFrame = Math.min(edFrame, tables[edSlot][edSide].frames.length - 1); if (tool === 'harm') loadHarm(); renderStrip(); drawEditor(); }
  save();
}
// Copy covers the sound only: sequences and the Pattern knob stay as they are
const copySound = (from, to) => bulk(() => {
  const ip = IX.pattern, keep = state[to][ip];
  state[to] = state[from].slice(); state[to][ip] = keep;
  tables.forEach(t => { t[to] = cloneTable(t[from]); });
  state.smp[to] = { ...state.smp[from] };
});
$('copyAB').addEventListener('click', () => copySound('A', 'B'));
$('copyBA').addEventListener('click', () => copySound('B', 'A'));
$('swap').addEventListener('click', () => bulk(() => {
  let t = state.A; state.A = state.B; state.B = t; state.C = state.C.map(c => -c);
  tables.forEach(p => { const x = p.A; p.A = p.B; p.B = x; });
  t = state.smp.A; state.smp.A = state.smp.B; state.smp.B = t;
  t = state.seq.A; state.seq.A = state.seq.B; state.seq.B = t;
}));
$('resetAll').addEventListener('click', () => bulk(() => {
  state.A = DEFS.map((_, i) => defaultNorm('A', i)); state.B = DEFS.map((_, i) => defaultNorm('B', i)); state.C = DEFS.map(() => 0);
  state.spectral = true; state.links = DEFAULT_LINKS(); state.linkMem = {};
  state.oscOn = [true, true, true, true]; state.fxOn = DEFAULT_FXON(); state.smp = DEFAULT_SMP();
  DEFAULT_TABLES().forEach((t, k) => { tables[k] = t; });
  state.seq = defaultSeqs();
}));
