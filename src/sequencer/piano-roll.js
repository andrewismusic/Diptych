const GUT = 34, RH = 14;
function rollRows() { const pcs = scalePcs(cur()), rows = []; for (let n = 84; n >= 36; n--) if (pcs.has(n % 12)) rows.push(n); return rows; }
function rowOf(rows, note) { let best = 0; rows.forEach((n, i) => { if (Math.abs(n - note) < Math.abs(rows[best] - note)) best = i; }); return best; }
function rollGeom(s, w) {   // x position and width of every step (steps can differ in length with Mixed)
  const P = stepPos(s), span = w - GUT;
  return { P, x: i => GUT + P.pos[i] / P.total * span, wOf: t => t / P.total * span };
}
function drawRoll() {
  const s = cur(), rows = rollRows(), L = s.steps.length;
  roll.style.height = rows.length * RH + 'px';
  const c = prep(roll); if (!c) return;
  const G = rollGeom(s, c.w), side = css(sqSide === 'A' ? '--a' : '--b');
  rows.forEach((n, i) => {
    if (n % 12 === s.root) { c.g.fillStyle = css('--line'); c.g.globalAlpha = 0.45; c.g.fillRect(GUT, i * RH, c.w - GUT, RH); c.g.globalAlpha = 1; }
    c.g.fillStyle = css('--muted'); c.g.font = '10px "Barlow Semi Condensed", sans-serif'; c.g.textAlign = 'left';
    c.g.fillText(noteName(n), 3, i * RH + 10.5);
  });
  const tx = t => GUT + t / G.P.total * (c.w - GUT);
  for (let t = 0; t <= G.P.total; t += 12) {   // the sixteenth grid, with beats and bars stronger
    const beat = t % 48 === 0, bar = t % 192 === 0;
    c.g.fillStyle = css(bar ? '--muted' : '--line'); c.g.globalAlpha = bar ? 0.7 : beat ? 1 : 0.35;
    c.g.fillRect(Math.min(c.w - 1, tx(t)) - (bar ? 0.5 : 0), 0, bar ? 1.5 : 1, c.h);
  }
  c.g.fillStyle = side; c.g.globalAlpha = 0.18;   // where each note slot starts
  for (let k = 1; k < L; k++) c.g.fillRect(G.x(k), 0, 1, c.h);
  c.g.globalAlpha = 1;
  const kept = keptSteps(s), lens = playLens(s, kept);
  s.steps.forEach((st, k) => {
    if (!st.on) return;
    const y = rowOf(rows, st.note) * RH;
    if (!kept[k]) {   // thinned out by Density: shown as an outline so you can see what comes back
      c.g.strokeStyle = side; c.g.globalAlpha = 0.5; c.g.lineWidth = 1;
      c.g.strokeRect(G.x(k) + 1.5, y + 2, Math.max(3, G.wOf(st.len * stepDur(s, k)) - 3), RH - 4);
      c.g.globalAlpha = 1; return;
    }
    c.g.fillStyle = side; c.g.globalAlpha = 0.45 + 0.55 * st.vel;
    c.g.fillRect(G.x(k) + 1, y + 1.5, Math.max(3, G.wOf(lens[k]) - 2), RH - 3);
  });
  c.g.globalAlpha = 1;
  const v = prep(velCv); if (!v) return;
  s.steps.forEach((st, k) => {
    if (!st.on) return;
    v.g.fillStyle = side; v.g.fillRect(G.x(k) + 2, v.h - st.vel * (v.h - 4), Math.max(2, G.wOf(stepDur(s, k)) - 4), st.vel * (v.h - 4));
  });
  v.g.fillStyle = css('--muted'); v.g.font = '10px "Barlow Semi Condensed", sans-serif'; v.g.fillText('Vel', 3, 12);
}
function stepAt(s, G, x) { let k = 0; for (let i = 0; i < s.steps.length; i++) if (x >= G.x(i)) k = i; return k; }
function rollHit(e) {
  const rc = roll.getBoundingClientRect(), s = cur(), rows = rollRows(), G = rollGeom(s, rc.width);
  const x = e.clientX - rc.left, y = e.clientY - rc.top, k = stepAt(s, G, x);
  const row = Math.max(0, Math.min(rows.length - 1, Math.floor(y / RH)));
  return { k, note: rows[row], x, G, inGutter: x < GUT };
}
roll.addEventListener('pointerdown', e => {
  const h = rollHit(e); if (h.inGutter) return;
  e.preventDefault(); roll.setPointerCapture(e.pointerId); pushUndo();
  const st = cur().steps[h.k];
  if (st.on && st.note === h.note) rollDrag = { id: e.pointerId, type: 'len', k: h.k, x0: h.x, tap: true };
  else { st.on = true; st.note = h.note; if (!st.len) st.len = 1; rollDrag = { id: e.pointerId, type: 'paint', last: h.k }; seqChanged(); }
});
roll.addEventListener('pointermove', e => {
  if (!rollDrag || rollDrag.id !== e.pointerId) return;
  const h = rollHit(e), steps = cur().steps;
  if (rollDrag.type === 'len') {
    if (Math.abs(h.x - rollDrag.x0) > 6) rollDrag.tap = false;
    if (!rollDrag.tap) { const k = rollDrag.k, one = h.G.wOf(stepDur(cur(), k)); steps[k].len = Math.max(0.25, Math.min(8, Math.round((h.x - h.G.x(k)) / one * 4) / 4)); seqChanged(); }
  } else {
    const lo = Math.min(rollDrag.last, h.k), hi = Math.max(rollDrag.last, h.k);
    for (let k = lo; k <= hi; k++) { if (k === rollDrag.last && k !== h.k) continue; steps[k].on = true; steps[k].note = h.note; }
    rollDrag.last = h.k; seqChanged();
  }
});
const rollEnd = e => {
  if (!rollDrag || rollDrag.id !== e.pointerId) return;
  if (rollDrag.type === 'len' && rollDrag.tap) { cur().steps[rollDrag.k].on = false; seqChanged(); }
  rollDrag = null;
};
roll.addEventListener('pointerup', rollEnd); roll.addEventListener('pointercancel', rollEnd);
let velDrag = null;
function velAt(e) {
  const rc = velCv.getBoundingClientRect(), s = cur(), G = rollGeom(s, rc.width), x = e.clientX - rc.left;
  if (x < GUT) return;
  const k = stepAt(s, G, x);
  s.steps[k].vel = Math.max(0.05, Math.min(1, 1 - (e.clientY - rc.top - 2) / (rc.height - 4)));
  seqChanged();
}
velCv.addEventListener('pointerdown', e => { e.preventDefault(); velCv.setPointerCapture(e.pointerId); pushUndo(); velDrag = e.pointerId; velAt(e); });
velCv.addEventListener('pointermove', e => { if (velDrag === e.pointerId) velAt(e); });
['pointerup', 'pointercancel'].forEach(t => velCv.addEventListener(t, () => { velDrag = null; }));

$('bpmVal').textContent = state.bpm; drawBpmKnob();
$('play').innerHTML = ICON_PLAY; $('play').setAttribute('aria-label', 'Play');
updateWalkUI();
setPanel('seq', true);   // the sequencer is the starting view

