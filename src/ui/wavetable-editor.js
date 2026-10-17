/* =====================================================================
   WAVETABLE EDITOR
   ===================================================================== */
const ed = $('ed'), edCv = $('edCanvas');
let edSlot = 0, edSide = 'A', edFrame = 0, tool = 'draw', harm = null, stroke = null;
const HN = 32;
const NOTES = {
  draw: 'Draw directly on the wave. Edits play live, so hold or latch a note to hear them.',
  line: 'Drag to draw straight lines. Edits play live, so hold or latch a note to hear them.',
  harm: 'Drag across the bars to set the first 32 harmonics. This rebuilds the frame from those harmonics.',
};
const presetSel = $('edPreset');
presetSel.innerHTML = '<option value="">Choose…</option>' + Object.keys(PRESETS).map(n => `<option>${n}</option>`).join('');

new ResizeObserver(() => document.documentElement.style.setProperty('--kbh', $('kb').getBoundingClientRect().height + 'px')).observe($('kb'));

function openEditor(slot, side) {
  edSlot = slot; edSide = side; edFrame = Math.min(edFrame, tab().frames.length - 1);
  ed.classList.toggle('b', side === 'B');
  $('edTitle').textContent = edTitle();
  ed.classList.add('open');
  if (tool === 'harm') loadHarm();
  renderStrip(); drawEditor(); setTool(tool);
  $('edDone').focus({ preventScroll:true });
}
function closeEditor() { ed.classList.remove('open'); const b = $('wt' + edSide + edSlot); if (b && b.offsetParent) b.focus({ preventScroll:true }); }
const tab = () => tables[edSlot][edSide];
const edTitle = () => `${OSC_NAMES[edSlot]}, table ${edSide}: ${tab().name}`;
document.addEventListener('click', e => { const b = e.target.closest('[data-wt]'); if (b && !e.target.closest('select, .seg') && OSC_KIND[+b.dataset.wt] === 'wt') openEditor(+b.dataset.wt, b.dataset.side); });
$('edDone').addEventListener('click', closeEditor);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ed.classList.contains('open')) closeEditor(); });

function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
  $('edNote').textContent = NOTES[t];
  if (t === 'harm') loadHarm();
  drawEditor();
}
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

function loadHarm() {
  const s = spec[edSlot][edSide]; harm = new Float32Array(HN + 1);
  let mx = 0;
  for (let h = 1; h <= HN; h++) { harm[h] = Math.hypot(s.re[edFrame][h], s.im[edFrame][h]); mx = Math.max(mx, harm[h]); }
  if (mx > 1e-6) for (let h = 1; h <= HN; h++) harm[h] /= mx;   // bars show the balance; the frame is always normalized
}
function frame() { return tab().frames[edFrame]; }
function frameChanged(structure) {
  if (structure) analyzeTable(edSlot, edSide); else analyzeFrame(edSlot, edSide, edFrame);
  sendTable(edSlot, edSide); drawEditor(); structure ? renderStrip() : drawThumb(edFrame); drawWaves(); save();
}
function drawEditor() {
  const side = css(edSide === 'A' ? '--a' : '--b');
  if (tool !== 'harm') { drawWave(edCv, frame(), side, { pad:10, lw:2.2 }); return; }
  const dpr = window.devicePixelRatio || 1, w = edCv.clientWidth, h = edCv.clientHeight;
  if (!w) return;
  edCv.width = Math.round(w * dpr); edCv.height = Math.round(h * dpr);
  const g = edCv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const bw = w / HN;
  g.fillStyle = side;
  for (let k = 1; k <= HN; k++) { const bh = harm[k] * (h - 16); g.fillRect((k - 1) * bw + 1.5, h - 8 - bh, Math.max(1, bw - 3), bh); }
  g.fillStyle = css('--muted'); g.font = '11px "Barlow Semi Condensed", sans-serif';
  g.textAlign = 'center';
  [1, 8, 16, 24, 32].forEach(k => g.fillText(String(k), (k - 0.5) * bw, 12));
}
function drawThumb(j) {
  const c = $('edStrip').children[j];
  if (c) drawWave(c, tab().frames[j], css(edSide === 'A' ? '--a' : '--b'), { pad:3, lw:1.3 });
}
function renderStrip() {
  const st = $('edStrip'), fr = tab().frames;
  st.innerHTML = '';
  fr.forEach((_, j) => {
    const c = document.createElement('canvas');
    c.setAttribute('role', 'option'); c.setAttribute('aria-label', `Frame ${j + 1}`); c.setAttribute('aria-selected', j === edFrame);
    c.tabIndex = 0;
    if (j === edFrame) c.classList.add('sel');
    const pick = () => { edFrame = j; if (tool === 'harm') loadHarm(); renderStrip(); drawEditor(); };
    c.addEventListener('click', pick);
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    st.appendChild(c);
  });
  fr.forEach((_, j) => drawThumb(j));
  $('edCount').textContent = `Frame ${edFrame + 1} of ${fr.length}`;
  $('edAdd').disabled = fr.length >= MAXF; $('edDel').disabled = fr.length <= 1;
  $('edTitle').textContent = edTitle();
}

