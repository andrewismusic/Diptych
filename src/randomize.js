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
  // oscillator slots (Level is locked by default)
  olevel: () => 0.5 + rnd() * 0.5, opan: () => (rnd() < 0.5 ? 0 : (rnd() * 2 - 1) * 0.6),
  byp: () => (rnd() < 0.8 ? 0 : rnd() * 0.5),
  pitch: () => { const r = rnd(); return r < 0.15 ? -12 : r > 0.85 ? 12 : 0; },
  fine: () => (rnd() < 0.7 ? 0 : (rnd() * 2 - 1) * 15),
  // FM: whole-numbered algorithms, ratios leaning on 1-4, the carrier (op 1) usually at 1; op 1 holds half the time
  fmalgo: () => Math.floor(rnd() * 8), fmfb: () => (rnd() < 0.6 ? 0 : rnd() * 0.7),
  fmpitch: () => { const r = rnd(); return r < 0.15 ? -12 : r > 0.85 ? 12 : 0; }, fmfine: () => (rnd() < 0.7 ? 0 : (rnd() * 2 - 1) * 15),
  ...Object.fromEntries([1, 2, 3, 4].flatMap(k => [
    ['fmr' + k, () => { if (k === 1 && rnd() < 0.7) return 1; const r = rnd(); return r < 0.05 ? 0 : r < 0.35 ? 1 : r < 0.55 ? 2 : r < 0.67 ? 3 : r < 0.77 ? 4 : r < 0.92 ? 5 + Math.floor(rnd() * 4) : 9 + Math.floor(rnd() * 8); }],
    ['fml' + k, () => (k === 1 ? 0.6 + rnd() * 0.4 : rnd() ** 1.3)],
    ['fmd' + k, () => (k === 1 ? (rnd() < 0.5 ? 30 : logr(0.2, 20)) : rnd() < 0.3 ? 30 : logr(0.02, 8))],
  ])),
  soct: () => (rnd() < 0.6 ? -1 : -2), sshape: () => rnd(), sdrive: () => rnd() ** 2 * 0.8,
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
const rv = (d, side) => quant(d, clamp(norm(d, RND[d.key](side))));
// Keep morphs dramatic: a side's new value lands at least 15% of the knob's throw away from the other side.
// Parameters whose chance of landing at 0 (or low) matters more than the A/B gap skip the 15% rule;
// both sides at 0 is fine for them. The rule would otherwise re-roll away their stated odds.
const SPREAD = 0.15, NO_SPREAD = new Set(['lnmix', 'ottgl', 'ottgm', 'ottgh', 'fmix', 'mmix', 'dlmix', 'rvmix', 'lwow', 'lflut', 'lcodec', 'ldrop',
  'glide', 'unison', 'vdepth', 'vrfade', 'mode', 'byp', 'opan', 'soct', 'fmfb', 'fmr1', 'fmr2', 'fmr3', 'fmr4', 'fmd1', 'fmd2', 'fmd3', 'fmd4']);
