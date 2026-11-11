/* ---------- piano roll editor ---------- */
const sq = $('sq'), roll = $('roll'), velCv = $('velCv');
let sqSide = 'A', rollDrag = null;
$('sqRate').innerHTML = RATES.map((r, i) => `<option value="${i}">${r[0]}</option>`).join('');
$('sqRoot').innerHTML = NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
$('sqScale').innerHTML = Object.keys(SCALES).map(n => `<option>${n}</option>`).join('');
$('sqChord').innerHTML = Object.keys(CHORDS).map(n => `<option>${n}</option>`).join('');
$('sqMode').innerHTML = MODES.map(n => `<option>${n}</option>`).join('');
const cur = () => state.seq[sqSide];
function openSeq(side) {
  sqSide = side || sqSide;
  sq.classList.add('open'); sq.classList.toggle('b', sqSide === 'B');
  syncSeqControls(); drawRoll(); drawLanes();
  $('sqDone').focus({ preventScroll:true });
}
function closeSeq() { sq.classList.remove('open'); $('seqEdit').focus({ preventScroll:true }); }
$('seqEdit').addEventListener('click', () => openSeq());
$('sqDone').addEventListener('click', closeSeq);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sq.classList.contains('open')) closeSeq(); });
$('sqA').addEventListener('click', () => openSeq('A'));
$('sqB').addEventListener('click', () => openSeq('B'));
function syncSeqControls() {
  const s = cur(); fixSeq(s);
  const dn = Math.round(seqDensity(s) * 100); $('sqDens').value = dn; $('sqDensVal').textContent = dn + '%';
  $('sqA').setAttribute('aria-pressed', sqSide === 'A'); $('sqB').setAttribute('aria-pressed', sqSide === 'B');
  $('sqRate').value = s.rate; $('sqRoot').value = s.root; $('sqScale').value = s.scale;
  $('sqLen').textContent = s.n16;
  $('sqOther').textContent = `Copy to ${sqSide === 'A' ? 'B' : 'A'}`;
}
// the shared Scale also sits in the Sequence card on the main page (a broad control: root and scale type)
$('pSeqCtl').insertAdjacentHTML('beforeend', `<div class="qscale"><span class="lbl">Scale</span><select id="qRoot" aria-label="Scale root">${NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select><select id="qScale" aria-label="Scale type">${Object.keys(SCALES).map(n => `<option>${n}</option>`).join('')}</select><span class="spacer"></span><button type="button" class="key send" id="patA" aria-label="Make the pattern you hear now sequence A">&larr; Set A</button><button type="button" class="key send" id="patB" aria-label="Make the pattern you hear now sequence B">Set B &rarr;</button></div>`);
function syncScaleUI() { $('qRoot').value = state.seq.A.root; $('qScale').value = state.seq.A.scale; }
$('qRoot').addEventListener('change', () => { pushUndo(); setScale(+$('qRoot').value, state.seq.A.scale); if (sq.classList.contains('open')) syncSeqControls(); seqChanged(); });
$('qScale').addEventListener('change', () => { pushUndo(); setScale(state.seq.A.root, $('qScale').value); if (sq.classList.contains('open')) syncSeqControls(); seqChanged(); });
function snapToScale(s) {
  const pcs = scalePcs(s);
  s.steps.forEach(st => { for (let d = 0; d < 12; d++) { if (pcs.has(((st.note - d) % 12 + 12) % 12)) { st.note -= d; break; } if (pcs.has((st.note + d) % 12)) { st.note += d; break; } } });
}
function editSeq(fn) { pushUndo(); fn(cur()); syncSeqControls(); seqChanged(); }
$('sqRate').addEventListener('change', () => editSeq(s => { s.rate = +$('sqRate').value; fitSlots(s, true); }));
function setScale(root, scale) {   // shared by both sides
  ['A', 'B'].forEach(k => { const q = state.seq[k]; q.root = root; q.scale = scale; snapToScale(q); });
}
$('sqRoot').addEventListener('change', () => editSeq(() => setScale(+$('sqRoot').value, cur().scale)));
$('sqScale').addEventListener('change', () => editSeq(() => setScale(cur().root, $('sqScale').value)));
$('sqLenDn').addEventListener('click', () => editSeq(s => { if (s.n16 > 1) { s.n16--; fitSlots(s); } }));
$('sqLenUp').addEventListener('click', () => editSeq(s => { if (s.n16 < MAXSTEPS) { s.n16++; fitSlots(s); } }));
['pointerdown', 'keydown'].forEach(t => $('sqDens').addEventListener(t, () => pushUndo()));
$('sqDens').addEventListener('input', () => { setParam(sqSide, IX.sqdens, $('sqDens').value / 100); $('sqDensVal').textContent = $('sqDens').value + '%'; });
// shift the whole pattern one step, wrapping around the loop
$('sqLeft').addEventListener('click', () => editSeq(s => { s.steps.push(s.steps.shift()); s.rot = (s.rot - 1 + s.steps.length) % s.steps.length; }));
$('sqRight').addEventListener('click', () => editSeq(s => { s.steps.unshift(s.steps.pop()); s.rot = (s.rot + 1) % s.steps.length; }));
let genType = 'Arp';
function setGen(t) {
  genType = t;
  $('gnArp').setAttribute('aria-pressed', t === 'Arp'); $('gnRiff').setAttribute('aria-pressed', t === 'Riff');
  $('arpRow').hidden = t !== 'Arp'; $('riffRow').hidden = t !== 'Riff';
}
$('gnArp').addEventListener('click', () => setGen('Arp'));
$('gnRiff').addEventListener('click', () => setGen('Riff'));
setGen('Arp');
$('sqGen').addEventListener('click', () => editSeq(s => genFromControls(s)));
$('sqClear').addEventListener('click', () => editSeq(s => s.steps.forEach(st => { st.on = false; })));
/* random tools: each regenerates the current side's pattern */
const pick = a => a[Math.floor(Math.random() * a.length)];
// with the oscillator already shifted up an octave, keep generated patterns within two octaves
// if any Wavetable slot is pitched up an octave or more on either side, generated patterns stay within 2 octaves
const octCap = () => (WT_SLOTS.some(s => ['A', 'B'].some(k => MorphEngine.denorm(DEFS[oi(s, 'pitch')], state[k][oi(s, 'pitch')]) >= 12)) ? 2 : 3);
function randArpSettings() {   // now: random generator settings, Arp or Riff
  setGen(Math.random() < 0.5 ? 'Arp' : 'Riff');
  $('sqChord').value = pick(Object.keys(CHORDS)); $('sqMode').value = pick(MODES);
  const o = Math.random(); $('sqOct').value = String(Math.min(octCap(), o < 0.45 ? 1 : o < 0.9 ? 2 : 3));   // three octaves only rarely
  $('rfStyle').value = pick(['Motif', 'Pedal', 'Cells']); $('rfOct').value = String(1 + Math.floor(Math.random() * 2)); $('rfSync').value = Math.round(Math.random() * 100);
}
const genFromControls = s => (genType === 'Riff' ? riff(s, $('rfStyle').value, +$('rfOct').value, $('rfSync').value / 100) : generate(s, $('sqChord').value, $('sqMode').value, +$('sqOct').value));

