/* FM sketch UI: knobs, algorithm diagrams, presets, scope, keyboard, audio startup and saving. */
const $ = id => document.getElementById(id);
const pct = v => Math.round(v * 100) + '%';
const time = v => (v < 0.9995 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s');
// curve: 'lin' | 'log' | 'int'
const P = (id, label, min, max, curve, def, fmt) => ({ id, label, min, max, curve, def, fmt });
const PARAMS = [
  P('fb', 'Feedback', 0, 1, 'lin', 0, pct), P('bright', 'Brightness', 0, 2, 'lin', 1, pct),
  P('pitch', 'Pitch', -24, 24, 'int', 0, v => (v > 0 ? '+' : '') + v + ' st'),
  ...[1, 2, 3, 4].flatMap(k => [
    P('r' + k, 'Ratio', 0, 16, 'int', [1, 1, 3, 2][k - 1], v => '×' + OscFM.RATIOS[v]),
    P('l' + k, 'Level', 0, 1, 'lin', [1, 0.5, 0.35, 0.25][k - 1], pct),
    P('d' + k, 'Decay', 0.005, 30, 'log', [30, 1.2, 0.6, 0.3][k - 1], v => (v >= OscFM.HOLD ? 'Hold' : time(v))),
  ]),
  P('aatk', 'Attack', 0.001, 5, 'log', 0.003, time), P('adec', 'Decay', 0.005, 10, 'log', 0.8, time),
  P('asus', 'Sustain', 0, 1, 'lin', 0.7, pct), P('arel', 'Release', 0.005, 10, 'log', 0.4, time),
  P('vol', 'Volume', 0, 1, 'lin', 0.7, pct),
];
const BY = Object.fromEntries(PARAMS.map(p => [p.id, p]));
const norm = (p, v) => p.curve === 'log' ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min);
const denorm = (p, x) => { const v = p.curve === 'log' ? p.min * Math.pow(p.max / p.min, x) : p.min + (p.max - p.min) * x; return p.curve === 'int' ? Math.round(v) : v; };
const PRESETS = {
  'Electric piano': { algo: 4, fb: 0, bright: 1, r1: 1, l1: 0.9, d1: 3, r2: 14, l2: 0.25, d2: 0.4, r3: 1, l3: 0.8, d3: 4, r4: 1, l4: 0.35, d4: 1.2, aatk: 0.002, adec: 2, asus: 0.4, arel: 0.5 },
  'Bell': { algo: 4, fb: 0, bright: 1, r1: 1, l1: 1, d1: 6, r2: 4, l2: 0.55, d2: 4, r3: 1, l3: 0.6, d3: 8, r4: 7, l4: 0.4, d4: 3, aatk: 0.001, adec: 6, asus: 0, arel: 2 },
  'Bass': { algo: 0, fb: 0.3, bright: 1, r1: 1, l1: 1, d1: 30, r2: 1, l2: 0.55, d2: 0.5, r3: 2, l3: 0.3, d3: 0.3, r4: 1, l4: 0.2, d4: 0.2, aatk: 0.002, adec: 0.6, asus: 0.6, arel: 0.15 },
  'Brass': { algo: 1, fb: 0.2, bright: 1, r1: 1, l1: 1, d1: 30, r2: 1, l2: 0.6, d2: 30, r3: 1, l3: 0.3, d3: 30, r4: 2, l4: 0.2, d4: 30, aatk: 0.06, adec: 0.4, asus: 0.85, arel: 0.2 },
  'Pluck': { algo: 0, fb: 0.1, bright: 1, r1: 1, l1: 1, d1: 0.6, r2: 2, l2: 0.6, d2: 0.15, r3: 3, l3: 0.3, d3: 0.08, r4: 1, l4: 0.3, d4: 0.05, aatk: 0.001, adec: 1, asus: 0, arel: 0.3 },
  'Organ': { algo: 7, fb: 0.15, bright: 1, r1: 1, l1: 0.9, d1: 30, r2: 2, l2: 0.6, d2: 30, r3: 4, l3: 0.4, d3: 30, r4: 8, l4: 0.3, d4: 30, aatk: 0.005, adec: 0.2, asus: 1, arel: 0.08 },
};
const state = { algo: 0, ...Object.fromEntries(PARAMS.map(p => [p.id, p.def])) };
try { const s = JSON.parse(localStorage.getItem('fm-sketch') || 'null'); if (s) for (const k in state) if (typeof s[k] === 'number') state[k] = s[k]; } catch (e) {}
let saveTimer = null;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem('fm-sketch', JSON.stringify(state)); } catch (e) {} }, 300); };

