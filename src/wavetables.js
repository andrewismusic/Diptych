/* =====================================================================
   WAVETABLES (UI side)
   A table is up to 16 keyframes of 2048 samples. The UI analyzes each
   frame into harmonics and sends the spectra to the engine.
   ===================================================================== */
const NS = 2048, MAXF = 16;
const SIN = Float32Array.from({ length: NS }, (_, n) => Math.sin(2 * Math.PI * n / NS));
const additive = (amps) => { const f = new Float32Array(NS);
  amps.forEach((a, h) => { if (h && a) for (let n = 0; n < NS; n++) f[n] += a * SIN[(h * n) & (NS - 1)]; }); return f; };
const shape = fn => Float32Array.from({ length: NS }, (_, n) => fn(n / NS));
function normalizeFrame(f) {
  let dc = 0; for (let n = 0; n < NS; n++) dc += f[n]; dc /= NS;
  let pk = 0; for (let n = 0; n < NS; n++) { f[n] -= dc; pk = Math.max(pk, Math.abs(f[n])); }
  if (pk > 1e-6) for (let n = 0; n < NS; n++) f[n] /= pk;
  return f;
}
const PRESETS = {
  'Basic shapes': () => [
    shape(t => Math.sin(2 * Math.PI * t)),
    shape(t => 1 - 4 * Math.abs(((t + 0.25) % 1) - 0.5)),
    shape(t => ((t + 0.5) % 1) * 2 - 1),
    shape(t => (t < 0.5 ? 1 : -1)),
  ],
  'Pulse width': () => Array.from({ length: 8 }, (_, j) => { const w = 0.5 - j * 0.46 / 7; return shape(t => (t < w ? 1 : -1)); }),
  'Harmonic stack': () => [1, 2, 3, 5, 8, 16, 32, 64].map(H => additive(Array.from({ length: H + 1 }, (_, h) => (h ? 1 / h : 0)))),
  'Sync sweep': () => [1, 1.5, 2.2, 3, 3.9, 5, 6.2, 7.5].map(r => shape(t => Math.sin(2 * Math.PI * r * t))),
  'Vowel formants': () => Array.from({ length: 8 }, (_, j) => {
    const c = 2 + j * 2.6;
    return additive(Array.from({ length: 49 }, (_, h) => (h ? Math.exp(-((h - c) ** 2) / 4.5) + (h === 1 ? 0.5 : 0) : 0)));
  }),
  'Sine': () => [shape(t => Math.sin(2 * Math.PI * t))],
};
const makeTable = name => ({ name, frames: PRESETS[name]().map(normalizeFrame) });
const cloneTable = t => ({ name: t.name, frames: t.frames.map(f => f.slice()) });

