/* =====================================================================
   DSP ENGINE
   Runs in an AudioWorklet when possible, otherwise on the main thread.
   Parameters arrive normalized and resolve every 16 samples as
   lerp(A, B, bend(morph, curve)). The oscillator reads band-limited
   tables rebuilt (at most every 512 samples, with a crossfade) from
   table A and table B at the current Position, blended by the morph.

   The whole class is stringified into the AudioWorklet (see audio.js),
   so it must stay self-contained: no references to anything outside it.
   ===================================================================== */
class MorphEngine {
  constructor(sr, defs) {
    this.sr = sr; this.defs = defs;
    const n = defs.length;
    this.A = new Float32Array(n); this.B = new Float32Array(n); this.C = new Float32Array(n);
    this.cur = new Float32Array(n); this.val = new Float32Array(n);
    this.morph = 0; this.mSm = 0; this.first = true; this.clock = 0; this.lastPitch = -1;
    this.I = {}; defs.forEach((d, i) => { this.I[d.id] = i; });
    // wavetables: spectra per keyframe, one table per side
    this.tables = { A: null, B: null }; this.spectral = true; this.tabVer = 0;
    // band-limited banks, level k holds harmonics 1..(512 >> k); double-buffered for crossfades
    this.bankCur = []; this.bankPrev = []; this.scr = [];
    for (let k = 0; k < 10; k++) {
      const N = Math.max(64, 4 * (512 >> k));
      this.bankCur.push(new Float32Array(N + 1)); this.bankPrev.push(new Float32Array(N + 1));
      this.scr.push([new Float32Array(N), new Float32Array(N)]);
    }
    const sp = () => [new Float32Array(513), new Float32Array(513)];
    this.fa = sp(); this.fb = sp(); this.fr = sp();
    this.bankReady = false; this.xf = 1; this.xfInc = 0; this.since = 1e9; this.lastKey = '';
    this.gL = -1; this.gR = -1;   // output gain (Level, Pan) at the end of the last sub-block; -1 = not set yet
    this.voices = [];
    for (let v = 0; v < 8; v++) this.voices.push({ active:false, note:0, vel:0, pitch:0, age:0,
      aSt:0, aLv:0, fSt:0, fLv:0, ph:new Float64Array(7), l1:0, l2:0, r1:0, r2:0, vAge:0, vPh:0 });
    this.fxInit();
    this.uL = new Float32Array(7); this.uR = new Float32Array(7); this.uOff = new Float32Array(7);
    this.uDt = new Float32Array(7); this.uLev = new Int32Array(7); this.uJ = new Int32Array(7);
    // sequencer
    this.seq = null; this.playing = false; this.bpm = 120; this.walk = true;
    this.spos = 0; this.ei = 0; this.stick = 0; this.offs = []; this.reports = []; this.repCount = 0;
    this.mono = false; this.stack = [];
  }

