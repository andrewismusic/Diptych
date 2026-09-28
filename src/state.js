/* ---------- state + persistence ---------- */
const STORE = 'diptych-v3';  // patches from before the effects existed load with the new knobs at defaults
const state = {
  A: DEFS.map((_, i) => defaultNorm('A', i)),
  B: DEFS.map((_, i) => defaultNorm('B', i)),
  C: DEFS.map(() => 0),
  morph: 0,
  spectral: true,
  locks: { level: true, pan: true, pattern: true, ottdepth: true, ottout: true },
  secLocks: {},
  linkMem: {},
  mono: false,
  links: { octave: true, fine: true, ottdepth: true, ottout: true },
  fxOn: [true, true, true, true, true, true, true],
  seq: null,
  bpm: 120,
  walk: true,
  dlSpill: false,
};
const tables = { A: makeTable('Basic shapes'), B: makeTable('Vowel formants') };

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
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  const old = saved ? null : JSON.parse(localStorage.getItem('diptych-step2') || 'null');
  if (old && old.tables) ['A', 'B'].forEach(s => {   // keep wavetables from the previous version
    const t = old.tables[s];
    if (t && Array.isArray(t.frames) && t.frames.length) tables[s] = { name: String(t.name || 'Custom'), frames: t.frames.slice(0, MAXF).map(dec) };
  });
  // Parameters are matched by name, so patches survive new knobs being added.
  // Patches saved before names were stored are matched against the pre-effects list.
  const FX = new Set(['drive','dshape','dmix','fvowel','fshift','freso','fmix','mtype','mrate','mdepth','mfb','mmix','dltime','dlfb','dlpp','dltone','dlmix','rvsize','rvdecay','rvdamp','rvmix','ottdepth','otttime','ottup','ottdown','ottout']);
  const ids = saved && saved.A ? (saved.ids || (saved.A.length === DEFS.length ? DEFS.map(d => d.id) : DEFS.filter(d => !FX.has(d.id)).map(d => d.id))) : null;
  if (saved && ids && ids.length === saved.A.length && saved.B.length === saved.A.length) {
    ids.forEach((id, k) => {
      const i = IX[id]; if (i === undefined) return;
      state.A[i] = clamp(+saved.A[k]); state.B[i] = clamp(+saved.B[k]);
      if (saved.C) state.C[i] = clampC(+saved.C[k] || 0);
    });
    state.morph = clamp(+saved.morph || 0);
    if (saved.locks && typeof saved.locks === 'object') state.locks = saved.locks;
    if (saved.links && typeof saved.links === 'object') state.links = saved.links;
    if (!(saved.ver >= 5)) state.locks.pattern = true;   // Pattern starts locked from this version
    if (saved.secLocks && typeof saved.secLocks === 'object') state.secLocks = saved.secLocks;
    if (saved.linkMem && typeof saved.linkMem === 'object') state.linkMem = saved.linkMem;
    state.mono = !!saved.mono;
    if (saved.locks && saved.locks.tables) { state.secLocks.Wavetables = true; delete state.locks.tables; }
    if (!(saved.ver >= 7)) ['ottdepth', 'ottout'].forEach(id => { state.locks[id] = true; });   // OTT Depth and Output start locked
    if (!(saved.ver >= 8)) ['otttime', 'ottlo', 'otthi', 'ottgl', 'ottgm', 'ottgh'].forEach(id => { delete state.locks[id]; });   // the rest of OTT starts unlocked
    if (!(saved.ver >= 6)) {   // OTT Depth and Output start linked, at 13% and 0 dB
      state.links.ottdepth = true; state.links.ottout = true;
      ['ottdepth', 'ottout'].forEach(id => { const i = IX[id]; state.A[i] = state.B[i] = defaultNorm('A', i); });
    }
    if (Array.isArray(saved.fxOn) && saved.fxOn.length === 7) state.fxOn = saved.fxOn.map(Boolean);
    if (!(saved.ver >= 4)) {   // Octave and Fine tune start at 0 and linked
      state.links.octave = true; state.links.fine = true;
      ['octave', 'fine'].forEach(id => { const i = IX[id]; state.A[i] = state.B[i] = defaultNorm('A', i); });
    }
    if (saved.seq && saved.seq.A && saved.seq.B && Array.isArray(saved.seq.A.steps)) state.seq = saved.seq;
    if (saved.bpm) state.bpm = Math.max(40, Math.min(240, +saved.bpm || 120));
    state.walk = saved.walk !== false;
    state.dlSpill = !!saved.dlSpill;
    ['A', 'B'].forEach(s => {
      const t = saved.tables && saved.tables[s];
      if (t && Array.isArray(t.frames) && t.frames.length) tables[s] = { name: String(t.name || 'Custom'), frames: t.frames.slice(0, MAXF).map(dec) };
    });
  }
} catch (e) {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ ...state, ver: 8, ids: DEFS.map(d => d.id),
        tables: { A: { name: tables.A.name, frames: tables.A.frames.map(enc) }, B: { name: tables.B.name, frames: tables.B.frames.map(enc) } } }));
    } catch (e) {}
  }, 400);
}