/* Riff generator
   Motif: a short motif, repeated, varied, then answered (call and response over four cells).
   Pedal: a low root repeated, with notes jumping out above it.
   Cells: rhythmic groups (3+3+2 and friends), each starting a new note.
   Syncopation pushes onsets off the beat and toward odd groupings. */
function riff(s, style, octs, sync) {
  const R = Math.random, n = s.steps.length, ns = SCALES[s.scale].length, span = Math.max(2, ns * octs);
  const out = s.steps.map(st => ({ on: false, note: 48 + s.root, len: 1, vel: 0.75, dur: st.dur }));
  const walk = (d, big) => Math.max(0, Math.min(span - 1, d + Math.round((R() * 2 - 1) * (big ? ns * 0.6 : 2.4))));
  const cellRhythm = len => {
    const on = Array.from({ length: len }, (_, i) => R() < (i % 2 ? 0.2 + 0.55 * sync : 0.75 - 0.4 * sync));
    if (R() < sync * 0.6) on[0] = false;   // skip the downbeat now and then
    if (!on.some(Boolean)) on[Math.floor(R() * len)] = true;
    return on;
  };
  const put = (i, d, vel) => { if (i < n) { out[i] = { ...out[i], on: true, note: tame(degNote(s, d)), vel }; } };
  if (style === 'Motif') {
    const cl = Math.max(2, Math.ceil(n / 4)), rh = cellRhythm(cl);
    let d = Math.floor(R() * Math.min(ns, span)); const motif = rh.map(on => (on ? (d = walk(d, false)) : null));
    const shift = R() < 0.5 ? 2 : -1, answer = motif.map((x, i) => (x === null ? null : i >= cl / 2 ? walk(x, true) : x));
    const answerRh = R() < 0.5 ? rh : cellRhythm(cl);
    [motif, motif, motif.map(x => (x === null ? null : Math.max(0, Math.min(span - 1, x + shift)))), answer].forEach((m, c) => {
      (c === 3 ? answerRh : rh).forEach((on, i) => { const x = m[i] ?? motif.find(v => v !== null) ?? 0; if (on) put(c * cl + i, x, i === 0 || (i === 1 && !rh[0]) ? 1 : 0.7 + R() * 0.2); });
    });
  } else if (style === 'Pedal') {
    const groups = sync > 0.5 ? [3, 3, 2] : [2, 2];
    let i = 0, g = 0;
    while (i < n) {
      const len = groups[g++ % groups.length];
      for (let k = 0; k < len && i + k < n; k++) {
        const on = k === 0 || R() < 0.35 + 0.3 * (1 - sync);
        if (!on) continue;
        if (k === 0 && R() < 0.3) put(i + k, ns + Math.floor(R() * Math.max(1, span - ns)), 1);   // jump out above the pedal
        else put(i + k, 0, k === 0 ? 0.95 : 0.7);
      }
      i += len;
    }
  } else {
    const sets = sync > 0.5 ? [[3, 3, 2], [3, 3, 3, 3, 4], [3, 2, 3]] : [[2, 2, 4], [4, 2, 2], [3, 3, 2]];
    const groups = pick(sets); let i = 0, g = 0, d = Math.floor(R() * Math.min(ns, span));
    while (i < n) {
      const len = groups[g++ % groups.length]; d = walk(d, R() < 0.2);
      put(i, d, 1);
      for (let k = 1; k < len; k++) if (R() < 0.45) put(i + k, R() < 0.3 && d + ns < span ? d + ns : d, 0.65);
      i += len;
    }
  }
  // 95% of riffs start on the very first beat
  if (!out[0].on && R() < 0.95) { const first = out.find(x => x.on); out[0] = { ...out[0], on: true, note: first ? first.note : tame(degNote(s, 0)), vel: 1 }; }
  s.steps = out;
}
function randNotes(s) {
  const n = SCALES[s.scale].length, span = n * Math.min(+$('sqOct').value, octCap()), P = stepPos(s);
  let d = Math.floor(Math.random() * span);
  s.steps = s.steps.map((old, i) => {
    const beat = P.pos[i] % 48 === 0;
    d += Math.random() < 0.15 ? Math.round((Math.random() * 2 - 1) * n) : Math.round((Math.random() * 2 - 1) * 2);   // mostly small moves, sometimes a leap
    d = Math.max(0, Math.min(span - 1, d));
    const x = Math.random();
    return { on: beat ? Math.random() < 0.92 : Math.random() < 0.72, note: tame(degNote(s, d)), len: x < 0.12 ? 2 : x < 0.22 ? 0.5 : 1, vel: beat ? 1 : 0.75, dur: old.dur };
  });
}
function randVel(s) { s.steps.forEach(st => { st.vel = 0.05 + Math.random() * 0.95; }); }
function randRhythm(s) { s.steps.forEach(st => { const x = Math.random(); if (x < 0.1) st.on = false; else if (x < 0.25) st.len = 2; else if (x < 0.33) st.len = 0.5; }); }
// launch: a new shared scale, then each side gets a whole new 16-step pattern
function randSeqs() {
  ['A', 'B'].forEach(k => { const q = state.seq[k]; fixSeq(q); q.n16 = 16; fitSlots(q); });
  setScale(Math.floor(Math.random() * 12), pick(Object.keys(SCALES)));
  ['A', 'B'].forEach(k => fullSeqRandom(state.seq[k]));
}
$('rzNotes').addEventListener('click', () => editSeq(randNotes));
// top bar: new patterns for one side (keeps the shared scale) or both (new scale too)
// main-page sequence dice and launch: new rate, new generator settings (Arp or Riff), rhythm, velocity,
// and a density that leans high (never below 50%, 2026-11-06; it was 30%)
const highDensity = () => 1 - 0.5 * Math.random() ** 2;
/* Random patterns (2026-11-06, owner: "tend toward a note on the downbeat of the bar, and more notes, always at least 5"):
   - at least 5 notes, and usually more: 40% of the note slots (7 of 16 sixteenths), whichever is larger;
   - a note on the downbeat of every bar 95% of the time (it was the first beat only, 90%), and Density keeps it.
   A slow rate that can't fit 5 notes into one bar gets two bars. */