  /* ---------- shared maths (also used by the UI) ---------- */
  static denorm(d, x) {
    if (d.curve === 'log') return d.min * Math.pow(d.max / d.min, x);
    if (d.curve === 'pow2') return d.min + (d.max - d.min) * x * x;
    let v = d.min + (d.max - d.min) * x;
    if (d.curve === 'int') v = Math.round(v);
    return v;
  }
  // Morph curve per parameter. c = 0 is even, c > 0 moves early, c < 0 moves late.
  static bend(m, c) { return c === 0 ? m : Math.pow(m, Math.pow(6, -c)); }
  static fft(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const a = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < h; j++) {
          const p = i + j, q = p + h;
          const xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
          re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  // 2048-sample frame -> complex amplitudes of harmonics 1..512 (a unit sine gives magnitude 1)
  static analyze(frame) {
    const N = 2048, re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = frame[i];
    MorphEngine.fft(re, im, false);
    const oR = new Float32Array(513), oI = new Float32Array(513);
    for (let h = 1; h <= 512; h++) { oR[h] = re[h] * 2 / N; oI[h] = im[h] * 2 / N; }
    return { re: oR, im: oI };
  }
  // Blend two spectra. Direct = straight crossfade of the waveforms: always smooth, but it can
  // thin out when the two waves work against each other. Spectral = the same crossfade, with each
  // harmonic's loudness then restored to the blended loudness of A and B. Its phase comes from the
  // direct crossfade, so it never flips; the boost is capped so harmonics that truly cancel still dip.
  static interp(aR, aI, bR, bI, t, spectral, oR, oI) {
    for (let h = 1; h <= 512; h++) {
      const dr = aR[h] + (bR[h] - aR[h]) * t, di = aI[h] + (bI[h] - aI[h]) * t;
      if (!spectral) { oR[h] = dr; oI[h] = di; continue; }
      const dl = Math.hypot(dr, di);
      if (dl < 1e-9) { oR[h] = 0; oI[h] = 0; continue; }
      const ma = Math.hypot(aR[h], aI[h]), mb = Math.hypot(bR[h], bI[h]);
      const g = Math.min((ma + (mb - ma) * t) / dl, 3);
      oR[h] = dr * g; oI[h] = di * g;
    }
  }
  static frameAt(tab, p, spectral, oR, oI) {
    const k = tab.k;
    if (k === 1) { oR.set(tab.re[0]); oI.set(tab.im[0]); return; }
    const f = Math.max(0, Math.min(1, p)) * (k - 1);
    let i = Math.floor(f); if (i > k - 2) i = k - 2;
    MorphEngine.interp(tab.re[i], tab.im[i], tab.re[i + 1], tab.im[i + 1], f - i, spectral, oR, oI);
  }
  static synth(re, im, maxH, N, out, sR, sI) {
    sR.fill(0); sI.fill(0);
    const H = Math.min(maxH, N / 2 - 1);
    for (let h = 1; h <= H; h++) { sR[h] = re[h]; sI[h] = im[h]; }
    MorphEngine.fft(sR, sI, true);
    for (let i = 0; i < N; i++) out[i] = sR[i];
  }

  /* ---------- messages ---------- */
  handle(m) {
    switch (m.type) {
      case 'state': this.A.set(m.A); this.B.set(m.B); if (m.C) this.C.set(m.C); this.morph = m.morph; break;
      case 'param': (m.side === 'A' ? this.A : this.B)[m.i] = m.v; break;
      case 'curve': this.C[m.i] = m.v; break;
      case 'morph': this.morph = m.v; break;
      case 'table': this.tables[m.side] = { k: m.re.length, re: m.re, im: m.im }; this.tabVer++; break;
      case 'blend': this.spectral = !!m.v; this.tabVer++; break;
      case 'seq':
        this.seq = m.seq;
        if (this.seq) {
          this.spos %= this.seq.loop;
          this.ei = this.seq.events.findIndex(ev => ev.tick >= this.spos);
          if (this.ei < 0) this.ei = this.seq.events.length;
        }
        break;
      case 'seqPlay':
        if (m.on) { this.playing = true; this.spos = 0; this.ei = 0; this.stick = 0; this.repCount = 64; }
        else { this.playing = false; this.offs.forEach(o => this.noteOff(o.note)); this.offs = []; }
        break;
      case 'bpm': this.bpm = m.v; break;
      case 'walk': this.walk = !!m.v; break;
      case 'dlmode': this.dlSpill = !!m.v; break;
      case 'bypass': this.byT[m.i] = m.on ? 1 : 0; break;
      case 'on': this.noteOn(m.note, m.vel); break;
      case 'off': this.noteOff(m.note); break;
      case 'panic': this.stack = []; this.voices.forEach(v => { if (v.active) { v.aSt = 3; v.fSt = 3; } }); break;
      case 'mono': this.mono = !!m.v; this.stack = []; if (this.mono) this.voices.forEach((v, k) => { if (k && v.active) { v.aSt = 3; v.fSt = 3; } }); break;
    }
  }
  noteOn(note, vel) {
    if (this.mono) {   // one voice, last note wins; releasing it falls back to a key still held
      this.stack = this.stack.filter(n => n !== note); this.stack.push(note);
      for (let k = 1; k < 8; k++) if (this.voices[k].active) { this.voices[k].aSt = 3; this.voices[k].fSt = 3; }
      const v = this.voices[0];
      if (!v.active) {
        v.aLv = 0; v.fLv = 0; v.l1 = v.l2 = v.r1 = v.r2 = 0;
        for (let j = 0; j < 7; j++) v.ph[j] = Math.random();
        v.pitch = this.val[this.I.glide] > 0.0005 && this.lastPitch >= 0 ? this.lastPitch : note;
      }
      v.active = true; v.note = note; v.vel = vel; v.aSt = 1; v.fSt = 1; v.vAge = 0; v.vPh = 0; this.lastPitch = note;
      return;
    }
    let v = this.voices.find(x => x.active && x.note === note);
    if (!v) v = this.voices.find(x => !x.active);
    if (!v) v = this.voices.reduce((a, b) => (a.age < b.age ? a : b));
    if (!v.active) {
      v.aLv = 0; v.fLv = 0; v.l1 = v.l2 = v.r1 = v.r2 = 0;
      for (let j = 0; j < 7; j++) v.ph[j] = Math.random();
      const glide = this.val[this.I.glide];
      v.pitch = glide > 0.0005 && this.lastPitch >= 0 ? this.lastPitch : note;
    }
    v.active = true; v.note = note; v.vel = vel; v.aSt = 1; v.fSt = 1; v.age = this.clock++;
    v.vAge = 0; v.vPh = 0;   // vibrato fades in again from each new note
    this.lastPitch = note;
  }
  /* ---------- sequencer ----------
     Events are the union of both patterns' note starts on a shared tick grid
     (48 ticks per quarter). Each event is evaluated against the Pattern value
     when it plays; see seqEval. Nothing here is random. */
  static seqAllowed(sc, pc, mm) {
    if (sc.shared[pc]) return true;
    const c = sc.change[pc];
    return !!c && (c.add ? mm >= c.thr : mm < c.thr);
  }
  static seqQuant(sc, p, mm) {
    const r = Math.round(p), up = p >= r;
    for (let d = 0; d <= 6; d++) {
      const c1 = up ? r + d : r - d, c2 = up ? r - d : r + d;
      if (MorphEngine.seqAllowed(sc, ((c1 % 12) + 12) % 12, mm)) return c1;
      if (d && MorphEngine.seqAllowed(sc, ((c2 % 12) + 12) % 12, mm)) return c2;
    }
    return r;
  }
  static seqEval(ev, mm, walk, sc) {
    if (ev.a && ev.b) {
      const vel = ev.a.v + (ev.b.v - ev.a.v) * mm, len = ev.a.l + (ev.b.l - ev.a.l) * mm;
      const note = walk ? MorphEngine.seqQuant(sc, ev.a.p + (ev.b.p - ev.a.p) * mm, mm)
        : ev.a.p === ev.b.p ? ev.a.p : (mm >= ev.thr ? ev.b.p : ev.a.p);
      return { note, vel, len };
    }
    const s = ev.a || ev.b, on = ev.a ? mm < ev.thr : mm >= ev.thr;
    if (!on) return null;
    return { note: walk ? MorphEngine.seqQuant(sc, s.p, mm) : s.p, vel: s.v, len: s.l };
  }
  seqRun(len) {
    if (!this.playing || !this.seq) return;
    const S = this.seq, adv = this.bpm / 60 * 48 / this.sr * len, endT = this.stick + adv;
    for (let k = this.offs.length - 1; k >= 0; k--) if (this.offs[k].at <= endT) { this.noteOff(this.offs[k].note); this.offs.splice(k, 1); }
    const mm = this.val[this.I.pattern];
    let from = this.spos, to = from + adv;
    for (;;) {
      const lim = Math.min(to, S.loop);
      while (this.ei < S.events.length && S.events[this.ei].tick < lim) {
        const ev = S.events[this.ei++], r = MorphEngine.seqEval(ev, mm, this.walk, S.scale);
        if (!r) continue;
        // monophonic: a new note always ends the one before it
        for (const o of this.offs) if (o.note !== r.note) this.noteOff(o.note);
        this.offs.length = 0;
        this.noteOn(r.note, 0.25 + 0.75 * r.vel);
        this.offs.push({ note: r.note, at: this.stick + (ev.tick - from) + Math.max(1, r.len * 0.92) });
      }
      if (to >= S.loop) { to -= S.loop; from -= S.loop; this.ei = 0; } else break;
    }
    this.spos = to; this.stick = endT;
    if (++this.repCount >= 64) { this.repCount = 0; this.reports.push({ type:'pos', pos: this.spos, loop: S.loop }); }
  }
  noteOff(note) {
    if (this.mono) {
      const top = this.stack[this.stack.length - 1], v = this.voices[0];
      this.stack = this.stack.filter(n => n !== note);
      if (note === top) {
        if (this.stack.length) { v.note = this.stack[this.stack.length - 1]; this.lastPitch = v.note; }   // legato back to the held key
        else if (v.active && v.note === note) { v.aSt = 3; v.fSt = 3; }
      }
      return;
    }
    for (const v of this.voices) if (v.active && v.note === note && v.aSt !== 3) { v.aSt = 3; v.fSt = 3; }
  }

  /* =================================================================
     EFFECTS: fixed order, every unit always running so any setting,
     including its mix, can morph without clicks.
     Drive -> Formant -> Modulation -> Delay -> Reverb -> Lo-fi -> OTT
     Settings arrive once per 16-sample block; anything that would
     click if it stepped (delay times, filter sweeps, tap gains) is
     smoothed again per sample.
     ================================================================= */
  fxInit() {
    const sr = this.sr, pow2 = n => { let k = 1; while (k < n) k <<= 1; return k; };
    this.rng = 0x9e3779b9;
    // bypass: one on/off per effect (drive, formant, modulation, delay, reverb, lo-fi, OTT), crossfaded over ~15 ms
    this.by = new Float64Array(7).fill(1); this.byT = new Float64Array(7).fill(1); this.byC = 1 - Math.exp(-1 / (0.015 * sr));
    // drive: 4x oversampling with a 33-tap linear-phase filter (8 samples of latency, matched on the dry path)
    this.osH = MorphEngine.osFilter();
    this.drXL = new Float64Array(9); this.drXR = new Float64Array(9);
    this.drZL = new Float64Array(33); this.drZR = new Float64Array(33); this.drZw = 0;
    this.drDL = new Float64Array(8); this.drDR = new Float64Array(8); this.drDw = 0;
    this.drLpL = 0; this.drLpR = 0; this.drDcXL = 0; this.drDcYL = 0; this.drDcXR = 0; this.drDcYR = 0;
    // formant
    this.fs = new Float64Array(12);
    // modulation
    this.mdN = pow2(sr * 0.06); this.mdL = new Float32Array(this.mdN); this.mdR = new Float32Array(this.mdN);
    this.mdW = 0; this.lfo = 0; this.fbL = 0; this.fbR = 0;
    this.apL = new Float64Array(6); this.apR = new Float64Array(6); this.phL = 0; this.phR = 0;
    this.msm = null;   // per-sample smoothed modulation settings
    // delay: one line per division, all running at once
    this.dls = MorphEngine.DIVS.map(beats => {
      const n = pow2(beats * 1.5 * sr + 8);   // long enough at 40 bpm
      return { L: new Float32Array(n), R: new Float32Array(n), m: n - 1, t: -1, lpL: 0, lpR: 0, hpL: 0, hpR: 0, wIn: 1, wOut: 0 };
    });
    this.dlMax = Math.max(...this.dls.map(d => d.m + 1)); this.dlW = 0; this.dlSpill = false; this.dlFirst = true;
    // reverb
    this.rvN = pow2(sr * 0.2); this.rv = []; for (let i = 0; i < 8; i++) this.rv.push(new Float32Array(this.rvN));
    this.rvLen = new Float64Array(8).fill(-1); this.rvLp = new Float64Array(8); this.rvG = new Float64Array(8); this.rvT = new Float64Array(8);
    this.rvApLen = [142, 107, 379, 277].map(x => Math.round(x * sr / 44100));
    this.rvAp = this.rvApLen.map(l => new Float32Array(pow2(l + 1)));
    this.rvW = 0;
    // lo-fi
    this.lfN = pow2(sr * 0.05); this.lfL = new Float32Array(this.lfN); this.lfR = new Float32Array(this.lfN); this.lfW = 0;
    this.wowPh = 0; this.flPh1 = 0; this.flPh2 = 0; this.drift = 0; this.driftT = 0; this.lfD = -1;
    this.wowR = 0; this.wowRT = 0; this.flR = 0; this.flRT = 0;
    this.lfBpL = [0, 0]; this.lfBpR = [0, 0];
    this.dpG = 1; this.dpT = 1; this.dpTimer = 0; this.dpLpL = 0; this.dpLpR = 0;
    // codec: 512-point STFT, 50% overlap, square-root Hann windows (512 samples of latency when engaged)
    this.cWin = Float64Array.from({ length: 512 }, (_, n) => Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * n / 512)));
    this.cInL = new Float64Array(512); this.cInR = new Float64Array(512); this.cPos = 0;
    this.cOlaL = new Float64Array(1024); this.cOlaR = new Float64Array(1024); this.cT = 0; this.cHop = 0;
    this.cRe = new Float64Array(512); this.cIm = new Float64Array(512); this.cXf = 0; this.cAmt = 0;
    this.lfLpL = 0; this.lfLpR = 0; this.nDkL = 0; this.nDkR = 0; this.nBrL = 0; this.nBrR = 0; this.crL = 0; this.crR = 0; this.crLp = 0;
    // OTT
    this.xo = new Float64Array(8);
    this.oEnv = new Float64Array(3); this.oGain = new Float64Array([1, 1, 1]); this.oTgt = new Float64Array([1, 1, 1]);
    this.oInE = 1e-6; this.oOutE = 1e-6; this.oComp = 1; this.oRep = 0;
    this.oLa = [0, 1, 2, 3, 4, 5].map(() => new Float64Array(128)); this.oLaW = 0; this.oLaN = Math.round(0.0015 * sr);
  }
  static osFilter() {
    const N = 33, fc = 0.11, h = new Float64Array(N); let s = 0;
    for (let n = 0; n < N; n++) {
      const x = n - 16, sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
      const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * n / (N - 1)) + 0.08 * Math.cos(4 * Math.PI * n / (N - 1));
      h[n] = sinc * w; s += h[n];
    }
    for (let n = 0; n < N; n++) h[n] /= s;
    return h;
  }
  static get DIVS() { return [0.125, 1 / 6, 0.25, 1 / 3, 0.375, 0.5, 2 / 3, 0.75, 1, 1.5, 2, 3]; }   // delay times in beats
  static get VOWELS() { return [[650, 1080, 2650], [400, 1700, 2600], [290, 1870, 2800], [400, 800, 2600], [350, 600, 2700]]; }   // a e i o u
  rand() { let x = this.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rng = x >>> 0; return this.rng / 4294967296; }

  codecFrame(inp, ola) {
    const N = 512, re = this.cRe, im = this.cIm, win = this.cWin, a = this.cAmt;
    for (let k = 0; k < N; k++) { re[k] = inp[(this.cPos + k) & 511] * win[k]; im[k] = 0; }
    MorphEngine.fft(re, im, false);
    const cut = Math.round(256 * Math.min(1, 20000 * Math.pow(0.25, a) / (this.sr / 2)));
    const thr = -80 + 62 * a, q = 0.5 + 5.5 * a;
    let M = 1e-12;
    for (let k = 1; k < 256; k++) M = Math.max(M, Math.hypot(re[k], im[k]));
    for (let k = 1; k < 256; k++) {
      let g = 0;
      if (k <= cut) {
        const db = 20 * Math.log10(Math.hypot(re[k], im[k]) / M + 1e-12);
        const jit = (this.rand() * 2 - 1) * 8 * a;   // bins near the threshold flicker, like codec "birdies"
        if (db + jit >= thr) g = Math.pow(10, (Math.round(db / q) * q - db) / 20);
      }
      re[k] *= g; im[k] *= g; re[N - k] = re[k]; im[N - k] = -im[k];
    }
    re[256] = 0; im[256] = 0;
    MorphEngine.fft(re, im, true);
    const t0 = this.cT - 512;   // time of this frame's first sample
    for (let k = 0; k < N; k++) ola[(t0 + k) & 1023] += re[k] / N * win[k];
  }
  fx(L, R, p, len) {
    const v = this.val, I = this.I, sr = this.sr, TAU = 2 * Math.PI, msr = sr / 1000;
    const readF = (buf, mask, pos) => { const i = Math.floor(pos), f = pos - i; const a = buf[i & mask]; return a + (buf[(i + 1) & mask] - a) * f; };

    /* ---- drive ---- */
    // Level-referenced: a full-level signal comes out at the same level whatever the drive,
    // so turning it up changes tone, not volume. The curve runs from warm and asymmetric
    // (even harmonics) through a firmer knee to a sine wavefolder.
    const drv = v[I.drive], dsh = v[I.dshape], dmix = v[I.dmix];
    // Heavier drive squares the wave off, which raises its average level; dcomp pulls that back.
    const REF = 0.35, dg = 0.5 * Math.pow(32, drv), dcomp = 1 / Math.tanh(dg) / (1 + 3.5 * Math.pow(drv, 1.5));
    const dLpC = 1 - Math.exp(-TAU * 20000 * Math.pow(0.35, drv) / sr);
    const shape = a => {
      const soft = Math.tanh(a + 0.25) - 0.2449186624;   // tanh(0.25)
      const firm = a / Math.pow(1 + a * a * a * a, 0.25);
      return dsh < 0.5 ? soft + (firm - soft) * dsh * 2 : firm + (Math.sin(a) - firm) * (dsh - 0.5) * 2;
    };
    const H = this.osH;

    /* ---- formant ---- */
    const vp = v[I.fvowel] * 4, vi = Math.min(3, Math.floor(vp)), vf = vp - vi, VW = MorphEngine.VOWELS, fr = Math.pow(2, v[I.fshift] / 12);
    const fk = 1 / (3 + v[I.freso] * 17), fmix = v[I.fmix], fGain = [1, 0.7, 0.45], fMake = 2.2 / Math.sqrt(fk);
    const fa1 = [], fa2 = [], fa3 = [];
    for (let b = 0; b < 3; b++) {
      const f = Math.min(sr * 0.45, (VW[vi][b] + (VW[vi + 1][b] - VW[vi][b]) * vf) * fr);
      const g = Math.tan(Math.PI * f / sr), a1 = 1 / (1 + g * (g + fk));
      fa1.push(a1); fa2.push(g * a1); fa3.push(g * g * a1);
    }

    /* ---- modulation targets (smoothed per sample below) ---- */
    // Type: 0 chorus (3 taps, long delay) -> 0.5 flanger (1 tap, short delay, feedback) -> 1 phaser.
    // Going chorus -> flanger, the outer tap fades out first, then the middle one, like unison in reverse.
    const mt = v[I.mtype], u = Math.min(1, mt * 2);
    const T = [
      15 + (1.5 - 15) * u,                          // 0 base delay (ms)
      (6 + (1.2 - 6) * u) * v[I.mdepth],            // 1 depth (ms)
      Math.max(0, Math.min(1, 2 - 2 * u)),          // 2 middle tap gain
      Math.max(0, 1 - 2 * u),                       // 3 outer tap gain
      Math.max(0, (mt - 0.5) * 2),                  // 4 phaser share
      v[I.mfb] * (0.25 + 0.75 * u) * 0.95,          // 5 delay feedback
      v[I.mfb] * 0.85,                              // 6 phaser feedback
      0.5 + 4 * v[I.mdepth],                        // 7 phaser sweep (octaves)
      v[I.mmix],                                    // 8 mix
    ];
    if (!this.msm) this.msm = T.slice();
    const S = this.msm, lfoInc = v[I.mrate] / sr;

    /* ---- delay ---- */
    const dIdx = Math.max(0, Math.min(11, Math.round(v[I.dltime])));
    const dfb = v[I.dlfb], pp = v[I.dlpp], dlmix = v[I.dlmix];
    // Tone: below 50% darkens (low-pass sweeping down to 400 Hz), above 50% thins (high-pass sweeping up to 2 kHz).
    // It filters the echoes you hear and every repeat, so its effect builds with feedback.
    const dt = v[I.dltone], dtc = 1 - Math.exp(-TAU * (dt < 0.5 ? 400 * Math.pow(2, dt * 2 * 5.5) : 18000) / sr);
    const dth = 1 - Math.exp(-TAU * (dt > 0.5 ? 20 * Math.pow(2, (dt - 0.5) * 2 * 6.6) : 20) / sr);
    const spill = this.dlSpill, xfc = 1 - Math.exp(-1 / (0.012 * sr));   // ~12 ms crossfade
    const dls = this.dls;
    for (let i = 0; i < dls.length; i++) {
      const d = dls[i];
      d.tgt = Math.min(d.m - 4, MorphEngine.DIVS[i] * 60 / this.bpm * sr);
      if (d.t < 0) d.t = d.tgt;
      // Cut: every line hears the input, only the selected one is heard.
      // Spill: only the selected line gets the input, all are heard, so old tails ring out.
      d.inT = spill ? (i === dIdx ? 1 : 0) : 1;
      d.outT = spill ? 1 : (i === dIdx ? 1 : 0);
      if (this.dlFirst) { d.wIn = d.inT; d.wOut = d.outT; }
    }
    this.dlFirst = false;

    /* ---- reverb ---- */
    const scale = 0.35 + 1.4 * v[I.rvsize], RVB = [29.7, 37.1, 41.1, 43.7, 53.3, 59.9, 67.1, 73.1], rdecay = v[I.rvdecay];
    for (let i = 0; i < 8; i++) {
      const t = RVB[i] * scale * msr;
      if (this.rvLen[i] < 0) this.rvLen[i] = t;
      this.rvG[i] = Math.pow(10, -3 * this.rvLen[i] / (sr * rdecay));
      this.rvT[i] = t;
    }
    const rdc = 1 - v[I.rvdamp] * 0.85, rmix = v[I.rvmix];

    /* ---- lo-fi ---- */
    this.driftT += (this.rand() * 2 - 1 - this.driftT) * 0.02;   // slow random drift for wow depth
    // wow and flutter rates wander a little too
    if (this.rand() < len / (0.6 * sr)) this.wowRT = this.rand() * 2 - 1;
    if (this.rand() < len / (0.3 * sr)) this.flRT = this.rand() * 2 - 1;
    this.wowR += (this.wowRT - this.wowR) * 0.01; this.flR += (this.flRT - this.flR) * 0.02;
    const wowD = v[I.lwow] * 8, flD = v[I.lflut] * 0.8, lch = v[I.lchar];
    const wowInc = 0.55 * (1 + 0.4 * this.wowR) / sr, fl1Inc = 7.3 * (1 + 0.2 * this.flR) / sr, fl2Inc = 11.9 * (1 - 0.15 * this.flR) / sr;
    // character: tape-style drive (asymmetric, so it adds intermodulation between notes), a low bump, and high rolloff
    const cg = 1 + 7 * lch, cA = 0.2 * lch, cTa = Math.tanh(cA), cOut = (1 + 0.1 * lch) / cg;
    const lLpC = 1 - Math.exp(-TAU * 20000 * Math.pow(0.18, lch) / sr);
    const bg = Math.tan(Math.PI * 100 / sr), bk = 1.2, ba1 = 1 / (1 + bg * (bg + bk)), ba2 = bg * ba1, ba3 = bg * ba2, bump = lch * 0.7;
    // dropouts: level dips (never below about 15%) that also dull the sound, never full silence
    const ldrop = v[I.ldrop];
    if (this.dpTimer > 0) { this.dpTimer -= len; if (this.dpTimer <= 0) this.dpT = 1; }
    else if (this.rand() < ldrop * 2.5 * len / sr) { this.dpT = 0.15 + 0.35 * this.rand(); this.dpTimer = (0.04 + 0.25 * this.rand()) * sr; }
    const dpDn = 1 - Math.exp(-1 / (0.006 * sr)), dpUp = 1 - Math.exp(-1 / (0.03 * sr)), dpLpC = 1 - Math.exp(-TAU * 2000 / sr);
    // codec
    this.cAmt = 1 - Math.pow(1 - v[I.lcodec], 2.2);   // most of the damage now arrives in the first half
    const cXfT = v[I.lcodec] > 0.001 ? 1 : 0, cXfC = 1 - Math.exp(-1 / (0.03 * sr));
    // Noise: dark hiss (0) -> bright hiss (35%) -> crackle (60%), then crackle gets denser up to 100%
    const nt = v[I.lnoise], nm = v[I.lnmix], ngain = nm > 0 ? 0.03 * Math.pow(10, -(1 - nm) * 45 / 20) * Math.min(1, nm * 20) : 0;   // even steps in loudness
    const nDark = nt < 0.35 ? 1 - nt / 0.35 : 0, nBright = nt < 0.35 ? nt / 0.35 : nt < 0.6 ? 1 - (nt - 0.35) / 0.25 : 0, nCrack = nt < 0.35 ? 0 : nt < 0.6 ? (nt - 0.35) / 0.25 : 1;
    const crDense = 0.1 + 1.9 * Math.max(0, Math.min(1, (nt - 0.35) / 0.65));   // sparse where crackle first appears, growing steadily to the top
    const cDk = 1 - Math.exp(-TAU * 900 / sr), cBr = 1 - Math.exp(-TAU * 9000 / sr), crP = 0.0025 * 48000 / sr * crDense;

    /* ---- OTT ---- */
    // Three bands, each pulled toward a target level: downward above it, upward below it.
    // Very quiet material (below about -80 dB) is left alone so silence doesn't turn into hiss.
    const od = v[I.ottdepth] * 1.5, otime = v[I.otttime], oout = Math.pow(10, v[I.ottout] / 20);
    const oAtk = 1 - Math.exp(-1 / (0.002 * otime * sr)), oRel = 1 - Math.exp(-1 / (0.07 * otime * sr));
    const OT = [-26, -24, -30];
    const ottGain = (b, e) => {   // per-band gain from its level: squash above the target, lift below it
      const lv = 10 * Math.log10(e + 1e-12), t = OT[b];
      const down = lv > t ? (t + (lv - t) / 10) - lv : 0;
      const gate = Math.max(0, Math.min(1, (lv + 80) / 10));
      const up = lv < t ? Math.min(30, (t - (t - lv) / 3) - lv) * gate : 0;
      return Math.pow(10, Math.min(24, od * (down + up + 8)) / 20);   // lift capped at +24 dB
    };
    const gFall = 0.25, gRise = 1 - Math.exp(-1 / (0.02 * otime * sr));
    const xa = f => { const g = Math.tan(Math.PI * f / sr), a1 = 1 / (1 + g * (g + Math.SQRT2)); return [a1, g * a1, g * g * a1]; };
    const [x1a, x1b, x1c] = xa(v[I.ottlo]), [x2a, x2b, x2c] = xa(v[I.otthi]);
    const lmC = 1 - Math.exp(-1 / (0.3 * sr));
    const compT = Math.max(0.25, Math.min(4, Math.sqrt((this.oInE + 1e-9) / (this.oOutE + 1e-9))));
    if ((this.oRep += len) >= 1024) {   // band levels for the OTT picture
      this.oRep = 0;
      this.reports.push({ type:'ott', lv: [0, 1, 2].map(b => 10 * Math.log10(this.oEnv[b] + 1e-12)), g: [0, 1, 2].map(b => 20 * Math.log10(this.oGain[b]) + [v[I.ottgl], v[I.ottgm], v[I.ottgh]][b] + 20 * Math.log10(this.oComp)) });
    }
    const bgL = Math.pow(10, v[I.ottgl] / 20), bgM = Math.pow(10, v[I.ottgm] / 20), bgH = Math.pow(10, v[I.ottgh] / 20);

    const fs = this.fs, mdL = this.mdL, mdR = this.mdR, mdM = this.mdN - 1;
    const rvM = this.rvN - 1, rv = this.rv, rvLen = this.rvLen, rvLp = this.rvLp, rvG = this.rvG, rvT = this.rvT, xo = this.xo;
    const lfM = this.lfN - 1, dlMaxM = this.dlMax - 1;

    const BY = this.by, BT = this.byT, byC = this.byC;
    for (let s = 0; s < len; s++) {
      let xL = L[p + s], xR = R[p + s];
      for (let k = 0; k < 7; k++) BY[k] += (BT[k] - BY[k]) * byC;

      const bL0 = xL, bR0 = xR;
      /* drive (4x oversampled) */
      {
        const XL = this.drXL, XR = this.drXR;
        for (let j = 8; j > 0; j--) { XL[j] = XL[j - 1]; XR[j] = XR[j - 1]; }
        XL[0] = xL; XR[0] = xR;
        let zw = this.drZw;
        for (let k = 0; k < 4; k++) {
          let uL = 0, uR = 0;
          for (let j = 0, t = k; t < 33; j++, t += 4) { uL += H[t] * XL[j]; uR += H[t] * XR[j]; }
          this.drZL[zw] = REF * shape(dg * 4 * uL / REF) * dcomp;
          this.drZR[zw] = REF * shape(dg * 4 * uR / REF) * dcomp;
          zw = zw === 32 ? 0 : zw + 1;
        }
        this.drZw = zw;
        let yL = 0, yR = 0;
        for (let t = 0, q = zw === 0 ? 32 : zw - 1; t < 33; t++, q = q === 0 ? 32 : q - 1) { yL += H[t] * this.drZL[q]; yR += H[t] * this.drZR[q]; }
        this.drLpL += (yL - this.drLpL) * dLpC; this.drLpR += (yR - this.drLpR) * dLpC;
        // DC blocker (the warm curve is asymmetric)
        const dL = this.drLpL - this.drDcXL + 0.9995 * this.drDcYL; this.drDcXL = this.drLpL; this.drDcYL = dL;
        const dR = this.drLpR - this.drDcXR + 0.9995 * this.drDcYR; this.drDcXR = this.drLpR; this.drDcYR = dR;
        const dw = this.drDw, dryL = this.drDL[dw], dryR = this.drDR[dw];   // dry delayed to match the filters
        this.drDL[dw] = xL; this.drDR[dw] = xR; this.drDw = (dw + 1) & 7;
        xL = dryL + (dL - dryL) * dmix; xR = dryR + (dR - dryR) * dmix;
      }

      xL = bL0 + (xL - bL0) * BY[0]; xR = bR0 + (xR - bR0) * BY[0];   // bypass crossfade
      const bL1 = xL, bR1 = xR;
      /* formant */
      {
        let wL = 0, wR = 0;
        for (let b = 0; b < 3; b++) {
          const o = b * 4;
          let v3 = xL - fs[o + 1], v1 = fa1[b] * fs[o] + fa2[b] * v3, v2 = fs[o + 1] + fa2[b] * fs[o] + fa3[b] * v3;
          fs[o] = 2 * v1 - fs[o]; fs[o + 1] = 2 * v2 - fs[o + 1]; wL += v1 * fk * fGain[b];
          v3 = xR - fs[o + 3]; v1 = fa1[b] * fs[o + 2] + fa2[b] * v3; v2 = fs[o + 3] + fa2[b] * fs[o + 2] + fa3[b] * v3;
          fs[o + 2] = 2 * v1 - fs[o + 2]; fs[o + 3] = 2 * v2 - fs[o + 3]; wR += v1 * fk * fGain[b];
        }
        xL += (wL * fMake - xL) * fmix; xR += (wR * fMake - xR) * fmix;
      }

      xL = bL1 + (xL - bL1) * BY[1]; xR = bR1 + (xR - bR1) * BY[1];   // bypass crossfade
      const bL2 = xL, bR2 = xR;
      /* modulation */
      {
        for (let k = 0; k < 9; k++) S[k] += (T[k] - S[k]) * 0.002;
        const base = S[0], dep = S[1], g1 = S[2], g2 = S[3], ph = S[4], fbD = S[5], fbP = S[6], octs = S[7], mmix = S[8];
        const w = this.mdW;
        mdL[w] = xL + this.fbL * fbD; mdR[w] = xR + this.fbR * fbD;
        let dL = 0, dR = 0;
        const gs = [1, g1, g2];
        for (let j = 0; j < 3; j++) {
          const gj = gs[j]; if (gj <= 1e-4) continue;
          const phs = this.lfo + j / 3;
          const rl = readF(mdL, mdM, w - (base + dep * 0.5 * (1 + Math.sin(TAU * phs))) * msr);
          const rr = readF(mdR, mdM, w - (base + dep * 0.5 * (1 + Math.sin(TAU * (phs + 0.25)))) * msr);
          if (j === 0) { this.fbL = Math.tanh(rl); this.fbR = Math.tanh(rr); }
          dL += rl * gj; dR += rr * gj;
        }
        const nrm = 1 / Math.sqrt(1 + g1 * g1 + g2 * g2);
        dL *= nrm; dR *= nrm;
        // phaser: six first-order all-passes, swept per sample, feedback soft-limited
        const tL = Math.tan(Math.PI * Math.min(sr * 0.45, 200 * Math.pow(2, octs * (0.5 + 0.5 * Math.sin(TAU * this.lfo)))) / sr);
        const tR = Math.tan(Math.PI * Math.min(sr * 0.45, 200 * Math.pow(2, octs * (0.5 + 0.5 * Math.sin(TAU * (this.lfo + 0.25))))) / sr);
        const aL = (tL - 1) / (tL + 1), aR = (tR - 1) / (tR + 1);
        let pL = xL + Math.tanh(this.phL * fbP), pR = xR + Math.tanh(this.phR * fbP);
        for (let k = 0; k < 6; k++) {
          let y = aL * pL + this.apL[k]; this.apL[k] = pL - aL * y; pL = y;
          y = aR * pR + this.apR[k]; this.apR[k] = pR - aR * y; pR = y;
        }
        this.phL = pL; this.phR = pR;
        const wL = dL + (pL - dL) * ph, wR = dR + (pR - dR) * ph;
        this.mdW = (w + 1) & mdM; this.lfo += lfoInc; if (this.lfo >= 1) this.lfo -= 1;
        xL += (wL - xL) * 0.5 * mmix; xR += (wR - xR) * 0.5 * mmix;   // full mix = equal dry and wet
      }

      xL = bL2 + (xL - bL2) * BY[2]; xR = bR2 + (xR - bR2) * BY[2];   // bypass crossfade
      const bL3 = xL, bR3 = xR;
      /* delay: 12 lines in parallel, one per division */
      {
        const w = this.dlW, inL = xL * (1 - pp) + (xL + xR) * 0.5 * pp, inR = xR * (1 - pp);
        let oL = 0, oR = 0;
        for (let i = 0; i < 12; i++) {
          const d = dls[i];
          d.wIn += (d.inT - d.wIn) * xfc; d.wOut += (d.outT - d.wOut) * xfc;
          d.t += (d.tgt - d.t) * 0.0003;   // only moves when the tempo changes
          const eL = readF(d.L, d.m, w - d.t), eR = readF(d.R, d.m, w - d.t);
          d.lpL += (eL - d.lpL) * dtc; d.lpR += (eR - d.lpR) * dtc;
          d.hpL += (d.lpL - d.hpL) * dth; d.hpR += (d.lpR - d.hpR) * dth;
          const fL = d.lpL - d.hpL, fR = d.lpR - d.hpR;
          d.L[w & d.m] = inL * d.wIn + dfb * Math.tanh(fL + (fR - fL) * pp);
          d.R[w & d.m] = inR * d.wIn + dfb * Math.tanh(fR + (fL - fR) * pp);
          oL += fL * d.wOut; oR += fR * d.wOut;
        }
        this.dlW = (w + 1) & dlMaxM;
        xL = xL * (1 - 0.5 * dlmix) + oL * dlmix; xR = xR * (1 - 0.5 * dlmix) + oR * dlmix;
      }

      xL = bL3 + (xL - bL3) * BY[3]; xR = bR3 + (xR - bR3) * BY[3];   // bypass crossfade
      const bL4 = xL, bR4 = xR;
      /* reverb */
      {
        const w = this.rvW;
        let inp = (xL + xR) * 0.5;
        for (let j = 0; j < 4; j++) {
          const b = this.rvAp[j], m = b.length - 1, d = b[(w - this.rvApLen[j]) & m], y = -0.6 * inp + d;
          b[w & m] = inp + 0.6 * y; inp = y;
        }
        let sum = 0;
        for (let i = 0; i < 8; i++) {
          rvLen[i] += (rvT[i] - rvLen[i]) * 0.0005;
          const y = readF(rv[i], rvM, w - rvLen[i]);
          rvLp[i] += (y - rvLp[i]) * rdc; sum += rvLp[i];
        }
        sum *= 0.25;
        for (let i = 0; i < 8; i++) rv[i][w & rvM] = inp * (i & 1 ? 0.5 : -0.5) + rvG[i] * (rvLp[i] - sum);
        this.rvW = (w + 1) & rvM;
        const oL = (rvLp[0] - rvLp[2] + rvLp[4] - rvLp[6]) * 0.6, oR = (rvLp[1] - rvLp[3] + rvLp[5] - rvLp[7]) * 0.6;
        xL = xL * (1 - 0.5 * rmix) + oL * rmix; xR = xR * (1 - 0.5 * rmix) + oR * rmix;
      }

      xL = bL4 + (xL - bL4) * BY[4]; xR = bR4 + (xR - bR4) * BY[4];   // bypass crossfade
      const bL5 = xL, bR5 = xR;
      /* lo-fi: wow and flutter, tape character, noise */
      {
        const w = this.lfW;
        this.lfL[w] = xL; this.lfR[w] = xR;
        this.drift += (this.driftT - this.drift) * 0.00005;
        const wobble = wowD * (0.5 + 0.5 * Math.sin(TAU * this.wowPh)) + wowD * 0.4 * this.drift
          + flD * (Math.sin(TAU * this.flPh1) + 0.5 * Math.sin(TAU * this.flPh2));
        const target = (6 + wobble) * msr;
        if (this.lfD < 0) this.lfD = target;
        this.lfD += (target - this.lfD) * 0.01;
        xL = readF(this.lfL, lfM, w - this.lfD); xR = readF(this.lfR, lfM, w - this.lfD);
        this.lfW = (w + 1) & lfM;
        this.wowPh += wowInc; if (this.wowPh >= 1) this.wowPh -= 1;
        this.flPh1 += fl1Inc; if (this.flPh1 >= 1) this.flPh1 -= 1;
        this.flPh2 += fl2Inc; if (this.flPh2 >= 1) this.flPh2 -= 1;
        // character
        {
          const B = this.lfBpL, C = this.lfBpR;
          let v3 = xL - B[1], v1 = ba1 * B[0] + ba2 * v3, v2 = B[1] + ba2 * B[0] + ba3 * v3; B[0] = 2 * v1 - B[0]; B[1] = 2 * v2 - B[1];
          xL += v1 * bk * bump;
          v3 = xR - C[1]; v1 = ba1 * C[0] + ba2 * v3; v2 = C[1] + ba2 * C[0] + ba3 * v3; C[0] = 2 * v1 - C[0]; C[1] = 2 * v2 - C[1];
          xR += v1 * bk * bump;
          xL = (Math.tanh(cg * xL + cA) - cTa) * cOut; xR = (Math.tanh(cg * xR + cA) - cTa) * cOut;
          this.lfLpL += (xL - this.lfLpL) * lLpC; this.lfLpR += (xR - this.lfLpR) * lLpC;
          xL = this.lfLpL; xR = this.lfLpR;
        }
        // dropouts
        {
          this.dpG += (this.dpT - this.dpG) * (this.dpT < this.dpG ? dpDn : dpUp);
          this.dpLpL += (xL - this.dpLpL) * dpLpC; this.dpLpR += (xR - this.dpLpR) * dpLpC;
          const dull = 1 - this.dpG;
          xL = (xL + (this.dpLpL - xL) * dull) * this.dpG; xR = (xR + (this.dpLpR - xR) * dull) * this.dpG;
        }
        // codec: spectral holes, band-limiting and coarse levels, like a low-bitrate MP3
        {
          const ri = (this.cT - 512) & 1023;
          const oL = this.cOlaL[ri], oR = this.cOlaR[ri]; this.cOlaL[ri] = 0; this.cOlaR[ri] = 0;
          this.cInL[this.cPos] = xL; this.cInR[this.cPos] = xR; this.cPos = (this.cPos + 1) & 511;
          this.cT = (this.cT + 1) & 1023;
          if (++this.cHop === 256) { this.cHop = 0; this.codecFrame(this.cInL, this.cOlaL); this.codecFrame(this.cInR, this.cOlaR); }
          this.cXf += (cXfT - this.cXf) * cXfC;
          xL += (oL - xL) * this.cXf; xR += (oR - xR) * this.cXf;
        }
        if (ngain > 0) {
          const wL = this.rand() * 2 - 1, wR = this.rand() * 2 - 1;
          this.nDkL += (wL - this.nDkL) * cDk; this.nDkR += (wR - this.nDkR) * cDk;
          this.nBrL += (wL - this.nBrL) * cBr; this.nBrR += (wR - this.nBrR) * cBr;
          if (this.rand() < crP) { const a = Math.pow(this.rand(), 3) * (this.rand() < 0.5 ? -1 : 1); if (this.rand() < 0.5) this.crL += a; else this.crR += a; }
          this.crLp += ((this.rand() * 2 - 1) * 0.25 - this.crLp) * 0.05;   // faint surface bed under the clicks
          const nL = this.nDkL * 1.5 * nDark + this.nBrL * 0.5 * nBright + (this.crL * 9 + this.crLp * 5) * nCrack;
          const nR = this.nDkR * 1.5 * nDark + this.nBrR * 0.5 * nBright + (this.crR * 9 + this.crLp * 5) * nCrack;
          this.crL *= 0.55; this.crR *= 0.55;
          xL += nL * ngain; xR += nR * ngain;
        }
      }

      xL = bL5 + (xL - bL5) * BY[5]; xR = bR5 + (xR - bR5) * BY[5];   // bypass crossfade
      const bL6 = xL, bR6 = xR;
      /* OTT: low / mid / high always sum back to the input; each band is squashed toward its target */
      {
        const lp = (x, o, a1, a2, a3) => { const v3 = x - xo[o + 1], v1 = a1 * xo[o] + a2 * v3, v2 = xo[o + 1] + a2 * xo[o] + a3 * v3; xo[o] = 2 * v1 - xo[o]; xo[o + 1] = 2 * v2 - xo[o + 1]; return v2; };
        const loL = lp(xL, 0, x1a, x1b, x1c), loR = lp(xR, 2, x1a, x1b, x1c);
        const rL = xL - loL, rR = xR - loR;
        const miL = lp(rL, 4, x2a, x2b, x2c), miR = lp(rR, 6, x2a, x2b, x2c);
        const hiL = rL - miL, hiR = rR - miR;
        const e0 = Math.max(loL * loL, loR * loR), e1 = Math.max(miL * miL, miR * miR), e2 = Math.max(hiL * hiL, hiR * hiR);
        const E = this.oEnv, G = this.oGain;
        E[0] += (e0 > E[0] ? oAtk : oRel) * (e0 - E[0]);
        E[1] += (e1 > E[1] ? oAtk : oRel) * (e1 - E[1]);
        E[2] += (e2 > E[2] ? oAtk : oRel) * (e2 - E[2]);
        // Gain drops land at once and rises ease in, and the audio runs 1.5 ms behind the detector, so a
        // note arriving after a quiet gap is caught before its first peak instead of getting the gap's lift.
        for (let b = 0; b < 3; b++) { const tg = ottGain(b, E[b]); G[b] += (tg - G[b]) * (tg < G[b] ? gFall : gRise); }
        const la = this.oLa, lw = this.oLaW, lr = (lw - this.oLaN) & 127;
        la[0][lw] = loL; la[1][lw] = miL; la[2][lw] = hiL; la[3][lw] = loR; la[4][lw] = miR; la[5][lw] = hiR;
        this.oLaW = (lw + 1) & 127;
        const dxL = la[0][lr] + la[1][lr] + la[2][lr], dxR = la[3][lr] + la[4][lr] + la[5][lr];   // delayed input, for the level match
        let yL = la[0][lr] * G[0] * bgL + la[1][lr] * G[1] * bgM + la[2][lr] * G[2] * bgH, yR = la[3][lr] * G[0] * bgL + la[4][lr] * G[1] * bgM + la[5][lr] * G[2] * bgH;
        // Level match: OTT changes the dynamics, not the overall loudness. Slow averages of the level going in
        // and coming out set a correction (within ±12 dB), so Depth doesn't swing the volume around.
        this.oInE += (dxL * dxL + dxR * dxR - this.oInE) * lmC; this.oOutE += (yL * yL + yR * yR - this.oOutE) * lmC;
        this.oComp += (compT - this.oComp) * lmC;
        xL = yL * this.oComp * oout; xR = yR * this.oComp * oout;
      }
      xL = bL6 + (xL - bL6) * BY[6]; xR = bR6 + (xR - bR6) * BY[6];   // bypass crossfade
      L[p + s] = xL; R[p + s] = xR;
    }
  }

  /* ---------- per-block work ---------- */
  resolve() {
    const m = this.morph, defs = this.defs;
    this.mSm = this.first ? m : this.mSm + (m - this.mSm) * 0.08;
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      const mm = MorphEngine.bend(m, this.C[i]);
      let target = d.snap ? (mm < 0.5 ? this.A[i] : this.B[i]) : this.A[i] + (this.B[i] - this.A[i]) * mm;
      if (this.first || d.snap || d.curve === 'int') this.cur[i] = target;
      else this.cur[i] += (target - this.cur[i]) * 0.08;   // de-zipper
      this.val[i] = MorphEngine.denorm(d, this.cur[i]);
    }
    this.first = false;
  }
  build() {
    const tA = this.tables.A, tB = this.tables.B;
    if (!tA || !tB) return false;
    // Each table is read at its own position (these never morph). The Wave value, which does
    // morph and has its own curve, sets how much of B's shape is in the blend.
    const v = this.val, I = this.I;
    MorphEngine.frameAt(tA, v[I.posA], this.spectral, this.fa[0], this.fa[1]);
    MorphEngine.frameAt(tB, v[I.posB], this.spectral, this.fb[0], this.fb[1]);
    MorphEngine.interp(this.fa[0], this.fa[1], this.fb[0], this.fb[1], v[I.wave], this.spectral, this.fr[0], this.fr[1]);
    const t = this.bankPrev; this.bankPrev = this.bankCur; this.bankCur = t;
    for (let k = 0; k < 10; k++) {
      const out = this.bankCur[k], N = out.length - 1;
      MorphEngine.synth(this.fr[0], this.fr[1], 512 >> k, N, out, this.scr[k][0], this.scr[k][1]);
      out[N] = out[0];
    }
    return true;
  }
  maybeBuild(len) {
    this.since += len;
    if (!this.tables.A || !this.tables.B) return;
    const v = this.val, I = this.I;
    const key = v[I.posA].toFixed(4) + '|' + v[I.posB].toFixed(4) + '|' + v[I.wave].toFixed(4) + '|' + this.tabVer;
    if (!this.bankReady) {
      if (this.build()) {
        for (let k = 0; k < 10; k++) this.bankPrev[k].set(this.bankCur[k]);
        this.bankReady = true; this.xf = 1; this.lastKey = key; this.since = 0;
      }
      return;
    }
    // rebuild at most every 512 samples, crossfading from the previous tables
    if (key !== this.lastKey && this.since >= 512 && this.xf >= 1) {
      this.build(); this.lastKey = key; this.since = 0; this.xf = 0; this.xfInc = 1 / 512;
    }
  }
  render(L, R, n) {
    const sr = this.sr, I = this.I;
    let p = 0;
    while (p < n) {
      const len = Math.min(16, n - p);
      this.resolve();
      this.seqRun(len);
      this.maybeBuild(len);
      if (this.bankReady) {
        const v = this.val;
        const tune = v[I.octave] * 12 + v[I.fine] / 100;
        // Unison as a wet amount: the center voice always plays; the inner pair fades in over
        // the first third, the middle pair over the second, the outer pair over the last.
        const uAmt = v[I.unison];   // one control: more voices and a wider spread together
        let uni = 0, pw = 0;
        for (let j = 0; j < 7; j++) {
          const pair = Math.abs(j - 3), gain = pair === 0 ? 1 : Math.max(0, Math.min(1, uAmt * 3 - (pair - 1)));
          if (gain <= 0) continue;
          const off = (j - 3) / 3;
          this.uJ[uni] = j; this.uOff[uni] = off * uAmt * 0.5;   // up to ±50 cents at full
          const a = (off * 0.7 + 1) * Math.PI / 4;
          this.uL[uni] = Math.cos(a) * Math.SQRT2 * gain; this.uR[uni] = Math.sin(a) * Math.SQRT2 * gain;
          pw += gain * gain; uni++;
        }
        const ug = 1 / Math.sqrt(pw);
        for (let j = 0; j < uni; j++) { this.uL[j] *= ug; this.uR[j] *= ug; }
        const glide = v[I.glide], gK = glide > 0.0005 ? 1 - Math.exp(-len / (glide * sr / 4)) : 1;
        const cutoff = v[I.cutoff], k = 2 - 1.96 * v[I.reso], envAmt = v[I.envamt], kt = v[I.keytrack];
        const bpG = Math.sqrt(k * 2);
        const md = v[I.mode];
        let wl, wb, wh;
        if (md < 0.5) { const t = md * 2; wl = 1 - t; wb = t; wh = 0; } else { const t = (md - 0.5) * 2; wl = 0; wb = 1 - t; wh = t; }
        const aInc = 1 / (v[I.aatk] * sr), aD = Math.exp(-5 / (v[I.adec] * sr)), aS = v[I.asus], aR = Math.exp(-6.9 / (v[I.arel] * sr));
        const fInc = 1 / (v[I.fatk] * sr), fD = Math.exp(-5 / (v[I.fdec] * sr)), fS = v[I.fsus], fR = Math.exp(-6.9 / (v[I.frel] * sr));
        const pa = (v[I.pan] + 1) * Math.PI / 4;
        const gl = Math.cos(pa) * Math.SQRT2 * v[I.level] * 0.2, gr = Math.sin(pa) * Math.SQRT2 * v[I.level] * 0.2;
        // Level and Pan glide per sample from the last sub-block's gain, so changes never step every 16 samples
        if (this.gL < 0) { this.gL = gl; this.gR = gr; }
        const gl0 = this.gL, gr0 = this.gR, glI = (gl - gl0) / len, grI = (gr - gr0) / len;
        this.gL = gl; this.gR = gr;
        const xf0 = this.xf, xfI = this.xfInc;
        const uL = this.uL, uR = this.uR, uDt = this.uDt, uLev = this.uLev, uJ = this.uJ;

        for (const vc of this.voices) {
          if (!vc.active) continue;
          vc.pitch += (vc.note - vc.pitch) * gK;
          // vibrato: depth fades in over the fade time; the rate can start fast and slow down, or the reverse
          const vT = vc.vAge / sr, vF = v[I.vfade], vEnv = vF < 0.005 ? 1 : Math.min(1, vT / vF), rEnv = Math.min(1, vT / Math.max(0.005, v[I.vrtime]));
          const vRate = Math.max(0.1, v[I.vrate] + v[I.vrfade] * (1 - rEnv));   // Rate fade is in Hz: the rate starts that far off and settles
          const vib = v[I.vdepth] * vEnv * Math.sin(2 * Math.PI * vc.vPh);
          vc.vPh += vRate * len / sr; if (vc.vPh >= 1) vc.vPh -= 1; vc.vAge += len;
          const base = vc.pitch + tune + vib;
          for (let j = 0; j < uni; j++) {
            const dt = 440 * Math.pow(2, (base + this.uOff[j] - 69) / 12) / sr;
            uDt[j] = dt;
            let lev = Math.ceil(Math.log2(512 * dt / 0.45));
            uLev[j] = lev < 0 ? 0 : lev > 9 ? 9 : lev;
          }
          const fc = Math.min(sr * 0.45, Math.max(20, cutoff * Math.pow(2, envAmt * 5 * vc.fLv + kt * (vc.pitch - 60) / 12)));
          const g = Math.tan(Math.PI * fc / sr), a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
          let aSt = vc.aSt, aLv = vc.aLv, fSt = vc.fSt, fLv = vc.fLv, l1 = vc.l1, l2 = vc.l2, r1 = vc.r1, r2 = vc.r2;
          const ph = vc.ph, vel = vc.vel;
          for (let s = 0; s < len; s++) {
            const xf = Math.min(1, xf0 + xfI * s);
            let sl = 0, sr2 = 0;
            for (let j = 0; j < uni; j++) {
              const bc = this.bankCur[uLev[j]], bp = this.bankPrev[uLev[j]], N = bc.length - 1;
              const pj = uJ[j];
              let q = ph[pj];
              const pos = q * N, i = pos | 0, fr = pos - i;
              const c = bc[i] + (bc[i + 1] - bc[i]) * fr, o = bp[i] + (bp[i + 1] - bp[i]) * fr;
              const x = o + (c - o) * xf;
              sl += x * uL[j]; sr2 += x * uR[j];
              q += uDt[j]; if (q >= 1) q -= 1; ph[pj] = q;
            }
            if (aSt === 1) { aLv += aInc; if (aLv >= 1) { aLv = 1; aSt = 2; } } else if (aSt === 2) aLv = aS + (aLv - aS) * aD; else aLv *= aR;
            if (fSt === 1) { fLv += fInc; if (fLv >= 1) { fLv = 1; fSt = 2; } } else if (fSt === 2) fLv = fS + (fLv - fS) * fD; else fLv *= fR;
            let v3 = sl - l2, v1 = a1 * l1 + a2 * v3, v2 = l2 + a2 * l1 + a3 * v3;
            l1 = 2 * v1 - l1; l2 = 2 * v2 - l2;
            const oL = wl * v2 + wb * v1 * bpG + wh * (sl - k * v1 - v2);
            v3 = sr2 - r2; v1 = a1 * r1 + a2 * v3; v2 = r2 + a2 * r1 + a3 * v3;
            r1 = 2 * v1 - r1; r2 = 2 * v2 - r2;
            const oR = wl * v2 + wb * v1 * bpG + wh * (sr2 - k * v1 - v2);
            const amp = aLv * vel;
            L[p + s] += oL * amp * (gl0 + glI * (s + 1)); R[p + s] += oR * amp * (gr0 + grI * (s + 1));
          }
          vc.aSt = aSt; vc.aLv = aLv; vc.fSt = fSt; vc.fLv = fLv; vc.l1 = l1; vc.l2 = l2; vc.r1 = r1; vc.r2 = r2;
          if (aSt === 3 && aLv < 3e-4) vc.active = false;
        }
        this.xf = Math.min(1, this.xf + this.xfInc * len);
      }
      this.fx(L, R, p, len);
      p += len;
    }
    for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i]); R[i] = Math.tanh(R[i]); }
  }
}


