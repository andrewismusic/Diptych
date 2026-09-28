/* ---------- randomize ----------
   Values are drawn from musically useful ranges rather than the full range
   of each knob, so results are usually playable. */
const rnd = Math.random;
const logr = (lo, hi) => lo * Math.pow(hi / lo, rnd());
const RND = {
  // wavetables and pattern
  posA: () => rnd(), posB: () => rnd(),
  wave: side => (side === 'A' ? (rnd() < 0.6 ? 0 : rnd() * 0.4) : (rnd() < 0.6 ? 1 : 0.6 + rnd() * 0.4)),
  pattern: side => (side === 'A' ? (rnd() < 0.6 ? 0 : rnd() * 0.4) : (rnd() < 0.6 ? 1 : 0.6 + rnd() * 0.4)),
  // oscillator
  octave: () => { const r = rnd(); return r < 0.15 ? -1 : r > 0.85 ? 1 : 0; },
  fine: () => (rnd() < 0.7 ? 0 : (rnd() * 2 - 1) * 15),
  unison: () => (rnd() < 0.4 ? 0 : rnd()),
  glide: () => (rnd() < 0.5 ? 0 : rnd() < 0.9 ? rnd() * 0.1 : 0.1 + rnd() ** 2 * 0.5),   // half off; 95% under 100 ms
  vdepth: () => (rnd() < 0.85 ? rnd() * 0.3 : 0.3 + rnd() * 0.7),   // mostly within ±30 cents
  vfade: () => rnd() ** 2 * 3,
  vrate: () => logr(2, 9),
  vrfade: () => (rnd() < 0.5 ? 0 : (rnd() * 2 - 1) * 8), vrtime: () => rnd() ** 2 * 4,
  // filter and envelopes
  cutoff: () => logr(150, 12000),
  reso: () => rnd() ** 1.5 * 0.85,
  mode: () => (rnd() < 0.5 ? 0 : rnd()),
  envamt: () => (rnd() < 0.8 ? rnd() : -rnd() * 0.6),
  keytrack: () => rnd(),
  fatk: () => logr(0.001, rnd() < 0.7 ? 0.1 : 1.5),
  fdec: () => logr(0.05, 3),
  fsus: () => rnd(),
  frel: () => logr(0.02, 3),
  aatk: () => logr(0.001, rnd() < 0.7 ? 0.05 : 1.2),
  adec: () => logr(0.05, 3),
  asus: () => 0.2 + rnd() * 0.8,
  arel: () => logr(0.03, 3),
  level: () => 0.5 + rnd() * 0.5,
  pan: () => (rnd() * 2 - 1) * 0.6,
  // effects: full range, the synth is meant to surprise
  drive: () => rnd(), dshape: () => rnd(), dmix: () => rnd(),
  fvowel: () => rnd(), fshift: () => (rnd() * 2 - 1) * 12, freso: () => rnd(), fmix: () => (rnd() < 0.66 ? 0 : rnd()),
  mtype: () => rnd(), mrate: () => logr(0.02, 10), mdepth: () => rnd(), mfb: () => rnd(), mmix: () => (rnd() < 0.4 ? 0 : rnd()),
  dltime: () => Math.floor(rnd() * 12), dlfb: () => rnd() * 0.95, dlpp: () => rnd(), dltone: () => rnd(), dlmix: () => (rnd() < 0.4 ? 0 : rnd() < 0.85 ? rnd() * 0.35 : rnd() < 0.8 ? 0.35 + rnd() * 0.15 : 0.5 + rnd() * 0.5),   // mostly 0–35%, rarely above 50%
  rvsize: () => rnd(), rvdecay: () => logr(0.2, 20), rvdamp: () => rnd(), rvmix: () => (rnd() < 0.4 ? 0 : rnd() < 0.8 ? rnd() * 0.35 : 0.35 + rnd() * 0.65),
  // lo-fi leans gentle: wow, flutter and codec are off two times in three, dropouts nine times in ten
  lwow: () => (rnd() < 0.66 ? 0 : rnd() ** 2), lflut: () => (rnd() < 0.66 ? 0 : rnd() ** 2), lchar: () => rnd() ** 2,
  ldrop: () => (rnd() < 0.9 ? 0 : rnd() ** 2), lcodec: () => (rnd() < 0.66 ? 0 : rnd() ** 2),
  lnoise: () => rnd(), lnmix: () => (rnd() < 0.85 ? rnd() * 0.15 : 0.15 + rnd() * 0.2),   // never above 35%, mostly 0–15%
  ottdepth: () => rnd(), otttime: () => logr(0.1, 4),
  ottlo: () => logr(40, 500), otthi: () => logr(600, 10000),
  ottgl: () => (rnd() * 2 - 1) * 3, ottgm: () => (rnd() * 2 - 1) * 3, ottgh: () => (rnd() * 2 - 1) * 3,   // mixed signs enforced in mixOttGains
  ottout: () => 0,
};
const TABLE_CHOICES = Object.keys(PRESETS).filter(n => n !== 'Sine');
const rv = (d, side) => quant(d, clamp(norm(d, RND[d.id](side))));
// Keep morphs dramatic: a side's new value lands at least 15% of the knob's throw away from the other side.
// Parameters whose chance of landing at 0 matters more than the A/B gap skip the 15% rule.
const SPREAD = 0.15, NO_SPREAD = new Set(['lnmix', 'ottgl', 'ottgm', 'ottgh', 'fmix', 'mmix', 'dlmix', 'rvmix', 'lwow', 'lflut', 'lcodec', 'ldrop']);
function rvApart(d, side, other) {
  if (NO_SPREAD.has(d.id)) return rv(d, side);
  for (let k = 0; k < 12; k++) { const x = rv(d, side); if (Math.abs(x - other) >= SPREAD) return x; }
  const room = Math.max(other, 1 - other);   // no luck from the usual range: step toward whichever end has more room
  return quant(d, clamp(other + (other <= 0.5 ? 1 : -1) * (SPREAD + rnd() * (room - SPREAD))));
}
// A parameter is locked if its own padlock is on or its whole section is locked.
// Section locks sit on top of the individual ones, so unlocking a section brings back each knob's own setting.
const isLocked = d => !!state.locks[d.id] || !!state.secLocks[d.group];
const inGroup = (d, g) => !g || d.group === g;
// OTT band gains: within ±3 dB, and never all boosting or all cutting on one side
function mixOttGains(side, g) {
  const ids = ['ottgl', 'ottgm', 'ottgh'];
  if (!inGroup(DEFS[IX.ottgl], g)) return;
  const free = ids.filter(id => !isLocked(DEFS[IX[id]]) && !state.links[id]);
  if (!free.length) return;
  const val = id => MorphEngine.denorm(DEFS[IX[id]], state[side][IX[id]]);
  const signs = () => ids.map(val).filter(x => Math.abs(x) > 0.05).map(Math.sign);
  const sg = signs();
  if (sg.length === 3 && sg.every(x => x === sg[0])) {
    const id = free[Math.floor(rnd() * free.length)], d = DEFS[IX[id]];
    state[side][IX[id]] = norm(d, -val(id));
  }
}
// Formant, Modulation, Delay and Reverb mixes: at most two above 50%, and at most one above 90%
function effectMixRules(side, g) {
  const ids = ['fmix', 'mmix', 'dlmix', 'rvmix'].filter(id => inGroup(DEFS[IX[id]], g));
  const val = id => state[side][IX[id]], free = id => !isLocked(DEFS[IX[id]]) && !state.links[id];
  const shuffle = a => a.map(x => [rnd(), x]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  let hi = shuffle(ids.filter(id => val(id) > 0.5 && free(id)));
  while (ids.filter(id => val(id) > 0.5).length > 2 && hi.length) state[side][IX[hi.pop()]] = rnd() * 0.5;
  let top = shuffle(ids.filter(id => val(id) > 0.9 && free(id)));
  while (ids.filter(id => val(id) > 0.9).length > 1 && top.length) state[side][IX[top.pop()]] = 0.5 + rnd() * 0.4;
}
// A near-sine wave through a low-pass set low (or a high-pass set high) can be close to silent,
// so when a side's wave is nearly pure, its cutoff is moved toward the open end.
function sineGuard(side) {
  const d = DEFS[IX.cutoff]; if (isLocked(d) || state.links.cutoff) return;
  MorphEngine.frameAt(spec.A, state.A[IX.posA], true, W.fa[0], W.fa[1]);
  MorphEngine.frameAt(spec.B, state.A[IX.posB], true, W.fb[0], W.fb[1]);
  MorphEngine.interp(W.fa[0], W.fa[1], W.fb[0], W.fb[1], state[side][IX.wave], true, W.fr[0], W.fr[1]);
  let tot = 0; for (let h = 1; h <= 512; h++) tot += W.fr[0][h] ** 2 + W.fr[1][h] ** 2;
  const pure = (W.fr[0][1] ** 2 + W.fr[1][1] ** 2) / (tot + 1e-12) > 0.85;
  if (!pure) return;
  const mode = MorphEngine.denorm(DEFS[IX.mode], state[side][IX.mode]), c = state[side][IX.cutoff];
  if (mode < 0.35 && c < 0.6) state[side][IX.cutoff] = 0.6 + rnd() * 0.4;
  else if (mode > 0.65 && c > 0.35) state[side][IX.cutoff] = rnd() * 0.35;
}
// raw = section dice: anywhere in each knob's full range, none of the shaping rules (locks still apply)
// Section dice use each knob's full range, except that some Lo-fi amounts usually stay gentle
const RAW_LEAN = { lnmix: 0.3, lcodec: 0.3, ldrop: 0.3, lwow: 0.4, lflut: 0.4 };
const rvRaw = d => quant(d, d.id in RAW_LEAN && rnd() < 0.8 ? rnd() * RAW_LEAN[d.id] : rnd());
function randomizeSide(side, g, raw) {
  const other = side === 'A' ? 'B' : 'A';
  DEFS.forEach((d, i) => {
    if (!inGroup(d, g) || isLocked(d)) return;
    if (d.single) { if (d.single === side) state.A[i] = state.B[i] = raw ? rvRaw(d) : rv(d, side); return; }
    if (state.links[d.id]) return;   // shared values only change with Randomize all or Randomize linked
    state[side][i] = raw ? rvRaw(d) : rvApart(d, side, state[other][i]);
  });
  if (!raw) { mixOttGains(side, g); effectMixRules(side, g); }
  if ((!g || g === 'Wavetables') && !state.secLocks.Wavetables) { tables[side] = makeTable(TABLE_CHOICES[Math.floor(rnd() * TABLE_CHOICES.length)]); analyzeTable(side); }
  if (!raw) sineGuard(side);
}
$('rndA').addEventListener('click', () => bulk(() => randomizeSide('A')));
$('rndB').addEventListener('click', () => bulk(() => randomizeSide('B')));
function randomizeLinked(g, raw) {   // linked knobs only: one new value shared by both sides
  DEFS.forEach((d, i) => { if (inGroup(d, g) && state.links[d.id] && !d.single && !isLocked(d)) state.A[i] = state.B[i] = raw ? rvRaw(d) : rv(d, 'A'); });
}
function randomizeAll(g, raw) {
  randomizeSide('A', g, raw); randomizeSide('B', g, raw);
  if ((!g || g === 'Delay') && !state.secLocks.Delay) { state.dlSpill = rnd() < 0.5; updateDlUI(); }   // Cut or Spill
  randomizeLinked(g, raw);
  state.C = DEFS.map((d, i) => (!inGroup(d, g) || isLocked(d) || isLinked(i) ? state.C[i] : rnd() < 0.5 ? 0 : (rnd() * 2 - 1) * 0.7));
}
$('rndLinked').addEventListener('click', () => bulk(() => randomizeLinked()));
$('rndAll').addEventListener('click', () => bulk(() => randomizeAll()));