const MIN_NOTES = 5, NOTE_SHARE = 0.4;
const wantNotes = s => Math.min(s.steps.length, Math.max(MIN_NOTES, Math.ceil(s.steps.length * NOTE_SHARE)));
function roomForNotes(s) { if (s.steps.length < MIN_NOTES && s.n16 < MAXSTEPS) { s.n16 = MAXSTEPS; fitSlots(s, true); } }
// the note slots that start a bar (every 16 sixteenths)
const barSlots = s => { const P = stepPos(s); return s.steps.map((_, i) => i).filter(i => P.pos[i] % 192 === 0); };
function shapeRandom(s) {
  const kept = () => keptSteps(s).filter(Boolean).length, bars = barSlots(s).filter(() => Math.random() < 0.95);
  bars.forEach(i => { s.steps[i].on = true; });
  for (let k = 0; k < 80 && kept() < wantNotes(s); k++) {
    const d = seqDensity(s);
    if (d < 1) setSeqDensity(s, Math.min(1, d + 0.1));   // thin less first, then switch rests back on
    else { const off = s.steps.filter(st => !st.on); if (!off.length) break; off[Math.floor(Math.random() * off.length)].on = true; }
  }
  // which notes density keeps depends on dseed (not how many), so pick one that keeps the downbeats; failing that, thin less
  const keepsBars = () => { const kp = keptSteps(s); return bars.every(i => kp[i]); };
  for (let k = 0; k < 60 && !keepsBars(); k++) { s.dseed = Math.random(); if (k % 15 === 14) setSeqDensity(s, Math.min(1, seqDensity(s) + 0.1)); }
}
/* Speed and Octave (per side): usually 1× and no shift. Half speed only for quick patterns, double only for slow ones,
   so a random pattern never crawls or blurs. */
