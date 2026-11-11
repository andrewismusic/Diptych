/* ---------- morph slider (2026-11-10) ----------
   A track as tall as the A and B keys beside it, with a cap that reads MORPH. Drag the cap, or touch the track to
   jump there. While a side is focused the slider rests at that end, and touching it (the cap, or anywhere) brings back
   the morph view. The track is the colour you hear now (the same colour as the wave), with light glimmering across it
   and glints rising off it (drawGlim, below); the page background takes the same colour. */
const morphEl = $('morph'), mcap = $('mcap');
const capFrac = m => { const W = morphEl.clientWidth, cw = mcap.offsetWidth; return W > cw ? m * (W - cw) / W * 100 : 0; };
function updateMorphUI() {
  const m = state.morph;
  morphEl.value = Math.round(m * 1000);
  mcap.style.left = capFrac(m) + '%';
  document.documentElement.style.setProperty('--mix', (m * 100).toFixed(1) + '%');
  const pa = Math.round((1 - m) * 100), pb = 100 - pa;
  morphEl.setAttribute('aria-valuenow', Math.round(m * 1000)); morphEl.setAttribute('aria-valuetext', `${pa}% A, ${pb}% B`);
  glimColor = null;
  drawWaves();
}
function setMorph(m) {
  state.morph = clamp(m);
  updateMorphUI();
  updateKnobs();
  if (ready) send({ type:'morph', v: state.morph });
  save();
}
{
  let pid = null, grab = 0;
  const mAt = (x, off) => { const r = morphEl.getBoundingClientRect(), cw = mcap.offsetWidth; return (x - r.left - off) / Math.max(1, r.width - cw); };
  morphEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (focus !== 'M') { setFocus('M'); return; }   // a focused side: the slot is one big MORPH key; touching it comes back to the morph
    pid = e.pointerId; morphEl.setPointerCapture(pid); morphEl.classList.add('drag'); holdingMorph = true;
    const cr = mcap.getBoundingClientRect();
    if (e.clientX >= cr.left && e.clientX <= cr.right) grab = e.clientX - cr.left;   // on the cap: drag it from where you hold it
    else { grab = cr.width / 2; setMorph(mAt(e.clientX, grab)); }                    // on the track: the cap jumps there
  });
  morphEl.addEventListener('pointermove', e => { if (e.pointerId === pid) setMorph(mAt(e.clientX, grab)); });
  const end = e => { if (e.pointerId === pid) { pid = null; morphEl.classList.remove('drag'); holdingMorph = false; } };
  morphEl.addEventListener('pointerup', end); morphEl.addEventListener('pointercancel', end);
  morphEl.addEventListener('keydown', e => {
    const st = e.shiftKey ? 0.1 : 0.01;
    const m = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? state.morph + st : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? state.morph - st
      : e.key === 'Home' ? 0 : e.key === 'End' ? 1 : null;
    if (m === null) return;
    e.preventDefault(); if (focus !== 'M') setFocus('M'); setMorph(m);
  });
}
/* the slot is a window onto coloured space (2026-11-11): the colour heard now, deeper at the edges, with stars at three
   distances drifting past (the far ones slow and faint, the near ones faster and brighter), twinkling, and now and then
   a bright one flaring. Everything stays inside the slot. */
const glim = $('glim'), STARS = [];
let glimColor = null, glimLast = 0;
{ let r = 7; const R = () => ((r = (r * 16807) % 2147483647) / 2147483647);   // its own generator: the stars never use up Math.random
  for (let k = 0; k < 70; k++) { const z = k < 40 ? 0 : k < 60 ? 1 : 2; STARS.push({ x: R(), y: R(), z, ph: R() * 6.28, tw: 0.6 + R() * 2.4 }); } }
function drawGlim(now) {
  const c = prep(glim); if (!c) return;
  const { g, w, h } = c, t = now / 1000;
  if (!glimColor) glimColor = mixColor(state.morph);
  g.fillStyle = glimColor; g.fillRect(0, 0, w, h);
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.6);   // deeper towards the edges, like looking out
  vg.addColorStop(0, 'rgba(255,255,255,.10)'); vg.addColorStop(1, 'rgba(0,0,20,.42)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  const SPEED = [0.006, 0.016, 0.04], SIZE = [0.7, 1.15, 1.7], ALPHA = [0.45, 0.7, 0.95];
  for (const st of STARS) {
    const x = ((st.x - t * SPEED[st.z]) % 1 + 1) % 1 * w, y = 3 + st.y * (h - 6);
    const tw = 0.55 + 0.45 * Math.sin(t * st.tw + st.ph), a = ALPHA[st.z] * tw, r = SIZE[st.z] * (0.8 + 0.3 * tw);
    g.globalAlpha = a; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    if (st.z === 2 && tw > 0.93) {   // a near star flares now and then
      const f = (tw - 0.93) / 0.07 * 7; g.globalAlpha = a * 0.8; g.fillRect(x - f, y - 0.4, 2 * f, 0.8); g.fillRect(x - 0.4, y - f, 0.8, 2 * f);
    }
  }
  g.globalAlpha = 1;
}
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
function glimLoop(now) {
  if (!document.hidden && now - glimLast > 33) { glimLast = now; drawGlim(reduceMotion.matches ? 0 : now); if (typeof animatePanels === 'function') animatePanels(now); }
  requestAnimationFrame(glimLoop);
}
requestAnimationFrame(glimLoop);
/* ---------- side focus: A | Morph | B (see knobs.js) ---------- */
function setFocus(f) {
  if (f === focus) return;
  if (focus === 'M') focusMem = state.morph;
  focus = f;
  state.morph = f === 'A' ? 0 : f === 'B' ? 1 : focusMem;
  morphEl.disabled = f !== 'M'; morphEl.classList.toggle('rest', f !== 'M');
  document.body.dataset.sidefocus = f;
  document.querySelectorAll('[data-focus]').forEach(b => b.setAttribute('aria-pressed', b.dataset.focus === f));
  updateMorphUI();
  updateKnobs();
  if (ready) send({ type:'morph', v: state.morph });
  drawLanes();
}
/* Tap A or B to edit only that side; tap it again (or the other) to come back to the morph or switch sides.
   Hold MORPH and tap A or B (2026-11-11; with a mouse, Shift-click A or B) to capture what you hear into that side: the
   sound, and the sequence heard at the Pattern knob's value. The morph then sits at that end, so nothing changes. */
let holdingMorph = false;
function captureHeard(side) {
  pushUndo();
  capturePattern(side, true);   // first, while the Pattern value still is what you hear
  captureSound(side, true);
  const b = document.querySelector(`[data-focus="${side}"]`); b.classList.remove('caught'); void b.offsetWidth; b.classList.add('caught');
}
document.querySelectorAll('[data-focus]').forEach(b => b.addEventListener('click', e => {
  if ((holdingMorph || e.shiftKey) && focus === 'M') { captureHeard(b.dataset.focus); return; }
  setFocus(focus === b.dataset.focus ? 'M' : b.dataset.focus);
}));
const savedMorph = () => (focus === 'M' ? state.morph : focusMem);
document.body.dataset.sidefocus = 'M';
