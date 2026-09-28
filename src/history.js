/* ---------- undo ---------- */
const undoStack = [];
function snapshot() {
  return { A: state.A.slice(), B: state.B.slice(), C: state.C.slice(), morph: state.morph, spectral: state.spectral, links: { ...state.links }, linkMem: JSON.parse(JSON.stringify(state.linkMem)),
           tA: cloneTable(tables.A), tB: cloneTable(tables.B), seq: JSON.parse(JSON.stringify(state.seq)) };
}
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 30) undoStack.shift(); $('undo').disabled = false; }
$('undo').addEventListener('click', () => {
  const s = undoStack.pop(); if (!s) return;
  applyBulk(() => { Object.assign(state, { A: s.A, B: s.B, C: s.C, morph: s.morph, spectral: s.spectral, links: s.links, linkMem: s.linkMem }); updateIcons(); tables.A = s.tA; tables.B = s.tB; state.seq = s.seq; });
  $('undo').disabled = !undoStack.length;
});
function bulk(fn) { pushUndo(); applyBulk(fn); }
function applyBulk(fn) {
  fn(); analyzeTable('A'); analyzeTable('B'); refreshAll(); updateBlendUI(); seqCache = null; drawLanes();
  if (sq.classList.contains('open')) { syncSeqControls(); drawRoll(); }
  if (ready) { sendAll(); send({ type:'morph', v: state.morph }); }
  if (ed.classList.contains('open')) { edFrame = Math.min(edFrame, tables[edSide].frames.length - 1); if (tool === 'harm') loadHarm(); renderStrip(); drawEditor(); }
  save();
}
// Copy covers the sound only: sequences and the Pattern knob stay as they are
const copySound = (from, to) => bulk(() => {
  const ip = IX.pattern, keep = state[to][ip];
  state[to] = state[from].slice(); state[to][ip] = keep;
  tables[to] = cloneTable(tables[from]);
});
$('copyAB').addEventListener('click', () => copySound('A', 'B'));
$('copyBA').addEventListener('click', () => copySound('B', 'A'));
$('swap').addEventListener('click', () => bulk(() => {
  let t = state.A; state.A = state.B; state.B = t; state.C = state.C.map(c => -c);
  t = tables.A; tables.A = tables.B; tables.B = t;
  t = state.seq.A; state.seq.A = state.seq.B; state.seq.B = t;
}));
$('resetAll').addEventListener('click', () => bulk(() => {
  state.A = DEFS.map((_, i) => defaultNorm('A', i)); state.B = DEFS.map((_, i) => defaultNorm('B', i)); state.C = DEFS.map(() => 0);
  state.spectral = true; state.links = { octave: true, fine: true, ottdepth: true, ottout: true }; updateIcons(); tables.A = makeTable('Basic shapes'); tables.B = makeTable('Vowel formants');
  state.seq = defaultSeqs();
}));

