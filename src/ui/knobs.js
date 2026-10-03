/* =====================================================================
   KNOBS
   ===================================================================== */
// Sections with pictures. A section can be split into sub-blocks (parameters with a matching `sub`), each with its own picture.
const VIZ = { 'Filter': [{ viz: 'vzF', name: 'Filter response' }, { sub: 'env', title: 'Envelope', viz: 'vzFE', name: 'Filter envelope' }], 'Amp envelope': [{ viz: 'vzAE', name: 'Amp envelope' }] };
const lockIcon = on => `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor"/><path d="${on ? 'M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7' : 'M5.2 7V5.2a2.8 2.8 0 0 1 5.5-.8'}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
const iconBtn = (id, label, single) => `<span class="icons"><button type="button" class="lock" data-plock="${id}" aria-pressed="false" aria-label="Lock ${label}"></button>${single ? '' : `<button type="button" class="lock" data-plink="${id}" aria-pressed="false" aria-label="Link ${label}"></button>`}</span>`;
const linkIcon = on => `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">${on
  ? '<path d="M6.6 9.4l2.8-2.8"/><path d="M7.4 4.9l1.3-1.3a2.6 2.6 0 0 1 3.7 3.7l-1.3 1.3"/><path d="M8.6 11.1l-1.3 1.3a2.6 2.6 0 0 1-3.7-3.7l1.3-1.3"/>'
  : '<path d="M8.2 4.1l.9-.9a2.6 2.6 0 0 1 3.7 3.7l-.9.9"/><path d="M7.8 11.9l-.9.9a2.6 2.6 0 0 1-3.7-3.7l.9-.9"/><path d="M10.5 12.5l1 1M12.5 10.5l1 1" stroke-width="1.3"/>'}</svg>`;
const CX = 40, R = 31, SWEEP = 75;   // SWEEP = 270° as a share of pathLength 100
const ang = x => (135 + 270 * x) * Math.PI / 180;
const pt = x => [CX + R * Math.cos(ang(x)), CX + R * Math.sin(ang(x))];
const knobSVG = (d, i) => `<svg viewBox="0 0 80 80" aria-hidden="false">
  <circle class="bg" cx="40" cy="40" r="${R}" pathLength="100" stroke-dasharray="${SWEEP} 200" transform="rotate(135 40 40)" fill="none" stroke-width="6" stroke-linecap="round"/>
  <circle class="arcA" id="arcA${i}" cx="40" cy="40" r="${R}" pathLength="100" transform="rotate(135 40 40)" fill="none" stroke-width="6" stroke-linecap="round"/>
  <circle class="arcB" id="arcB${i}" cx="40" cy="40" r="${R}" pathLength="100" transform="rotate(135 40 40)" fill="none" stroke-width="6" stroke-linecap="round"/>
  <circle class="cap" cx="40" cy="40" r="21"/>
  <path class="glyph" id="gl${i}"/>
  <circle class="gdot" id="gd${i}" r="2"/>
  <g class="ctr" id="c${i}" tabindex="0" role="slider" aria-label="${d.label} morph curve" aria-valuemin="-100" aria-valuemax="100">
    <circle class="ring" cx="40" cy="40" r="23"/>
  </g>
  <g class="hdl hA" id="hA${i}" tabindex="0" role="slider" aria-label="${d.label} A value" aria-valuemin="0" aria-valuemax="100">
    <circle class="ring" r="9"/><circle class="h" r="5.5"/>
  </g>
  <g class="hdl hB" id="hB${i}" tabindex="0" role="slider" aria-label="${d.label} B value" aria-valuemin="0" aria-valuemax="100">
    <circle class="ring" r="9"/><circle class="h" id="hBc${i}" r="5.5"/>
  </g>
  <circle class="now" id="now${i}" r="3.4"/>
