/* =====================================================================
   PARAMETER REGISTRY
   curve: 'lin' | 'log' | 'int' | 'pow2'   snap: switch instead of blending
   single: 'A' | 'B' belongs to one side only and never morphs

   Oscillator and FX slots hold every parameter of every type, so each slot
   remembers all its types' settings. Ids: global 'glide', 'cutoff',
   slots 'o1.<key>' and 'x1.<key>'. `key` is the parameter's
   own name; formats (FMT) and randomize rules (RND) are looked up by key.
   kind: 'osc' | 'fx' with slot (0-based); eng: the type it belongs
   to (null = every type of that slot).
   ===================================================================== */
const OSC_TYPES = [['off', 'Off'], ['wt', 'Wavetable'], ['smp', 'Sampler'], ['sub', 'Sub']];
const FX_TYPES = [['drive', 'Drive'], ['formant', 'Formant filter'], ['mod', 'Modulation'], ['delay', 'Delay'], ['reverb', 'Reverb'], ['lofi', 'Lo-fi'], ['ott', 'OTT']];
const typeName = (list, t) => (list.find(x => x[0] === t) || [t, t])[1];
const P_ = (key, label, min, max, curve, a, b, x) => ({ key, label, min, max, curve, a, b, ...x });
const OSC_COMMON = [
  P_('olevel', 'Level', 0, 1, 'lin', 0.8, 0.8), P_('opan', 'Pan', -1, 1, 'lin', 0, 0), P_('byp', 'Bypass', 0, 1, 'lin', 0, 0),
];
const OSC_ENG = {
  wt: [
    P_('posA', 'Position A', 0, 1, 'lin', 0.667, 0.667, { single:'A' }), P_('wave', 'Wave', 0, 1, 'lin', 0, 1),
    P_('posB', 'Position B', 0, 1, 'lin', 0.3, 0.3, { single:'B' }),
    P_('pitch', 'Pitch', -24, 24, 'int', 0, 0), P_('fine', 'Fine', -100, 100, 'lin', 0, 0), P_('unison', 'Unison', 0, 1, 'lin', 0, 0.35),
  ],
  // Sampler: a sample per side; Sample crossfades them like Wave; Start is read when a note starts
  smp: [
    P_('sample', 'Sample', 0, 1, 'lin', 0, 1), P_('sstart', 'Start', 0, 1, 'lin', 0, 0),
    P_('spitch', 'Pitch', -24, 24, 'int', 0, 0), P_('sfine', 'Fine', -100, 100, 'lin', 0, 0), P_('strack', 'Key track', 0, 1, 'lin', 1, 1),
  ],
  sub: [P_('soct', 'Octave', -2, -1, 'int', -1, -1), P_('sshape', 'Shape', 0, 1, 'lin', 0, 0), P_('sdrive', 'Drive', 0, 1, 'lin', 0, 0)],
};
const VOICE = [
  P_('glide', 'Glide', 0, 2, 'pow2', 0, 0), P_('vdepth', 'Vibrato', 0, 1, 'pow2', 0, 0), P_('vfade', 'Fade in', 0, 5, 'pow2', 0.6, 0.6),
  P_('vrate', 'Vib rate', 0.5, 12, 'log', 5.5, 5.5), P_('vrfade', 'Rate fade', -10, 10, 'lin', 0, 0), P_('vrtime', 'Rate settle', 0, 5, 'pow2', 1, 1),
];
const FILTER = [P_('cutoff', 'Cutoff', 30, 18000, 'log', 700, 2500), P_('reso', 'Resonance', 0, 1, 'lin', 0.25, 0.45), P_('mode', 'Mode', 0, 1, 'lin', 0, 0.25),
  P_('envamt', 'Env amount', -1, 1, 'lin', 0.5, 0.25), P_('keytrack', 'Key track', 0, 1, 'lin', 0.5, 0.5),
  ...[P_('fatk', 'Attack', 0.001, 10, 'log', 0.003, 0.4), P_('fdec', 'Decay', 0.005, 10, 'log', 0.35, 1.2),
  P_('fsus', 'Sustain', 0, 1, 'lin', 0.15, 0.4), P_('frel', 'Release', 0.005, 10, 'log', 0.3, 1.5)].map(p => ({ ...p, sub: 'env' }))];   // the filter envelope lives with the filter
