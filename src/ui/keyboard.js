/* =====================================================================
   KEYBOARD (the Play panel, 2026-11-11)
   Three layouts (the icons at the top of the Play panel): Piano, three rows
   of one octave each (the lowest at the bottom); Grid, an isomorphic square
   grid; Hexagons, an isomorphic hexagonal one. Grid and hexagons follow the
   Key in the header, in key (the scale's notes only) or chromatic (all twelve,
   those in the key lit more brightly), with rows a third, fourth (default)
   or fifth apart (Settings). Roots are lit in the morph colour everywhere.
   The cell size suits the device: about 56 px for touch, 44 px for a mouse.
   Every key carries its offset from the bottom octave (data-off).
   ===================================================================== */
const keysEl = $('keys');
let octShift = 0, kbMode = 'piano';
try { const m = localStorage.getItem('diptych-kb'); if (['piano', 'grid', 'hex'].includes(m)) kbMode = m; } catch (e) {}
const base = () => 48 + 12 * octShift;
const WHITE7 = [0, 2, 4, 5, 7, 9, 11], BLACK5 = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
const keyRoot = () => (state.seq ? state.seq.A.root : 0), keyScale = () => (state.seq ? SCALES[state.seq.A.scale] : [0, 2, 4, 5, 7, 9, 11]);
const ROW_STEPS = [2, 3, 4], ROW_SEMIS = [4, 5, 7];   // a third, a fourth, a fifth: in scale steps (in key) or semitones (chromatic)
/* the note (offset from the bottom octave) at grid position (step right, row up), in key or chromatic, and whether the
   note is in the key and a root; for hexagons, right is one scale step (in key) or a whole tone (chromatic, as on a
   Wicki-Hayden layout) and up-right is the row interval */