function randSpeedOct(q) {
  const k = sideOf(q); if (!k) return;
  const r = RATES[q.rate][1] || 18, x = Math.random();   // Mixed counts as fairly quick
  state[k][IX.sqspeed] = norm(DEFS[IX.sqspeed], x < 0.12 && r <= 18 ? 0 : x > 0.9 && r >= 36 ? 2 : 1);
  const o = Math.random(); state[k][IX.sqoct] = norm(DEFS[IX.sqoct], o < 0.1 ? -1 : o > 0.9 ? 1 : 0);
}
function fullSeqRandom(q) { fixSeq(q); randRate(q); roomForNotes(q); randArpSettings(); genFromControls(q); randRhythm(q); randVel(q); setSeqDensity(q, highDensity()); randSpeedOct(q); shapeRandom(q); }
function randSeqSide(k) { fullSeqRandom(state.seq[k]); }
$('rzVel').addEventListener('click', () => editSeq(randVel));
function randRate(s) { s.rate = Math.floor(Math.random() * RATES.length); fitSlots(s, true); }
$('rzRate').addEventListener('click', () => editSeq(randRate));
$('rzArp').addEventListener('click', () => editSeq(s => { randArpSettings(); genFromControls(s); }));
function randAllSide(s) { randRate(s); roomForNotes(s); randArpSettings(); genFromControls(s); randRhythm(s); randVel(s); setSeqDensity(s, 0.5 + 0.5 * Math.random()); shapeRandom(s); }
$('rzAll').addEventListener('click', () => { pushUndo(); randAllSide(cur()); refreshSeqKnobs(); syncSeqControls(); seqChanged(); });
$('sqOther').addEventListener('click', () => copySeq(sqSide, sqSide === 'A' ? 'B' : 'A'));

