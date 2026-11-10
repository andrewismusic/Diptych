/* =====================================================================
   DICE SLIDERS (2026-11-10, Orbital's dice, standing up)
   Six tracks in one row: Sound A, B, Both and Sequence A, B, Both, the same
   in every view. Touch a track and let go: the higher, the bigger the change
   (the die sits under your finger and rolls as it travels over a yellow fill,
   then springs home). Faces show 1 to 6 in order. As in Orbital, each sound
   value moves 0.35 + 0.65 x strength of the way toward a fresh roll, so the
   top is a whole new sound. Keys: Enter or Space rolls at 50%, 1 to 9 at 10%
   to 90%, 0 at 100%.
   ===================================================================== */
/* Sound: the shaped randomizer runs for the target side(s), then every value moves only `amt` of the way from where it
   was toward the new roll (stepped values round, switches flip with chance amt), and each wavetable is replaced with
   chance amt. The guards (level match, sine and loudness guards) run again on the result. */
function rollSound(side, s) {
  const amt = 0.35 + 0.65 * s;
  const sides = side === 'M' ? ['A', 'B'] : [side];
  const old = { A: state.A.slice(), B: state.B.slice(), C: state.C.slice(), t: tables.map(t => ({ A: t.A, B: t.B })), smp: { ...state.smp } };
  if (sides.length === 2) randomizeAll(); else randomizeSide(sides[0]);
  if (amt >= 0.98) return;
  for (const k of sides) {
    DEFS.forEach((d, i) => {
      const o = old[k][i], n = state[k][i];
      if (o === n) return;
      state[k][i] = d.opts ? (rnd() < amt ? n : o) : quant(d, o + (n - o) * amt);
    });
    tables.forEach((t, s) => { if (rnd() >= amt) t[k] = old.t[s][k]; });
    if (rnd() >= amt) state.smp[k] = old.smp[k];
    levelMatch(k); sineGuard(k); loudnessGuard(k);
  }
  if (sides.length === 2) state.C = state.C.map((c, i) => old.C[i] + (c - old.C[i]) * amt);
}
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
document.querySelectorAll('.dicetrack').forEach(el => {
  const die = el.querySelector('.die'), face = die.firstChild, fill = el.querySelector('.fill'), what = el.dataset.what, side = el.dataset.side;
  let pid = null;
  const dieH = () => die.offsetHeight || 31, travel = () => Math.max(1, el.clientHeight - dieH());
  // the die sits under your finger and the whole face turns as it travels (1.25 turns over the track); the track fills behind it
  const place = x => {
    die.style.bottom = (x * travel()) + 'px';
    face.style.transform = `rotate(${x * 450}deg)`;
    fill.style.height = x > 0 ? x * travel() + dieH() / 2 + 'px' : '0';
    el.setAttribute('aria-valuenow', Math.round(x * 100));
  };
  const fromY = cy => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (r.bottom - cy - dieH() / 2) / travel())); };
  const roll = a => {
    bulk(() => (what === 'seq' ? rollSeq(side, a) : rollSound(side, a)));
    el.classList.remove('dragging'); place(0);
    die.classList.remove('rolled'); void die.offsetWidth; die.classList.add('rolled');
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; el.setPointerCapture(pid); el.classList.add('dragging'); place(fromY(e.clientY)); });
  el.addEventListener('pointermove', e => { if (e.pointerId === pid) place(fromY(e.clientY)); });
  el.addEventListener('pointerup', e => { if (e.pointerId !== pid) return; pid = null; const x = fromY(e.clientY); if (x > 0.01) roll(x); else { el.classList.remove('dragging'); place(0); } });
  el.addEventListener('pointercancel', e => { if (e.pointerId !== pid) return; pid = null; el.classList.remove('dragging'); place(0); });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); roll(0.5); }
    else if (/^[1-9]$/.test(e.key)) { e.preventDefault(); roll(+e.key / 10); }
    else if (e.key === '0') { e.preventDefault(); roll(1); }
  });
  place(0);
});
