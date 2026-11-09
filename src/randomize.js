/* ---------- randomize ----------
   Values are drawn from musically useful ranges rather than the full range
   of each knob, so results are usually playable. */
const rnd = Math.random;
const logr = (lo, hi) => lo * Math.pow(hi / lo, rnd());
const RND = {
  // macros: Envelope picks where each side sits between pluck and pad; the others start at 50% ("as generated")
  menv: () => rnd(), mbright: () => 0.5, mfx: () => 0.5, mwet: () => 0.5,
  harm: () => (rnd() < 0.7 ? 1 : 0.6 + rnd() * 0.4),
  // FM: Patch is locked at full range by default, like Wave; each side's patch comes from fmPatch (archetypes)
  fmx: side => (side === 'A' ? 0 : 1), fpitch: () => { const r = rnd(); return r < 0.15 ? -12 : r > 0.85 ? 12 : 0; },
  // wavetables and pattern
  posA: () => rnd(), posB: () => rnd(),
  wave: side => (side === 'A' ? (rnd() < 0.6 ? 0 : rnd() * 0.4) : (rnd() < 0.6 ? 1 : 0.6 + rnd() * 0.4)),
  pattern: side => (side === 'A' ? (rnd() < 0.6 ? 0 : rnd() * 0.4) : (rnd() < 0.6 ? 1 : 0.6 + rnd() * 0.4)),
  // oscillators: Level decides whether each one is heard on this side (set by pickOscs; oscGuard keeps at least one)
  olevel: () => 0, opan: () => (rnd() < 0.5 ? 0 : (rnd() * 2 - 1) * 0.6),
  byp: () => (rnd() < 0.8 ? 0 : rnd() * 0.5),
  pitch: () => { const r = rnd(); return r < 0.15 ? -12 : r > 0.85 ? 12 : 0; },
  fine: () => (rnd() < 0.7 ? 0 : (rnd() * 2 - 1) * 15),
  // Sampler: Sample is locked at full range by default, like Wave; Start usually at the top; Key track usually full
  sample: side => (side === 'A' ? 0 : 1), sstart: () => (rnd() < 0.6 ? 0 : rnd() * 0.4),
  spitch: () => { const r = rnd(); return r < 0.15 ? -12 : r > 0.85 ? 12 : 0; }, sfine: () => (rnd() < 0.7 ? 0 : (rnd() * 2 - 1) * 15),
  strack: () => (rnd() < 0.85 ? 1 : rnd() < 0.5 ? 0 : rnd()),
  sloop: () => 0,   // set after the sample is picked: usually on for sustained samples (see randomizeSide)
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
  // the amp envelope is a medium shape with some variety: the Envelope macro takes it to a pluck or a pad (2026-11-06)
  aatk: () => logr(0.002, 0.02),
  adec: () => logr(0.4, 1.2),
  asus: () => 0.4 + rnd() * 0.35,
  arel: () => logr(0.2, 0.6),
  level: () => 0.5 + rnd() * 0.5,
  pan: () => (rnd() * 2 - 1) * 0.6,
  // effects: settings over the full range (the synth is meant to surprise); every effect is always in the chain, so each
  // is on for a side only so often (owner's odds, 2026-10-22): Drive 20%, Formant 10%, Modulation 40%, Delay 50%,
  // Reverb 50%, OTT 50%, Lo-fi 10% (lofiGate). A side hears about 2.3 effects on average.
  drive: () => rnd(), dshape: () => rnd(), dmix: () => (rnd() < 0.8 ? 0 : rnd()),
  fvowel: () => rnd(), fshift: () => (rnd() * 2 - 1) * 12, freso: () => rnd(), fmix: () => (rnd() < 0.9 ? 0 : rnd()),
  mtype: () => rnd(), mrate: () => logr(0.02, 10), mdepth: () => rnd(), mfb: () => rnd(), mmix: () => (rnd() < 0.6 ? 0 : rnd()),
  dltime: () => Math.floor(rnd() * 12), dlfb: () => rnd() * 0.95, dlpp: () => rnd(), dltone: () => rnd(), dlmix: () => (rnd() < 0.5 ? 0 : rnd() < 0.75 ? rnd() * 0.35 : rnd() < 0.6 ? 0.35 + rnd() * 0.15 : 0.5 + rnd() * 0.5),   // mostly up to 35%, rarely above 50%
  dlspill: () => (rnd() < 0.5 ? 1 : 0),
  rvsize: () => rnd(), rvdecay: () => logr(0.2, 20), rvdamp: () => rnd(), rvmix: () => (rnd() < 0.5 ? 0 : rnd() < 0.65 ? rnd() * 0.35 : 0.35 + rnd() * 0.65),
  // lo-fi leans gentle: wow, flutter and codec are off two times in three, dropouts nine times in ten (and lofiGate turns it all off 90% of the time)
  lwow: () => (rnd() < 0.66 ? 0 : rnd() ** 2), lflut: () => (rnd() < 0.66 ? 0 : rnd() ** 2), lchar: () => rnd() ** 2,
  ldrop: () => (rnd() < 0.9 ? 0 : rnd() ** 2), lcodec: () => (rnd() < 0.66 ? 0 : rnd() ** 2),
  lnoise: () => rnd(), lnmix: () => (rnd() < 0.85 ? rnd() * 0.15 : 0.15 + rnd() * 0.2),   // never above 35%, mostly 0–15%
  ottdepth: () => (rnd() < 0.5 ? 0 : 0.05 + rnd() ** 1.5 * 0.55), otttime: () => logr(0.1, 4),
  ottlo: () => logr(40, 500), otthi: () => logr(600, 10000),
  ottgl: () => (rnd() * 2 - 1) * 3, ottgm: () => (rnd() * 2 - 1) * 3, ottgh: () => (rnd() * 2 - 1) * 3,   // mixed signs enforced in mixOttGains
  ottout: () => 0,
};
const TABLE_CHOICES = Object.keys(PRESETS).filter(n => n !== 'Sine');
/* What each side hears (2026-11-06; owner: the first oscillator needn't be a Wavetable). The player never sees the
   oscillators: each side picks a lead engine, Wavetable 45% (either of the two), FM 30%, Sampler 25%; then a Sub
   comes in under it 30% of the time, and a second layer (one of the other engines) 30% of the time. */
