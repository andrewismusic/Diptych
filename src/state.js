/* ---------- state + persistence ----------
   The fixed architecture (2026-10-17) starts fresh: it saves under a new key and ignores earlier patches, by decision.
   Parameters are matched by id, so patches survive new knobs; list changes need a migration keyed on `ver`. */
const STORE = 'diptych-v5', STORE_VER = 2;
const DEFAULT_LOCKS = () => ({ level: true, pan: true, pattern: true, 'o1.wave': true, 'o2.wave': true, 'o4.sample': true, ottout: true });
const DEFAULT_LINKS = () => ({ 'o1.pitch': true, 'o1.fine': true, 'o2.pitch': true, 'o2.fine': true, 'o4.spitch': true, 'o4.sfine': true, ottout: true });
const DEFAULT_SMP = () => ({ A: { name: 'Plucked string' }, B: { name: 'Vocal ah' } });   // the Sampler's sample references
const DEFAULT_TABLES = () => WT_SLOTS.map(s => (s === 0 ? { A: makeTable('Basic shapes'), B: makeTable('Vowel formants') } : { A: makeTable('Harmonic stack'), B: makeTable('Pulse width') }));
const DEFAULT_FXON = () => FX_KIND.map(() => true);
const state = {
  A: DEFS.map((_, i) => defaultNorm('A', i)),
  B: DEFS.map((_, i) => defaultNorm('B', i)),
  C: DEFS.map(() => 0),
  morph: 0,
  spectral: true,
  locks: DEFAULT_LOCKS(),
  secLocks: {},
  linkMem: {},
  mono: false,
  links: DEFAULT_LINKS(),
  oscOn: [true, true, true, true],   // bypass switches for auditioning: never morphed or randomized
  fxOn: DEFAULT_FXON(),
  smp: DEFAULT_SMP(),
  seq: null,
  bpm: 120,
  walk: true,
};
const tables = DEFAULT_TABLES();   // tables[slot].A / .B for each Wavetable slot (slots 0 and 1)

function enc(f) {
  const i16 = new Int16Array(f.length);
  for (let n = 0; n < f.length; n++) i16[n] = Math.max(-32767, Math.min(32767, Math.round(f[n] * 32767)));
  const u8 = new Uint8Array(i16.buffer); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function dec(b) {
  const s = atob(b), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  const i16 = new Int16Array(u8.buffer);
  return Float32Array.from(i16, x => x / 32767);
}
const decTable = t => (t && Array.isArray(t.frames) && t.frames.length ? { name: String(t.name || 'Custom'), frames: t.frames.slice(0, MAXF).map(dec) } : null);
const okRef = r => r && typeof r.name === 'string' && (r.id ? typeof r.id === 'string' : !!FACTORY[r.name]);
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && Array.isArray(saved.ids) && Array.isArray(saved.A) && saved.ids.length === saved.A.length && saved.B.length === saved.A.length) {
    saved.ids.forEach((id, k) => {
      const i = IX[id]; if (i === undefined) return;
      state.A[i] = clamp(+saved.A[k]); state.B[i] = clamp(+saved.B[k]);
      if (saved.C) state.C[i] = clampC(+saved.C[k] || 0);
    });
    state.morph = clamp(+saved.morph || 0);
    for (const k of ['locks', 'links', 'secLocks', 'linkMem']) if (saved[k] && typeof saved[k] === 'object') state[k] = saved[k];
    state.mono = !!saved.mono;
    if (Array.isArray(saved.fxOn) && saved.fxOn.length === NFX) state.fxOn = saved.fxOn.map(Boolean);
    if (Array.isArray(saved.oscOn) && saved.oscOn.length === NOSC) state.oscOn = saved.oscOn.map(Boolean);
    // ver 2: Loop and Cut / Spill became per-side switches (they were one setting for both sides)
    if (!(saved.ver >= 2)) for (const [k, id] of [['smpLoop', 'o4.sloop'], ['dlSpill', 'dlspill']]) state.A[IX[id]] = state.B[IX[id]] = saved[k] ? 1 : 0;
    if (saved.smp) ['A', 'B'].forEach(k => { const r = saved.smp[k]; if (okRef(r)) state.smp[k] = { name: r.name, ...(r.id ? { id: r.id } : {}) }; });
    if (saved.seq && saved.seq.A && saved.seq.B && Array.isArray(saved.seq.A.steps)) state.seq = saved.seq;
    if (saved.bpm) state.bpm = Math.max(40, Math.min(240, +saved.bpm || 120));
    state.walk = saved.walk !== false;
    if (Array.isArray(saved.tables)) saved.tables.slice(0, WT_SLOTS.length).forEach((t, s) => {
      ['A', 'B'].forEach(side => { const d = t && decTable(t[side]); if (d) tables[s][side] = d; });
    });
  }
} catch (e) {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ ...state, ver: STORE_VER, ids: DEFS.map(d => d.id),
        tables: tables.map(t => ({ A: { name: t.A.name, frames: t.A.frames.map(enc) }, B: { name: t.B.name, frames: t.B.frames.map(enc) } })) }));
    } catch (e) {}
  }, 400);
}
