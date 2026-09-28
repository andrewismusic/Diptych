/* =====================================================================
   KEYBOARD
   ===================================================================== */
const keysEl = $('keys');
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12];
const BLACK = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
let octShift = 0;
const base = () => 48 + 12 * octShift;
const keyEls = {};
WHITE.forEach(o => {
  const k = document.createElement('div'); k.className = 'white'; k.dataset.off = o;
  if (o % 12 === 0) k.innerHTML = '<span></span>';
  keysEl.appendChild(k); keyEls[o] = k;
});
BLACK.forEach(([o, w]) => {
  const k = document.createElement('div'); k.className = 'black'; k.dataset.off = o;
  k.style.left = ((w + 1) * 12.5 - 3.75) + '%';
  keysEl.appendChild(k); keyEls[o] = k;
});
function labelOct() {
  const name = n => 'C' + (Math.floor(n / 12) - 1);
  $('octLabel').textContent = name(base());
  keyEls[0].querySelector('span').textContent = name(base());
  keyEls[12].querySelector('span').textContent = name(base() + 12);
}
const sounding = new Map();
function markKeys() { Object.entries(keyEls).forEach(([o, el]) => el.classList.toggle('on', sounding.has(base() + +o))); }
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
const noteAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.dataset && el.dataset.off !== undefined ? base() + +el.dataset.off : null; };
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
function shiftOct(dir) { octShift = Math.max(-2, Math.min(3, octShift + dir)); labelOct(); markKeys(); }
$('octDown').addEventListener('click', () => shiftOct(-1));
$('octUp').addEventListener('click', () => shiftOct(1));
const KEYMAP = { a:0, w:1, s:2, e:3, d:4, f:5, t:6, g:7, y:8, h:9, u:10, j:11, k:12 };
const heldKeys = new Map();
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (panel === 'seq') {
    if (e.key === ' ' && !e.target.closest('button,select,input')) { e.preventDefault(); setPlaying(!seqPlaying); }
    return;
  }
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

