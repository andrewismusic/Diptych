/* =====================================================================
   PANELS (2026-11-11)
   The player's view is four panels, each with its picture, its dice and
   its knobs: Sound (the wave; Brightness, Position), Envelope (the amp
   envelope; Envelope), FX (the wave with the effects' marks; FX intensity,
   FX wet), Sequence (the lanes; Pattern, Density, Speed, Octave, and the
   sequencer's controls). On a phone one shows at a time, picked with the
   tabs (remembered per browser); on desktop all four show at once.
   Each panel's dice (A, B, Both) roll only that panel's part (ui/dice.js).
   ===================================================================== */
const DIE_CAPS = { A: 'A', B: 'B', M: 'Both' };
document.querySelectorAll('.dbox').forEach(box => {
  const scope = box.dataset.scope, faces = box.dataset.faces.split(',').map(Number);
  const name = { sound: 'the sound', env: 'the envelope', fx: 'the effects', seq: 'the sequence' }[scope];
  box.innerHTML = ['A', 'B', 'M'].map((side, k) => `<div class="dcol"><div class="dicetrack" data-what="${scope}" data-side="${side}" data-face="${faces[k]}" tabindex="0" role="slider" aria-orientation="vertical" aria-label="Randomize ${name}, ${side === 'M' ? 'both sides' : 'side ' + side}: slide further up for more change" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="fill"></div><div class="die" aria-hidden="true"><div class="face">${'<i></i>'.repeat(faces[k])}</div></div></div><span class="dcap${side === 'A' ? ' a' : side === 'B' ? ' b' : ''}">${DIE_CAPS[side]}</span></div>`).join('');
});
let curTab = 'sound';
try { const t = localStorage.getItem('diptych-tab'); if (['sound', 'env', 'fx', 'seq'].includes(t)) curTab = t; } catch (e) {}
function setTab(t) {
  curTab = t;
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.dataset.panel === t));
  try { localStorage.setItem('diptych-tab', t); } catch (e) {}
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
  const v = {}; for (const k of ['aatk', 'adec', 'asus', 'arel']) v[k] = MAC.val[IX[k]];
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
  c.g.fillStyle = mixColor(state.morph); c.g.font = `500 11px ${css('--font-mono')}`; c.g.textAlign = 'right';
  c.g.fillText(time(sets[2].aatk + sets[2].adec + sets[2].arel), c.w - pad, 14);
}
