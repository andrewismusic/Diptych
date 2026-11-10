/* =====================================================================
   DICE SLIDERS (2026-11-10, from the family: Orbital, Pixy, Heather)
   Touch the track and let go: the further right, the bigger the change (the die
   sits under your finger and turns as it travels). As in Orbital, each value
   moves 0.35 + 0.65 x strength of the way toward a fresh roll, so the far end
   is a whole new sound. The die springs back with a tumble. What they act on follows the side focus: in A or B only that
   side changes, in Morph both do (and a full sequence roll picks a new scale).
   Keys: Enter or Space rolls at 50%, 1 to 9 at 10% to 90%, 0 at 100%.
   ===================================================================== */
const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
const dieFace = n => `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">${PIPS[n].map(([x, y]) => `<circle cx="${4.5 + x * 5.5}" cy="${4.5 + y * 5.5}" r="1.9" fill="currentColor"/>`).join('')}</svg>`;
/* Sound: the shaped randomizer runs for the target side(s), then every value moves only `amt` of the way from where it
   was toward the new roll (stepped values round, switches flip with chance amt), and each wavetable is replaced with
   chance amt. The guards (level match, sine and loudness guards) run again on the result. */
function rollSound(s) {
  const amt = 0.35 + 0.65 * s;
  const sides = focus === 'M' ? ['A', 'B'] : [focus];
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
function rollSeq(amt) {
  const sides = focus === 'M' ? ['A', 'B'] : [focus];
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
document.querySelectorAll('.dice').forEach(el => {
  const tile = el.querySelector('.dtile'), what = el.dataset.what;
  el.insertAdjacentHTML('afterbegin', '<span class="dfill"></span>');
  const fill = el.querySelector('.dfill');
  let face = 5, pid = null, s = 0;
  tile.innerHTML = dieFace(face);
  const dieW = () => tile.offsetWidth || 30, travel = () => Math.max(1, el.clientWidth - dieW() - 4);
  // the die sits where you touch and turns as it travels (1.25 turns over the whole track); the track fills behind it
  const place = x => {
    tile.style.transform = `translateX(${x * travel()}px)`;
    tile.firstChild.style.transform = `rotate(${x * 450}deg)`;
    fill.style.width = x > 0 ? x * travel() + dieW() / 2 + 2 + 'px' : '0';
    el.setAttribute('aria-valuenow', Math.round(x * 100));
  };
  const fromX = cx => { const r = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (cx - r.left - 2 - dieW() / 2) / travel())); };
  const roll = a => {
    bulk(() => (what === 'seq' ? rollSeq(a) : rollSound(a)));
    el.classList.remove('drag'); place(0);
    el.classList.remove('roll'); void el.offsetWidth; el.classList.add('roll');
    let n = 0; const spin = setInterval(() => { face = 1 + Math.floor(rnd() * 6); tile.innerHTML = dieFace(face); if (++n >= 5) clearInterval(spin); }, 90);
    setTimeout(() => el.classList.remove('roll'), 600);
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; el.setPointerCapture(pid); el.classList.add('drag'); s = fromX(e.clientX); place(s); });
  el.addEventListener('pointermove', e => { if (e.pointerId === pid) { s = fromX(e.clientX); place(s); } });
  el.addEventListener('pointerup', e => { if (e.pointerId !== pid) return; pid = null; s = fromX(e.clientX); if (s > 0.01) roll(s); else { el.classList.remove('drag'); place(0); } });
  el.addEventListener('pointercancel', e => { if (e.pointerId !== pid) return; pid = null; el.classList.remove('drag'); place(0); });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); roll(0.5); }
    else if (/^[1-9]$/.test(e.key)) { e.preventDefault(); roll(+e.key / 10); }
    else if (e.key === '0') { e.preventDefault(); roll(1); }
  });
});
// what the dice act on, shown on each slider: A, B, or A+B (follows the side focus)
function updateDiceTarget() { document.querySelectorAll('.dtarget').forEach(t => { t.textContent = focus === 'M' ? 'A+B' : focus; }); }
updateDiceTarget();
