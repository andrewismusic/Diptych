/* =====================================================================
   DICE SLIDERS (Orbital's dice, standing up; 2026-11-11 in each panel)
   Every panel has three: A, B and Both (built in ui/panels.js). Touch a
   track and let go: the higher, the bigger the change (the die sits under
   your finger and rolls as it travels over a yellow fill, then springs
   home). As in Orbital, each value moves 0.35 + 0.65 x strength of the way
   toward a fresh roll, so the top is a whole new roll of that part. Keys:
   Enter or Space rolls at 50%, 1 to 9 at 10% to 90%, 0 at 100%.
   ===================================================================== */
/* Each panel's dice roll only its part (2026-11-11): Sound (the wave, filter, voice, oscillators, Brightness), Envelope
   (both envelopes and the Envelope macro), FX (the seven effects, FX intensity and FX wet). The shaped randomizer runs
   as before for the target side(s), everything outside the part goes back to where it was, then every value in the part
   moves only `amt` of the way toward the new roll (stepped values round, switches flip with chance amt; on Sound each
   wavetable is replaced with chance amt). On Sound the guards (level match, sine and loudness guards) run again. */
const AMP_KEYS = new Set(['aatk', 'adec', 'asus', 'arel', 'menv']);
const FILT_KEYS = new Set(['cutoff', 'reso', 'mode', 'envamt', 'keytrack', 'fatk', 'fdec', 'fsus', 'frel']);
const isFxD = d => d.kind === 'fx' || d.key === 'mfx' || d.key === 'mwet', isSeqD = d => !!d.seq || d.group === 'Sequencer';
const PART = {
  amp: d => AMP_KEYS.has(d.key),
  filt: d => FILT_KEYS.has(d.key),
  fx: isFxD,
  synth: d => !AMP_KEYS.has(d.key) && !FILT_KEYS.has(d.key) && !isFxD(d) && !isSeqD(d),
  all: d => !isSeqD(d),
};
function rollPart(part, side, s) {
  const amt = 0.35 + 0.65 * s, inPart = PART[part];
  const sides = side === 'M' ? ['A', 'B'] : [side];
  const old = { A: state.A.slice(), B: state.B.slice(), C: state.C.slice(), t: tables.map(t => ({ A: t.A, B: t.B })), smp: { ...state.smp } };
  if (sides.length === 2) randomizeAll(); else randomizeSide(sides[0]);
  DEFS.forEach((d, i) => { if (!inPart(d)) { state.A[i] = old.A[i]; state.B[i] = old.B[i]; state.C[i] = old.C[i]; } });
  if (part !== 'synth' && part !== 'all') { tables.forEach((t, k) => { t.A = old.t[k].A; t.B = old.t[k].B; }); state.smp = old.smp; }
  if (amt < 0.98) {
    for (const k of sides) {
      DEFS.forEach((d, i) => {
        const o = old[k][i], n = state[k][i];
        if (o === n || !inPart(d)) return;
        state[k][i] = d.opts ? (rnd() < amt ? n : o) : quant(d, o + (n - o) * amt);
      });
      if (part === 'synth' || part === 'all') { tables.forEach((t, j) => { if (rnd() >= amt) t[k] = old.t[j][k]; }); if (rnd() >= amt) state.smp[k] = old.smp[k]; }
    }
    if (sides.length === 2) state.C = state.C.map((c, i) => old.C[i] + (c - old.C[i]) * amt);
  }
  for (const k of sides) { if (part === 'synth' || part === 'all') levelMatch(k); if (part === 'synth' || part === 'all' || part === 'filt') { sineGuard(k); loudnessGuard(k); } }
}
const rollSound = (side, s) => rollPart('synth', side, s);
// the header's die: everything, both sides (the sound by parts at this strength, and the sequences)
const rollAll = s => { rollPart('all', 'M', s); rollSeq('M', s); };
/* Sequence: a full roll at the far end (as before: new rate, generator, rhythm, density, speed and octave; in Morph also a
   new shared scale). Below that the pattern keeps its rate and length, and each note is re-rolled with chance amt (a new
   melody in the scale), with rests and velocities shuffled in proportion. */
function rollSeq(side, amt) {
  const sides = side === 'M' ? ['A', 'B'] : [side];
  if (amt >= 0.9) { if (sides.length === 2) randSeqs(); else randSeqSide(sides[0]); return; }
  for (const k of sides) {
    const q = state.seq[k], fresh = cloneSeq(q);
    randNotes(fresh);
    q.steps.forEach((st, i) => {
      if (rnd() < amt) st.note = fresh.steps[i].note;
      if (rnd() < amt * 0.35) st.on = !st.on;
      if (rnd() < amt) st.vel = clamp(st.vel + (rnd() * 2 - 1) * 0.5 * amt);
    });
    shapeRandom(q);
  }
}
/* ---------- live dice (2026-11-11) ----------
   Pulling a die already rolls: when you touch it, a full roll of its part is worked out once (the target: a random path),
   and as the die travels every value moves that far from where it was toward the target (switches and wavetables flip
   once the die passes their own random point; sequence notes likewise, step by step, and the far end takes the whole new
   pattern). You see the knobs move and hear it as it goes; let go wherever you like it. Back at the start, nothing has
   changed and the paths are drawn again, so the next pull goes somewhere else. Letting go keeps it, as one undo step. */
