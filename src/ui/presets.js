/* =====================================================================
   PRESETS (2026-11-11; DESIGN.md section 15, items 1 and 2)
   Global presets, as in most plugins: a menu at the top showing the current
   preset's name. A global preset holds everything: both sides, curves, locks
   and links, the wavetables, the samples' references, both sequences, tempo
   and Walk / Swap. The menu also has a die (a random preset, never the one
   just loaded when there is a choice), Save, Save as and Delete.
   Side presets: a menu above each of A and B. One pool for both sides, so any
   sound can morph into any other: a side preset holds one side's sound (every
   morphing value of that side, its table position, its wavetable and sample),
   never sequences, curves, locks or links. Loading one into B changes only B.
   Both pools live in this browser (localStorage); loading is one undo step.
   ===================================================================== */
const PRE_KEY = 'diptych-presets', SIDE_KEY = 'diptych-sides';
const readList = k => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const writeList = (k, list) => { try { localStorage.setItem(k, JSON.stringify(list)); return true; } catch (e) { return false; } };
const esc = t => String(t).replace(/[<&]/g, '');
if (typeof state.presetName !== 'string') state.presetName = '';
if (!state.sideNames || typeof state.sideNames !== 'object') state.sideNames = { A: '', B: '' };
let lastPreset = -1;
/* ---------- a name, asked in the app's own sheet ---------- */
function askName(title, def, ok) {
  $('nameTitle').textContent = title; $('nameIn').value = def || ''; $('nameOk').textContent = 'Save';
  $('nameSheet').hidden = false; setTimeout(() => { $('nameIn').focus(); $('nameIn').select(); }, 30);
  const done = v => { $('nameSheet').hidden = true; $('nameOk').onclick = $('nameCancel').onclick = $('nameIn').onkeydown = null; if (v !== null) ok(v); };
  $('nameOk').onclick = () => done(($('nameIn').value || '').trim() || def || 'Untitled');
  $('nameCancel').onclick = () => done(null);
  $('nameIn').onkeydown = e => { if (e.key === 'Enter') $('nameOk').click(); else if (e.key === 'Escape') done(null); };
}
/* ---------- global ---------- */
function patchNow() {
  return { ver: STORE_VER, ids: DEFS.map(d => d.id), A: state.A.slice(), B: state.B.slice(), C: state.C.slice(), morph: savedMorph(),
    locks: { ...state.locks }, secLocks: { ...state.secLocks }, links: { ...state.links }, linkMem: JSON.parse(JSON.stringify(state.linkMem)),
    oscOn: state.oscOn.slice(), fxOn: state.fxOn.slice(), smp: JSON.parse(JSON.stringify(state.smp)), seq: JSON.parse(JSON.stringify(state.seq)),
    bpm: state.bpm, walk: state.walk, sideNames: { ...state.sideNames },
    tables: tables.map(t => ({ A: { name: t.A.name, frames: t.A.frames.map(enc) }, B: { name: t.B.name, frames: t.B.frames.map(enc) } })) };
}
function loadPreset(k) {
  const p = readList(PRE_KEY)[k]; if (!p) return;
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
    state.presetName = p.name; state.sideNames = p.sideNames ? { ...p.sideNames } : { A: '', B: '' };
  });
  if (p.bpm) setBpm(p.bpm);
  updateWalkUI(); if (ready) send({ type:'walk', v: state.walk });
  lastPreset = k; presetLabels();
}
function saveGlobal(name) {
  const list = readList(PRE_KEY), p = { name, ...patchNow() }, k = list.findIndex(x => x.name === name);
  if (k >= 0) list[k] = p; else list.push(p);
  if (writeList(PRE_KEY, list)) { state.presetName = name; lastPreset = k >= 0 ? k : list.length - 1; save(); presetLabels(); }
}
function randomPreset() {
  const n = readList(PRE_KEY).length; if (!n) return;
  let k = Math.floor(Math.random() * n); if (n > 1 && k === lastPreset) k = (k + 1 + Math.floor(Math.random() * (n - 1))) % n;
  loadPreset(k);
}
$('gPre').addEventListener('click', () => {
  const b = $('gPre'); if (menuOpen && menuOpen.anchor === b) { closeMenu(); return; }
  const list = readList(PRE_KEY), cur = state.presetName;
  const items = [{ label: '⚄  Random preset', act: 'rand', cls: 'act' + (list.length ? '' : ' off') }, { sep: true }];
  if (list.length) items.push(...list.map((p, k) => ({ label: p.name, k, on: p.name === cur }))); else items.push({ head: 'No presets yet' });
  items.push({ sep: true });
  if (cur) items.push({ label: `Save "${cur}"`, act: 'save', cls: 'act' });
  items.push({ label: 'Save as…', act: 'saveas', cls: 'act' });
  if (cur && list.some(p => p.name === cur)) items.push({ label: `Delete "${cur}"`, act: 'del', cls: 'act' });
  openMenu(b, items, it => {
    if (it.act === 'rand') randomPreset();
    else if (it.act === 'save') saveGlobal(cur);
    else if (it.act === 'saveas') askName('Save preset', cur || `Sound ${list.length + 1}`, saveGlobal);
    else if (it.act === 'del') { writeList(PRE_KEY, list.filter(p => p.name !== cur)); state.presetName = ''; lastPreset = -1; save(); presetLabels(); }
    else if (it.k !== undefined) loadPreset(it.k);
  }, { label: 'Presets' });
});
/* ---------- side presets (one pool for A and B) ---------- */
const sideKeys = () => DEFS.map((d, i) => i).filter(i => { const d = DEFS[i]; return !d.single && !d.seq && !d.pair && d.group !== 'Sequencer' && !isLinked(i); });
function sideNow(k) {
  const vals = {}; sideKeys().forEach(i => { vals[DEFS[i].id] = state[k][i]; });
  return { vals, pos: state[k][IX.wpos], table: { name: tables[0][k].name, frames: tables[0][k].frames.map(enc) }, smp: state.smp[k] ? { ...state.smp[k] } : null };
}
function loadSide(k, j) {
  const p = readList(SIDE_KEY)[j]; if (!p) return;
  bulk(() => {
    for (const [id, v] of Object.entries(p.vals || {})) { const i = IX[id]; if (i === undefined || DEFS[i].single || isLinked(i)) continue; state[k][i] = clamp(+v); }
    if (typeof p.pos === 'number') { const x = clamp(p.pos), q = oi(0, k === 'A' ? 'posA' : 'posB'); state.A[q] = state.B[q] = x; }
    const t = decTable(p.table); if (t) tables[0][k] = t;
    if (p.smp && okRef(p.smp)) state.smp[k] = { ...p.smp };
    state.sideNames[k] = p.name;
  });
  presetLabels();
}
function saveSide(k, name) {
  const list = readList(SIDE_KEY), p = { name, ...sideNow(k) }, j = list.findIndex(x => x.name === name);
  if (j >= 0) list[j] = p; else list.push(p);
  if (writeList(SIDE_KEY, list)) { state.sideNames[k] = name; save(); presetLabels(); }
}
document.querySelectorAll('[data-spre]').forEach(b => b.addEventListener('click', () => {
  if (menuOpen && menuOpen.anchor === b) { closeMenu(); return; }
  const k = b.dataset.spre, list = readList(SIDE_KEY), cur = state.sideNames[k];
  const items = list.length ? list.map((p, j) => ({ label: p.name, j, on: p.name === cur })) : [{ head: 'No side presets yet' }];
  items.push({ sep: true }, { label: `Save side ${k} as…`, act: 'saveas', cls: 'act' });
  if (cur && list.some(p => p.name === cur)) items.push({ label: `Delete "${cur}"`, act: 'del', cls: 'act' });
  openMenu(b, items, it => {
    if (it.act === 'saveas') askName(`Save side ${k}`, cur || `Side ${list.length + 1}`, n => saveSide(k, n));
    else if (it.act === 'del') { writeList(SIDE_KEY, list.filter(p => p.name !== cur)); ['A', 'B'].forEach(s => { if (state.sideNames[s] === cur) state.sideNames[s] = ''; }); save(); presetLabels(); }
    else if (it.j !== undefined) loadSide(k, it.j);
  }, { label: `Side ${k} presets` });
}));
function presetLabels() {
  $('gPre').innerHTML = `<span class="ddv">${esc(state.presetName || 'Untitled')}</span>${CHEV}`;
  document.querySelectorAll('[data-spre]').forEach(b => { const k = b.dataset.spre; b.innerHTML = `<b>${k}</b><span class="ddv">${esc(state.sideNames[k] || 'Untitled')}</span>${CHEV}`; });
}
presetLabels();