// copy a whole sequence to the other side (from the bottom pane), with its Density, Speed and Octave; the scale is shared anyway
const SEQ_KEYS = ['sqdens', 'sqspeed', 'sqoct'];
function copySeqTo(from, to) { state.seq[to] = cloneSeq(state.seq[from]); SEQ_KEYS.forEach(k => { state[to][IX[k]] = state[from][IX[k]]; }); }
const refreshSeqKnobs = () => SEQ_KEYS.forEach(k => updateKnob(IX[k]));
const copySeq = (from, to) => { pushUndo(); copySeqTo(from, to); refreshSeqKnobs(); if (ready) sendState(); if (sq.classList.contains('open')) syncSeqControls(); seqChanged(); };
$('seqAB').addEventListener('click', () => copySeq('A', 'B'));
$('seqBA').addEventListener('click', () => copySeq('B', 'A'));

/* Pattern Set A / Set B (2026-11-10): the sequence heard at the Pattern knob's current value becomes sequence A (or B):
   a 1/16 pattern as long as the loop (at most 32 sixteenths), each note at its sixteenth, with its length and velocity.
   Speed and Octave are already in the notes, so that side's Speed goes to 1x, Octave to 0 and Density to 100%, and the Pattern
   knob's handle for that side goes to its end (All A or All B), so that end plays exactly the captured sequence. */
function capturePattern(side) {
  pushUndo();
  const s = buildSeq(), mm = resolveNorm(IX.pattern), n16 = Math.max(1, Math.min(MAXSTEPS, Math.round(s.loop / 12)));
  const q = cloneSeq(state.seq[side]); q.rate = R16; q.n16 = n16; q.rot = 0;
  q.steps = Array.from({ length: n16 }, () => ({ on: false, note: 48 + q.root, len: 1, vel: 0.75, dur: 12 }));
  s.events.forEach(e => {
    const k = Math.round(e.tick / 12); if (k >= n16) return;
    const r = MorphEngine.seqEval(e, mm, state.walk, s.scale); if (!r) return;
    q.steps[k] = { on: true, note: r.note, len: Math.max(0.25, Math.round(r.len / 12 * 4) / 4), vel: r.vel, dur: 12 };
  });
  state.seq[side] = q;
  state[side][IX.sqspeed] = norm(DEFS[IX.sqspeed], 1); state[side][IX.sqoct] = norm(DEFS[IX.sqoct], 0); state[side][IX.sqdens] = 1;
  state[side][IX.pattern] = side === 'A' ? 0 : 1;   // that end of the Pattern knob plays the captured sequence
  if (ready) sendState();
  refreshSeqKnobs(); updateKnob(IX.pattern); if (sq.classList.contains('open')) syncSeqControls(); seqChanged();
}
$('patA').addEventListener('click', () => capturePattern('A'));
$('patB').addEventListener('click', () => capturePattern('B'));
