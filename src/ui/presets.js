/* =====================================================================
   PRESETS (2026-11-11; DESIGN.md section 15, "global presets")
   A preset holds everything: both sides, curves, locks and links, the
   wavetables, the samples' references, both sequences, the tempo and Walk /
   Swap. Saved in this browser (localStorage, 'diptych-presets'). Loading one
   is one undo step. The die loads a random preset (never the one just loaded,
   when there is a choice).
   ===================================================================== */
const PRE_KEY = 'diptych-presets';
const BOOK = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4.5" y="6.5" width="13" height="14" rx="2"/><path d="M7.5 3.5h10a2 2 0 0 1 2 2v12"/><path d="M8 11h6M8 14.5h6"/></svg>';
const DIE5 = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.3" cy="8.3" r="1.6" fill="currentColor"/><circle cx="15.7" cy="8.3" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="8.3" cy="15.7" r="1.6" fill="currentColor"/><circle cx="15.7" cy="15.7" r="1.6" fill="currentColor"/></svg>';
$('presetBtn').innerHTML = BOOK; $('preRandom').innerHTML = DIE5;
const readPresets = () => { try { const v = JSON.parse(localStorage.getItem(PRE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const writePresets = list => { try { localStorage.setItem(PRE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; } };
function patchNow() {
  return { ver: STORE_VER, ids: DEFS.map(d => d.id), A: state.A.slice(), B: state.B.slice(), C: state.C.slice(), morph: savedMorph(),
    locks: { ...state.locks }, secLocks: { ...state.secLocks }, links: { ...state.links }, linkMem: JSON.parse(JSON.stringify(state.linkMem)),
    oscOn: state.oscOn.slice(), fxOn: state.fxOn.slice(), smp: JSON.parse(JSON.stringify(state.smp)), seq: JSON.parse(JSON.stringify(state.seq)),
    bpm: state.bpm, walk: state.walk,
    tables: tables.map(t => ({ A: { name: t.A.name, frames: t.A.frames.map(enc) }, B: { name: t.B.name, frames: t.B.frames.map(enc) } })) };
}
let lastPreset = -1;
function loadPreset(k) {
  const list = readPresets(), p = list[k]; if (!p) return;
  bulk(() => {
    p.ids.forEach((id, j) => { const i = IX[id]; if (i === undefined) return; state.A[i] = clamp(+p.A[j]); state.B[i] = clamp(+p.B[j]); state.C[i] = clampC(+p.C[j] || 0); });
    for (const key of ['locks', 'secLocks', 'links', 'linkMem']) if (p[key]) state[key] = JSON.parse(JSON.stringify(p[key]));
    if (Array.isArray(p.oscOn)) state.oscOn = OSC_KIND.map((_, s) => p.oscOn[s] !== false);
    if (Array.isArray(p.fxOn)) state.fxOn = p.fxOn.map(Boolean);
    if (p.smp) state.smp = JSON.parse(JSON.stringify(p.smp));
    if (p.seq) { state.seq = JSON.parse(JSON.stringify(p.seq)); fixSeq(state.seq.A); fixSeq(state.seq.B); }
    if (typeof p.walk === 'boolean') state.walk = p.walk;
    (p.tables || []).slice(0, WT_SLOTS.length).forEach((t, s) => ['A', 'B'].forEach(side => { const d = t && decTable(t[side]); if (d) tables[s][side] = d; }));
    if (focus === 'M') state.morph = clamp(+p.morph || 0); else focusMem = clamp(+p.morph || 0);
  });
  if (p.bpm) setBpm(p.bpm);
  updateWalkUI(); if (ready) send({ type:'walk', v: state.walk });
  lastPreset = k; $('preNote').textContent = `Loaded ${p.name}.`; renderPresets();
}
function renderPresets() {
  const list = readPresets();
  $('preList').innerHTML = list.length ? list.map((p, k) => `<div class="preitem${k === lastPreset ? ' cur' : ''}" role="listitem"><button type="button" class="key preload" data-pre="${k}">${p.name.replace(/[<&]/g, '')}</button><button type="button" class="key icon predel" data-predel="${k}" aria-label="Delete ${p.name.replace(/["<&]/g, '')}">&times;</button></div>`).join('')
    : '<p class="ednote">No presets yet. Name the sound you hear and save it; the die loads one at random.</p>';
  $('preRandom').disabled = list.length < 1;
}
$('preSave').addEventListener('click', () => {
  const name = ($('preName').value || '').trim() || `Sound ${readPresets().length + 1}`, list = readPresets();
  const k = list.findIndex(p => p.name === name), p = { name, ...patchNow() };
  if (k >= 0) list[k] = p; else list.push(p);
  $('preNote').textContent = writePresets(list) ? `Saved ${name}.` : 'Could not save: this browser is out of room for presets.';
  lastPreset = k >= 0 ? k : list.length - 1; $('preName').value = ''; renderPresets();
});
$('preList').addEventListener('click', e => {
  const l = e.target.closest('[data-pre]'); if (l) { loadPreset(+l.dataset.pre); return; }
  const d = e.target.closest('[data-predel]'); if (!d) return;
  const list = readPresets(), k = +d.dataset.predel, gone = list.splice(k, 1)[0];
  writePresets(list); if (lastPreset === k) lastPreset = -1; else if (lastPreset > k) lastPreset--;
  $('preNote').textContent = gone ? `Deleted ${gone.name}.` : ''; renderPresets();
});
$('preRandom').addEventListener('click', () => {
  const n = readPresets().length; if (!n) return;
  let k = Math.floor(Math.random() * n); if (n > 1 && k === lastPreset) k = (k + 1 + Math.floor(Math.random() * (n - 1))) % n;
  loadPreset(k);
});
$('presetBtn').addEventListener('click', () => { renderPresets(); $('presets').hidden = false; $('preDone').focus({ preventScroll: true }); });
const closePresets = () => { $('presets').hidden = true; $('presetBtn').focus({ preventScroll: true }); };
$('preDone').addEventListener('click', closePresets);
$('presets').addEventListener('click', e => { if (e.target === $('presets')) closePresets(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('presets').hidden) closePresets(); });
