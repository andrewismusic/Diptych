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
  DEFS.forEach((d, i) => updateKnob(i));
  if (ready) send({ type:'morph', v: state.morph });
  save();
}
{
  let pid = null, grab = 0;
  const mAt = (x, off) => { const r = morphEl.getBoundingClientRect(), cw = mcap.offsetWidth; return (x - r.left - off) / Math.max(1, r.width - cw); };
  morphEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (focus !== 'M') { setFocus('M'); return; }   // a focused side: touching the slider comes back to the morph
    pid = e.pointerId; morphEl.setPointerCapture(pid); morphEl.classList.add('drag');
    const cr = mcap.getBoundingClientRect();
    if (e.clientX >= cr.left && e.clientX <= cr.right) grab = e.clientX - cr.left;   // on the cap: drag it from where you hold it
    else { grab = cr.width / 2; setMorph(mAt(e.clientX, grab)); }                    // on the track: the cap jumps there
  });
  morphEl.addEventListener('pointermove', e => { if (e.pointerId === pid) setMorph(mAt(e.clientX, grab)); });
  const end = e => { if (e.pointerId === pid) { pid = null; morphEl.classList.remove('drag'); } };
  morphEl.addEventListener('pointerup', end); morphEl.addEventListener('pointercancel', end);
  morphEl.addEventListener('keydown', e => {
    const st = e.shiftKey ? 0.1 : 0.01;
    const m = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? state.morph + st : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? state.morph - st
      : e.key === 'Home' ? 0 : e.key === 'End' ? 1 : null;
    if (m === null) return;
    e.preventDefault(); if (focus !== 'M') setFocus('M'); setMorph(m);
  });
}
/* glimmer: the track's colour, a band of light sweeping across, and glints that sparkle and drift up off the top */
const glim = $('glim'), glints = [];
let glimColor = null, glimLast = 0;
function drawGlim(now) {
  const c = prep(glim); if (!c) return;
  const { g, w, h } = c, top = h - morphEl.clientHeight, th = morphEl.clientHeight, t = now / 1000, rad = 10;
  if (!glimColor) glimColor = mixColor(state.morph);
  g.save();
  g.beginPath(); g.roundRect(0, top, w, th, rad); g.clip();
  g.fillStyle = glimColor; g.fillRect(0, top, w, th);
  // two soft bands of light sweeping across at different speeds, and a shimmer along the top edge
  for (const [sp, wd, a] of [[0.23, 0.35, 0.35], [0.37, 0.18, 0.25]]) {
    const x = ((t * sp) % 1.6 - 0.3) * w, gr = g.createLinearGradient(x - wd * w, 0, x + wd * w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, top, w, th);
  }
  const sh = g.createLinearGradient(0, top, 0, top + th);
  sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.12)');
  g.fillStyle = sh; g.fillRect(0, top, w, th);
  g.restore();
  // glints: born on the track, twinkle, and some drift up and off it
  if (glints.length < 26 && Math.random() < 0.5) glints.push({ x: Math.random() * w, y: top + 4 + Math.random() * (th - 8), vy: Math.random() < 0.45 ? -(6 + Math.random() * 16) : 0, born: t, life: 0.6 + Math.random() * 1.4, s: 1.5 + Math.random() * 3 });
  for (let k = glints.length - 1; k >= 0; k--) {
    const p = glints[k], age = (t - p.born) / p.life;
    if (age >= 1) { glints.splice(k, 1); continue; }
    const y = p.y + p.vy * (t - p.born), a = Math.sin(Math.PI * age), s = p.s * (0.6 + 0.4 * a);
    g.globalAlpha = a * 0.95; g.fillStyle = '#fff';
    g.beginPath();   // a four-point star
    g.moveTo(p.x, y - s * 2); g.quadraticCurveTo(p.x, y, p.x + s * 2, y); g.quadraticCurveTo(p.x, y, p.x, y + s * 2); g.quadraticCurveTo(p.x, y, p.x - s * 2, y); g.quadraticCurveTo(p.x, y, p.x, y - s * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
function glimLoop(now) {
  if (!document.hidden && now - glimLast > 33) { glimLast = now; drawGlim(reduceMotion.matches ? 0 : now); }
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
  DEFS.forEach((d, i) => updateKnob(i));
  if (ready) send({ type:'morph', v: state.morph });
  drawLanes();
}
// tap A or B to edit only that side; tap it again (or the other) to come back to the morph or switch sides
document.querySelectorAll('[data-focus]').forEach(b => b.addEventListener('click', () => setFocus(focus === b.dataset.focus ? 'M' : b.dataset.focus)));
const savedMorph = () => (focus === 'M' ? state.morph : focusMem);
document.body.dataset.sidefocus = 'M';