const LEADS = [['wt', 0.45], ['fm', 0.3], ['smp', 0.25]], SUB_ODDS = 0.3, LAYER_ODDS = 0.3;
const OSC_ON = [0.25, 0.25, 0.3, 0.3, 0.35];   // only for oscGuard's last resort: rough share each oscillator is heard
function pickOscs(side) {
  const lv = s => oi(s, 'olevel'), on = new Set();
  let r = rnd(), lead = LEADS[0][0];
  for (const [t, p] of LEADS) { if (r < p) { lead = t; break; } r -= p; }
  const slotOf = t => (t === 'wt' ? WT_SLOTS[Math.floor(rnd() * WT_SLOTS.length)] : t === 'fm' ? FM_SLOT : SMP_SLOT);
  on.add(slotOf(lead));
  if (rnd() < SUB_ODDS) on.add(SUB_SLOT);
  if (rnd() < LAYER_ODDS) { const others = [0, 1, SMP_SLOT, FM_SLOT].filter(s => !on.has(s)); on.add(others[Math.floor(rnd() * others.length)]); }
  OSC_KIND.forEach((_, s) => { if (isFree(lv(s))) state[side][lv(s)] = on.has(s) ? norm(DEFS[lv(s)], 0.5 + rnd() * 0.4) : 0; });
}
/* FM guardrails (2026-11-06): FM sounds good in a narrow part of its range, so a side's FM patch is never fully random.
   It comes from one of eight archetypes (electric piano, bell, bass, brass, pluck, organ, glass, growl), each with its
   algorithm, simple ratios, modulator levels (index) and decays in ranges that work, then jittered. The engine adds the
   rest: indexes shrink on high notes and are capped below aliasing, and the Envelope and Brightness macros scale decays
   and indexes. Here: the summed index of the operators that modulate stays under 9 (a busy algorithm can't turn to noise). */