function gridNote(right, up, hex) {
  const root = keyRoot(), sc = keyScale(), n = sc.length, pcs = new Set(sc.map(x => (x + root) % 12));
  if (!kbChrom) { const d = right + up * ROW_STEPS[kbRow]; return { off: root + sc[((d % n) + n) % n] + 12 * Math.floor(d / n), inKey: true, isRoot: ((d % n) + n) % n === 0 }; }
  const semis = right * (hex ? 2 : 1) + up * ROW_SEMIS[kbRow], off = root + semis, pc = ((off % 12) + 12) % 12;
  return { off, inKey: pcs.has(pc), isRoot: pc === root };
}
function buildKeys() {
  keysEl.innerHTML = ''; keysEl.className = 'keys ' + kbMode; keysEl.style.gridTemplateColumns = keysEl.style.gridTemplateRows = '';
  const root = keyRoot(), isRoot = off => ((base() + off) % 12 + 12) % 12 === root;
  const coarse = matchMedia('(pointer: coarse)').matches, cell = coarse ? 56 : 44;
  const W = keysEl.clientWidth || 340, H = keysEl.clientHeight || 300;
  const label = off => NOTE_NAMES[(((base() + off) % 12) + 12) % 12];
  if (kbMode === 'piano') {
    for (let r = 2; r >= 0; r--) {
      const row = document.createElement('div'); row.className = 'krow';
      WHITE7.forEach(o => { const k = document.createElement('div'); k.className = 'white' + (isRoot(r * 12 + o) ? ' root' : ''); k.dataset.off = r * 12 + o;
        if (o === 0) k.innerHTML = `<span>C${Math.floor((base() + r * 12) / 12) - 1}</span>`; row.appendChild(k); });
      BLACK5.forEach(([o, w]) => { const k = document.createElement('div'); k.className = 'black' + (isRoot(r * 12 + o) ? ' root' : ''); k.dataset.off = r * 12 + o;
        k.style.left = ((w + 1) * (100 / 7) - 100 / 7 * 0.3) + '%'; row.appendChild(k); });
      keysEl.appendChild(row);
    }
  } else if (kbMode === 'grid') {
    const cols = Math.max(4, Math.floor(W / cell)), rows = Math.max(3, Math.floor(H / cell));
    keysEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`; keysEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    for (let r = rows - 1; r >= 0; r--) for (let c = 0; c < cols; c++) {
      const g = gridNote(c, r, false), k = document.createElement('div');
      k.className = 'cell' + (g.isRoot ? ' root' : '') + (g.inKey ? '' : ' out'); k.dataset.off = g.off; k.innerHTML = `<span>${label(g.off)}</span>`;
      keysEl.appendChild(k);
    }
  } else {   // hexagons, pointed at the top, each row shifted half a cell from the one below
    const w = cell * 1.05, h = w * 1.1547, dy = h * 0.75, cols = Math.max(4, Math.floor((W - w / 2) / w)), rows = Math.max(3, Math.floor((H - h) / dy) + 1);
    const ox = (W - (cols * w + w / 2)) / 2, oy = (H - ((rows - 1) * dy + h)) / 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const q = c - Math.floor(r / 2), g = gridNote(q, r, true), k = document.createElement('div');   // axial: right +1, up-right +1 row
      k.className = 'hexcell' + (g.isRoot ? ' root' : '') + (g.inKey ? '' : ' out'); k.dataset.off = g.off;
      k.style.cssText = `left:${(ox + c * w + (r % 2) * w / 2).toFixed(1)}px;top:${(oy + (rows - 1 - r) * dy).toFixed(1)}px;width:${(w - 3).toFixed(1)}px;height:${(h - 3).toFixed(1)}px`;
      k.innerHTML = `<span>${label(g.off)}</span>`;
      keysEl.appendChild(k);
    }
  }
  document.querySelectorAll('[data-kb]').forEach(b => b.setAttribute('aria-pressed', b.dataset.kb === kbMode));
  labelOct(); markKeys();
}
function labelOct() { $('octLabel').textContent = 'C' + (Math.floor(base() / 12) - 1); }
document.querySelectorAll('[data-kb]').forEach(b => b.addEventListener('click', () => { kbMode = b.dataset.kb; try { localStorage.setItem('diptych-kb', kbMode); } catch (e) {} buildKeys(); }));
new ResizeObserver(() => { if (kbMode !== 'piano' && keysEl.offsetParent) buildKeys(); }).observe(keysEl);
const sounding = new Map();
function markKeys() { keysEl.querySelectorAll('[data-off]').forEach(el => el.classList.toggle('on', sounding.has(base() + +el.dataset.off))); }
function on(n) { sounding.set(n, (sounding.get(n) || 0) + 1); post({ type:'on', note:n, vel:0.9 }); markKeys(); }
function off(n) {
  const c = (sounding.get(n) || 0) - 1;
  if (c <= 0) { sounding.delete(n); post({ type:'off', note:n }); } else sounding.set(n, c);
  markKeys();
}
let latch = false; const latched = new Set();
function press(n) {
  if (latch) { if (latched.has(n)) { latched.delete(n); off(n); } else { latched.add(n); on(n); } }
  else on(n);
}
function release(n) { if (!latch) off(n); }
$('latch').addEventListener('click', e => {
  latch = !latch; e.currentTarget.setAttribute('aria-pressed', latch);
  if (!latch) { latched.forEach(n => off(n)); latched.clear(); }
});
const pointers = new Map();
const noteAt = (x, y) => { const h = document.elementFromPoint(x, y), el = h && h.closest('[data-off]'); return el && keysEl.contains(el) ? base() + +el.dataset.off : null; };
keysEl.addEventListener('pointerdown', e => {
  e.preventDefault(); keysEl.setPointerCapture(e.pointerId);
  const n = noteAt(e.clientX, e.clientY); pointers.set(e.pointerId, n);
  if (n !== null) press(n);
});
keysEl.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId) || latch) return;
  const prev = pointers.get(e.pointerId), n = noteAt(e.clientX, e.clientY);
  if (n === prev) return;
  if (prev !== null) release(prev);
  if (n !== null) press(n);
  pointers.set(e.pointerId, n);
});
const pEnd = e => { if (!pointers.has(e.pointerId)) return; const n = pointers.get(e.pointerId); pointers.delete(e.pointerId); if (n !== null) release(n); };
keysEl.addEventListener('pointerup', pEnd); keysEl.addEventListener('pointercancel', pEnd);
function shiftOct(dir) { octShift = Math.max(-2, Math.min(2, octShift + dir)); buildKeys(); }
$('octDown').addEventListener('click', () => shiftOct(-1));
$('octUp').addEventListener('click', () => shiftOct(1));
const KEYMAP = { a:0, w:1, s:2, e:3, d:4, f:5, t:6, g:7, y:8, h:9, u:10, j:11, k:12 };
const heldKeys = new Map();
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  // space plays and stops the sequencer; the letter keys always play notes (2026-11-10: the keyboard is a drawer now)
  if (e.key === ' ' && !e.target.closest('button,select,input,[role="slider"]')) { e.preventDefault(); setPlaying(!seqPlaying); return; }
  if (e.target.closest('input,select,textarea')) return;
  const key = e.key.toLowerCase();
  if (key === 'z') { shiftOct(-1); return; }
  if (key === 'x') { shiftOct(1); return; }
  if (!(key in KEYMAP) || heldKeys.has(key)) return;
  const n = base() + KEYMAP[key]; heldKeys.set(key, n); press(n);
});
window.addEventListener('keyup', e => {
  const key = e.key.toLowerCase();
  if (!heldKeys.has(key)) return;
  release(heldKeys.get(key)); heldKeys.delete(key);
});
window.addEventListener('blur', () => { heldKeys.forEach(n => release(n)); heldKeys.clear(); });