/* drawing */
function edPoint(e) {
  const r = edCv.getBoundingClientRect();
  const fx = clamp((e.clientX - r.left) / r.width), fy = clamp((e.clientY - r.top) / r.height);
  const pad = 10 / r.height;
  return { i: Math.round(fx * (NS - 1)), v: Math.max(-1, Math.min(1, 1 - 2 * (fy - pad) / (1 - 2 * pad))), fx, fy };
}
function fillLine(f, a, b) {
  if (a.i === b.i) { f[a.i] = b.v; return; }
  const s = a.i < b.i ? 1 : -1;
  for (let i = a.i; i !== b.i + s; i += s) f[i] = a.v + (b.v - a.v) * (i - a.i) / (b.i - a.i);
}
function setHarmAt(p, last) {
  const k = Math.min(HN, Math.max(1, Math.floor(p.fx * HN) + 1)), v = clamp(1 - (p.fy * edCv.clientHeight - 8) / (edCv.clientHeight - 16));
  if (last) { const lo = Math.min(last.k, k), hi = Math.max(last.k, k);
    for (let q = lo; q <= hi; q++) harm[q] = hi === lo ? v : last.v + (v - last.v) * (q - last.k) / (k - last.k); }
  else harm[k] = v;
  const f = additive(harm); let pk = 0; for (const x of f) pk = Math.max(pk, Math.abs(x));
  if (pk > 1e-6) for (let n = 0; n < NS; n++) f[n] /= pk;
  tab().frames[edFrame] = f;
  return { k, v };
}
edCv.addEventListener('pointerdown', e => {
  e.preventDefault(); edCv.setPointerCapture(e.pointerId);
  const p = edPoint(e);
  if (tool === 'draw') { frame()[p.i] = p.v; stroke = { last: p }; }
  else if (tool === 'line') stroke = { start: p, base: frame().slice() };
  else stroke = { last: setHarmAt(p, null) };
  stroke.id = e.pointerId;
  frameChanged(false);
});
edCv.addEventListener('pointermove', e => {
  if (!stroke || stroke.id !== e.pointerId) return;
  const p = edPoint(e);
  if (tool === 'draw') { fillLine(frame(), stroke.last, p); stroke.last = p; }
  else if (tool === 'line') { frame().set(stroke.base); fillLine(frame(), stroke.start, p); }
  else stroke.last = setHarmAt(p, stroke.last);
  frameChanged(false);
});
const edEnd = e => { if (stroke && stroke.id === e.pointerId) stroke = null; };
edCv.addEventListener('pointerup', edEnd); edCv.addEventListener('pointercancel', edEnd);

/* tools */
function afterTool() { if (tool === 'harm') loadHarm(); frameChanged(false); }
$('edSmooth').addEventListener('click', () => {
  const f = frame(), r = 12;
  for (let pass = 0; pass < 2; pass++) {
    const src = f.slice(); let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[(k + NS) % NS];
    for (let n = 0; n < NS; n++) { f[n] = acc / (2 * r + 1); acc += src[(n + r + 1) % NS] - src[(n - r + NS) % NS]; }
  }
  afterTool();
});
$('edNorm').addEventListener('click', () => { normalizeFrame(frame()); afterTool(); });
$('edInv').addEventListener('click', () => { const f = frame(); for (let n = 0; n < NS; n++) f[n] = -f[n]; afterTool(); });
$('edClear').addEventListener('click', () => { tab().frames[edFrame] = PRESETS['Sine']()[0]; afterTool(); });
$('edAdd').addEventListener('click', () => {
  const fr = tab().frames; if (fr.length >= MAXF) return;
  fr.splice(edFrame + 1, 0, frame().slice()); edFrame++;
  if (tool === 'harm') loadHarm(); frameChanged(true);
});
$('edDel').addEventListener('click', () => {
  const fr = tab().frames; if (fr.length <= 1) return;
  fr.splice(edFrame, 1); edFrame = Math.min(edFrame, fr.length - 1);
  if (tool === 'harm') loadHarm(); frameChanged(true);
});
presetSel.addEventListener('change', () => {
  if (!presetSel.value) return;
  tables[edSlot][edSide] = makeTable(presetSel.value); presetSel.value = ''; edFrame = 0;
  if (tool === 'harm') loadHarm(); frameChanged(true);
});
$('edLoad').addEventListener('click', () => $('edFile').click());
$('edFile').addEventListener('change', async () => {
  const file = $('edFile').files[0]; $('edFile').value = '';
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf);
    const d = audio.getChannelData(0), L = d.length;
    let frames = [];
    if (L >= NS * 2 && L % NS === 0) {
      const total = L / NS, count = Math.min(MAXF, total);
      for (let j = 0; j < count; j++) { const src = Math.round(j * (total - 1) / Math.max(1, count - 1)); frames.push(d.slice(src * NS, src * NS + NS)); }
    } else {
      const f = new Float32Array(NS);
      for (let n = 0; n < NS; n++) { const x = n * L / NS, i = Math.floor(x), fr = x - i; f[n] = d[i % L] + ((d[(i + 1) % L]) - d[i % L]) * fr; }
      frames = [f];
    }
    tables[edSlot][edSide] = { name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Loaded', frames: frames.map(f => normalizeFrame(Float32Array.from(f))) };
    edFrame = 0; if (tool === 'harm') loadHarm(); frameChanged(true);
    $('edNote').textContent = frames.length > 1 ? `Loaded ${frames.length} frames.` : 'Loaded as a single cycle. Files made of 2048-sample frames load as multi-frame tables.';
  } catch (err) {
    $('edNote').textContent = 'That file could not be read as audio. WAV files work best.';
  }
});

