/* ---------- lock / link icons ---------- */
function updateIcons() {
  document.querySelectorAll('[data-seclock]').forEach(b => {
    const g = b.dataset.seclock, on = !!state.secLocks[g];
    b.setAttribute('aria-pressed', on); b.innerHTML = lockIcon(on);
    b.setAttribute('aria-label', `${on ? 'Unlock' : 'Lock'} the whole ${g} section for randomizing`);
    b.closest('.group').classList.toggle('seclocked', on);
  });
  document.querySelectorAll('[data-plock]').forEach(b => {
    const id = b.dataset.plock, on = !!state.locks[id];
    b.setAttribute('aria-pressed', on); b.innerHTML = lockIcon(on);
    b.setAttribute('aria-label', `${on ? 'Unlock' : 'Lock'} ${DEFS[IX[id]].label} for randomizing`);
  });
  document.querySelectorAll('[data-plink]').forEach(b => {
    const id = b.dataset.plink, on = !!state.links[id];
    b.setAttribute('aria-pressed', on); b.innerHTML = linkIcon(on);
    b.setAttribute('aria-label', `${on ? 'Unlink' : 'Link'} ${DEFS[IX[id]].label} A and B`);
  });
}
function toggleLink(i) {
  const d = DEFS[i], id = d.id;
  pushUndo();
  if (!state.links[id]) {
    state.linkMem[id] = [state.A[i], state.B[i]];   // remembered, so unlinking brings the two sides back
    const v = resolveNorm(i);   // snap both sides to what you hear now, so nothing jumps
    state.links[id] = true; state.A[i] = v; state.B[i] = v;
  } else {
    delete state.links[id];
    const m = state.linkMem[id];
    if (m) { state.A[i] = m[0]; state.B[i] = m[1]; delete state.linkMem[id]; }
  }
  if (ready) { send({ type:'param', side:'A', i, v: state.A[i] }); send({ type:'param', side:'B', i, v: state.B[i] }); }
  updateKnob(i); updateIcons(); drawWaves(); save();
}
document.addEventListener('click', e => {
  const sl = e.target.closest('[data-seclock]');
  if (sl) { const g = sl.dataset.seclock; state.secLocks[g] = !state.secLocks[g]; updateIcons(); save(); return; }
  const dc = e.target.closest('[data-dice]');
  if (dc) { const g = dc.dataset.dice, s = dc.dataset.side; bulk(() => (s ? randomizeSide(s, g, true) : randomizeAll(g, true))); return; }
  const pl = e.target.closest('[data-plock]');
  if (pl) { const id = pl.dataset.plock; state.locks[id] = !state.locks[id]; updateIcons(); save(); return; }
  const pk = e.target.closest('[data-plink]');
  if (pk) toggleLink(IX[pk.dataset.plink]);
});

