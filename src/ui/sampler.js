/* =====================================================================
   SAMPLER CONTROLS
   In each slot's Sampler panel: a sample menu per side (built-in samples,
   the loaded file if any, and "Load file…") and One-shot / Loop.
   ===================================================================== */
const smpFile = document.createElement('input');
smpFile.type = 'file'; smpFile.accept = 'audio/*'; smpFile.hidden = true;
document.body.appendChild(smpFile);
let smpPending = null;   // { s, k } waiting for a file
for (let s = 0; s < 4; s++) {
  sections[`Osc ${s + 1}`].querySelector('.eng[data-eng="smp"]').insertAdjacentHTML('afterbegin', `<div class="smprow">
    <label class="smpsel a"><span>A</span><select data-smpsel="${s}" data-side="A" aria-label="Osc ${s + 1} sample A"></select></label>
    <label class="smpsel b"><span>B</span><select data-smpsel="${s}" data-side="B" aria-label="Osc ${s + 1} sample B"></select></label>
    <span class="seg" role="group" aria-label="Osc ${s + 1} playback"><button type="button" data-smploop="${s}" data-v="0">One-shot</button><button type="button" data-smploop="${s}" data-v="1">Loop</button></span>
    <span class="smpnote" id="smpNote${s}" role="status"></span></div>`);
}
function updateSamplerUI() {
  document.querySelectorAll('[data-smpsel]').forEach(sel => {
    const ref = state.smp[+sel.dataset.smpsel][sel.dataset.side];
    sel.innerHTML = FACTORY_NAMES.map(n => `<option value="f:${n}">${n}</option>`).join('')
      + (ref && ref.id ? `<option value="u:${ref.id}">${ref.name.replace(/[<&]/g, '')}</option>` : '') + '<option value="load">Load file…</option>';
    sel.value = ref ? (ref.id ? 'u:' + ref.id : 'f:' + ref.name) : 'load';
  });
  document.querySelectorAll('[data-smploop]').forEach(b => b.setAttribute('aria-pressed', state.smpLoop[+b.dataset.smploop] === (b.dataset.v === '1')));
}
function setSample(s, k, ref) {
  pushUndo();
  state.smp[s][k] = ref; resolveSamples();
  if (ready) postSample(s, k);
  updateSamplerUI(); drawWaves(); save();
}
document.addEventListener('change', e => {
  const sel = e.target.closest('[data-smpsel]'); if (!sel) return;
  const s = +sel.dataset.smpsel, k = sel.dataset.side;
  if (sel.value === 'load') { smpPending = { s, k }; updateSamplerUI(); smpFile.click(); return; }
  if (sel.value.startsWith('f:')) setSample(s, k, { name: sel.value.slice(2) });
});
smpFile.addEventListener('change', async () => {
  const file = smpFile.files[0], p = smpPending; smpFile.value = ''; smpPending = null;
  if (!file || !p) return;
  const note = $('smpNote' + p.s);
  try {
    note.textContent = 'Loading…';
    const d = await decodeSampleFile(file), id = 'u' + Date.now().toString(36), name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Sample';
    await idb.put(id, { name, sr: SMP_SR, d }).catch(() => { note.textContent = 'Could not store the file; it will be gone after a reload.'; });
    smpData[p.s][p.k] = { d, sr: SMP_SR, name, id };   // in hand already, no need to wait for IndexedDB
    setSample(p.s, p.k, { name, id });
    if (note.textContent === 'Loading…') note.textContent = '';
  } catch (err) { note.textContent = 'That file could not be read as audio.'; }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-smploop]'); if (!b) return;
  const s = +b.dataset.smploop; state.smpLoop[s] = b.dataset.v === '1';
  updateSamplerUI(); if (ready) send({ type:'smpLoop', i:s, v: state.smpLoop[s] }); save();
});
updateSamplerUI();