/* ---------- knobs: drag up/down (or left/right), double-click resets, arrow keys step ---------- */
const ang = x => (135 + 270 * x) * Math.PI / 180;
function knob(p, host) {
  const el = document.createElement('div'); el.className = 'kn';
  el.innerHTML = `<div class="kname">${p.label}</div><svg viewBox="0 0 60 60" class="knob" tabindex="0" role="slider" aria-label="${p.label}">
    <circle cx="30" cy="30" r="23" class="bg" pathLength="100" stroke-dasharray="75 200" transform="rotate(135 30 30)"/>
    <circle cx="30" cy="30" r="23" class="arc" pathLength="100" transform="rotate(135 30 30)"/><circle class="dot" r="3.5"/></svg><div class="kval"></div>`;
  host.appendChild(el);
  const svg = el.querySelector('svg'), arc = el.querySelector('.arc'), dot = el.querySelector('.dot'), val = el.querySelector('.kval');
  const draw = () => {
    const x = norm(p, state[p.id]);
    arc.setAttribute('stroke-dasharray', `${(75 * x).toFixed(2)} 200`);
    dot.setAttribute('cx', (30 + 23 * Math.cos(ang(x))).toFixed(2)); dot.setAttribute('cy', (30 + 23 * Math.sin(ang(x))).toFixed(2));
    val.textContent = p.fmt(state[p.id]); svg.setAttribute('aria-valuetext', val.textContent);
  };
  const set = x => { const v = denorm(p, Math.max(0, Math.min(1, x))); if (v !== state[p.id]) { state[p.id] = v; draw(); changed(); } };
  let drag = null;
  svg.addEventListener('pointerdown', e => { e.preventDefault(); svg.setPointerCapture(e.pointerId); drag = { y: e.clientY, x: e.clientX, v: norm(p, state[p.id]), id: e.pointerId }; });
  svg.addEventListener('pointermove', e => { if (drag && drag.id === e.pointerId) set(drag.v + ((drag.y - e.clientY) + (e.clientX - drag.x) * 0.5) / (e.shiftKey ? 800 : 180)); });
  ['pointerup', 'pointercancel'].forEach(t => svg.addEventListener(t, () => { drag = null; }));
  svg.addEventListener('dblclick', () => { state[p.id] = p.def; draw(); changed(); });
  svg.addEventListener('keydown', e => {
    const step = p.curve === 'int' ? 1 / (p.max - p.min) : e.shiftKey ? 0.1 : 0.01;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(norm(p, state[p.id]) + step); else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(norm(p, state[p.id]) - step); else return;
    e.preventDefault();
  });
  knobs.push(draw); draw();
}
const knobs = [];

/* ---------- algorithm diagrams: operators as boxes, modulation as lines into the box below, heard ones on the floor ---------- */
// layout per algorithm: [column, row] for operators 1-4 (row 0 is the bottom, where operators are heard)
const LAYOUT = [[[0, 0], [0, 1], [0, 2], [0, 3]], [[0.5, 0], [0.5, 1], [0, 2], [1, 2]], [[0.5, 0], [0, 1], [1, 1], [1, 2]], [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [1, 2]], [[0, 0], [1, 0], [2, 0], [0, 1]], [[0, 0], [1, 0], [2, 0], [3, 0]]];
const LINKS = [[4, 3], [4, 2], [4, 1], [3, 2], [3, 1], [2, 1]];
function diagram(a) {
  const L = LAYOUT[a], W = 92, H = 92, bx = 18, cx = c => 12 + c * 22, cy = r => H - 18 - r * 21;
  let svg = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  OscFM.ALGS[a][0].forEach((on, j) => { if (!on) return; const [from, to] = LINKS[j], A = L[from - 1], B = L[to - 1];
    svg += `<line x1="${cx(A[0]) + bx / 2}" y1="${cy(A[1]) + bx / 2}" x2="${cx(B[0]) + bx / 2}" y2="${cy(B[1])}" class="ln"/>`; });
  svg += `<path d="M${cx(L[3][0]) + bx} ${cy(L[3][1]) + 5} h4 v-9 h-${bx / 2 + 4} v4" class="ln fbk"/>`;   // feedback loop on operator 4
  L.forEach(([c, r], k) => { const heard = OscFM.ALGS[a][1][k];
    svg += `<rect x="${cx(c)}" y="${cy(r)}" width="${bx}" height="${bx}" rx="3" class="op${heard ? ' heard' : ''}"/><text x="${cx(c) + bx / 2}" y="${cy(r) + 13}">${k + 1}</text>`; });
  return svg + '</svg>';
}
$('algos').innerHTML = OscFM.ALGS.map((_, a) => `<button type="button" class="algo" data-a="${a}" aria-label="Algorithm ${a + 1}">${diagram(a)}<span>${a + 1}</span></button>`).join('');
$('algos').addEventListener('click', e => { const b = e.target.closest('.algo'); if (b) { state.algo = +b.dataset.a; changed(); } });

