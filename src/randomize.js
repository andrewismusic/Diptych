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
  // oscillators: Level decides whether each one is heard on this side (see OSC_ON; oscGuard keeps at least one)
  olevel: (side, d) => (rnd() < OSC_ON[d.slot] ? 0.5 + rnd() * 0.4 : 0), opan: () => (rnd() < 0.5 ? 0 : (rnd() * 2 - 1) * 0.6),
  byp: () => (rnd() < 0.8 ? 0 : rnd() * 0.5),
  pitch: () => { const r = rnd(); return r < 0.15 ? -12 : r > 0.85 ? 12 : 0; },
  fine: () => (rnd() < 0.7 ? 0 : (rnd() * 2 - 1) * 15),
  // Sampler: Sample is locked at full range by default, like Wave; Start usually at the top; Key track usually full
  sample: side => (side === 'A' ? 0 : 1), sstart: () => (rnd() < 0.6 ? 0 : rnd() * 0.4),
  spitch: () => { const r = rnd(); return r < 0.15 ? -12 : r > 0.85 ? 12 : 0; }, sfine: () => (rnd() < 0.7 ? 0 : (rnd() * 2 - 1) * 15),
  strack: () => (rnd() < 0.85 ? 1 : rnd() < 0.5 ? 0 : rnd()),
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
  // effects: settings over the full range (the synth is meant to surprise); every effect is always in the chain,
  // so each mix is 0 (off on this side) often enough that a side hears about three effects on average
  drive: () => rnd(), dshape: () => rnd(), dmix: () => (rnd() < 0.6 ? 0 : rnd()),
  fvowel: () => rnd(), fshift: () => (rnd() * 2 - 1) * 12, freso: () => rnd(), fmix: () => (rnd() < 0.8 ? 0 : rnd()),
  mtype: () => rnd(), mrate: () => logr(0.02, 10), mdepth: () => rnd(), mfb: () => rnd(), mmix: () => (rnd() < 0.65 ? 0 : rnd()),
  dltime: () => Math.floor(rnd() * 12), dlfb: () => rnd() * 0.95, dlpp: () => rnd(), dltone: () => rnd(), dlmix: () => (rnd() < 0.55 ? 0 : rnd() < 0.75 ? rnd() * 0.35 : rnd() < 0.6 ? 0.35 + rnd() * 0.15 : 0.5 + rnd() * 0.5),   // mostly up to 35%, rarely above 50%
  rvsize: () => rnd(), rvdecay: () => logr(0.2, 20), rvdamp: () => rnd(), rvmix: () => (rnd() < 0.5 ? 0 : rnd() < 0.65 ? rnd() * 0.35 : 0.35 + rnd() * 0.65),
  // lo-fi leans gentle: wow, flutter and codec are off two times in three, dropouts nine times in ten (and lofiGate turns it all off 70% of the time)
  lwow: () => (rnd() < 0.66 ? 0 : rnd() ** 2), lflut: () => (rnd() < 0.66 ? 0 : rnd() ** 2), lchar: () => rnd() ** 2,
  ldrop: () => (rnd() < 0.9 ? 0 : rnd() ** 2), lcodec: () => (rnd() < 0.66 ? 0 : rnd() ** 2),
  lnoise: () => rnd(), lnmix: () => (rnd() < 0.85 ? rnd() * 0.15 : 0.15 + rnd() * 0.2),   // never above 35%, mostly 0–15%
  ottdepth: () => (rnd() < 0.5 ? 0 : 0.05 + rnd() ** 1.5 * 0.55), otttime: () => logr(0.1, 4),
  ottlo: () => logr(40, 500), otthi: () => logr(600, 10000),
  ottgl: () => (rnd() * 2 - 1) * 3, ottgm: () => (rnd() * 2 - 1) * 3, ottgh: () => (rnd() * 2 - 1) * 3,   // mixed signs enforced in mixOttGains
  ottout: () => 0,
};
const TABLE_CHOICES = Object.keys(PRESETS).filter(n => n !== 'Sine');
const OSC_ON = [0.85, 0.4, 0.3, 0.4];   // chance each oscillator is heard on a side: Wavetable 1, Wavetable 2, Sub, Sampler
const rv = (d, side) => quant(d, clamp(norm(d, RND[d.key](side, d))));
// Keep morphs dramatic: a side's new value lands at least 15% of the knob's throw away from the other side.
// Parameters whose chance of landing at 0 (or low) matters more than the A/B gap skip the 15% rule;
// both sides at 0 is fine for them. The rule would otherwise re-roll away their stated odds.
const SPREAD = 0.15, NO_SPREAD = new Set(['lnmix', 'ottgl', 'ottgm', 'ottgh', 'fmix', 'mmix', 'dlmix', 'rvmix', 'lwow', 'lflut', 'lcodec', 'ldrop',
  'glide', 'unison', 'vdepth', 'vrfade', 'mode', 'byp', 'opan', 'soct', 'sstart', 'strack', 'olevel', 'dmix', 'ottdepth', 'lchar']);
