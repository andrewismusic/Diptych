/* =====================================================================
   SEQUENCER
   Each side has its own pattern (rate, steps, scale). Both are laid on a
   shared grid of 48 ticks per quarter note. Where both sides start a note
   at the same tick, the note morphs; where only one does, the note has a
   fixed switch point on the Pattern knob. Switch points are spread evenly
   through the loop in bit-reversed order, like ordered dithering, so each
   Pattern value always gives exactly the same sequence.
   ===================================================================== */
const RATES = [['1/4', 48], ['1/4 dotted', 72], ['1/8', 24], ['1/8 dotted', 36], ['1/16', 12], ['Mixed', 0]];
const MIXED = 5;
/* A pattern is always n16 sixteenth-note steps long. The rate lays notes over that grid: a dotted 8th
   pattern of 16 steps holds notes at every third sixteenth, and the last one is cut short at the end.
   s.steps holds one entry per note slot. With Mixed, every slot has its own length (dur). */
const MIX_POOL = [12, 12, 12, 24, 24, 24, 36, 48, 72];
const patTicks = s => s.n16 * 12;
function stepPos(s) {
  const total = patTicks(s), r = RATES[s.rate][1], pos = [];
  let t = 0; s.steps.forEach((st, i) => { pos.push(t); t += r || st.dur || 12; });
  return { pos, total };
}
const stepDur = (s, i) => { const P = stepPos(s); return Math.min(RATES[s.rate][1] || s.steps[i].dur || 12, P.total - P.pos[i]); };
// Rebuild the slot list so it exactly covers the pattern, keeping whichever note was sounding at each new slot's start
function fitSlots(s, freshDurs) {
  const old = s.steps, oldP = old.length ? stepPos(s) : null, total = patTicks(s), r = RATES[s.rate][1], slots = [];
  let t = 0;
  while (t < total) {
    const dur = r || (freshDurs || !old[slots.length] || !old[slots.length].dur ? MIX_POOL[Math.floor(Math.random() * MIX_POOL.length)] : old[slots.length].dur);
    let src = null;
    if (oldP) { let k = 0; for (let i = 0; i < old.length; i++) if (oldP.pos[i] <= t) k = i; src = old[k]; }
    slots.push({ on: src ? src.on : false, note: src ? src.note : 48 + (s.root || 0), len: src ? src.len : 1, vel: src ? src.vel : 0.75, dur });
    t += dur;
  }
  s.steps = slots;
}
const giveDurs = (s, fresh) => fitSlots(s, fresh);
// generated notes stay out of the very top: anything above E5 drops an octave
const tame = n => { while (n > 76) n -= 12; return n; };
const R16 = 4;   // index of 1/16
// earlier versions stored rates as positions in a longer list that included triplets
const OLD_RATE_TICKS = [48, 72, 32, 24, 36, 16, 12, 18, 8, 6, 4];
const SCALES = {
  'Major': [0, 2, 4, 5, 7, 9, 11], 'Natural minor': [0, 2, 3, 5, 7, 8, 10], 'Dorian': [0, 2, 3, 5, 7, 9, 10],
  'Phrygian': [0, 1, 3, 5, 7, 8, 10], 'Lydian': [0, 2, 4, 6, 7, 9, 11], 'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
  'Harmonic minor': [0, 2, 3, 5, 7, 8, 11], 'Major pentatonic': [0, 2, 4, 7, 9], 'Minor pentatonic': [0, 3, 5, 7, 10],
  'Blues': [0, 3, 5, 6, 7, 10], 'Whole tone': [0, 2, 4, 6, 8, 10], 'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = n => NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
const randDegrees = (n, k) => { const d = [...Array(n).keys()]; for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d.slice(0, Math.min(k, n)).sort((x, y) => x - y); };
// Random 2/3/4 pick that many notes from the scale when you generate; the result is then fixed
const CHORDS = { 'Triad': n => [0, 2, 4], 'Seventh': n => [0, 2, 4, 6], 'Sus': n => [0, 3, 4], 'Random 2': n => randDegrees(n, 2), 'Random 3': n => randDegrees(n, 3), 'Random 4': n => randDegrees(n, 4) };
const MODES = ['Up', 'Down', 'Up-down', 'Down-up', 'Converge', 'Random'];
const MAXSTEPS = 32;

const scalePcs = s => new Set(SCALES[s.scale].map(x => (x + s.root) % 12));
function degNote(s, d) {
  const sc = SCALES[s.scale], n = sc.length;
  return 48 + s.root + sc[((d % n) + n) % n] + 12 * Math.floor(d / n);
}
function generate(s, chord, mode, octs) {
  const n = SCALES[s.scale].length, base = CHORDS[chord](n);
  let list = [];
  for (let o = 0; o < octs; o++) base.forEach(d => list.push(degNote(s, d + o * n)));
  list = [...new Set(list)].sort((x, y) => x - y);
  let order;
  if (mode === 'Up') order = list;
  else if (mode === 'Down') order = list.slice().reverse();
  else if (mode === 'Up-down') order = list.concat(list.slice(1, -1).reverse());
  else if (mode === 'Down-up') { const r = list.slice().reverse(); order = r.concat(r.slice(1, -1).reverse()); }
  else if (mode === 'Converge') { order = []; let lo = 0, hi = list.length - 1; while (lo <= hi) { order.push(list[lo++]); if (lo <= hi) order.push(list[hi--]); } }
  else { order = list.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
  if (!order.length) order = [48 + s.root];
  const P = stepPos(s);
  s.steps = s.steps.map((old, i) => ({ on: true, note: tame(order[i % order.length]), len: 1, vel: P.pos[i] % 48 === 0 ? 1 : 0.75, dur: old.dur }));
}
function makeSeq(rate, len, root, scale, chord, mode, octs) {
  const s = { rate, root, scale, n16: len, v2: 1, v3: 1, v4: 1, density: 1, dseed: Math.random(), rot: 0, steps: [] };
  fitSlots(s);
  generate(s, chord, mode, octs);
  return s;
}
const defaultSeqs = () => ({
  A: makeSeq(R16, 16, 0, 'Minor pentatonic', 'Triad', 'Up-down', 2),
  B: makeSeq(R16, 16, 0, 'Minor pentatonic', 'Seventh', 'Down', 2),
});
const cloneSeq = s => JSON.parse(JSON.stringify(s));
if (!state.seq) state.seq = defaultSeqs();
function fixSeq(s) {
  if (!s.v2) {   // move old rate positions onto the list without triplets, picking the closest rate
    const t = OLD_RATE_TICKS[s.rate] || 12;
    let best = 0; RATES.forEach((r, i) => { if (Math.abs(r[1] - t) < Math.abs(RATES[best][1] - t)) best = i; });
    s.rate = best; s.v2 = 1;
  }
  if (!s.v3) { if (s.rate === 6) s.rate = 4; s.v3 = 1; }   // 1/32 was removed
  if (!s.v4) {   // dotted 1/16 was removed, and patterns became a fixed number of sixteenths
    const oldTicks = [48, 72, 24, 36, 12, 18][s.rate], oldTotal = s.steps.reduce((t, st) => t + (oldTicks || st.dur || 12), 0);
    s.rate = s.rate === 5 ? 4 : s.rate === 6 ? MIXED : s.rate;
    s.n16 = Math.max(1, Math.min(32, Math.round(oldTotal / 12)));
    fitSlots(s); s.v4 = 1;
  }
  if (!s.n16) { s.n16 = 16; fitSlots(s); }
  if (typeof s.dseed !== 'number') s.dseed = Math.random();
  if (typeof s.density !== 'number') s.density = 1;
  if (typeof s.rot !== 'number') s.rot = 0;
  s.rot = ((s.rot % s.steps.length) + s.steps.length) % s.steps.length;
}
fixSeq(state.seq.A); fixSeq(state.seq.B);
// Scale is shared by both sides; older patches with two different scales take side A's
if (state.seq.B.root !== state.seq.A.root || state.seq.B.scale !== state.seq.A.scale) {
  state.seq.B.root = state.seq.A.root; state.seq.B.scale = state.seq.A.scale;
  setTimeout(() => { snapToScale(state.seq.B); seqChanged(); });
}
/* Density: the pattern's notes are taken in order from a fixed starting point (rot), and each gets a
   rank from the golden-ratio sequence (k × 0.618, wrapped, plus a per-pattern offset). That order is
   evenly spread but never periodic, so thinning doesn't strip out every other note (which in an
   arpeggio is often all of one pitch). The starting point moves with the notes when you shift. */
function keptSteps(s) {
  fixSeq(s);
  const n = s.steps.length, order = [];
  for (let k = 0; k < n; k++) { const i = (s.rot + k) % n; if (s.steps[i].on) order.push(i); }
  const ranked = order.map((i, k) => ({ i, key: (k * 0.6180339887 + s.dseed) % 1 })).sort((a, b) => a.key - b.key);
  const keep = new Set(ranked.slice(0, Math.round(s.density * order.length)).map(x => x.i));
  return s.steps.map((_, i) => keep.has(i));
}
// each kept note is cut off where the next kept note starts, so notes never overlap
function playLens(s, kept) {   // in ticks
  const n = s.steps.length, out = new Array(n).fill(0), P = stepPos(s);
  for (let i = 0; i < n; i++) {
    if (!kept[i]) continue;
    let gap = P.total;
    for (let d = 1; d < n; d++) { const j = (i + d) % n; if (kept[j]) { gap = (P.pos[j] - P.pos[i] + P.total) % P.total || P.total; break; } }
    out[i] = Math.min(s.steps[i].len * stepDur(s, i), gap);
  }
  return out;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const bitrev = (i, bits) => { let r = 0; for (let k = 0; k < bits; k++) { r = (r << 1) | (i & 1); i >>= 1; } return r; };
function scaleMorph(A, B) {
  const a = scalePcs(A), b = scalePcs(B), shared = new Array(12).fill(false), change = new Array(12).fill(null);
  const sharedList = [];
  for (let pc = 0; pc < 12; pc++) if (a.has(pc) && b.has(pc)) { shared[pc] = true; sharedList.push(pc); }
  // order the differing notes by distance around the circle of fifths from the shared notes
  const fifth = pc => (pc * 7) % 12;
  const anchors = sharedList.length ? sharedList : [A.root];
  const dist = pc => Math.min(...anchors.map(s => { const d = Math.abs(fifth(pc) - fifth(s)); return Math.min(d, 12 - d); }));
  const sortD = l => l.sort((x, y) => dist(x) - dist(y) || x - y);
  const aOnly = sortD([...a].filter(x => !b.has(x))), bOnly = sortD([...b].filter(x => !a.has(x)));
  const out = [];
  const addFirst = !sharedList.length;   // never let the scale go empty
  while (aOnly.length || bOnly.length) {
    if (addFirst) { if (bOnly.length) out.push({ pc: bOnly.shift(), add: true }); if (aOnly.length) out.push({ pc: aOnly.shift(), add: false }); }
    else { if (aOnly.length) out.push({ pc: aOnly.shift(), add: false }); if (bOnly.length) out.push({ pc: bOnly.shift(), add: true }); }
  }
  out.forEach((c, k) => { change[c.pc] = { add: c.add, thr: (k + 0.5) / out.length }; });
  return { shared, change };
}
function assignThresholds(list) {
  const n = list.length; if (!n) return;
  const bits = Math.max(1, Math.ceil(Math.log2(n)));
  list.map((e, i) => ({ e, k: bitrev(i, bits) })).sort((x, y) => x.k - y.k).forEach((o, r) => { o.e.thr = (r + 0.5) / n; });
}
let seqCache = null;
function buildSeq() {
  if (seqCache) return seqCache;
  const A = state.seq.A, B = state.seq.B;
  const dA = stepPos(A).total, dB = stepPos(B).total;
  let loop = dA / gcd(dA, dB) * dB;
  if (loop > 48 * 4 * 64) loop = Math.max(dA, dB);
  const map = new Map();
  const add = (side, S) => {
    const kept = keptSteps(S), lens = playLens(S, kept), P = stepPos(S);
    for (let base = 0; base < loop; base += P.total) S.steps.forEach((st, i) => {
      const t = base + P.pos[i];
      if (!kept[i] || t >= loop) return;
      let e = map.get(t); if (!e) { e = { tick: t }; map.set(t, e); }
      e[side] = { p: st.note, v: st.vel, l: lens[i] };
    });
  };
  add('a', A); add('b', B);
  const events = [...map.values()].sort((x, y) => x.tick - y.tick);
  assignThresholds(events.filter(e => !(e.a && e.b)));
  assignThresholds(events.filter(e => e.a && e.b && e.a.p !== e.b.p));
  events.forEach(e => { if (e.thr === undefined) e.thr = 0.5; });
  seqCache = { events, loop, scale: scaleMorph(A, B), dA, dB };
  return seqCache;
}
function sendSeq() { if (ready) { const s = buildSeq(); send({ type:'seq', seq: { events: s.events, loop: s.loop, scale: s.scale } }); } }
function seqChanged() { seqCache = null; sendSeq(); drawLanes(); if (sq.classList.contains('open')) drawRoll(); save(); }