const ENVS = [
  ['Amp envelope', [P_('aatk', 'Attack', 0.001, 10, 'log', 0.003, 0.25), P_('adec', 'Decay', 0.005, 10, 'log', 0.6, 1),
    P_('asus', 'Sustain', 0, 1, 'lin', 0.7, 0.85), P_('arel', 'Release', 0.005, 10, 'log', 0.3, 1.6)]],
  ['Output', [P_('level', 'Level', 0, 1, 'lin', 0.8, 0.8), P_('pan', 'Pan', -1, 1, 'lin', 0, 0)]],
];
const FX_ENG = {
  drive: [P_('drive', 'Drive', 0, 1, 'lin', 0, 0), P_('dshape', 'Shape', 0, 1, 'lin', 0, 0), P_('dmix', 'Mix', 0, 1, 'lin', 0, 0)],
  formant: [P_('fvowel', 'Vowel', 0, 1, 'lin', 0, 1), P_('fshift', 'Shift', -12, 12, 'lin', 0, 0), P_('freso', 'Resonance', 0, 1, 'lin', 0.5, 0.5), P_('fmix', 'Mix', 0, 1, 'lin', 0, 0)],
  mod: [P_('mtype', 'Type', 0, 1, 'lin', 0, 0), P_('mrate', 'Rate', 0.02, 10, 'log', 0.4, 0.4), P_('mdepth', 'Depth', 0, 1, 'lin', 0.5, 0.5),
    P_('mfb', 'Feedback', 0, 1, 'lin', 0.3, 0.3), P_('mmix', 'Mix', 0, 1, 'lin', 0, 0)],
  delay: [P_('dltime', 'Time', 0, 11, 'int', 7, 7), P_('dlfb', 'Feedback', 0, 0.95, 'lin', 0.4, 0.4), P_('dlpp', 'Ping-pong', 0, 1, 'lin', 0.6, 0.6),
    P_('dltone', 'Tone', 0, 1, 'lin', 0.5, 0.5), P_('dlmix', 'Mix', 0, 1, 'lin', 0, 0.3)],
  reverb: [P_('rvsize', 'Size', 0, 1, 'lin', 0.5, 0.7), P_('rvdecay', 'Decay', 0.2, 20, 'log', 1.5, 3), P_('rvdamp', 'Damping', 0, 1, 'lin', 0.5, 0.4), P_('rvmix', 'Mix', 0, 1, 'lin', 0.12, 0.3)],
  lofi: [P_('lwow', 'Wow', 0, 1, 'lin', 0, 0), P_('lflut', 'Flutter', 0, 1, 'lin', 0, 0), P_('lchar', 'Character', 0, 1, 'lin', 0, 0),
    P_('lnoise', 'Noise', 0, 1, 'lin', 0, 0), P_('lnmix', 'Noise mix', 0, 1, 'lin', 0, 0), P_('ldrop', 'Dropouts', 0, 1, 'lin', 0, 0), P_('lcodec', 'Codec', 0, 1, 'lin', 0, 0)],
  ott: [P_('ottdepth', 'Depth', 0, 1, 'lin', 0.13, 0.13), P_('otttime', 'Time', 0.1, 4, 'log', 1, 1), P_('ottlo', 'Low split', 40, 500, 'log', 120, 120),
    P_('otthi', 'High split', 600, 10000, 'log', 2500, 2500), P_('ottgl', 'Low gain', -12, 12, 'lin', 0, 0), P_('ottgm', 'Mid gain', -12, 12, 'lin', 0, 0),
    P_('ottgh', 'High gain', -12, 12, 'lin', 0, 0), P_('ottout', 'Output', -12, 12, 'lin', 0, 0)],
};
const DEFS = [];
for (let s = 0; s < 4; s++) {
  const group = `Osc ${s + 1}`, add = (p, eng) => DEFS.push({ ...p, id: `o${s + 1}.${p.key}`, group, kind:'osc', slot:s, eng });
  OSC_COMMON.forEach(p => add(p, null));
  Object.entries(OSC_ENG).forEach(([eng, ps]) => ps.forEach(p => add(p, eng)));
}
VOICE.forEach(p => DEFS.push({ ...p, id: p.key, group:'Voice' }));
FILTER.forEach(p => DEFS.push({ ...p, id: p.key, group:'Filter' }));
ENVS.forEach(([group, ps]) => ps.forEach(p => DEFS.push({ ...p, id: p.key, group })));
for (let s = 0; s < 4; s++) Object.entries(FX_ENG).forEach(([eng, ps]) => ps.forEach(p => DEFS.push({ ...p, id: `x${s + 1}.${p.key}`, group: `FX ${s + 1}`, kind:'fx', slot:s, eng })));
DEFS.push({ ...P_('pattern', 'Pattern', 0, 1, 'lin', 0, 1), id:'pattern', group:'Sequencer' });
const IX = {}; DEFS.forEach((d, i) => { IX[d.id] = i; });
// index of a slot parameter: oi(0, 'wave') -> IX['o1.wave'], xi(3, 'ottdepth') -> IX['x4.ottdepth']
const oi = (s, key) => IX[`o${s + 1}.${key}`], xi = (s, key) => IX[`x${s + 1}.${key}`];
// Is this parameter part of the sound right now? (its slot's current type, or a global)
const isActive = d => d.kind === 'osc' ? state.oscType[d.slot] !== 'off' && (!d.eng || d.eng === state.oscType[d.slot])
  : d.kind === 'fx' ? d.eng === state.fxType[d.slot] : true;
