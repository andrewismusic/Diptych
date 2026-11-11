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
  const roll = a => {
    bulk(() => (what === 'all' ? rollAll(a) : what === 'seq' ? rollSeq(side, a) : rollPart(what, side, a)));
    el.classList.remove('dragging'); place(0);
    die.classList.remove('rolled'); void die.offsetWidth; die.classList.add('rolled');
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; el.setPointerCapture(pid); el.classList.add('dragging'); place(fromY(e.clientY, e.clientX)); });
  el.addEventListener('pointermove', e => { if (e.pointerId === pid) place(fromY(e.clientY, e.clientX)); });
  el.addEventListener('pointerup', e => { if (e.pointerId !== pid) return; pid = null; const x = fromY(e.clientY, e.clientX); if (x > 0.01) roll(x); else { el.classList.remove('dragging'); place(0); } });
  el.addEventListener('pointercancel', e => { if (e.pointerId !== pid) return; pid = null; el.classList.remove('dragging'); place(0); });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); roll(0.5); }
    else if (/^[1-9]$/.test(e.key)) { e.preventDefault(); roll(+e.key / 10); }
    else if (e.key === '0') { e.preventDefault(); roll(1); }
  });
  place(0);
});