/* ---------- panels ---------- */
['fb', 'bright', 'pitch'].forEach(id => knob(BY[id], $('global')));
for (let k = 1; k <= 4; k++) {
  const col = document.createElement('div'); col.className = 'opcol'; col.id = 'op' + k;
  col.innerHTML = `<h3>Operator ${k} <span class="role"></span></h3>`;
  $('ops').appendChild(col);
  ['r', 'l', 'd'].forEach(x => knob(BY[x + k], col));
}
['aatk', 'adec', 'asus', 'arel', 'vol'].forEach(id => knob(BY[id], $('amp')));
$('preset').innerHTML = '<option value="">Presets…</option>' + Object.keys(PRESETS).map(n => `<option>${n}</option>`).join('');
$('preset').addEventListener('change', () => { const pr = PRESETS[$('preset').value]; if (!pr) return; Object.assign(state, pr); $('preset').value = ''; knobs.forEach(d => d()); changed(); });
$('rand').addEventListener('click', () => {
  state.algo = Math.floor(Math.random() * 8); state.fb = Math.random() < 0.6 ? 0 : Math.random() * 0.6;
  for (let k = 1; k <= 4; k++) {
    const heard = OscFM.ALGS[state.algo][1][k - 1];
    state['r' + k] = k === 1 || Math.random() < 0.4 ? 1 : Math.floor(Math.random() * 8);
    state['l' + k] = heard ? 0.6 + Math.random() * 0.4 : Math.random() ** 1.3 * 0.8;
    state['d' + k] = heard ? (Math.random() < 0.6 ? 30 : 0.2 + Math.random() * 3) : (Math.random() < 0.3 ? 30 : 0.03 * Math.pow(200, Math.random()));
  }
  knobs.forEach(d => d()); changed();
});