</svg>`;

const groupsEl = document.getElementById('groups');
const knobHTML = (d, i) => `<div class="kn">
    <div class="kname">${d.label}</div>
    <div class="kwrap"><div class="knob" id="k${i}">${knobSVG(d, i)}</div>${iconBtn(d.id, d.label, d.single)}</div>
    <div class="kval" id="v${i}"></div>
    <div class="kab"><span class="a" id="va${i}"></span><span class="b" id="vb${i}"></span></div>
  </div>`;
// A, what you hear, and B for every oscillator slot; on a Wavetable slot the A and B cards open the editor
const waveCards = s => `<div class="wt">
    <button class="wtcard a" id="wtA${s}" data-wt="${s}" data-side="A" type="button" aria-label="Edit wavetable A of Osc ${s + 1}">
      <canvas id="cvA${s}"></canvas><span class="wtlabel"><span class="nm" id="nmA${s}"></span><span class="ac">Edit A</span></span></button>
    <div class="wtcard"><canvas id="cvH${s}"></canvas><span class="wtlabel"><span class="nm">What you hear</span></span></div>
    <button class="wtcard b" id="wtB${s}" data-wt="${s}" data-side="B" type="button" aria-label="Edit wavetable B of Osc ${s + 1}">
      <canvas id="cvB${s}"></canvas><span class="wtlabel"><span class="nm" id="nmB${s}"></span><span class="ac">Edit B</span></span></button>
  </div>`;
const options = list => list.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
/* One section per group. Oscillator and FX slot sections hold a container per type (data-eng),
   and only the current type's is shown; '*' holds the knobs every oscillator type shares. */
const sections = {};
function makeSection(d) {
  const g = document.createElement('section'); g.className = 'group'; g.dataset.group = d.group;
  let head = `<h2><span class="gname">${d.group}</span>`;
  if (d.kind === 'osc') head += `<select class="typesel" data-osc="${d.slot}" aria-label="${d.group} engine">${options(OSC_TYPES)}</select>`;
  if (d.kind === 'fx') head += `<select class="typesel" data-fxsel="${d.slot}" aria-label="${d.group} effect">${options(FX_TYPES)}</select>`;
  head += '</h2>';
  let body;
  if (d.kind === 'osc') body = waveCards(d.slot) + Object.keys(OSC_ENG).map(e => `<div class="eng" data-eng="${e}"><div class="knobs"></div></div>`).join('')
    + '<div class="eng" data-eng="*"><div class="knobs"></div></div>';
  else if (d.kind === 'fx') body = Object.keys(FX_ENG).map(e => `<div class="eng" data-eng="${e}">${e === 'ott'
    ? `<canvas class="viz" id="vzOT${d.slot}" aria-label="OTT bands: split points, gain settings and live levels"></canvas>` : ''}<div class="knobs"></div></div>`).join('');
  else if (VIZ[d.group]) body = VIZ[d.group].map(b => `<div class="sub">${b.title ? `<div class="subh">${b.title}</div>` : ''}<canvas class="viz" id="${b.viz}" aria-label="${b.name}: A, B and current shape"></canvas><div class="knobs"${b.sub ? ` data-sub="${b.sub}"` : ''}></div></div>`).join('');
  else body = '<div class="knobs"></div>';
  if (d.kind) g.dataset.kind = d.kind;
  g.innerHTML = head + `<div class="gbody">${body}</div>`;
  groupsEl.appendChild(g);
  return g;
}
DEFS.forEach((d, i) => {
  let box;
  if (d.group === 'Sequencer') box = document.getElementById('seqKnob');
  else {
    const g = sections[d.group] || (sections[d.group] = makeSection(d));
    box = d.kind === 'osc' || d.kind === 'fx' ? g.querySelector(`.eng[data-eng="${d.eng || '*'}"] .knobs`) : g.querySelector(d.sub ? `.knobs[data-sub="${d.sub}"]` : '.knobs:not([data-sub])');
  }
  box.insertAdjacentHTML('beforeend', knobHTML(d, i));
});

const $ = id => document.getElementById(id);
const valText = (i, x) => FMT[DEFS[i].key](MorphEngine.denorm(DEFS[i], x));
const editing = {};   // i -> 'A' | 'B' | 'C' while a knob is being dragged

function setArc(el, from, to) {
  const s = Math.min(from, to), l = Math.abs(to - from);
  el.setAttribute('stroke-dasharray', `${(SWEEP * l).toFixed(3)} 200`);
  el.setAttribute('stroke-dashoffset', (-SWEEP * s).toFixed(3));
}
function updateKnob(i) {
  const d = DEFS[i], a = state.A[i], b = state.B[i], c = state.C[i], r = resolveNorm(i);
  setArc($('arcA' + i), a, r);
  setArc($('arcB' + i), r, b);
  const [ax, ay] = pt(a), [bx, by] = pt(b), [nx, ny] = pt(r);
  $('hA' + i).setAttribute('transform', `translate(${ax.toFixed(2)} ${ay.toFixed(2)})`);
  $('hB' + i).setAttribute('transform', `translate(${bx.toFixed(2)} ${by.toFixed(2)})`);
  $('hBc' + i).setAttribute('r', Math.abs(a - b) < 0.035 ? 3 : 5.5);   // stacked handles stay visible
  $('now' + i).setAttribute('cx', nx.toFixed(2)); $('now' + i).setAttribute('cy', ny.toFixed(2));
  // Linked (or single-side) parameters don't morph: one handle, one value, no curve
  const linked = isLinked(i), kn = $('k' + i);
  kn.classList.toggle('kl-A', d.single === 'A'); kn.classList.toggle('kl-B', d.single === 'B'); kn.classList.toggle('kl-L', linked && !d.single);
  $('now' + i).setAttribute('r', linked ? 0 : 3.4);
  $('hB' + i).style.display = linked ? 'none' : '';
  $('hB' + i).setAttribute('tabindex', linked ? -1 : 0);
  $('c' + i).setAttribute('tabindex', linked ? -1 : 0);
  $('gd' + i).setAttribute('r', linked ? 0 : 2);
  if (linked) { setArc($('arcA' + i), 0, a); setArc($('arcB' + i), a, a); }

  // center glyph: the morph curve drawn in an 18×18 box
  const x0 = 31, y0 = 49, S = 18, m = state.morph;
  let path, gy;
  if (d.snap) {
    const e = Math.pow(6, -c), t = Math.pow(0.5, 1 / e);
    path = `M${x0} ${y0} H${(x0 + t * S).toFixed(2)} V${y0 - S} H${x0 + S}`;
    gy = MorphEngine.bend(m, c) >= 0.5 ? 1 : 0;
  } else if (d.curve === 'int') {
    const steps = d.max - d.min, sA = Math.round(a * steps), sB = Math.round(b * steps), span = sB - sA;
    const yOf = t => span === 0 ? MorphEngine.bend(t, c) : (Math.round((a + (b - a) * MorphEngine.bend(t, c)) * steps) - sA) / span;
    let py = yOf(0); path = `M${x0} ${(y0 - py * S).toFixed(2)}`;
    for (let k = 1; k <= 60; k++) {
      const t = k / 60, ny = yOf(t);
      if (ny !== py) { path += ` H${(x0 + t * S).toFixed(2)} V${(y0 - ny * S).toFixed(2)}`; py = ny; }
    }
    path += ` H${x0 + S}`;
    gy = yOf(m);
  } else {
    path = '';
    for (let k = 0; k <= 20; k++) { const t = k / 20; path += (k ? 'L' : 'M') + (x0 + t * S).toFixed(2) + ' ' + (y0 - MorphEngine.bend(t, c) * S).toFixed(2); }
    gy = MorphEngine.bend(m, c);
  }
  $('gl' + i).setAttribute('d', linked ? '' : path);
  $('gd' + i).setAttribute('cx', (x0 + m * S).toFixed(2)); $('gd' + i).setAttribute('cy', (y0 - gy * S).toFixed(2));

  // text
  const v = $('v' + i), ed = editing[i];
  if (linked) {
    v.className = 'kval'; v.textContent = valText(i, a);
    $('va' + i).textContent = d.single === 'A' ? 'Side A' : linked && !d.single ? 'Linked' : '';
    $('vb' + i).textContent = d.single === 'B' ? 'Side B' : '';
    $('va' + i).classList.toggle('muted', !d.single);
  } else {
    v.className = 'kval' + (ed === 'A' ? ' a' : ed === 'B' ? ' b' : '');
    v.textContent = ed === 'A' ? 'A ' + valText(i, a) : ed === 'B' ? 'B ' + valText(i, b) : ed === 'C' ? fmtCurve(c) : valText(i, r);
    $('va' + i).textContent = valText(i, a); $('va' + i).classList.remove('muted');
    $('vb' + i).textContent = valText(i, b);
  }

  // accessibility
  const hA = $('hA' + i), hB = $('hB' + i), cc = $('c' + i);
  hA.setAttribute('aria-valuenow', Math.round(a * 100)); hA.setAttribute('aria-valuetext', valText(i, a));
  hB.setAttribute('aria-valuenow', Math.round(b * 100)); hB.setAttribute('aria-valuetext', valText(i, b));
  cc.setAttribute('aria-valuenow', Math.round(c * 100)); cc.setAttribute('aria-valuetext', fmtCurve(c));
}
function refreshAll() { DEFS.forEach((d, i) => { if (isActive(d)) updateKnob(i); }); updateMorphUI(); }   // hidden knobs update when their type is shown
function setParam(side, i, x) {
  x = clamp(x);
  if (isLinked(i)) {   // linked or single-side: both sides always hold the same value
    if (state.A[i] === x && state.B[i] === x) return;
    state.A[i] = x; state.B[i] = x;
    updateKnob(i);
    if (ready) { send({ type:'param', side:'A', i, v:x }); send({ type:'param', side:'B', i, v:x }); }
    drawWaves(); save();
    return;
  }
  if (state[side][i] === x) return;
  state[side][i] = x;
  updateKnob(i);
  if (ready) send({ type:'param', side, i, v:x });
  drawWaves();
  save();
}
function setCurve(i, c) {
  c = clampC(Math.abs(c) < 0.03 ? 0 : c);
  if (state.C[i] === c) return;
  state.C[i] = c;
  updateKnob(i);
  if (ready) send({ type:'curve', i, v:c });
  drawWaves();
  save();
}


/* ---------- knob pointer interaction ---------- */
function bindKnob(i) {
  const el = $('k' + i), d = DEFS[i];
  let pid = null, mode = null, sx = 0, sy = 0, sv = 0, lastTap = 0, lastMode = null;
  const targetEl = md => md === 'C' ? $('c' + i) : $('h' + md + i);

  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    const rc = el.getBoundingClientRect();
    const x = (e.clientX - rc.left) / rc.width * 80 - CX, y = (e.clientY - rc.top) / rc.height * 80 - CX;
    if (isLinked(i)) mode = 'A';   // linked: the whole knob drags the single value
    else if (Math.hypot(x, y) < 22) mode = 'C';
    else {
      let rel = (Math.atan2(y, x) * 180 / Math.PI - 135 + 720) % 360;
      const xp = rel <= 270 ? rel / 270 : (rel > 315 ? 0 : 1);
      const a = state.A[i], b = state.B[i];
      if (Math.abs(a - b) < 0.035) {
        // Stacked handles: at the start of the ring take B, at the end take A,
        // otherwise grabbing on the lower (counter-clockwise) side takes A and the upper side takes B.
        const h = (a + b) / 2;
        mode = h <= 0.01 ? 'B' : h >= 0.99 ? 'A' : (xp < h ? 'A' : 'B');
      } else mode = Math.abs(a - xp) < Math.abs(b - xp) ? 'A' : 'B';
    }
    const now = performance.now();
    if (now - lastTap < 300 && mode === lastMode) {
      if (mode === 'C') setCurve(i, 0); else setParam(mode, i, defaultNorm(DEFS[i].single || mode, i));
      lastTap = 0; mode = null; return;
    }
    lastTap = now; lastMode = mode;
    pid = e.pointerId; el.setPointerCapture(pid);
    sx = e.clientX; sy = e.clientY;
    sv = mode === 'C' ? state.C[i] : state[mode][i];
    editing[i] = mode; el.classList.add('dragging');
    targetEl(mode).classList.add('active');
    targetEl(mode).focus({ preventScroll:true });
    updateKnob(i);
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    const delta = ((sy - e.clientY) + (e.clientX - sx) * 0.5) / (e.shiftKey ? 900 : 200);
    if (mode === 'C') setCurve(i, sv + delta * 2);
    else setParam(mode, i, quant(d, clamp(sv + delta)));
  });
  const end = e => {
    if (e.pointerId !== pid) return;
    targetEl(mode).classList.remove('active');
    pid = null; delete editing[i]; el.classList.remove('dragging');
    updateKnob(i);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);

  // keyboard: each handle and the center are focusable sliders
  ['A', 'B', 'C'].forEach(md => {
    const t = targetEl(md);
    t.addEventListener('keydown', e => {
      const isC = md === 'C';
      if (isLinked(i) && md !== 'A') return;
      const step = isC ? (e.shiftKey ? 0.25 : 0.05) : d.curve === 'int' ? 1 / (d.max - d.min) : (e.shiftKey ? 0.1 : 0.01);
      let x = isC ? state.C[i] : state[md][i];
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') x += step;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') x -= step;
      else if (e.key === 'Home') x = isC ? -1 : 0;
      else if (e.key === 'End') x = 1;
      else if (e.key === 'Delete' || e.key === 'Backspace') x = isC ? 0 : defaultNorm(md, i);
      else return;
      e.preventDefault(); e.stopPropagation();
      if (isC) setCurve(i, x); else setParam(md, i, quant(d, clamp(x)));
    });
    t.addEventListener('focus', () => { if (!el.classList.contains('dragging')) { editing[i] = md; updateKnob(i); } });
    t.addEventListener('blur', () => { if (!el.classList.contains('dragging')) { delete editing[i]; updateKnob(i); } });
  });
}
DEFS.forEach((_, i) => bindKnob(i));


