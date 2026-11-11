/* =====================================================================
   PANELS (2026-11-11)
   The player's view is six panels: Synth (the wave; Brightness, Position),
   Amp (the amp envelope; Envelope), Filt (the cutoff over a held note;
   Cutoff, Resonance, Env amount), FX (the wave with the effects' marks; FX
   intensity, FX wet), Seq (the lanes; Pattern, Density, Speed, Octave, Scale,
   Walk / Swap, Edit) and Play (the keyboard or the grid). Each panel's
   controls sit top left and its dice (A 1, B 2, Both 3: one and two make
   three) top right, in the same place on every tab; its picture runs the
   full width below. On a phone one panel shows at a time, chosen with the
   tabs (remembered per browser); on desktop all six show at once.
   ===================================================================== */
const DIE_CAPS = { A: 'A', B: 'B', M: 'Both' }, DIE_FACE = { A: 1, B: 2, M: 3 };
document.querySelectorAll('.dbox').forEach(box => {
  const scope = box.dataset.scope;
  const name = { synth: 'the synth', amp: 'the amp envelope', filt: 'the filter', fx: 'the effects', seq: 'the sequence' }[scope];
  box.innerHTML = ['A', 'B', 'M'].map(side => `<div class="dcol"><div class="dicetrack" data-what="${scope}" data-side="${side}" data-face="${DIE_FACE[side]}" tabindex="0" role="slider" aria-orientation="vertical" aria-label="Randomize ${name}, ${side === 'M' ? 'both sides' : 'side ' + side}: slide further up for more change" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="fill"></div><div class="die" aria-hidden="true"><div class="face">${'<i></i>'.repeat(DIE_FACE[side])}</div></div></div><span class="dcap${side === 'A' ? ' a' : side === 'B' ? ' b' : ''}">${DIE_CAPS[side]}</span></div>`).join('');
});
const TABS = ['synth', 'amp', 'filt', 'fx', 'seq', 'play'];
let curTab = 'synth';
try { const t = localStorage.getItem('diptych-tab'); if (TABS.includes(t)) curTab = t; } catch (e) {}
function setTab(t) {
  curTab = t;
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.dataset.panel === t));
  try { localStorage.setItem('diptych-tab', t); } catch (e) {}
  if (typeof buildKeys === 'function' && t === 'play') requestAnimationFrame(buildKeys);
  drawWaves();
}
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
setTab(curTab);

/* the values heard at morph position m, after the macros (as the engine plays them) */
function heardAt(m) {
  for (let i = 0; i < DEFS.length; i++) {
    const d = DEFS[i], a = state.A[i], b = state.B[i], mm = MorphEngine.bend(m, state.C[i]);
    MAC.cur[i] = d.snap ? (mm < 0.5 ? a : b) : quant(d, a + (b - a) * mm);
    MAC.val[i] = MorphEngine.denorm(d, MAC.cur[i]);
  }
  MorphEngine.prototype.applyMacros.call(MAC);
  const v = {}; for (const k of ['aatk', 'adec', 'asus', 'arel', 'fatk', 'fdec', 'fsus', 'frel', 'cutoff', 'reso', 'envamt']) v[k] = MAC.val[IX[k]];
  return v;
}
/* the amp envelope (after the Envelope macro): side A thin blue, side B thin pink, what you hear now thick in the morph
   colour, on one time scale with a fixed-length held part (the earlier version's envelope picture, back by request) */