const pk = a => a[Math.floor(rnd() * a.length)], rr = (lo, hi) => lo + rnd() * (hi - lo), HOLD = 30;
const FM_TYPES = [
  ['Electric piano', 0.18, () => { const tine = rnd() < 0.4;
    return { alg: 4, fb: 0, ops: [[1, rr(0.8, 1), rr(2, 5)], tine ? [14, rr(0.15, 0.3), rr(0.04, 0.2)] : [1, rr(0.3, 0.5), rr(0.5, 2)], [1, rr(0.6, 0.8), rr(2, 6)], [pk([1, 2]), rr(0.25, 0.45), rr(0.6, 2)]] }; }],
  ['Bell', 0.14, () => ({ alg: pk([4, 5]), fb: 0, ops: [[1, rr(0.8, 1), rr(3, 8)], [pk([3, 4, 5, 7]), rr(0.35, 0.55), rr(2, 6)], [pk([1, 2, 3]), rr(0.5, 0.8), rr(3, 8)], [pk([2, 3, 5]), rr(0.3, 0.5), rr(1.5, 5)]] })],
  ['Bass', 0.14, () => ({ alg: pk([0, 2]), fb: rr(0.15, 0.4), ops: [[1, 1, HOLD], [1, rr(0.45, 0.65), rr(0.15, 0.6)], [pk([1, 2]), rr(0.25, 0.4), rr(0.1, 0.4)], [1, rr(0.15, 0.3), rr(0.1, 0.3)]] })],
  ['Brass', 0.12, () => ({ alg: 1, fb: rr(0.1, 0.3), ops: [[1, 1, HOLD], [1, rr(0.3, 0.5), HOLD], [1, rr(0.2, 0.35), HOLD], [pk([1, 2]), rr(0.15, 0.3), HOLD]] })],
  ['Pluck', 0.16, () => ({ alg: 0, fb: rr(0.05, 0.2), ops: [[1, 1, rr(0.4, 1.5)], [pk([1, 2]), rr(0.4, 0.7), rr(0.08, 0.5)], [pk([1, 3]), rr(0.3, 0.5), rr(0.05, 0.3)], [1, rr(0.2, 0.4), rr(0.05, 0.2)]] })],
  ['Organ', 0.1, () => ({ alg: 7, fb: rr(0, 0.15), ops: [[1, 0.9, HOLD], [2, rr(0.5, 0.7), HOLD], [pk([3, 4]), rr(0.3, 0.5), HOLD], [pk([0.5, 6, 8]), rr(0.15, 0.35), HOLD]] })],
  ['Glass', 0.08, () => ({ alg: pk([3, 6]), fb: 0, ops: [[1, rr(0.8, 1), rr(1, 3)], [pk([2, 3]), rr(0.4, 0.6), rr(1, 3)], [pk([4, 5]), rr(0.25, 0.45), rr(0.8, 2.5)], [pk([7, 9, 11]), rr(0.15, 0.3), rr(0.05, 0.3)]] })],
  ['Growl', 0.08, () => ({ alg: 2, fb: rr(0.35, 0.55), ops: [[1, 1, HOLD], [pk([1, 2]), rr(0.35, 0.55), HOLD], [1, rr(0.3, 0.5), rr(0.5, 3)], [1, rr(0.3, 0.5), HOLD]] })],
];
const ratioIx = r => Math.max(0, FM_RATIOS.indexOf(r));
function fmPatch(side) {
  const fi = key => oi(FM_SLOT, key + side);
  let r = rnd(), make = FM_TYPES[0][2];
  for (const [, p, f] of FM_TYPES) { if (r < p) { make = f; break; } r -= p; }
  const P = make(), routes = OscFM.ALGS[P.alg][0];
  // which operators modulate another: routes are [4->3, 4->2, 4->1, 3->2, 3->1, 2->1]
  const mods = [false, routes[5] > 0, routes[3] > 0 || routes[4] > 0, routes[0] > 0 || routes[1] > 0 || routes[2] > 0];
  // jitter, then keep the modulators' summed index in bounds
  const ops = P.ops.map(([rt, l, d]) => [rt, clamp(l * rr(0.9, 1.1)), d >= HOLD ? HOLD : Math.min(20, d * rr(0.8, 1.25))]);
  const modI = ops.reduce((t, o, j) => t + (mods[j] ? OscFM.index(o[1]) : 0), 0);
  if (modI > 9) { const k = Math.sqrt(9 / modI); ops.forEach((o, j) => { if (mods[j]) o[1] *= k; }); }
  const set = (key, v) => { const i = fi(key); state.A[i] = state.B[i] = quant(DEFS[i], clamp(norm(DEFS[i], v))); };
  set('alg', P.alg); set('fb', Math.min(0.6, P.fb));
  ops.forEach(([rt, l, d], j) => { set(`r${j + 1}`, ratioIx(rt)); set(`l${j + 1}`, l); set(`d${j + 1}`, d); });
  fmTypeName[side] = FM_TYPES.find(t => t[2] === make)[0];
}
const fmTypeName = { A: '', B: '' };   // the archetype each side's FM patch came from (shown in the developer view only)
// a side's FM patch as OscFM.cycle wants it
const fmOf = side => {
  const v = key => MorphEngine.denorm(DEFS[oi(FM_SLOT, key + side)], state[side][oi(FM_SLOT, key + side)]);
  return { algo: v('alg'), fb: v('fb'), r: [1, 2, 3, 4].map(j => FM_RATIOS[v('r' + j)]), l: [1, 2, 3, 4].map(j => v('l' + j)) };
};
const FMCYC = new Float32Array(2048);
// the spectrum of one cycle of a side's FM patch (at full envelope), in harmonic order like a wavetable frame
function fmSpectrum(side) { OscFM.cycle(fmOf(side), 2048, FMCYC); return MorphEngine.analyze(FMCYC); }
const rv = (d, side) => quant(d, clamp(norm(d, RND[d.key](side, d))));
// Keep morphs dramatic: a side's new value lands at least 15% of the knob's throw away from the other side.
// Parameters whose chance of landing at 0 (or low) matters more than the A/B gap skip the 15% rule;
// both sides at 0 is fine for them. The rule would otherwise re-roll away their stated odds.
const SPREAD = 0.15, NO_SPREAD = new Set(['lnmix', 'ottgl', 'ottgm', 'ottgh', 'fmix', 'mmix', 'dlmix', 'rvmix', 'lwow', 'lflut', 'lcodec', 'ldrop',
  'glide', 'unison', 'vdepth', 'vrfade', 'mode', 'byp', 'opan', 'soct', 'sstart', 'strack', 'olevel', 'dmix', 'ottdepth', 'lchar', 'sloop', 'dlspill',
  'mbright', 'mfx', 'mwet', 'harm', 'aatk', 'adec', 'asus', 'arel', 'fpitch']);   // 2026-11-06: the Envelope macro now sets A and B apart
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
// Lo-fi is off on a side 90% of the time: every amount at 0
const LOFI_AMOUNTS = ['lwow', 'lflut', 'lchar', 'lnmix', 'ldrop', 'lcodec'];
function lofiGate(side, g) {
  if (!inGroup(DEFS[IX.lwow], g) || rnd() >= 0.9) return;
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
/* Level match: whichever oscillators a side hears, together they come out about as loud as one full-level sawtooth
   (RMS 0.58, the level built-in and loaded samples are matched to). Each heard oscillator's own loudness (its wave,
   the Sub's shape and drive, the sample from its Start point) times its Level is summed as power, and the free Levels
   are scaled together, keeping their balance. Before this, a side hearing three oscillators came out about 5 dB louder
   than a side hearing one. */
const LEVEL_RMS = 0.58;
function oscPower(s, side) {
  const t = OSC_KIND[s], val = key => MorphEngine.denorm(DEFS[oi(s, key)], state[side][oi(s, key)]);
  if (t === 'wt') {
    MorphEngine.frameAt(spec[s].A, state.A[oi(s, 'posA')], true, W.fa[0], W.fa[1]);
    MorphEngine.frameAt(spec[s].B, state.A[oi(s, 'posB')], true, W.fb[0], W.fb[1]);
    MorphEngine.interp(W.fa[0], W.fa[1], W.fb[0], W.fb[1], val('wave'), true, W.fr[0], W.fr[1]);
    let p = 0; for (let h = 1; h <= 512; h++) p += (W.fr[0][h] ** 2 + W.fr[1][h] ** 2) / 2;
    return p;
  }
  if (t === 'fm') {   // the patch this side plays (Patch is at full range by default: A plays A's)
    OscFM.cycle(fmOf(val('fmx') < 0.5 ? 'A' : 'B'), 2048, FMCYC);
    let p = 0; for (const x of FMCYC) p += x * x;
    return p / 2048;
  }
  if (t === 'sub') {
    const g = 1 + 7 * val('sdrive'), tg = Math.tanh(g); let p = 0;
    for (let n = 0; n < 256; n++) p += OscSub.sample(n / 256, 1 / 256, val('sshape'), g, tg) ** 2;
    return p / 256;
  }
  const ref = state.smp[val('sample') < 0.5 ? 'A' : 'B'], data = ref && ref.id ? [smpData.A, smpData.B].find(x => x && x.id === ref.id) : smpFor(ref);
  if (!data) return LEVEL_RMS ** 2;
  const a = Math.floor(val('sstart') * (data.d.length - 1)), b = Math.min(data.d.length, a + Math.round(0.3 * data.sr));
  let p = 0; for (let i = a; i < b; i++) p += data.d[i] ** 2;
  return b > a ? p / (b - a) : 0;
}
function levelMatch(side) {
  let fixed = 0, free = 0; const freeS = [];
  OSC_KIND.forEach((_, s) => {
    const i = oi(s, 'olevel'), lv = state[side][i]; if (lv === 0) return;
    const pw = oscPower(s, side) * (lv / 0.8) ** 2;   // Level 80% is unity
    if (isFree(i)) { free += pw; freeS.push(i); } else fixed += pw;
  });
  if (!freeS.length || free <= 0) return;
  const k = Math.sqrt(Math.max(0, LEVEL_RMS ** 2 - fixed) / free);
  freeS.forEach(i => { state[side][i] = Math.max(0.05, Math.min(1, state[side][i] * k)); });
}
// A near-sine wave through a low-pass set low, a high-pass set high, or a band-pass can be close to silent, so when a
// Wavetable slot that goes through the filter is nearly pure, the filter leaves band-pass for low-pass and its cutoff moves toward the open end.
function sineGuard(side) {
  const ci = IX.cutoff, mi = IX.mode, cd = DEFS[ci], md = DEFS[mi];
  for (const s of [...WT_SLOTS, FM_SLOT]) {
    if (state[side][oi(s, 'olevel')] === 0 || state[side][oi(s, 'byp')] > 0.5 || isLocked(cd) || state.links[cd.id]) continue;
    if (OSC_KIND[s] === 'fm') { const f = fmSpectrum(state[side][oi(s, 'fmx')] < 0.5 ? 'A' : 'B'); W.fr[0].set(f.re); W.fr[1].set(f.im); }
    else {
      MorphEngine.frameAt(spec[s].A, state.A[oi(s, 'posA')], true, W.fa[0], W.fa[1]);
      MorphEngine.frameAt(spec[s].B, state.A[oi(s, 'posB')], true, W.fb[0], W.fb[1]);
      MorphEngine.interp(W.fa[0], W.fa[1], W.fb[0], W.fb[1], state[side][oi(s, 'wave')], true, W.fr[0], W.fr[1]);
    }
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
  } else if (t === 'fm') {
    const f = fmSpectrum(val('fmx') < 0.5 ? 'A' : 'B'); re = f.re; im = f.im;
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
    const t = OSC_KIND[s], note = 60 + (t === 'wt' ? val(oi(s, 'pitch')) : t === 'smp' ? val(oi(s, 'spitch')) : t === 'fm' ? val(oi(s, 'fpitch')) : p1 + 12 * val(oi(s, 'soct')));
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
/* Every side uses at least one effect, so the FX intensity and FX wet macros always do something:
   if none came up, Reverb (or Delay, if Reverb is locked) comes on gently. */
function fxGuard(side, g) {
  if (g) return;
  const on = FX_KIND.some(t => Object.entries(MorphEngine.FX_CLASSES[t].REST).some(([key, v0]) => MorphEngine.denorm(DEFS[IX[key]], state[side][IX[key]]) !== v0));
  if (on) return;
  const i = [IX.rvmix, IX.dlmix].find(isFree);
  if (i !== undefined) state[side][i] = 0.15 + rnd() * 0.15;
}
function randomizeSide(side, g, raw) {
  const other = side === 'A' ? 'B' : 'A';
  DEFS.forEach((d, i) => {
    if (!inGroup(d, g) || isLocked(d)) return;
    if (d.seq) return;   // a side's sequencer settings change with the sequence dice, not the sound
    if (d.eng === 'fm' && d.single) return;   // a side's FM patch comes whole from fmPatch
    if (d.single) { if (d.single === side) state.A[i] = state.B[i] = raw ? rvRaw(d) : rv(d, side); return; }
    if (state.links[d.id]) return;   // shared values only change with Randomize all or Randomize linked
    state[side][i] = raw ? rvRaw(d) : rvApart(d, side, state[other][i]);
  });
  if (!raw) { if (!g) pickOscs(side); oscGuard(side); lofiGate(side, g); mixOttGains(side, g); effectMixRules(side, g); fxGuard(side, g); }
  if ((!g || g === 'FM') && !state.secLocks.FM) fmPatch(side);
  const mine = s => (!g || g === OSC_NAMES[s]) && !state.secLocks[OSC_NAMES[s]];
  for (const s of WT_SLOTS) if (mine(s)) { tables[s][side] = makeTable(TABLE_CHOICES[Math.floor(rnd() * TABLE_CHOICES.length)]); analyzeTable(s, side); }   // each Wavetable's table for this side, unless its section is locked
  if (mine(SMP_SLOT)) {
    state.smp[side] = { name: FACTORY_NAMES[Math.floor(rnd() * FACTORY_NAMES.length)] };   // a built-in sample
    // Loop: usually on for a sustained sample, usually off for plucks and hits
    const li = oi(SMP_SLOT, 'sloop'), f = FACTORY[state.smp[side].name];
    if (isFree(li)) state[side][li] = rnd() < (f.sustained ? 0.8 : 0.15) ? 1 : 0;
  }
  if (!raw) { levelMatch(side); sineGuard(side); loudnessGuard(side); }
}
$('rndA').addEventListener('click', () => bulk(() => randomizeSide('A')));
$('rndB').addEventListener('click', () => bulk(() => randomizeSide('B')));
function randomizeLinked(g, raw) {   // linked knobs only: one new value shared by both sides
  DEFS.forEach((d, i) => { if (inGroup(d, g) && state.links[d.id] && !d.single && !isLocked(d)) state.A[i] = state.B[i] = raw ? rvRaw(d) : rv(d, 'A'); });
}
function randomizeAll(g, raw) {
  randomizeSide('A', g, raw); randomizeSide('B', g, raw);
  randomizeLinked(g, raw);
  state.C = DEFS.map((d, i) => (!inGroup(d, g) || isLocked(d) || isLinked(i) || d.opts || d.seq ? state.C[i] : rnd() < 0.5 ? 0 : (rnd() * 2 - 1) * 0.7));
  if (!raw) ['A', 'B'].forEach(side => { sineGuard(side); loudnessGuard(side); });   // again, now that linked knobs (Pitch) have moved too
}
$('rndLinked').addEventListener('click', () => bulk(() => randomizeLinked()));
$('rndAll').addEventListener('click', () => bulk(() => randomizeAll()));
