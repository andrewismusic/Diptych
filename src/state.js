/* ---------- state + persistence ----------
   The slot build starts fresh: it saves under a new key and ignores patches from the fixed-chain version.
   Parameters are matched by id, so patches survive new knobs; list changes need a migration keyed on `ver`. */
const STORE = 'diptych-v4', STORE_VER = 4;
const DEFAULT_LOCKS = () => {
  const l = { level: true, pan: true, pattern: true };
  for (let s = 1; s <= 4; s++) { l[`o${s}.olevel`] = true; l[`o${s}.wave`] = true; l[`o${s}.sample`] = true; l[`x${s}.ottdepth`] = true; l[`x${s}.ottout`] = true; }
  return l;
};
const DEFAULT_LINKS = () => {
  const l = {};
  for (let s = 1; s <= 4; s++) { for (const k of ['olevel', 'pitch', 'fine', 'spitch', 'sfine']) l[`o${s}.${k}`] = true; l[`x${s}.ottdepth`] = true; l[`x${s}.ottout`] = true; }
  return l;
};
const DEFAULT_OSC = () => ['wt', 'off', 'off', 'off'];
const DEFAULT_FX = () => ['drive', 'delay', 'reverb', 'ott'];
const DEFAULT_SMP = () => [0, 1, 2, 3].map(() => ({ A: { name: 'Plucked string' }, B: { name: 'Vocal ah' } }));   // sample references per slot
const DEFAULT_TABLES = () => [0, 1, 2, 3].map(() => ({ A: makeTable('Basic shapes'), B: makeTable('Vowel formants') }));
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
  oscType: DEFAULT_OSC(),
  fxType: DEFAULT_FX(),
  fxOn: [true, true, true, true],
  dlSpill: [false, false, false, false],
  smp: DEFAULT_SMP(),
  smpLoop: [false, false, false, false],
  seq: null,
  bpm: 120,
  walk: true,
};
const tables = DEFAULT_TABLES();   // tables[slot].A / .B, one pair per oscillator slot

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
// a saved type that no longer exists (FM, moved to its own page in ver 3) becomes the given stand-in
const pickList = (saved, list, n, fallback, standIn) => (Array.isArray(saved) && saved.length === n ? saved.map(x => (list.some(t => t[0] === x) ? x : standIn)) : fallback);
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && Array.isArray(saved.ids) && Array.isArray(saved.A) && saved.ids.length === saved.A.length && saved.B.length === saved.A.length) {
    // ver 2: back to one filter. Filter 1's ids ('f1.cutoff') become plain ('cutoff'); Filter 2 and the slots' filter blend are dropped.
    const v1id = id => (!(saved.ver >= 2) && id.startsWith('f1.') ? id.slice(3) : id);
    if (!(saved.ver >= 2)) for (const k of ['locks', 'links', 'linkMem']) if (saved[k]) saved[k] = Object.fromEntries(Object.entries(saved[k]).map(([id, v]) => [v1id(id), v]));
    saved.ids = saved.ids.map(v1id);
    saved.ids.forEach((id, k) => {
      const i = IX[id]; if (i === undefined) return;
      state.A[i] = clamp(+saved.A[k]); state.B[i] = clamp(+saved.B[k]);
      if (saved.C) state.C[i] = clampC(+saved.C[k] || 0);
    });
    state.morph = clamp(+saved.morph || 0);
    for (const k of ['locks', 'links', 'secLocks', 'linkMem']) if (saved[k] && typeof saved[k] === 'object') state[k] = saved[k];
    state.mono = !!saved.mono;
    state.oscType = pickList(saved.oscType, OSC_TYPES, 4, state.oscType, 'off');
    state.fxType = pickList(saved.fxType, FX_TYPES, 4, state.fxType, 'drive');
    if (Array.isArray(saved.fxOn) && saved.fxOn.length === 4) state.fxOn = saved.fxOn.map(Boolean);
    if (Array.isArray(saved.dlSpill) && saved.dlSpill.length === 4) state.dlSpill = saved.dlSpill.map(Boolean);
    const okRef = r => r && typeof r.name === 'string' && (r.id ? typeof r.id === 'string' : !!FACTORY[r.name]);
    if (Array.isArray(saved.smp) && saved.smp.length === 4) saved.smp.forEach((p, s) => ['A', 'B'].forEach(k => { if (p && okRef(p[k])) state.smp[s][k] = { name: p[k].name, ...(p[k].id ? { id: p[k].id } : {}) }; }));
    if (Array.isArray(saved.smpLoop) && saved.smpLoop.length === 4) state.smpLoop = saved.smpLoop.map(Boolean);
    if (!(saved.ver >= 4)) for (let s = 1; s <= 4; s++) { state.locks[`o${s}.sample`] = true; state.links[`o${s}.spitch`] = true; state.links[`o${s}.sfine`] = true; }   // the Sampler arrived in ver 4
    if (saved.seq && saved.seq.A && saved.seq.B && Array.isArray(saved.seq.A.steps)) state.seq = saved.seq;
    if (saved.bpm) state.bpm = Math.max(40, Math.min(240, +saved.bpm || 120));
    state.walk = saved.walk !== false;
    if (Array.isArray(saved.tables)) saved.tables.slice(0, 4).forEach((t, s) => {
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