function rvApart(d, side, other) {
  if (NO_SPREAD.has(d.key)) return rv(d, side);
  for (let k = 0; k < 12; k++) { const x = rv(d, side); if (Math.abs(x - other) >= SPREAD) return x; }
  const room = Math.max(other, 1 - other);   // no luck from the usual range: step toward whichever end has more room
  return quant(d, clamp(other + (other <= 0.5 ? 1 : -1) * (SPREAD + rnd() * (room - SPREAD))));
}
// A parameter is locked if its own padlock is on or its whole section is locked.
// Section locks sit on top of the individual ones, so unlocking a section brings back each knob's own setting.
const isLocked = d => !!state.locks[d.id] || !!state.secLocks[d.group];
// only parameters that are part of the sound (each slot's current type) are randomized; the rest keep their remembered values
const inGroup = (d, g) => (!g || d.group === g) && isActive(d);
// OTT band gains: within ±3 dB, and never all boosting or all cutting on one side (per OTT slot)
function mixOttGains(side, g) {
  for (let slot = 0; slot < 4; slot++) {
    if (state.fxType[slot] !== 'ott' || !inGroup(DEFS[xi(slot, 'ottgl')], g)) continue;
    const ix = ['ottgl', 'ottgm', 'ottgh'].map(k => xi(slot, k));
    const free = ix.filter(i => !isLocked(DEFS[i]) && !state.links[DEFS[i].id]);
    if (!free.length) continue;
    const val = i => MorphEngine.denorm(DEFS[i], state[side][i]);
    const sg = ix.map(val).filter(x => Math.abs(x) > 0.05).map(Math.sign);
    if (sg.length === 3 && sg.every(x => x === sg[0])) {
      const i = free[Math.floor(rnd() * free.length)];
      state[side][i] = norm(DEFS[i], -val(i));
    }
  }
}
// Formant, Modulation, Delay and Reverb mixes (in whichever slots hold them): at most two above 50%, and at most one above 90%
function effectMixRules(side, g) {
  const ix = DEFS.map((d, i) => i).filter(i => ['fmix', 'mmix', 'dlmix', 'rvmix'].includes(DEFS[i].key) && inGroup(DEFS[i], g));
  const val = i => state[side][i], free = i => !isLocked(DEFS[i]) && !state.links[DEFS[i].id];
  const shuffle = a => a.map(x => [rnd(), x]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  let hi = shuffle(ix.filter(i => val(i) > 0.5 && free(i)));
  while (ix.filter(i => val(i) > 0.5).length > 2 && hi.length) state[side][hi.pop()] = rnd() * 0.5;
  let top = shuffle(ix.filter(i => val(i) > 0.9 && free(i)));
  while (ix.filter(i => val(i) > 0.9).length > 1 && top.length) state[side][top.pop()] = 0.5 + rnd() * 0.4;
}
/* FM: each side is sustained 60% of the time (every operator heard in that side's algorithm holds) and plucked
   otherwise (those operators decay in 0.15 to 3 s); modulators keep their own random decays. */
function fmCarrierRule(side, g) {
  for (let s = 0; s < 4; s++) {
    if (state.oscType[s] !== 'fm' || !inGroup(DEFS[oi(s, 'fmd1')], g)) continue;
    const heard = OscFM.ALGS[Math.round(MorphEngine.denorm(DEFS[oi(s, 'fmalgo')], state[side][oi(s, 'fmalgo')]))][1], sustained = rnd() < 0.6;
    heard.forEach((h, k) => {
      const i = oi(s, 'fmd' + (k + 1)), d = DEFS[i];
      if (h && !isLocked(d) && !state.links[d.id]) state[side][i] = norm(d, sustained ? 30 : logr(0.15, 3));
    });
  }
}
// A near-sine wave through a low-pass set low, a high-pass set high, or a band-pass can be close to silent, so when a
// Wavetable slot that goes through the filter is nearly pure, the filter leaves band-pass for low-pass and its cutoff moves toward the open end.
function sineGuard(side) {
  const ci = IX.cutoff, mi = IX.mode, cd = DEFS[ci], md = DEFS[mi];
  for (let s = 0; s < 4; s++) {
    if (state.oscType[s] !== 'wt' || state[side][oi(s, 'byp')] > 0.5 || isLocked(cd) || state.links[cd.id]) continue;
    MorphEngine.frameAt(spec[s].A, state.A[oi(s, 'posA')], true, W.fa[0], W.fa[1]);
    MorphEngine.frameAt(spec[s].B, state.A[oi(s, 'posB')], true, W.fb[0], W.fb[1]);
    MorphEngine.interp(W.fa[0], W.fa[1], W.fb[0], W.fb[1], state[side][oi(s, 'wave')], true, W.fr[0], W.fr[1]);
    let tot = 0; for (let h = 1; h <= 512; h++) tot += W.fr[0][h] ** 2 + W.fr[1][h] ** 2;
    if ((W.fr[0][1] ** 2 + W.fr[1][1] ** 2) / (tot + 1e-12) <= 0.85) continue;
    // band-passing a pure sine only changes its level, and a band far from its one harmonic silences it: go low-pass instead
    let mode = MorphEngine.denorm(md, state[side][mi]);
    if (mode >= 0.35 && mode <= 0.65 && !isLocked(md) && !state.links[md.id]) { state[side][mi] = rnd() * 0.3; mode = state[side][mi]; }
    const c = state[side][ci];
    if (mode < 0.35 && c < 0.6) state[side][ci] = 0.6 + rnd() * 0.4;
    else if (mode > 0.65 && c > 0.35) state[side][ci] = rnd() * 0.35;
  }
}
/* Loudness guard: a filter that passes almost none of the oscillators' harmonics (a band or high-pass far above
   them, a low-pass shut below them) leaves a side near silent. For middle C (plus each slot's pitch), the harmonics
   of every active slot go through its Bypass split and the filter, at the filter envelope's peak and at sustain.
   If less than 1% of the power (-20 dB) gets through at both, that side's filter is re-rolled (up to 10 times),
   and as a last resort it opens up as a low-pass. */
function filterMag2(f, fc, reso, mode) {
  const w = f / fc, k = 2 - 1.96 * reso, bpG = Math.sqrt(k * 2);
  const wl = mode < 0.5 ? 1 - mode * 2 : 0, wb = mode < 0.5 ? mode * 2 : 2 - mode * 2, wh = mode < 0.5 ? 0 : mode * 2 - 1;
  const nr = wl - wh * w * w, ni = wb * bpG * w, dr = 1 - w * w, di = k * w;
  return (nr * nr + ni * ni) / (dr * dr + di * di);
}
const GUARD_FRAME = new Float32Array(2048);
// harmonics [frequency, power] of slot s on this side, for a note
function slotHarmonics(s, side, f0) {
  const t = state.oscType[s], val = key => MorphEngine.denorm(DEFS[oi(s, key)], state[side][oi(s, key)]), harm = [];
  let re, im;
  if (t === 'wt') {
    MorphEngine.frameAt(spec[s].A, state.A[oi(s, 'posA')], true, W.fa[0], W.fa[1]);
    MorphEngine.frameAt(spec[s].B, state.A[oi(s, 'posB')], true, W.fb[0], W.fb[1]);
    MorphEngine.interp(W.fa[0], W.fa[1], W.fb[0], W.fb[1], state[side][oi(s, 'wave')], true, W.fr[0], W.fr[1]);
    re = W.fr[0]; im = W.fr[1];
  } else if (t === 'fm') {
    OscFM.cycle({ algo: val('fmalgo'), fb: val('fmfb'), r: [1, 2, 3, 4].map(k => OscFM.RATIOS[val('fmr' + k)]), l: [1, 2, 3, 4].map(k => val('fml' + k)) }, 2048, GUARD_FRAME);
    ({ re, im } = MorphEngine.analyze(GUARD_FRAME));
  } else return [[f0, 1]];
  for (let h = 1; h <= 512 && f0 * h < 20000; h++) harm.push([f0 * h, re[h] ** 2 + im[h] ** 2]);
  return harm;
}
function passedDb(side) {
  const val = i => MorphEngine.denorm(DEFS[i], state[side][i]);
  const cut = val(IX.cutoff), reso = val(IX.reso), mode = val(IX.mode), env = val(IX.envamt), kt = val(IX.keytrack), fsus = val(IX.fsus);
  const t0 = state.oscType[0], p1 = t0 === 'wt' ? val(oi(0, 'pitch')) : t0 === 'fm' ? val(oi(0, 'fmpitch')) : 0;
  const slots = [0, 1, 2, 3].filter(s => state.oscType[s] !== 'off').map(s => {
    const t = state.oscType[s], note = 60 + (t === 'wt' ? val(oi(s, 'pitch')) : t === 'fm' ? val(oi(s, 'fmpitch')) : p1 + 12 * val(oi(s, 'soct')));
    return { note, harm: slotHarmonics(s, side, 440 * Math.pow(2, (note - 69) / 12)), lv: val(oi(s, 'olevel')) ** 2, byp: val(oi(s, 'byp')) };
  });
  let dry = 0, best = 0;
  for (const fLv of [1, fsus]) {
    let wet = 0; dry = 0;
    for (const sl of slots) {
      const fc = Math.min(21600, Math.max(20, cut * Math.pow(2, env * 5 * fLv + kt * (sl.note - 60) / 12)));
      for (const [f, pw] of sl.harm) { const g = (1 - sl.byp) * Math.sqrt(filterMag2(f, fc, reso, mode)) + sl.byp; dry += pw * sl.lv; wet += pw * sl.lv * g * g; }
    }
    best = Math.max(best, wet);
  }
  return dry > 0 ? 10 * Math.log10(best / dry + 1e-12) : 0;
}
function loudnessGuard(side) {
  const other = side === 'A' ? 'B' : 'A';
  const free = ['cutoff', 'reso', 'mode', 'envamt', 'keytrack'].map(k => IX[k]).filter(i => !isLocked(DEFS[i]) && !state.links[DEFS[i].id]);
  for (let k = 0; k < 10 && passedDb(side) < -20; k++) free.forEach(i => { state[side][i] = rvApart(DEFS[i], side, state[other][i]); });
  if (passedDb(side) < -20) {
    if (free.includes(IX.mode)) state[side][IX.mode] = 0;
    if (free.includes(IX.cutoff)) state[side][IX.cutoff] = Math.max(state[side][IX.cutoff], 0.75);
  }
}
// raw = section dice: anywhere in each knob's full range, none of the shaping rules (locks still apply)
// Section dice use each knob's full range, except that some Lo-fi amounts usually stay gentle
const RAW_LEAN = { lnmix: 0.3, lcodec: 0.3, ldrop: 0.3, lwow: 0.4, lflut: 0.4 };
const rvRaw = d => quant(d, d.key in RAW_LEAN && rnd() < 0.8 ? rnd() * RAW_LEAN[d.key] : rnd());
function randomizeSide(side, g, raw) {
  const other = side === 'A' ? 'B' : 'A';
  DEFS.forEach((d, i) => {
    if (!inGroup(d, g) || isLocked(d)) return;
    if (d.single) { if (d.single === side) state.A[i] = state.B[i] = raw ? rvRaw(d) : rv(d, side); return; }
    if (state.links[d.id]) return;   // shared values only change with Randomize all or Randomize linked
    state[side][i] = raw ? rvRaw(d) : rvApart(d, side, state[other][i]);
  });
  if (!raw) { mixOttGains(side, g); effectMixRules(side, g); fmCarrierRule(side, g); }
  for (let s = 0; s < 4; s++) {   // each Wavetable slot's table for this side, unless its section is locked
    const grp = `Osc ${s + 1}`;
    if (state.oscType[s] === 'wt' && (!g || g === grp) && !state.secLocks[grp]) { tables[s][side] = makeTable(TABLE_CHOICES[Math.floor(rnd() * TABLE_CHOICES.length)]); analyzeTable(s, side); }
  }
  if (!raw) { sineGuard(side); loudnessGuard(side); }
}
$('rndA').addEventListener('click', () => bulk(() => randomizeSide('A')));
$('rndB').addEventListener('click', () => bulk(() => randomizeSide('B')));
function randomizeLinked(g, raw) {   // linked knobs only: one new value shared by both sides
  DEFS.forEach((d, i) => { if (inGroup(d, g) && state.links[d.id] && !d.single && !isLocked(d)) state.A[i] = state.B[i] = raw ? rvRaw(d) : rv(d, 'A'); });
}
/* Slot types are shared by both sides, so only Randomize all (and launch) picks them; a locked section keeps its type.
   Slot 1 is never Off (Wavetable 45%, FM 40%, Sub 15%); slot 2 is Sub 30%, Wavetable 15%, FM 15%, Off 40%;
   slots 3 and 4 are Wavetable 15%, FM 10%, otherwise Off. The FX slots get four different effects from all seven,
   kept in chain order (so OTT, when it comes up, is last). */
const OSC_ODDS = [[['wt', 0.45], ['fm', 0.4], ['sub', 0.15]], [['sub', 0.3], ['wt', 0.15], ['fm', 0.15], ['off', 0.4]],
  [['wt', 0.15], ['fm', 0.1], ['off', 0.75]], [['wt', 0.15], ['fm', 0.1], ['off', 0.75]]];
const FX_POOL = ['drive', 'formant', 'mod', 'delay', 'reverb', 'lofi', 'ott'];
function randomizeTypes() {
  const pick = odds => { let r = rnd(); for (const [t, w] of odds) { if (r < w) return t; r -= w; } return odds[odds.length - 1][0]; };
  for (let s = 0; s < 4; s++) if (!state.secLocks[`Osc ${s + 1}`]) state.oscType[s] = pick(OSC_ODDS[s]);
  const locked = s => !!state.secLocks[`FX ${s + 1}`], free = [0, 1, 2, 3].filter(s => !locked(s));
  const taken = [0, 1, 2, 3].filter(locked).map(s => state.fxType[s]);
  const chosen = FX_POOL.filter(t => !taken.includes(t)).map(t => [rnd(), t]).sort((a, b) => a[0] - b[0]).slice(0, free.length).map(x => x[1])
    .sort((a, b) => FX_POOL.indexOf(a) - FX_POOL.indexOf(b));
  free.forEach((s, k) => { state.fxType[s] = chosen[k]; });
}
function randomizeAll(g, raw) {
  if (!g) randomizeTypes();
  randomizeSide('A', g, raw); randomizeSide('B', g, raw);
  for (let s = 0; s < 4; s++) if (state.fxType[s] === 'delay' && (!g || g === `FX ${s + 1}`) && !state.secLocks[`FX ${s + 1}`]) state.dlSpill[s] = rnd() < 0.5;   // Cut or Spill
  updateDlUI();
  randomizeLinked(g, raw);
  state.C = DEFS.map((d, i) => (!inGroup(d, g) || isLocked(d) || isLinked(i) ? state.C[i] : rnd() < 0.5 ? 0 : (rnd() * 2 - 1) * 0.7));
  if (!raw) ['A', 'B'].forEach(side => { sineGuard(side); loudnessGuard(side); });   // again, now that linked knobs (Pitch) have moved too
}
$('rndLinked').addEventListener('click', () => bulk(() => randomizeLinked()));
$('rndAll').addEventListener('click', () => bulk(() => randomizeAll()));