const cloneT = () => tables.map(t => ({ A: t.A, B: t.B }));
const keepState = () => ({ A: state.A.slice(), B: state.B.slice(), C: state.C.slice(), t: cloneT(), smp: JSON.parse(JSON.stringify(state.smp)), seq: JSON.parse(JSON.stringify(state.seq)) });
function putState(k) {
  state.A = k.A.slice(); state.B = k.B.slice(); state.C = k.C.slice(); state.smp = JSON.parse(JSON.stringify(k.smp)); state.seq = JSON.parse(JSON.stringify(k.seq));
  k.t.forEach((t, j) => { tables[j].A = t.A; tables[j].B = t.B; });
}
function makePath(what, side) {
  const base = keepState(), undo = snapshot();
  if (what === 'all') rollAll(1); else if (what === 'seq') rollSeq(side, 1); else rollPart(what, side, 1);
  const full = keepState();
  putState(base);
  let part = null;   // sequences below the far end: a new melody in the same rhythm grid, step by step
  if (what === 'seq' || what === 'all') {
    rollSeq(side === 'M' || what === 'all' ? 'M' : side, 0.6); part = JSON.parse(JSON.stringify(state.seq)); putState(base);
  }
  const u = DEFS.map(() => rnd()), ut = tables.map(() => ({ A: rnd(), B: rnd() })), us = rnd();
  const useq = { A: state.seq.A.steps.map(() => rnd()), B: state.seq.B.steps.map(() => rnd()) };
  analyzeAll();   // the spectra back to the tables now in place
  return { base, undo, full, part, u, ut, us, useq, what, last: { t: cloneT(), smp: JSON.stringify(state.smp) } };
}
// the state at amount x (0 to 1) along the path
function pathAt(P, x) {
  const { base, full } = P;
  if (P.what !== 'seq') {
    for (const k of ['A', 'B']) for (let i = 0; i < DEFS.length; i++) {
      const o = base[k][i], n = full[k][i];
      state[k][i] = o === n ? o : DEFS[i].opts || DEFS[i].curve === 'int' && DEFS[i].snap ? (x > P.u[i] ? n : o) : quant(DEFS[i], o + (n - o) * x);
    }
    for (let i = 0; i < DEFS.length; i++) state.C[i] = base.C[i] + (full.C[i] - base.C[i]) * x;
    tables.forEach((t, j) => { for (const k of ['A', 'B']) t[k] = x > P.ut[j][k] ? full.t[j][k] : base.t[j][k]; });
    state.smp = x > P.us ? JSON.parse(JSON.stringify(full.smp)) : JSON.parse(JSON.stringify(base.smp));
  }
  if (P.what === 'seq' || P.what === 'all') {
    if (x >= 0.85) {
      state.seq = JSON.parse(JSON.stringify(full.seq));
      for (const k of ['A', 'B']) for (const key of ['sqdens', 'sqspeed', 'sqoct']) state[k][IX[key]] = full[k][IX[key]];
    } else {
      state.seq = JSON.parse(JSON.stringify(base.seq));
      for (const k of ['A', 'B']) {
        const q = state.seq[k], pq = P.part[k];
        q.steps.forEach((st, i) => { if (pq.steps[i] && x / 0.85 > P.useq[k][i]) { st.note = pq.steps[i].note; st.on = pq.steps[i].on; st.vel = pq.steps[i].vel; } });
        if (P.what === 'seq') for (const key of ['sqdens', 'sqspeed', 'sqoct']) state[k][IX[key]] = base[k][IX[key]];
      }
    }
  }
}
// show and play the state now, cheaply: knobs in view, the pictures, the engine (tables and samples only when they changed)
function liveShow(P) {
  syncPair(); updateKnobs(); updateMorphUI();
  const changed = []; tables.forEach((t, j) => { for (const k of ['A', 'B']) if (t[k] !== P.last.t[j][k]) changed.push([j, k]); });
  changed.forEach(([j, k]) => { analyzeTable(j, k); P.last.t[j][k] = tables[j][k]; });
  const smpNow = JSON.stringify(state.smp), smpChanged = smpNow !== P.last.smp; P.last.smp = smpNow;
  if (smpChanged) resolveSamples();
  seqCache = null; drawLanes(); syncScaleUI(); refreshSeqKnobs();
  if (ready) { sendState(); changed.forEach(([j, k]) => postTable(j, k)); if (smpChanged) { postSample('A'); postSample('B'); } sendSeq(); }
}
function commitPath(P) {
  undoStack.push(P.undo); if (undoStack.length > 30) undoStack.shift(); redoStack.length = 0; updateUndoUI();
  applyBulk(() => {});
}
let dieHeld = null;   // the die being held: { what, side, x, P, used }
document.querySelectorAll('.dicetrack').forEach(el => {
  const die = el.querySelector('.die'), face = die.firstChild, fill = el.querySelector('.fill'), what = el.dataset.what, side = el.dataset.side;
  let pid = null;
  const horiz = el.classList.contains('horiz');   // the header's Everything die runs left to right
  const dieH = () => die.offsetHeight || 31, travel = () => Math.max(1, (horiz ? el.clientWidth : el.clientHeight) - dieH());
  // the die sits under your finger and the whole face turns as it travels (1.25 turns over the track); the track fills behind it
  const place = x => {
    die.style[horiz ? 'left' : 'bottom'] = (x * travel()) + 'px';
    face.style.transform = `rotate(${x * 450}deg)`;
    fill.style[horiz ? 'width' : 'height'] = x > 0 ? x * travel() + dieH() / 2 + 'px' : '0';
    el.setAttribute('aria-valuenow', Math.round(x * 100));
  };
  const fromY = (cy, cx) => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (horiz ? cx - r.left - dieH() / 2 : r.bottom - cy - dieH() / 2) / travel())); };
  const settle = () => { el.classList.remove('dragging'); place(0); die.classList.remove('rolled'); void die.offsetWidth; die.classList.add('rolled'); };
  let raf = 0, pendingX = 0;
  const live = x => {   // at most once a frame
    pendingX = x; if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0; const H = dieHeld; if (!H || H.used) return;
      if (pendingX <= 0.01) { if (H.x > 0.01) { putState(H.P.base); liveShow(H.P); } H.P = makePath(what, side); H.x = 0; return; }   // back at the start: new paths
      H.x = pendingX; pathAt(H.P, pendingX); liveShow(H.P);
    });
  };
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); pid = e.pointerId; el.setPointerCapture(pid); el.classList.add('dragging');
    dieHeld = { what, side, x: 0, P: makePath(what, side), used: false };
    const x = fromY(e.clientY, e.clientX); place(x); live(x);
  });
  el.addEventListener('pointermove', e => { if (e.pointerId !== pid) return; const x = fromY(e.clientY, e.clientX); place(x); live(x); });
  const end = cancel => e => {
    if (e.pointerId !== pid) return; pid = null;
    cancelAnimationFrame(raf); raf = 0;
    const H = dieHeld; dieHeld = null;
    if (!H) { settle(); return; }
    if (H.used) { settle(); return; }   // a knob was rolled while the die was held: nothing else changes
    const x = cancel ? 0 : fromY(e.clientY, e.clientX);
    if (x > 0.01) { pathAt(H.P, x); commitPath(H.P); settle(); }
    else { putState(H.P.base); liveShow(H.P); el.classList.remove('dragging'); place(0); }
  };
  el.addEventListener('pointerup', end(false)); el.addEventListener('pointercancel', end(true));
  el.addEventListener('keydown', e => {
    const x = e.key === 'Enter' || e.key === ' ' ? 0.5 : /^[1-9]$/.test(e.key) ? +e.key / 10 : e.key === '0' ? 1 : null;
    if (x === null) return;
    e.preventDefault(); const P = makePath(what, side); pathAt(P, x); commitPath(P); settle();
  });
  place(0);
});
/* Hold a die and tap a knob (2026-11-11, as in Pixy and Orbital): only that knob rolls, as far as the die is pulled (half
   way if it is at the start), and nothing else changes when you let go of the die. It rolls the die's side (A, B or both;
   the Everything die both); with a side focused, that side. */
