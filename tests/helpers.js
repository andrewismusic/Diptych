import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BASE = 'http://localhost:4173/';   // localhost counts as a secure context, which AudioWorklet needs
const HTML = fileURLToPath(new URL('../dist/diptych.html', import.meta.url));

/* Open the synth with a seeded Math.random, so every run of a test is identical.
   Page-level `const`s (DEFS, state, tables...) are visible to page.evaluate code by name. */
export async function openSynth(page, { seed = 1, storage = null, tapAudio = false } = {}) {
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u === BASE || u.startsWith(BASE + '?')) return route.fulfill({ contentType: 'text/html', body: readFileSync(HTML, 'utf8') });
    if (u.includes('fonts.googleapis.com')) return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort();
  });
  await page.addInitScript(({ seed, storage, tapAudio }) => {
    // mulberry32
    let a = seed >>> 0;
    Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    if (storage !== null && !sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
    }
    if (tapAudio) {
      // Tap everything that reaches the speakers into an analyser, to measure the real output.
      const orig = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (dest, ...rest) {
        if (dest instanceof AudioDestinationNode) {
          const ctx = dest.context;
          if (!ctx.__tap) { ctx.__tap = ctx.createAnalyser(); ctx.__tap.fftSize = 8192; orig.call(ctx.__tap, dest); window.__tap = ctx.__tap; }
          return orig.call(this, ctx.__tap, ...rest);
        }
        return orig.call(this, dest, ...rest);
      };
    }
  }, { seed, storage, tapAudio });
  await page.goto(BASE);
  await page.evaluate(installHarness);
}

/* In-page offline harness: renders a fresh MorphEngine without the audio hardware.
   window.T.render(opts) returns interleaved-free { L, R } Float32Arrays. */
function installHarness() {
  const seeded = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const defs = () => DEFS.map(({ id, key, min, max, curve, snap, kind, slot, eng }) => ({ id, key, min, max, curve, snap: !!snap, kind, slot, eng }));
  const specOf = t => { const re = [], im = []; t.frames.forEach(f => { const a = MorphEngine.analyze(f); re.push(a.re); im.push(a.im); }); return { re, im }; };
  window.T = {
    // Normalized A/B arrays at every parameter's default, with overrides by id in real units: { 'cutoff': 2000 } or { level: [0.2, 1] }
    patch(over = {}) {
      const A = DEFS.map((_, i) => defaultNorm('A', i)), B = DEFS.map((_, i) => defaultNorm('B', i)), C = DEFS.map(() => 0);
      for (const [id, v] of Object.entries(over)) {
        const i = IX[id]; if (i === undefined) throw new Error('unknown parameter ' + id);
        const [a, b] = Array.isArray(v) ? v : [v, v];
        A[i] = norm(DEFS[i], a); B[i] = norm(DEFS[i], b);
      }
      return { A, B, C };
    },
    // A patch where every parameter holds side A's default on both sides (nothing morphs), plus overrides.
    flat(over = {}) {
      const p = T.patch(over);
      DEFS.forEach((d, i) => { if (!(d.id in over)) p.B[i] = p.A[i]; });
      return p;
    },
    /* opts: patch {A,B,C}, morph, fxOn (one per effect, default all on), dlSpill, smpLoop,
       tables: {A,B} for both Wavetables or an array of {A,B} per Wavetable (preset names or table objects),
       samples: {A,B} for the Sampler (built-in names or { d, sr }),
       notes [[midi, startBlock, endBlock]], blocks (128-sample blocks), sr, bpm, events: { [block]: message | message[] }, seed, setup(engine) */
    render(o = {}) {
      const real = Math.random; Math.random = seeded(o.seed || 7);
      try {
        const sr = o.sr || 48000, e = new MorphEngine(sr, defs());
        const p = o.patch || T.flat();
        e.handle({ type:'state', A: p.A, B: p.B, C: p.C, morph: o.morph || 0 });
        const tab = x => typeof x === 'string' ? makeTable(x) : x;
        for (const s of WT_SLOTS) {
          const t = Array.isArray(o.tables) ? o.tables[s] || {} : o.tables || {};
          e.handle({ type:'table', slot:s, side:'A', ...specOf(tab(t.A || 'Basic shapes')) });
          e.handle({ type:'table', slot:s, side:'B', ...specOf(tab(t.B || 'Basic shapes')) });
        }
        const smp = x => (typeof x === 'string' ? factoryData(x) : x);
        for (const k of ['A', 'B']) { const d = o.samples && smp(o.samples[k]); if (d) e.handle({ type:'sample', slot: SMP_SLOT, side:k, d: d.d, sr: d.sr }); }
        e.handle({ type:'smpLoop', i: SMP_SLOT, v: !!o.smpLoop });
        e.handle({ type:'blend', v:true }); e.handle({ type:'bpm', v: o.bpm || 120 });
        e.handle({ type:'dlmode', v: !!o.dlSpill });
        (o.fxOn || T.allFx).forEach((on, i) => e.handle({ type:'bypass', i, on: !!on }));
        if (o.setup) o.setup(e);   // e.g. spy on noteOn
        const blocks = o.blocks || 750, N = 128, L = new Float32Array(blocks * N), R = new Float32Array(blocks * N);
        const bl = new Float32Array(N), br = new Float32Array(N), notes = o.notes || [[48, 0, blocks]];
        const t0 = performance.now();
        for (let b = 0; b < blocks; b++) {
          for (const [n, s, end] of notes) { if (b === s) e.handle({ type:'on', note:n, vel:0.9 }); if (b === end) e.handle({ type:'off', note:n }); }
          const ev = o.events && o.events[b]; if (ev) [].concat(ev).forEach(m => e.handle(m));
          bl.fill(0); br.fill(0); e.render(bl, br, N); L.set(bl, b * N); R.set(br, b * N);
        }
        return { L, R, sr, ms: performance.now() - t0 };
      } finally { Math.random = real; }
    },
    // the page's current sound, as render() options
    current() {
      return { patch: { A: state.A.slice(), B: state.B.slice(), C: state.C.slice() }, morph: state.morph, fxOn: state.fxOn.map(x => +x), dlSpill: state.dlSpill,
        tables: tables.map(t => ({ A: cloneTable(t.A), B: cloneTable(t.B) })), samples: { A: smpData.A, B: smpData.B }, smpLoop: state.smpLoop };
    },
    allFx: FX_KIND.map(() => 1), noFx: FX_KIND.map(() => 0),   // every effect on / every effect bypassed
    only: k => FX_KIND.map(t => +(t === k)),                   // just this effect on
    rms(x, from = 0, to = x.length) { let s = 0; for (let i = from; i < to; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, to - from)); },
    peak(x, from = 0, to = x.length) { let p = 0; for (let i = from; i < to; i++) p = Math.max(p, Math.abs(x[i])); return p; },
    db: x => 20 * Math.log10(Math.max(x, 1e-12)),
    stereoRms(r, fromSec, toSec) {
      const a = Math.floor(fromSec * r.sr), b = Math.floor(toSec * r.sr);
      return Math.sqrt((T.rms(r.L, a, b) ** 2 + T.rms(r.R, a, b) ** 2) / 2);
    },
    hasNaN(r) { for (let i = 0; i < r.L.length; i++) if (!Number.isFinite(r.L[i]) || !Number.isFinite(r.R[i])) return true; return false; },
    // Largest sample-to-sample step in a window, a click detector for smooth test tones.
    maxStep(x, from, to) { let m = 0; for (let i = Math.max(1, from); i < to; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return m; },
  };
}