function rvApart(d, side, other) {
  if (NO_SPREAD.has(d.key)) return rv(d, side);
  for (let k = 0; k < 12; k++) { const x = rv(d, side); if (Math.abs(x - other) >= SPREAD) return x; }
  const room = Math.max(other, 1 - other);   // no luck from the usual range: step toward whichever end has more room
  return quant(d, clamp(other + (other <= 0.5 ? 1 : -1) * (SPREAD + rnd() * (room - SPREAD))));
}
// A parameter is locked if its own padlock is on or its whole section is locked.
// Section locks sit on top of the individual ones, so unlocking a section brings back each knob's own setting.
const isLocked = d => !!state.locks[d.id] || !!state.secLocks[d.group];
const inGroup = (d, g) => !g || d.group === g;
const isFree = i => !isLocked(DEFS[i]) && !state.links[DEFS[i].id];
/* OTT band gains: within ±3 dB, and never all boosting or all cutting on one side. A side where OTT is off
   (Depth 0) gets flat band gains, so it is truly off there (and costs nothing when it's off on both sides). */
function mixOttGains(side, g) {
  if (!inGroup(DEFS[IX.ottgl], g)) return;
  const ix = ['ottgl', 'ottgm', 'ottgh'].map(k => IX[k]), free = ix.filter(isFree);
  if (!free.length) return;
  if (state[side][IX.ottdepth] === 0) { free.forEach(i => { state[side][i] = norm(DEFS[i], 0); }); return; }
  const val = i => MorphEngine.denorm(DEFS[i], state[side][i]);
  const sg = ix.map(val).filter(x => Math.abs(x) > 0.05).map(Math.sign);
  if (sg.length === 3 && sg.every(x => x === sg[0])) {
    const i = free[Math.floor(rnd() * free.length)];
    state[side][i] = norm(DEFS[i], -val(i));
  }
}
// Lo-fi is off on a side 70% of the time: every amount at 0
const LOFI_AMOUNTS = ['lwow', 'lflut', 'lchar', 'lnmix', 'ldrop', 'lcodec'];
function lofiGate(side, g) {
  if (!inGroup(DEFS[IX.lwow], g) || rnd() >= 0.7) return;
  LOFI_AMOUNTS.map(k => IX[k]).filter(isFree).forEach(i => { state[side][i] = 0; });
}
// at least one oscillator is heard on each side: if every Level came up 0, one free oscillator comes on (by the same odds)
function oscGuard(side) {
  const lv = s => oi(s, 'olevel');
  if (OSC_KIND.some((_, s) => state[side][lv(s)] > 0)) return;
  const free = OSC_KIND.map((_, s) => s).filter(s => isFree(lv(s)));
  if (!free.length) return;
  let r = rnd() * free.reduce((t, s) => t + OSC_ON[s], 0), s = free[0];
  for (const k of free) { if (r < OSC_ON[k]) { s = k; break; } r -= OSC_ON[k]; }
  state[side][lv(s)] = norm(DEFS[lv(s)], 0.5 + rnd() * 0.4);
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
// A near-sine wave through a low-pass set low, a high-pass set high, or a band-pass can be close to silent, so when a
// Wavetable slot that goes through the filter is nearly pure, the filter leaves band-pass for low-pass and its cutoff moves toward the open end.
function sineGuard(side) {
  const ci = IX.cutoff, mi = IX.mode, cd = DEFS[ci], md = DEFS[mi];
  for (const s of WT_SLOTS) {
    if (state[side][oi(s, 'olevel')] === 0 || state[side][oi(s, 'byp')] > 0.5 || isLocked(cd) || state.links[cd.id]) continue;
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
   of every oscillator heard on that side go through its Bypass split and the filter, at the filter envelope's peak and at sustain.
   If less than 1% of the power (-20 dB) gets through at both, that side's filter is re-rolled (up to 10 times),
   and as a last resort it opens up as a low-pass. */
function filterMag2(f, fc, reso, mode) {
  const w = f / fc, k = 2 - 1.96 * reso, bpG = Math.sqrt(k * 2);
  const wl = mode < 0.5 ? 1 - mode * 2 : 0, wb = mode < 0.5 ? mode * 2 : 2 - mode * 2, wh = mode < 0.5 ? 0 : mode * 2 - 1;
  const nr = wl - wh * w * w, ni = wb * bpG * w, dr = 1 - w * w, di = k * w;
  return (nr * nr + ni * ni) / (dr * dr + di * di);
}
// harmonics [frequency, power] of slot s on this side, for a note
function slotHarmonics(s, side, f0) {
  const t = OSC_KIND[s], val = key => MorphEngine.denorm(DEFS[oi(s, key)], state[side][oi(s, key)]), harm = [];
  let re, im;
  if (t === 'wt') {
    MorphEngine.frameAt(spec[s].A, state.A[oi(s, 'posA')], true, W.fa[0], W.fa[1]);
    MorphEngine.frameAt(spec[s].B, state.A[oi(s, 'posB')], true, W.fb[0], W.fb[1]);
    MorphEngine.interp(W.fa[0], W.fa[1], W.fb[0], W.fb[1], state[side][oi(s, 'wave')], true, W.fr[0], W.fr[1]);
    re = W.fr[0]; im = W.fr[1];
  } else if (t === 'smp') {   // the spectrum of the sample this side mostly plays, from its Start point, at this note's speed
    const ref = state.smp[val('sample') < 0.5 ? 'A' : 'B'], data = ref && ref.id ? (smpData.A && smpData.A.id === ref.id ? smpData.A : smpData.B && smpData.B.id === ref.id ? smpData.B : null) : smpFor(ref);
    if (!data) return [[f0, 1]];
    const N = 2048, st = Math.floor(val('sstart') * Math.max(0, data.d.length - N)), fr = new Float64Array(N), fi = new Float64Array(N);
    for (let i = 0; i < N; i++) fr[i] = (data.d[st + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    MorphEngine.fft(fr, fi, false);
    for (let k = 1; k < N / 2; k++) { const f = k * data.sr / N * f0 / C4; if (f < 20000) harm.push([f, fr[k] ** 2 + fi[k] ** 2]); }
    return harm.length ? harm : [[f0, 1]];
  } else return [[f0, 1]];
  for (let h = 1; h <= 512 && f0 * h < 20000; h++) harm.push([f0 * h, re[h] ** 2 + im[h] ** 2]);
  return harm;
}
function passedDb(side) {
  const val = i => MorphEngine.denorm(DEFS[i], state[side][i]);
  const cut = val(IX.cutoff), reso = val(IX.reso), mode = val(IX.mode), env = val(IX.envamt), kt = val(IX.keytrack), fsus = val(IX.fsus);
  const p1 = val(oi(0, 'pitch'));   // the Sub follows Wavetable 1
  const slots = OSC_KIND.map((t, s) => s).filter(s => state[side][oi(s, 'olevel')] > 0).map(s => {
    const t = OSC_KIND[s], note = 60 + (t === 'wt' ? val(oi(s, 'pitch')) : t === 'smp' ? val(oi(s, 'spitch')) : p1 + 12 * val(oi(s, 'soct')));
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
  if (!raw) { oscGuard(side); lofiGate(side, g); mixOttGains(side, g); effectMixRules(side, g); }
  const mine = s => (!g || g === OSC_NAMES[s]) && !state.secLocks[OSC_NAMES[s]];
  for (const s of WT_SLOTS) if (mine(s)) { tables[s][side] = makeTable(TABLE_CHOICES[Math.floor(rnd() * TABLE_CHOICES.length)]); analyzeTable(s, side); }   // each Wavetable's table for this side, unless its section is locked
  if (mine(SMP_SLOT)) state.smp[side] = { name: FACTORY_NAMES[Math.floor(rnd() * FACTORY_NAMES.length)] };   // a built-in sample
  if (!raw) { sineGuard(side); loudnessGuard(side); }
}
$('rndA').addEventListener('click', () => bulk(() => randomizeSide('A')));
$('rndB').addEventListener('click', () => bulk(() => randomizeSide('B')));
function randomizeLinked(g, raw) {   // linked knobs only: one new value shared by both sides
  DEFS.forEach((d, i) => { if (inGroup(d, g) && state.links[d.id] && !d.single && !isLocked(d)) state.A[i] = state.B[i] = raw ? rvRaw(d) : rv(d, 'A'); });
}
function randomizeAll(g, raw) {
  randomizeSide('A', g, raw); randomizeSide('B', g, raw);
  const mine = grp => (!g || g === grp) && !state.secLocks[grp];
  if (mine('Delay')) state.dlSpill = rnd() < 0.5;   // Cut or Spill
  // Loop: usually on when either side plays a sustained sample, usually off for plucks and hits
  if (mine('Sampler')) {
    const sus = ['A', 'B'].some(k => { const r = state.smp[k]; return r && !r.id && FACTORY[r.name] && FACTORY[r.name].sustained; });
    state.smpLoop = rnd() < (sus ? 0.8 : 0.15);
  }
  randomizeLinked(g, raw);
  state.C = DEFS.map((d, i) => (!inGroup(d, g) || isLocked(d) || isLinked(i) ? state.C[i] : rnd() < 0.5 ? 0 : (rnd() * 2 - 1) * 0.7));
  if (!raw) ['A', 'B'].forEach(side => { sineGuard(side); loudnessGuard(side); });   // again, now that linked knobs (Pitch) have moved too
}
$('rndLinked').addEventListener('click', () => bulk(() => randomizeLinked()));
$('rndAll').addEventListener('click', () => bulk(() => randomizeAll()));
