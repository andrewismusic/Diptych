/* =====================================================================
   PARAMETER REGISTRY
   curve: 'lin' | 'log' | 'int' | 'pow2'   snap: switch instead of blending
   ===================================================================== */
const DEFS = [
  { id:'posA',     label:'Position A', group:'Wavetables',      min:0,     max:1,     curve:'lin',  single:'A', a:0.667, b:0.667 },
  { id:'wave',     label:'Wave',       group:'Wavetables',      min:0,     max:1,     curve:'lin',  a:0, b:1 },
  { id:'posB',     label:'Position B', group:'Wavetables',      min:0,     max:1,     curve:'lin',  single:'B', a:0.3, b:0.3 },
  { id:'octave',   label:'Octave',     group:'Oscillator',      min:-2,    max:2,     curve:'int',  a:0, b:0 },
  { id:'fine',     label:'Fine tune',  group:'Oscillator',      min:-100,  max:100,   curve:'lin',  a:0, b:0 },
  { id:'unison',   label:'Unison',     group:'Oscillator',      min:0,     max:1,     curve:'lin',  a:0, b:0.35 },
  { id:'glide',    label:'Glide',      group:'Oscillator',      min:0,     max:2,     curve:'pow2', a:0, b:0 },
  { id:'vdepth',   label:'Vibrato',    group:'Oscillator',      min:0,     max:1,     curve:'pow2', a:0, b:0 },
  { id:'vfade',    label:'Fade in',    group:'Oscillator',      min:0,     max:5,     curve:'pow2', a:0.6, b:0.6 },
  { id:'vrate',    label:'Vib rate',   group:'Oscillator',      min:0.5,   max:12,    curve:'log',  a:5.5, b:5.5 },
  { id:'vrfade',   label:'Rate fade',  group:'Oscillator',      min:-10,   max:10,    curve:'lin',  a:0, b:0 },
  { id:'vrtime',   label:'Rate settle',group:'Oscillator',      min:0,     max:5,     curve:'pow2', a:1, b:1 },
  { id:'cutoff',   label:'Cutoff',     group:'Filter',          min:30,    max:18000, curve:'log',  a:700, b:2500 },
  { id:'reso',     label:'Resonance',  group:'Filter',          min:0,     max:1,     curve:'lin',  a:0.25, b:0.45 },
  { id:'mode',     label:'Mode',       group:'Filter',          min:0,     max:1,     curve:'lin',  a:0, b:0.25 },
  { id:'envamt',   label:'Env amount', group:'Filter',          min:-1,    max:1,     curve:'lin',  a:0.5, b:0.25 },
  { id:'keytrack', label:'Key track',  group:'Filter',          min:0,     max:1,     curve:'lin',  a:0.5, b:0.5 },
  { id:'fatk',     label:'Attack',     group:'Filter envelope', min:0.001, max:10,    curve:'log',  a:0.003, b:0.4 },
  { id:'fdec',     label:'Decay',      group:'Filter envelope', min:0.005, max:10,    curve:'log',  a:0.35, b:1.2 },
  { id:'fsus',     label:'Sustain',    group:'Filter envelope', min:0,     max:1,     curve:'lin',  a:0.15, b:0.4 },
  { id:'frel',     label:'Release',    group:'Filter envelope', min:0.005, max:10,    curve:'log',  a:0.3, b:1.5 },
  { id:'aatk',     label:'Attack',     group:'Amp envelope',    min:0.001, max:10,    curve:'log',  a:0.003, b:0.25 },
  { id:'adec',     label:'Decay',      group:'Amp envelope',    min:0.005, max:10,    curve:'log',  a:0.6, b:1 },
  { id:'asus',     label:'Sustain',    group:'Amp envelope',    min:0,     max:1,     curve:'lin',  a:0.7, b:0.85 },
  { id:'arel',     label:'Release',    group:'Amp envelope',    min:0.005, max:10,    curve:'log',  a:0.3, b:1.6 },
  { id:'level',    label:'Level',      group:'Output',          min:0,     max:1,     curve:'lin',  a:0.8, b:0.8 },
  { id:'pan',      label:'Pan',        group:'Output',          min:-1,    max:1,     curve:'lin',  a:0, b:0 },
  { id:'drive',    label:'Drive',      group:'Drive',           min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'dshape',   label:'Shape',      group:'Drive',           min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'dmix',     label:'Mix',        group:'Drive',           min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'fvowel',   label:'Vowel',      group:'Formant filter',  min:0,     max:1,     curve:'lin',  a:0, b:1 },
  { id:'fshift',   label:'Shift',      group:'Formant filter',  min:-12,   max:12,    curve:'lin',  a:0, b:0 },
  { id:'freso',    label:'Resonance',  group:'Formant filter',  min:0,     max:1,     curve:'lin',  a:0.5, b:0.5 },
  { id:'fmix',     label:'Mix',        group:'Formant filter',  min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'mtype',    label:'Type',       group:'Modulation',      min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'mrate',    label:'Rate',       group:'Modulation',      min:0.02,  max:10,    curve:'log',  a:0.4, b:0.4 },
  { id:'mdepth',   label:'Depth',      group:'Modulation',      min:0,     max:1,     curve:'lin',  a:0.5, b:0.5 },
  { id:'mfb',      label:'Feedback',   group:'Modulation',      min:0,     max:1,     curve:'lin',  a:0.3, b:0.3 },
  { id:'mmix',     label:'Mix',        group:'Modulation',      min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'dltime',   label:'Time',       group:'Delay',           min:0,     max:11,    curve:'int',  a:7, b:7 },
  { id:'dlfb',     label:'Feedback',   group:'Delay',           min:0,     max:0.95,  curve:'lin',  a:0.4, b:0.4 },
  { id:'dlpp',     label:'Ping-pong',  group:'Delay',           min:0,     max:1,     curve:'lin',  a:0.6, b:0.6 },
  { id:'dltone',   label:'Tone',       group:'Delay',           min:0,     max:1,     curve:'lin',  a:0.5, b:0.5 },
  { id:'dlmix',    label:'Mix',        group:'Delay',           min:0,     max:1,     curve:'lin',  a:0, b:0.3 },
  { id:'rvsize',   label:'Size',       group:'Reverb',          min:0,     max:1,     curve:'lin',  a:0.5, b:0.7 },
  { id:'rvdecay',  label:'Decay',      group:'Reverb',          min:0.2,   max:20,    curve:'log',  a:1.5, b:3 },
  { id:'rvdamp',   label:'Damping',    group:'Reverb',          min:0,     max:1,     curve:'lin',  a:0.5, b:0.4 },
  { id:'rvmix',    label:'Mix',        group:'Reverb',          min:0,     max:1,     curve:'lin',  a:0.12, b:0.3 },
  { id:'lwow',     label:'Wow',        group:'Lo-fi',           min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'lflut',    label:'Flutter',    group:'Lo-fi',           min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'lchar',    label:'Character',  group:'Lo-fi',           min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'lnoise',   label:'Noise',      group:'Lo-fi',           min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'lnmix',    label:'Noise mix',  group:'Lo-fi',           min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'ldrop',    label:'Dropouts',   group:'Lo-fi',           min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'lcodec',   label:'Codec',      group:'Lo-fi',           min:0,     max:1,     curve:'lin',  a:0, b:0 },
  { id:'ottdepth', label:'Depth',      group:'OTT',             min:0,     max:1,     curve:'lin',  a:0.13, b:0.13 },
  { id:'otttime',  label:'Time',       group:'OTT',             min:0.1,   max:4,     curve:'log',  a:1, b:1 },
  { id:'ottlo',    label:'Low split',  group:'OTT',             min:40,    max:500,   curve:'log',  a:120, b:120 },
  { id:'otthi',    label:'High split', group:'OTT',             min:600,   max:10000, curve:'log',  a:2500, b:2500 },
  { id:'ottgl',    label:'Low gain',   group:'OTT',             min:-12,   max:12,    curve:'lin',  a:0, b:0 },
  { id:'ottgm',    label:'Mid gain',   group:'OTT',             min:-12,   max:12,    curve:'lin',  a:0, b:0 },
  { id:'ottgh',    label:'High gain',  group:'OTT',             min:-12,   max:12,    curve:'lin',  a:0, b:0 },
  { id:'ottout',   label:'Output',     group:'OTT',             min:-12,   max:12,    curve:'lin',  a:0, b:0 },
  { id:'pattern',  label:'Pattern',    group:'Sequencer',       min:0,     max:1,     curve:'lin',  a:0, b:1 },
];
const IX = {}; DEFS.forEach((d, i) => { IX[d.id] = i; });
const time = v => (v < 0.9995 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s');
const pct = v => Math.round(v * 100) + '%';
const FMT = {
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
  octave: v => (v > 0 ? '+' + v : String(v)),
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