const time = v => (v < 0.9995 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s');
const pct = v => Math.round(v * 100) + '%';
const FMT = {
  olevel: pct, opan: v => (Math.abs(v) < 0.02 ? 'Center' : (v < 0 ? 'L ' : 'R ') + Math.round(Math.abs(v) * 100)),
  byp: v => (v < 0.005 ? 'Off' : pct(v)),
  pitch: v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' st', soct: v => String(v).replace('-', '−'),
  sample: v => (v < 0.005 ? 'All A' : v > 0.995 ? 'All B' : Math.round(v * 100) + '% B'), sstart: pct,
  spitch: v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' st', sfine: v => `${v > 0 ? '+' : ''}${v.toFixed(0)} ct`, strack: pct,
  sshape: v => (v < 0.02 ? 'Sine' : Math.abs(v - 0.5) < 0.02 ? 'Triangle' : v > 0.98 ? 'Square' : pct(v)), sdrive: pct,
  posA: pct, posB: pct,
  drive: pct, dshape: pct, dmix: pct,
  fvowel: v => { const n = 'AEIOU', x = v * 4, i = Math.round(x); return Math.abs(x - i) < 0.08 ? n[i] : n[Math.floor(x)] + '–' + n[Math.min(4, Math.floor(x) + 1)]; },
  fshift: v => (v > 0 ? '+' : '') + v.toFixed(1) + ' st', freso: pct, fmix: pct,
  mtype: pct, mrate: v => (v < 1 ? v.toFixed(2) : v.toFixed(1)) + ' Hz', mdepth: pct, mfb: pct, mmix: pct,
  dltime: v => ['1/32', '1/16 T', '1/16', '1/8 T', '1/16 D', '1/8', '1/4 T', '1/8 D', '1/4', '1/4 D', '1/2', '1/2 D'][v],
  dlfb: pct, dlpp: pct, dltone: v => (Math.abs(v - 0.5) < 0.02 ? 'Flat' : v < 0.5 ? 'Dark ' + Math.round((0.5 - v) * 200) + '%' : 'Thin ' + Math.round((v - 0.5) * 200) + '%'), dlmix: pct,
  rvsize: pct, rvdecay: v => v.toFixed(v < 10 ? 1 : 0) + ' s', rvdamp: pct, rvmix: pct,
  lwow: pct, lflut: pct, lchar: pct, lnmix: pct, ldrop: pct, lcodec: pct,
  vdepth: v => (v < 0.005 ? 'Off' : Math.round(v * 100) + ' ct'), vfade: v => (v < 0.005 ? 'None' : time(v)), vrate: v => v.toFixed(1) + ' Hz',
  vrtime: v => (v < 0.005 ? 'Instant' : time(v)),
  vrfade: v => (Math.abs(v) < 0.05 ? 'Steady' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1) + ' Hz'),
  ottlo: v => Math.round(v) + ' Hz', otthi: v => (v / 1000).toFixed(1) + ' kHz',
  ottgl: v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB', ottgm: v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB', ottgh: v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB',
  lnoise: v => (v < 0.03 ? 'Dark hiss' : v < 0.32 ? 'Dark–bright' : v < 0.38 ? 'Bright hiss' : v < 0.58 ? 'Hiss–crackle' : v < 0.62 ? 'Crackle' : 'Crackle ' + (0.1 + 1.9 * (v - 0.35) / 0.65).toFixed(1) + '×'),
  ottdepth: pct, otttime: v => v.toFixed(2) + '×', ottout: v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB',
  pattern: v => (v < 0.005 ? 'All A' : v > 0.995 ? 'All B' : Math.round(v * 100) + '% B'),
  wave: v => (v < 0.005 ? 'All A' : v > 0.995 ? 'All B' : Math.round(v * 100) + '% B'),
  fine: v => `${v > 0 ? '+' : ''}${v.toFixed(0)} ct`,
  unison: v => (v < 0.005 ? 'Off' : pct(v)),
  glide: v => (v < 0.001 ? 'Off' : time(v)),
  cutoff: v => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz' : v.toFixed(0) + ' Hz'),
  reso: pct,
  mode: pct,
  envamt: v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%',
  keytrack: pct,
  fatk: time, fdec: time, fsus: pct, frel: time,
  aatk: time, adec: time, asus: pct, arel: time,
  level: pct,
  pan: v => (Math.abs(v) < 0.02 ? 'Center' : (v < 0 ? 'L ' : 'R ') + Math.round(Math.abs(v) * 100)),
};
const fmtCurve = c => Math.abs(c) < 0.03 ? 'Curve: even' : `Curve: ${c > 0 ? 'early' : 'late'} ${Math.round(Math.abs(c) * 100)}%`;
const norm = (d, v) => d.curve === 'log' ? Math.log(v / d.min) / Math.log(d.max / d.min)
  : d.curve === 'pow2' ? Math.sqrt((v - d.min) / (d.max - d.min)) : (v - d.min) / (d.max - d.min);
const clamp = x => Math.max(0, Math.min(1, x));
const isLinked = i => !!DEFS[i].single || !!state.links[DEFS[i].id];
const clampC = c => Math.max(-1, Math.min(1, c));
const quant = (d, x) => d.curve === 'int' ? Math.round(x * (d.max - d.min)) / (d.max - d.min) : x;
const defaultNorm = (side, i) => norm(DEFS[i], side === 'A' ? DEFS[i].a : DEFS[i].b);
const resolveNorm = i => {
  const d = DEFS[i], a = state.A[i], b = state.B[i];
  const mm = MorphEngine.bend(state.morph, state.C[i]);
  if (d.snap) return mm < 0.5 ? a : b;
  return quant(d, a + (b - a) * mm);
};