document.addEventListener('pointerdown', e => {
  const H = dieHeld; if (!H) return;
  const kn = e.target.closest('.knob'); if (!kn) return;
  const i = +kn.id.slice(1), d = DEFS[i]; if (!d) return;
  e.preventDefault(); e.stopPropagation();
  if (!H.used && H.x > 0.01) { putState(H.P.base); liveShow(H.P); }
  H.used = true;
  const amt = 0.35 + 0.65 * (H.x > 0.05 ? H.x : 0.5);
  const sides = focus !== 'M' ? [focus] : H.side === 'M' ? ['A', 'B'] : [H.side];
  bulk(() => {
    for (const k of isLinked(i) ? ['A'] : sides) {
      const cur = state[k][i], to = RND[d.key] && !['mbright', 'mfx', 'mwet'].includes(d.key) ? rv(d, k) : rnd();   // the macros start at 50% on a roll, but a tapped one moves
      const x = quant(d, clamp(cur + (to - cur) * amt));
      if (d.pair) { const p = oi(0, k === 'A' ? 'posA' : 'posB'); state.A[p] = state.B[p] = x; }
      if (isLinked(i)) { state.A[i] = state.B[i] = x; } else state[k][i] = x;
    }
  });
  kn.classList.remove('rolled'); void kn.offsetWidth; kn.classList.add('rolled');
}, true);
