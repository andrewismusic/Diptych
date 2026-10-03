/* =====================================================================
   DSP ENGINE
   Runs in an AudioWorklet when possible, otherwise on the main thread.
   Parameters arrive normalized and resolve every 16 samples as
   lerp(A, B, bend(morph, curve)); only the parameters of each slot's
   current type are resolved.

   Signal flow per voice: 4 oscillator slots (Off / Wavetable / Sampler / Sub)
   -> each slot splits between the filter and around it (Bypass) -> amp
   envelope -> master Level and Pan. Then the 4 FX slots in order,
   and a final tanh soft clip.

   MorphEngine and the classes in the other engine files are stringified
   into the AudioWorklet (see audio.js), so they must stay self-contained:
   they may refer to each other, but to nothing else on the page.
   ===================================================================== */
class MorphEngine {
  constructor(sr, defs) {
    this.sr = sr; this.defs = defs;
    const n = defs.length;
    this.A = new Float32Array(n); this.B = new Float32Array(n); this.C = new Float32Array(n);
    this.cur = new Float32Array(n); this.val = new Float32Array(n);
    this.act = new Uint8Array(n); this.fresh = new Uint8Array(n);
    this.morph = 0; this.first = true; this.clock = 0; this.lastPitch = -1;
    this.I = {}; defs.forEach((d, i) => { this.I[d.id] = i; });
    // per-slot key -> index maps: oscillator slots and FX slots
    const keyMap = (kind, slot) => { const m = {}; defs.forEach((d, i) => { if (d.kind === kind && d.slot === slot) m[d.key] = i; }); return m; };
    this.oP = [0, 1, 2, 3].map(s => keyMap('osc', s));
    this.xP = [0, 1, 2, 3].map(s => keyMap('fx', s));
    // oscillator slots: type, pending type, and a fade used to switch types without clicks
    this.oscType = ['off', 'off', 'off', 'off']; this.oscNext = [null, null, null, null];
    this.oFade = new Float64Array(4);
    this.cPrev = new Float64Array(16); this.cNext = new Float64Array(16); this.cD = new Float64Array(16);   // per slot: into the filter L/R, around it L/R
    this.banks = [0, 1, 2, 3].map(() => new WtBank());
    this.uL = new Float32Array(28); this.uR = new Float32Array(28); this.uOff = new Float32Array(28);
    this.uDt = new Float32Array(28); this.uLev = new Int32Array(28); this.uJ = new Int32Array(28); this.uN = new Int32Array(4);
    this.tune = new Float64Array(4); this.sdt = new Float64Array(4);
    this.sShape = new Float64Array(4); this.sG = new Float64Array(4); this.sTg = new Float64Array(4);
    this.slList = new Int32Array(4); this.slKind = new Int32Array(4);
    // Sampler per slot: a buffer per side ({ d, sr } or null), Loop, and per-block settings
    this.smp = [0, 1, 2, 3].map(() => ({ A: null, B: null })); this.smpLoop = [false, false, false, false];
    this.smpMix = new Float64Array(4); this.smpTrk = new Float64Array(4); this.smpRA = new Float64Array(4); this.smpRB = new Float64Array(4);
    this.gL = -1; this.gR = -1;   // master gain (Level, Pan) at the end of the last sub-block; -1 = not set yet
    this.voices = [];
    for (let k = 0; k < 8; k++) this.voices.push({ active:false, note:0, vel:0, pitch:0, age:0, aSt:0, aLv:0, fSt:0, fLv:0,
      ph:new Float64Array(28), sph:new Float64Array(4), flt:new Float64Array(4), vAge:0, vPh:0,
      sp:new Float64Array(8), op:new Float64Array(8), sxf:new Int32Array(4), sold:new Uint8Array(4) });   // sampler: positions, old positions and crossfade on restart
    // FX slots: instance, type, pending type, On/Off and the crossfade to dry used for On/Off and type switches
    this.fxInst = [null, null, null, null]; this.fxType = [null, null, null, null]; this.fxNext = [null, null, null, null];
    this.fxOn = [true, true, true, true]; this.fxBy = new Float64Array(4); this.dlSpill = [false, false, false, false];
    this.byC = 1 - Math.exp(-1 / (0.015 * sr)); this.swStep = 1 / (0.015 * sr);   // On/Off: ~15 ms glide; type switch: 15 ms linear fade to dry
    this.dryL = new Float32Array(16); this.dryR = new Float32Array(16);
    // sequencer
    this.seq = null; this.playing = false; this.bpm = 120; this.walk = true;
    this.spos = 0; this.ei = 0; this.stick = 0; this.offs = []; this.reports = []; this.repCount = 0;
    this.mono = false; this.stack = [];
    this.computeActive();
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
  static get FX_CLASSES() { return { drive: FxDrive, formant: FxFormant, mod: FxModulation, delay: FxDelay, reverb: FxReverb, lofi: FxLofi, ott: FxOtt }; }

  /* ---------- slots ---------- */
  // Only parameters of each slot's current (or incoming) type are resolved. A parameter that becomes
  // active jumps straight to its value instead of gliding from a stale one.
  computeActive() {
    const ok = (d, t) => t !== null && t !== 'off' && (!d.eng || d.eng === t);
    this.defs.forEach((d, i) => {
      let a = 1;
      if (d.kind === 'osc') a = ok(d, this.oscType[d.slot]) || ok(d, this.oscNext[d.slot]) ? 1 : 0;
      else if (d.kind === 'fx') a = d.eng === this.fxType[d.slot] || d.eng === this.fxNext[d.slot] ? 1 : 0;
      if (a && !this.act[i]) this.fresh[i] = 1;
      this.act[i] = a;
    });
  }
  swapOsc(s, t) {
    this.oscType[s] = t; this.oscNext[s] = null;
    for (const v of this.voices) { for (let j = 0; j < 7; j++) v.ph[s * 7 + j] = Math.random(); v.sph[s] = 0; this.smpStart(v, s, false); }
    this.computeActive();
  }
  /* (Re)start a voice's sample playback in slot s at the Start point. When a sounding note restarts, the old
     playback crossfades out over 5 ms (and a fresh one fades in), so restarts don't click. */
  smpStart(v, s, keepOld) {
    const st = this.val[this.oP[s].sstart] || 0, XN = Math.round(0.005 * this.sr);
    for (const k of [0, 1]) { const b = this.smp[s][k ? 'B' : 'A'], q = s * 2 + k; v.op[q] = v.sp[q]; v.sp[q] = b ? st * (b.d.length - 1) : 0; }
    v.sold[s] = keepOld ? 1 : 0; v.sxf[s] = XN;
  }
  makeFx(type, s) { return new (MorphEngine.FX_CLASSES[type])(this.sr, this, s); }

  /* ---------- messages ---------- */
  handle(m) {
    switch (m.type) {
      case 'state': this.A.set(m.A); this.B.set(m.B); if (m.C) this.C.set(m.C); this.morph = m.morph; break;
      case 'param': (m.side === 'A' ? this.A : this.B)[m.i] = m.v; break;
      case 'curve': this.C[m.i] = m.v; break;
      case 'morph': this.morph = m.v; break;
      case 'slots':
        for (let s = 0; s < 4; s++) {
          const o = m.osc[s];
          if (o === this.oscType[s]) this.oscNext[s] = null;
          else if (this.oscType[s] === 'off' && this.oFade[s] <= 0) this.swapOsc(s, o);   // nothing sounding: switch at once
          else this.oscNext[s] = o;
          const f = m.fx[s];
          if (!this.fxInst[s]) { this.fxInst[s] = this.makeFx(f, s); this.fxType[s] = f; this.fxBy[s] = this.fxOn[s] ? 1 : 0; }
          else this.fxNext[s] = f === this.fxType[s] ? null : f;
        }
        this.computeActive();
        break;
      case 'table': this.banks[m.slot].setTable(m.side, m.re, m.im); break;
      case 'sample': this.smp[m.slot][m.side] = m.d ? { d: m.d, sr: m.sr } : null; break;
      case 'smpLoop': this.smpLoop[m.i] = !!m.v; break;
      case 'blend': this.banks.forEach(b => { b.spectral = !!m.v; b.ver++; }); break;
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
      case 'dlmode': this.dlSpill[m.i] = !!m.v; break;
      case 'bypass': this.fxOn[m.i] = !!m.on; break;
      case 'on': this.noteOn(m.note, m.vel); break;
      case 'off': this.noteOff(m.note); break;
      case 'panic': this.stack = []; this.voices.forEach(v => { if (v.active) { v.aSt = 3; v.fSt = 3; } }); break;
      case 'mono': this.mono = !!m.v; this.stack = []; if (this.mono) this.voices.forEach((v, k) => { if (k && v.active) { v.aSt = 3; v.fSt = 3; } }); break;
    }
  }
  startVoice(v, note) {
    v.aLv = 0; v.fLv = 0; v.flt.fill(0);
    for (let j = 0; j < 28; j++) v.ph[j] = Math.random();
    v.sph.fill(0);
    v.pitch = this.val[this.I.glide] > 0.0005 && this.lastPitch >= 0 ? this.lastPitch : note;
  }
  noteOn(note, vel) {
    if (this.mono) {   // one voice, last note wins; releasing it falls back to a key still held
      this.stack = this.stack.filter(n => n !== note); this.stack.push(note);
      for (let k = 1; k < 8; k++) if (this.voices[k].active) { this.voices[k].aSt = 3; this.voices[k].fSt = 3; }
      const v = this.voices[0];
      const was = v.active;
      if (!v.active) this.startVoice(v, note);
      for (let s = 0; s < 4; s++) this.smpStart(v, s, was);
      v.active = true; v.note = note; v.vel = vel; v.aSt = 1; v.fSt = 1; v.vAge = 0; v.vPh = 0; this.lastPitch = note;
      return;
    }
    let v = this.voices.find(x => x.active && x.note === note);
    if (!v) v = this.voices.find(x => !x.active);
    if (!v) v = this.voices.reduce((a, b) => (a.age < b.age ? a : b));
    const was = v.active;
    if (!v.active) this.startVoice(v, note);
    for (let s = 0; s < 4; s++) this.smpStart(v, s, was);
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

  /* ---------- per-block work ---------- */
  resolve() {
    const m = this.morph, defs = this.defs, act = this.act, fresh = this.fresh;
    for (let i = 0; i < defs.length; i++) {
      if (!act[i]) continue;
      const d = defs[i];
      const mm = MorphEngine.bend(m, this.C[i]);
      const target = d.snap ? (mm < 0.5 ? this.A[i] : this.B[i]) : this.A[i] + (this.B[i] - this.A[i]) * mm;
      if (this.first || fresh[i] || d.snap || d.curve === 'int') { this.cur[i] = target; fresh[i] = 0; }
      else this.cur[i] += (target - this.cur[i]) * 0.08;   // de-zipper
      this.val[i] = MorphEngine.denorm(d, this.cur[i]);
    }
    this.first = false;
  }
  render(L, R, n) {
    const sr = this.sr;
    let p = 0;
    while (p < n) {
      const len = Math.min(16, n - p);
      this.resolve();
      this.seqRun(len);
      // oscillator type switches: fade the slot out (about 8 ms), switch once it is silent, fade back in
      const fStep = len / (0.008 * sr);
      for (let s = 0; s < 4; s++) {
        if (this.oscNext[s] !== null) {
          let silent = this.oFade[s] <= 0;
          for (let j = 0; j < 4 && silent; j++) if (this.cPrev[s * 4 + j] !== 0) silent = false;
          if (silent) this.swapOsc(s, this.oscNext[s]);
          else this.oFade[s] = Math.max(0, this.oFade[s] - fStep);
        } else if (this.oscType[s] !== 'off') this.oFade[s] = Math.min(1, this.oFade[s] + fStep);
      }
      const v = this.val;
      for (let s = 0; s < 4; s++) if (this.oscType[s] === 'wt') { const P = this.oP[s]; this.banks[s].maybeBuild(len, v[P.posA], v[P.posB], v[P.wave]); }
      this.renderVoices(L, R, p, len);
      this.renderFx(L, R, p, len);
      p += len;
    }
    for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i]); R[i] = Math.tanh(R[i]); }
  }
  renderVoices(L, R, p, len) {
    const sr = this.sr, v = this.val, I = this.I;
    // --- slots: mix coefficients (ramped per sample from the last sub-block) and per-engine setup ---
    const C0 = this.cPrev, CN = this.cNext, CD = this.cD, list = this.slList, kind = this.slKind;
    const P0 = this.oP[0], t0 = this.oscType[0];   // the Sub follows slot 1's pitch
    const tune1 = t0 === 'wt' ? v[P0.pitch] + v[P0.fine] / 100 : 0;
    let nSl = 0;
    for (let s = 0; s < 4; s++) {
      const t = this.oscType[s], P = this.oP[s], o = s * 4;
      const live = t !== 'off' && !(t === 'wt' && !this.banks[s].ready);
      if (live) {
        const lv = v[P.olevel] / 0.8 * this.oFade[s], pa = (v[P.opan] + 1) * Math.PI / 4;   // Level 80% is unity
        const pl = Math.cos(pa) * Math.SQRT2 * lv, pr = Math.sin(pa) * Math.SQRT2 * lv, byp = v[P.byp];
        CN[o] = pl * (1 - byp); CN[o + 1] = pr * (1 - byp); CN[o + 2] = pl * byp; CN[o + 3] = pr * byp;
      } else for (let j = 0; j < 4; j++) CN[o + j] = 0;
      let any = false;
      for (let j = 0; j < 4; j++) { CD[o + j] = (CN[o + j] - C0[o + j]) / len; if (C0[o + j] !== 0 || CN[o + j] !== 0) any = true; }
      if (!any || !live) continue;
      list[nSl] = s;
      if (t === 'wt') {
        kind[nSl] = 1;
        this.tune[s] = v[P.pitch] + v[P.fine] / 100;
        // Unison as a wet amount: the center voice always plays; the inner pair fades in over
        // the first third, the middle pair over the second, the outer pair over the last.
        const uAmt = v[P.unison], b = s * 7;
        let uni = 0, pw = 0;
        for (let j = 0; j < 7; j++) {
          const pair = Math.abs(j - 3), gain = pair === 0 ? 1 : Math.max(0, Math.min(1, uAmt * 3 - (pair - 1)));
          if (gain <= 0) continue;
          const off = (j - 3) / 3;
          this.uJ[b + uni] = j; this.uOff[b + uni] = off * uAmt * 0.5;   // up to ±50 cents at full
          const a = (off * 0.7 + 1) * Math.PI / 4;
          this.uL[b + uni] = Math.cos(a) * Math.SQRT2 * gain; this.uR[b + uni] = Math.sin(a) * Math.SQRT2 * gain;
          pw += gain * gain; uni++;
        }
        const ug = 1 / Math.sqrt(pw);
        for (let j = 0; j < uni; j++) { this.uL[b + j] *= ug; this.uR[b + j] *= ug; }
        this.uN[s] = uni;
      } else if (t === 'smp') {
        kind[nSl] = 4;
        this.tune[s] = v[P.spitch] + v[P.sfine] / 100;
        this.smpMix[s] = v[P.sample]; this.smpTrk[s] = v[P.strack];
      } else {
        kind[nSl] = 2;
        this.tune[s] = tune1 + v[P.soct] * 12;
        const g = 1 + 7 * v[P.sdrive];
        this.sShape[s] = v[P.sshape]; this.sG[s] = g; this.sTg[s] = Math.tanh(g);
      }
      nSl++;
    }
    // --- master gain: glides per sample from the last sub-block's value ---
    const pa = (v[I.pan] + 1) * Math.PI / 4;
    const gl = Math.cos(pa) * Math.SQRT2 * v[I.level] * 0.2, gr = Math.sin(pa) * Math.SQRT2 * v[I.level] * 0.2;
    if (this.gL < 0) { this.gL = gl; this.gR = gr; }
    const gl0 = this.gL, gr0 = this.gR, glI = (gl - gl0) / len, grI = (gr - gr0) / len;
    this.gL = gl; this.gR = gr;

    if (nSl) {
      const glide = v[I.glide], gK = glide > 0.0005 ? 1 - Math.exp(-len / (glide * sr / 4)) : 1;
      const aInc = 1 / (v[I.aatk] * sr), aD = Math.exp(-5 / (v[I.adec] * sr)), aS = v[I.asus], aR = Math.exp(-6.9 / (v[I.arel] * sr));
      const fInc = 1 / (v[I.fatk] * sr), fD = Math.exp(-5 / (v[I.fdec] * sr)), fS = v[I.fsus], fR = Math.exp(-6.9 / (v[I.frel] * sr));
      const cutoff = v[I.cutoff], fk = 2 - 1.96 * v[I.reso], bpG = Math.sqrt(fk * 2), envAmt = v[I.envamt], kt = v[I.keytrack], md = v[I.mode];
      let wl, wb, wh;
      if (md < 0.5) { const t = md * 2; wl = 1 - t; wb = t; wh = 0; } else { const t = (md - 0.5) * 2; wl = 0; wb = 1 - t; wh = t; }
      const banks = this.banks, uL = this.uL, uR = this.uR, uDt = this.uDt, uLev = this.uLev, uJ = this.uJ, uN = this.uN;

      for (const vc of this.voices) {
        if (!vc.active) continue;
        vc.pitch += (vc.note - vc.pitch) * gK;
        // vibrato: depth fades in over the fade time; the rate can start fast and slow down, or the reverse
        const vT = vc.vAge / sr, vF = v[I.vfade], vEnv = vF < 0.005 ? 1 : Math.min(1, vT / vF), rEnv = Math.min(1, vT / Math.max(0.005, v[I.vrtime]));
        const vRate = Math.max(0.1, v[I.vrate] + v[I.vrfade] * (1 - rEnv));   // Rate fade is in Hz: the rate starts that far off and settles
        const vib = v[I.vdepth] * vEnv * Math.sin(2 * Math.PI * vc.vPh);
        vc.vPh += vRate * len / sr; if (vc.vPh >= 1) vc.vPh -= 1; vc.vAge += len;
        const base = vc.pitch + vib;
        for (let a = 0; a < nSl; a++) {
          const s = list[a];
          if (kind[a] === 1) {
            for (let j = 0, b = s * 7; j < uN[s]; j++) {
              const dt = 440 * Math.pow(2, (base + this.tune[s] + this.uOff[b + j] - 69) / 12) / sr;
              uDt[b + j] = dt;
              const lev = Math.ceil(Math.log2(512 * dt / 0.45));
              uLev[b + j] = lev < 0 ? 0 : lev > 9 ? 9 : lev;
            }
          } else if (kind[a] === 4) {   // sampler: samples are at middle C; Key track scales how far notes move them
            const semi = (base - 60) * this.smpTrk[s] + this.tune[s], A = this.smp[s].A, B = this.smp[s].B;
            this.smpRA[s] = A ? Math.pow(2, semi / 12) * A.sr / sr : 0; this.smpRB[s] = B ? Math.pow(2, semi / 12) * B.sr / sr : 0;
          } else this.sdt[s] = 440 * Math.pow(2, (base + this.tune[s] - 69) / 12) / sr;
        }
        const fc = Math.min(sr * 0.45, Math.max(20, cutoff * Math.pow(2, envAmt * 5 * vc.fLv + kt * (vc.pitch - 60) / 12)));
        const g = Math.tan(Math.PI * fc / sr), fa1 = 1 / (1 + g * (g + fk)), fa2 = g * fa1, fa3 = g * fa2;
        const st = vc.flt;
        let l1 = st[0], l2 = st[1], r1 = st[2], r2 = st[3];
        let aSt = vc.aSt, aLv = vc.aLv, fSt = vc.fSt, fLv = vc.fLv;
        const ph = vc.ph, sph = vc.sph, vel = vc.vel;
        for (let s = 0; s < len; s++) {
          const t = s + 1;
          let iL = 0, iR = 0, dL = 0, dR = 0;
          for (let a = 0; a < nSl; a++) {
            const sl = list[a], o = sl * 4;
            let xl, xr;
            if (kind[a] === 1) {
              const bk = banks[sl], xf = Math.min(1, bk.xf + bk.xfInc * s), b = sl * 7;
              xl = 0; xr = 0;
              for (let j = 0; j < uN[sl]; j++) {
                const bc = bk.cur[uLev[b + j]], bp = bk.prev[uLev[b + j]], N = bc.length - 1, pj = b + uJ[b + j];
                let q = ph[pj];
                const pos = q * N, i = pos | 0, fr = pos - i;
                const c = bc[i] + (bc[i + 1] - bc[i]) * fr, od = bp[i] + (bp[i + 1] - bp[i]) * fr;
                const x = od + (c - od) * xf;
                xl += x * uL[b + j]; xr += x * uR[b + j];
                q += uDt[b + j]; if (q >= 1) q -= 1; ph[pj] = q;
              }
            } else if (kind[a] === 4) {
              const S = this.smp[sl], q = sl * 2, loop = this.smpLoop[sl], sp = vc.sp, op = vc.op;
              let ya = 0, yb = 0, oa = 0, ob = 0;
              if (S.A) { const d = S.A.d, n = d.length, ls = OscSmp.loopStart(n, this.val[this.oP[sl].sstart] * (n - 1));
                ya = OscSmp.read(d, sp[q], loop, ls); sp[q] = OscSmp.advance(sp[q], this.smpRA[sl], n, loop, ls);
                if (vc.sxf[sl] > 0 && vc.sold[sl]) { oa = OscSmp.read(d, op[q], loop, ls); op[q] = OscSmp.advance(op[q], this.smpRA[sl], n, loop, ls); } }
              if (S.B) { const d = S.B.d, n = d.length, ls = OscSmp.loopStart(n, this.val[this.oP[sl].sstart] * (n - 1));
                yb = OscSmp.read(d, sp[q + 1], loop, ls); sp[q + 1] = OscSmp.advance(sp[q + 1], this.smpRB[sl], n, loop, ls);
                if (vc.sxf[sl] > 0 && vc.sold[sl]) { ob = OscSmp.read(d, op[q + 1], loop, ls); op[q + 1] = OscSmp.advance(op[q + 1], this.smpRB[sl], n, loop, ls); } }
              const mix = this.smpMix[sl];
              let x = ya + (yb - ya) * mix;
              if (vc.sxf[sl] > 0) { const g = vc.sxf[sl] / Math.round(0.005 * sr); x = x * (1 - g) + (oa + (ob - oa) * mix) * g; vc.sxf[sl]--; }
              xl = xr = x;
            } else {
              const dt = this.sdt[sl];
              let q = sph[sl];
              xl = xr = OscSub.sample(q, dt, this.sShape[sl], this.sG[sl], this.sTg[sl]);
              q += dt; if (q >= 1) q -= 1; sph[sl] = q;
            }
            iL += xl * (C0[o] + CD[o] * t); iR += xr * (C0[o + 1] + CD[o + 1] * t);
            dL += xl * (C0[o + 2] + CD[o + 2] * t); dR += xr * (C0[o + 3] + CD[o + 3] * t);
          }
          if (aSt === 1) { aLv += aInc; if (aLv >= 1) { aLv = 1; aSt = 2; } } else if (aSt === 2) aLv = aS + (aLv - aS) * aD; else aLv *= aR;
          if (fSt === 1) { fLv += fInc; if (fLv >= 1) { fLv = 1; fSt = 2; } } else if (fSt === 2) fLv = fS + (fLv - fS) * fD; else fLv *= fR;
          let v3 = iL - l2, v1 = fa1 * l1 + fa2 * v3, v2 = l2 + fa2 * l1 + fa3 * v3;
          l1 = 2 * v1 - l1; l2 = 2 * v2 - l2;
          const oL = dL + wl * v2 + wb * v1 * bpG + wh * (iL - fk * v1 - v2);
          v3 = iR - r2; v1 = fa1 * r1 + fa2 * v3; v2 = r2 + fa2 * r1 + fa3 * v3;
          r1 = 2 * v1 - r1; r2 = 2 * v2 - r2;
          const oR = dR + wl * v2 + wb * v1 * bpG + wh * (iR - fk * v1 - v2);
          const amp = aLv * vel;
          L[p + s] += oL * amp * (gl0 + glI * t); R[p + s] += oR * amp * (gr0 + grI * t);
        }
        vc.aSt = aSt; vc.aLv = aLv; vc.fSt = fSt; vc.fLv = fLv;
        st[0] = l1; st[1] = l2; st[2] = r1; st[3] = r2;
        if (aSt === 3 && aLv < 3e-4) vc.active = false;
      }
    }
    for (let s = 0; s < 4; s++) { const bk = this.banks[s]; if (bk.ready) bk.xf = Math.min(1, bk.xf + bk.xfInc * len); }
    C0.set(CN);
  }
  // FX slots in order. Each runs even while switched off (so tails stay current) and is crossfaded
  // with its dry input. A type switch fades linearly to dry over 15 ms, swaps at exactly dry, then fades back in.
  renderFx(L, R, p, len) {
    const v = this.val, dryL = this.dryL, dryR = this.dryR;
    for (let s = 0; s < 4; s++) {
      const inst = this.fxInst[s]; if (!inst) continue;
      const switching = this.fxNext[s] !== null;
      if (switching && this.fxBy[s] <= 0) {
        this.fxInst[s] = this.makeFx(this.fxNext[s], s); this.fxType[s] = this.fxNext[s]; this.fxNext[s] = null;
        this.computeActive();   // its parameters resolve from the next sub-block; this one passes dry
        continue;
      }
      const tgt = this.fxOn[s] ? 1 : 0, c = this.byC, sw = this.swStep;
      if (inst instanceof FxDelay) inst.spill = this.dlSpill[s];
      for (let i = 0; i < len; i++) { dryL[i] = L[p + i]; dryR[i] = R[p + i]; }
      inst.process(L, R, p, len, v, this.xP[s]);
      let by = this.fxBy[s];
      for (let i = 0; i < len; i++) {
        by = switching ? (by > sw ? by - sw : 0) : by + (tgt - by) * c;
        L[p + i] = dryL[i] + (L[p + i] - dryL[i]) * by; R[p + i] = dryR[i] + (R[p + i] - dryR[i]) * by;
      }
      this.fxBy[s] = by;
    }
  }
}