function drawEnvPanel() {
  const c = prep($('envviz')); if (!c) return;
  const sets = [heardAt(0), heardAt(1), heardAt(state.morph)];
  const span = Math.max(...sets.map(e => e.aatk + e.adec + e.arel)), hold = span * 0.3, T = span + hold;
  const lvl = (e, t) => {
    if (t < e.aatk) return t / e.aatk;
    const endHold = e.aatk + e.adec + hold, dec = u => e.asus + (1 - e.asus) * Math.exp(-5 * u / e.adec);
    if (t < endHold) return dec(t - e.aatk);
    return dec(endHold - e.aatk) * Math.exp(-6.9 * (t - endHold) / e.arel);
  };
  const pad = 8, yOf = v => c.h - pad - v * (c.h - 2 * pad - 6);
  c.g.strokeStyle = css('--line'); c.g.lineWidth = 1; c.g.beginPath(); c.g.moveTo(0, yOf(0)); c.g.lineTo(c.w, yOf(0)); c.g.stroke();
  const cols = [css('--a'), css('--b'), mixColor(state.morph)], widths = [1.4, 1.4, 3.6], alpha = [focus === 'B' ? 0.25 : 0.7, focus === 'A' ? 0.25 : 0.7, 1];
  for (const s of [0, 1, 2]) {
    const g = c.g; g.strokeStyle = cols[s]; g.lineWidth = widths[s]; g.globalAlpha = alpha[s]; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
    for (let k = 0; k <= 240; k++) { const t = k / 240, x = pad + t * (c.w - 2 * pad), y = yOf(lvl(sets[s], t * T)); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    if (s === 2) { g.globalAlpha = 0.14; g.fillStyle = cols[2]; g.lineTo(c.w - pad, yOf(0)); g.lineTo(pad, yOf(0)); g.closePath(); g.fill(); }
  }
  c.g.globalAlpha = 1;
  if (notesMoving()) { const e = sets[2], p = envPos(e.aatk, e.adec, e.asus, e.arel, hold); if (!p.done && p.t <= T) playDot(c.g, pad + p.t / T * (c.w - 2 * pad), yOf(p.v), cols[2]); }
  c.g.fillStyle = mixColor(state.morph); c.g.font = `500 11px ${css('--font-mono')}`; c.g.textAlign = 'right';
  c.g.fillText(time(sets[2].aatk + sets[2].adec + sets[2].arel), c.w - pad, 14);
}

/* the filter: where the cutoff goes over a held note (a low C), from note-on through the filter envelope to the release,
   on a log frequency scale; Resonance shows as the glow under the line. Side A thin blue, side B thin pink, what you
   hear now thick in the morph colour. */
function drawFiltPanel() {
  const c = prep($('filtviz')); if (!c) return;
  const sets = [heardAt(0), heardAt(1), heardAt(state.morph)];
  const span = Math.max(...sets.map(e => e.fatk + e.fdec + e.frel)), hold = span * 0.3, T = span + hold;
  const lvl = (e, t) => {
    if (t < e.fatk) return t / e.fatk;
    const endHold = e.fatk + e.fdec + hold, dec = u => e.fsus + (1 - e.fsus) * Math.exp(-5 * u / e.fdec);
    if (t < endHold) return dec(t - e.fatk);
    return dec(endHold - e.fatk) * Math.exp(-6.9 * (t - endHold) / e.frel);
  };
  const pad = 8, lo = Math.log(30), hi = Math.log(18000), yOf = f => c.h - pad - (Math.log(Math.max(30, Math.min(18000, f))) - lo) / (hi - lo) * (c.h - 2 * pad);
  const g = c.g;
  g.strokeStyle = css('--line'); g.lineWidth = 1; g.font = `500 10px ${css('--font-mono')}`; g.fillStyle = css('--muted'); g.textAlign = 'left';
  for (const [f, l] of [[100, '100'], [1000, '1k'], [10000, '10k']]) { g.beginPath(); g.moveTo(0, yOf(f)); g.lineTo(c.w, yOf(f)); g.stroke(); g.fillText(l, 3, yOf(f) - 3); }
  const cols = [css('--a'), css('--b'), mixColor(state.morph)], widths = [1.4, 1.4, 3.4], alpha = [focus === 'B' ? 0.25 : 0.7, focus === 'A' ? 0.25 : 0.7, 1];
  for (const s of [0, 1, 2]) {
    const e = sets[s], path = [];
    for (let k = 0; k <= 200; k++) { const t = k / 200; path.push([pad + 22 + t * (c.w - 2 * pad - 22), yOf(e.cutoff * Math.pow(2, e.envamt * 5 * lvl(e, t * T)))]); }
    if (s === 2) {   // resonance: a glow under the line, stronger with more resonance
      g.save(); g.globalAlpha = 0.18 + 0.5 * e.reso; g.strokeStyle = cols[2]; g.lineWidth = 6 + 18 * e.reso; g.filter = 'blur(6px)';
      g.beginPath(); path.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
    }
    g.strokeStyle = cols[s]; g.lineWidth = widths[s]; g.globalAlpha = alpha[s]; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); path.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  }
  g.globalAlpha = 1;
  if (notesMoving()) { const e = sets[2], p = envPos(e.fatk, e.fdec, e.fsus, e.frel, hold); if (!p.done && p.t <= T) playDot(g, pad + 22 + p.t / T * (c.w - 2 * pad - 22), yOf(e.cutoff * Math.pow(2, e.envamt * 5 * p.v)), cols[2]); }
}

/* ---------- the panels move with the notes (2026-11-11) ----------
   The engine reports each note-on and note-off. While a note sounds (and through its release), a dot travels along the
   Amp and Filt pictures as the envelope plays it, and the waves on Synth and FX swell and fade with the amp envelope;
   idle, they show the whole wave. Drawn about 30 times a second from the morph slider's loop, only while something moves. */
const NOTE = { on: false, t0: -1e9, tOff: -1e9, last: -1e9 };
function noteSeen(on) { const t = performance.now(); if (on) { NOTE.t0 = t; NOTE.on = true; } else { NOTE.on = false; NOTE.tOff = t; } NOTE.last = t; }
// where a note is on an envelope picture: the picture's time (attack, decay, the held part, release) and the level there
function envPos(a, d, s, r, hold) {
  const now = performance.now(), el = (now - NOTE.t0) / 1000;
  const lvl = t => (t < a ? t / a : s + (1 - s) * Math.exp(-5 * (t - a) / d));
  if (NOTE.on) { const t = Math.min(el, a + d + hold); return { t, v: t < a ? t / a : lvl(Math.min(t, a + d * 3)) }; }
  const held = Math.max(0, (NOTE.tOff - NOTE.t0) / 1000), rel = (now - NOTE.tOff) / 1000, v0 = lvl(Math.min(held, a + d * 3));
  return { t: a + d + hold + rel, v: v0 * Math.exp(-6.9 * rel / r), done: rel > r * 1.2 };
}
function scopeGain() {
  if (NOTE.last < 0) return 1;
  const e = heardAt(state.morph), p = envPos(e.aatk, e.adec, e.asus, e.arel, 0);
  if (!NOTE.on && p.done) return Math.min(1, 0.1 + (performance.now() - NOTE.tOff) / 1000 - e.arel * 1.2);   // back to the whole wave
  return 0.1 + 0.9 * p.v;
}
const notesMoving = () => NOTE.on || performance.now() - NOTE.tOff < 6000;
function animatePanels(now) {
  if (!notesMoving()) return;
  drawEnvPanel(); drawFiltPanel(); drawScope(now);
}
// a dot on a picture's "now" line
function playDot(g, x, y, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, 5, 0, 6.2832); g.fill(); g.strokeStyle = css('--surface'); g.lineWidth = 2; g.stroke(); }