function updateAlgoUI() {
  document.querySelectorAll('.algo').forEach(b => b.setAttribute('aria-pressed', +b.dataset.a === state.algo));
  for (let k = 1; k <= 4; k++) {
    const heard = OscFM.ALGS[state.algo][1][k - 1], mods = OscFM.ALGS[state.algo][0].some((on, j) => on && LINKS[j][0] === k);
    const col = $('op' + k); col.classList.toggle('heard', !!heard);
    col.querySelector('.role').textContent = heard && mods ? 'heard + modulates' : heard ? 'heard' : mods ? 'modulates' : 'silent';
  }
}
const cyc = new Float32Array(512);
function drawCycle() {
  const cv = $('cycle'), dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  OscFM.cycle({ algo: state.algo, fb: state.fb, r: [1, 2, 3, 4].map(k => OscFM.RATIOS[state['r' + k]]), l: [1, 2, 3, 4].map(k => state['l' + k] * (k === 1 ? 1 : 1)) }, 512, cyc);
  let pk = 1e-6; for (const x of cyc) pk = Math.max(pk, Math.abs(x));
  g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink'); g.lineWidth = 2; g.beginPath();
  cyc.forEach((x, n) => { const X = n / 511 * w, Y = h / 2 - x / pk * (h / 2 - 6); n ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
}
function changed() { updateAlgoUI(); drawCycle(); post({ type:'params', p: state }); save(); }

/* ---------- audio ---------- */
let ctx = null, send = null, analyser = null, pending = [];
const post = m => { if (send) send(m); else if (m.type !== 'params') pending.push(m); };
async function startAudio() {
  if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.connect(ctx.destination);
  const src = `${OscFM.toString()}\n${FmEngine.toString()}
class P extends AudioWorkletProcessor { constructor() { super(); this.e = new FmEngine(sampleRate); this.port.onmessage = ev => this.e.handle(ev.data); }
  process(i, o) { const L = o[0][0], R = o[0][1]; L.fill(0); R.fill(0); this.e.render(L, R, L.length); return true; } }
registerProcessor('fm-sketch', P);`;
  try {
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
    const node = new AudioWorkletNode(ctx, 'fm-sketch', { numberOfInputs: 0, outputChannelCount: [2] });
    node.connect(analyser); send = m => node.port.postMessage(m);
  } catch (e) {   // older browsers: run on the main thread
    const eng = new FmEngine(ctx.sampleRate), sp = ctx.createScriptProcessor(1024, 1, 2);
    sp.onaudioprocess = ev => { const L = ev.outputBuffer.getChannelData(0), R = ev.outputBuffer.getChannelData(1); L.fill(0); R.fill(0); eng.render(L, R, L.length); };
    sp.connect(analyser); window.__sp = sp; send = m => eng.handle(m);
  }
  send({ type:'params', p: state }); pending.forEach(send); pending = [];
  $('audio').textContent = 'Audio on'; $('audio').classList.remove('attn');
  scope();
}
['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, startAudio, { capture: true, passive: true }));
function scope() {
  const cv = $('scope'), buf = new Float32Array(analyser.fftSize);
  const frame = () => {
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    analyser.getFloatTimeDomainData(buf);
    let start = 0; for (let i = 1; i < buf.length / 2; i++) if (buf[i - 1] < 0 && buf[i] >= 0) { start = i; break; }   // steady trigger
    g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent'); g.lineWidth = 1.6; g.beginPath();
    for (let i = 0; i < 1024; i++) { const X = i / 1023 * w, Y = h / 2 - buf[start + i] * (h / 2 - 4); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
    g.stroke(); requestAnimationFrame(frame);
  };
  frame();
}

/* ---------- keyboard: two octaves on screen, computer keys A-K (Z / X change octave) ---------- */
let oct = 4;
const kbEl = $('keys'), WHITE = [0, 2, 4, 5, 7, 9, 11], held = new Map();
function buildKeys() {
  kbEl.innerHTML = '';
  for (let o = 0; o < 2; o++) WHITE.forEach((n, i) => {
    const k = document.createElement('div'); k.className = 'white'; k.dataset.n = 12 * o + n; kbEl.appendChild(k);
    if ([0, 2, 5, 7, 9].includes(n)) { const b = document.createElement('div'); b.className = 'black'; b.dataset.n = 12 * o + n + 1; b.style.left = `calc(${(o * 7 + i + 1) / 14 * 100}% - 3.4%)`; kbEl.appendChild(b); }
  });
}
buildKeys();
const noteOf = el => 12 * (oct + 1) + +el.dataset.n;
const on = (n, v = 0.85) => { post({ type:'on', note:n, vel:v }); document.querySelectorAll(`[data-n="${n - 12 * (oct + 1)}"]`).forEach(k => k.classList.add('on')); };
const off = n => { post({ type:'off', note:n }); document.querySelectorAll(`[data-n="${n - 12 * (oct + 1)}"]`).forEach(k => k.classList.remove('on')); };
kbEl.addEventListener('pointerdown', e => { const k = e.target.closest('[data-n]'); if (!k) return; e.preventDefault(); kbEl.setPointerCapture(e.pointerId); const n = noteOf(k); held.set(e.pointerId, n); on(n); });
['pointerup', 'pointercancel'].forEach(t => kbEl.addEventListener(t, e => { const n = held.get(e.pointerId); if (n !== undefined) { off(n); held.delete(e.pointerId); } }));
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14 }, down = new Map();
document.addEventListener('keydown', e => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  if (k === 'z' || k === 'x') { oct = Math.max(1, Math.min(7, oct + (k === 'x' ? 1 : -1))); $('oct').textContent = 'C' + oct; return; }
  if (k in KEYMAP && !down.has(k)) { const n = 12 * (oct + 1) + KEYMAP[k]; down.set(k, n); on(n); }
});
document.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (down.has(k)) { off(down.get(k)); down.delete(k); } });
$('octDn').addEventListener('click', () => { oct = Math.max(1, oct - 1); $('oct').textContent = 'C' + oct; });
$('octUp').addEventListener('click', () => { oct = Math.min(7, oct + 1); $('oct').textContent = 'C' + oct; });
$('oct').textContent = 'C' + oct;
window.addEventListener('resize', drawCycle);
changed();
