/* ---------- bottom pane: keys / sequencer ---------- */
let panel = 'keys', seqPlaying = false, seqPos = null, seqLoop = 1;
function setPanel(p, quiet) {
  if (p === panel) return;
  panel = p;
  $('pmKeys').setAttribute('aria-pressed', p === 'keys'); $('pmSeq').setAttribute('aria-pressed', p === 'seq');
  $('kctl').hidden = p !== 'keys'; $('sctl').hidden = p !== 'seq';
  $('slide').classList.toggle('seq', p === 'seq');
  $('keysPane').inert = p !== 'keys'; $('seqPane').inert = p !== 'seq';
  if (p === 'seq') {   // leave normal playing cleanly
    latch = false; $('latch').setAttribute('aria-pressed', 'false'); latched.clear();
    sounding.clear(); markKeys(); if (!quiet) post({ type:'panic' });
    drawLanes();
  } else setPlaying(false);
}
$('pmKeys').addEventListener('click', () => setPanel('keys'));
$('pmSeq').addEventListener('click', () => { if (panel !== 'seq') { setPanel('seq'); setPlaying(true); } });
const ICON_PLAY = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.5 2.8v10.4L13 8z" fill="currentColor"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.2" fill="currentColor"/></svg>';
function setPlaying(on) {
  seqPlaying = on;
  $('play').innerHTML = on ? ICON_STOP : ICON_PLAY;
  $('play').setAttribute('aria-label', on ? 'Stop' : 'Play');
  $('play').classList.toggle('playing', on);
  if (on) { sendSeq(); post({ type:'seqPlay', on:true }); }
  else { if (ready) send({ type:'seqPlay', on:false }); seqPos = null; drawLanes(); }
}
$('play').addEventListener('click', () => setPlaying(!seqPlaying));
function drawBpmKnob() {
  const x = (state.bpm - 50) / 150;
  $('bpmArc').setAttribute('stroke-dasharray', `${(75 * x).toFixed(2)} 200`);
  $('bpmPtr').setAttribute('transform', `rotate(${-135 + 270 * x} 20 20)`);
}
function setBpm(v) { state.bpm = Math.max(50, Math.min(200, Math.round(v))); $('bpmVal').textContent = state.bpm; $('bpmBox').setAttribute('aria-valuenow', state.bpm); drawBpmKnob(); if (ready) send({ type:'bpm', v: state.bpm }); save(); }
function holdRepeat(el, fn) {
  let t1 = null, t2 = null;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  el.addEventListener('pointerdown', () => { fn(); t1 = setTimeout(() => { t2 = setInterval(fn, 60); }, 350); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => el.addEventListener(t, stop));
}
{ // drag the tempo readout up/down or sideways
  const el = $('bpmBox'); let pid = null, x0 = 0, y0 = 0, b0 = 0;
  el.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; el.setPointerCapture(pid); x0 = e.clientX; y0 = e.clientY; b0 = state.bpm; });
  el.addEventListener('pointermove', e => { if (e.pointerId === pid) setBpm(b0 + ((e.clientX - x0) - (e.clientY - y0)) / 3); });
  ['pointerup', 'pointercancel'].forEach(t => el.addEventListener(t, () => { pid = null; }));
  el.addEventListener('keydown', e => { const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); setBpm(state.bpm + d * (e.shiftKey ? 10 : 1)); } });
}
function onReport(d) {
  if (d.type === 'pos' && seqPlaying) { seqPos = d.pos; seqLoop = d.loop; drawLanesSoon(); }
  else if (d.type === 'ott') onOtt(d);
}
// mono / poly for playing the keys (the sequencer is always one note at a time)
function updateMonoUI() { ['monoBtn', 'monoBtn2'].forEach(id => { $(id).textContent = state.mono ? 'Mono' : 'Poly'; $(id).setAttribute('aria-label', `Voice mode: ${state.mono ? 'mono, one note at a time' : 'poly'}. Tap to switch`); }); }
['monoBtn', 'monoBtn2'].forEach(id => $(id).addEventListener('click', () => { state.mono = !state.mono; updateMonoUI(); post({ type:'mono', v: state.mono }); save(); }));
updateMonoUI();

/* ---------- mini lanes: A, what plays now, B ---------- */
let lanesQueued = false;
function drawLanesSoon() { if (lanesQueued) return; lanesQueued = true; requestAnimationFrame(() => { lanesQueued = false; drawLanes(); }); }
function drawLanes() {
  if (panel !== 'seq' && !sq.classList.contains('open')) return;
  const s = buildSeq(), mm = resolveNorm(IX.pattern), walk = state.walk;
  let lo = 127, hi = 0;
  s.events.forEach(e => { [e.a, e.b].forEach(x => { if (x) { lo = Math.min(lo, x.p); hi = Math.max(hi, x.p); } }); });
  if (lo > hi) { lo = 48; hi = 72; }
  lo -= 1; hi += 1;
  const rows = [['lnA', e => (e.a ? { note: e.a.p, len: e.a.l } : null), css('--a')],
                ['lnL', e => MorphEngine.seqEval(e, mm, walk, s.scale), mixColor(state.morph)],
                ['lnB', e => (e.b ? { note: e.b.p, len: e.b.l } : null), css('--b')]];
  rows.forEach(([id, fn, col]) => {
    const c = prep($(id)); if (!c) return;
    c.g.fillStyle = col;
    const yOf = n => c.h - 3 - (n - lo) / (hi - lo) * (c.h - 6);
    const notes = s.events.map(e => ({ t: e.tick, r: fn(e) })).filter(x => x.r);
    notes.forEach((x, k) => {
      const next = k + 1 < notes.length ? notes[k + 1].t : notes[0].t + s.loop;   // mono: a note ends where the next begins
      const len = Math.min(x.r.len * 0.92, next - x.t);
      c.g.fillRect(x.t / s.loop * c.w, yOf(x.r.note) - 1.5, Math.max(2, len / s.loop * c.w), 3);
    });
    // loop boundaries of each side inside the combined loop
    const d = id === 'lnA' ? s.dA : id === 'lnB' ? s.dB : 0;
    if (d && d < s.loop) { c.g.fillStyle = css('--line'); for (let t = d; t < s.loop; t += d) c.g.fillRect(t / s.loop * c.w, 0, 1, c.h); }
    if (seqPos !== null) { c.g.fillStyle = css('--ink'); c.g.fillRect(seqPos / s.loop * c.w, 0, 1.5, c.h); }
  });
}

/* ---------- Pitch mode (Walk / Swap) ---------- */
function updateWalkUI() { $('pmWalk').setAttribute('aria-pressed', state.walk); $('pmSwap').setAttribute('aria-pressed', !state.walk); }
$('pmWalk').addEventListener('click', () => { state.walk = true; updateWalkUI(); if (ready) send({ type:'walk', v:true }); drawLanes(); save(); });
$('pmSwap').addEventListener('click', () => { state.walk = false; updateWalkUI(); if (ready) send({ type:'walk', v:false }); drawLanes(); save(); });

