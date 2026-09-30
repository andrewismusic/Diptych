/* Lo-fi and OTT. */

/* Lo-fi: wow and flutter, tape character, dropouts, codec damage and noise. */
class FxLofi {
  constructor(sr, host, slot) {
    const pow2 = n => { let k = 1; while (k < n) k <<= 1; return k; };
    this.sr = sr; this.rng = (0x9e3779b9 ^ (slot * 0x85ebca6b)) >>> 0 || 1;
    this.N = pow2(sr * 0.05); this.bL = new Float32Array(this.N); this.bR = new Float32Array(this.N); this.w = 0;
    this.wowPh = 0; this.flPh1 = 0; this.flPh2 = 0; this.drift = 0; this.driftT = 0; this.dl = -1;
    this.wowR = 0; this.wowRT = 0; this.flR = 0; this.flRT = 0;
    this.bpL = [0, 0]; this.bpR = [0, 0];
    this.dpG = 1; this.dpT = 1; this.dpTimer = 0; this.dpLpL = 0; this.dpLpR = 0;
    // codec: 512-point STFT, 50% overlap, square-root Hann windows (512 samples of latency when engaged)
    this.cWin = Float64Array.from({ length: 512 }, (_, n) => Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * n / 512)));
    this.cInL = new Float64Array(512); this.cInR = new Float64Array(512); this.cPos = 0;
    this.cOlaL = new Float64Array(1024); this.cOlaR = new Float64Array(1024); this.cT = 0; this.cHop = 0;
    this.cRe = new Float64Array(512); this.cIm = new Float64Array(512); this.cXf = 0; this.cAmt = 0;
    this.lpL = 0; this.lpR = 0; this.nDkL = 0; this.nDkR = 0; this.nBrL = 0; this.nBrR = 0; this.crL = 0; this.crR = 0; this.crLp = 0;
  }
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
  process(L, R, p, len, v, P) {
    const sr = this.sr, TAU = 2 * Math.PI, msr = sr / 1000, readF = FxModulation.readF;
    this.driftT += (this.rand() * 2 - 1 - this.driftT) * 0.02;   // slow random drift for wow depth
    // wow and flutter rates wander a little too
    if (this.rand() < len / (0.6 * sr)) this.wowRT = this.rand() * 2 - 1;
    if (this.rand() < len / (0.3 * sr)) this.flRT = this.rand() * 2 - 1;
    this.wowR += (this.wowRT - this.wowR) * 0.01; this.flR += (this.flRT - this.flR) * 0.02;
    const wowD = v[P.lwow] * 8, flD = v[P.lflut] * 0.8, lch = v[P.lchar];
    const wowInc = 0.55 * (1 + 0.4 * this.wowR) / sr, fl1Inc = 7.3 * (1 + 0.2 * this.flR) / sr, fl2Inc = 11.9 * (1 - 0.15 * this.flR) / sr;
    // character: tape-style drive (asymmetric, so it adds intermodulation between notes), a low bump, and high rolloff
    const cg = 1 + 7 * lch, cA = 0.2 * lch, cTa = Math.tanh(cA), cOut = (1 + 0.1 * lch) / cg;
    const lLpC = 1 - Math.exp(-TAU * 20000 * Math.pow(0.18, lch) / sr);
    const bg = Math.tan(Math.PI * 100 / sr), bk = 1.2, ba1 = 1 / (1 + bg * (bg + bk)), ba2 = bg * ba1, ba3 = bg * ba2, bump = lch * 0.7;
    // dropouts: level dips (never below about 15%) that also dull the sound, never full silence
    const ldrop = v[P.ldrop];
    if (this.dpTimer > 0) { this.dpTimer -= len; if (this.dpTimer <= 0) this.dpT = 1; }
    else if (this.rand() < ldrop * 2.5 * len / sr) { this.dpT = 0.15 + 0.35 * this.rand(); this.dpTimer = (0.04 + 0.25 * this.rand()) * sr; }
    const dpDn = 1 - Math.exp(-1 / (0.006 * sr)), dpUp = 1 - Math.exp(-1 / (0.03 * sr)), dpLpC = 1 - Math.exp(-TAU * 2000 / sr);
    // codec
    this.cAmt = 1 - Math.pow(1 - v[P.lcodec], 2.2);   // most of the damage now arrives in the first half
    const cXfT = v[P.lcodec] > 0.001 ? 1 : 0, cXfC = 1 - Math.exp(-1 / (0.03 * sr));
    // Noise: dark hiss (0) -> bright hiss (35%) -> crackle (60%), then crackle gets denser up to 100%
    const nt = v[P.lnoise], nm = v[P.lnmix], ngain = nm > 0 ? 0.03 * Math.pow(10, -(1 - nm) * 45 / 20) * Math.min(1, nm * 20) : 0;   // even steps in loudness
    const nDark = nt < 0.35 ? 1 - nt / 0.35 : 0, nBright = nt < 0.35 ? nt / 0.35 : nt < 0.6 ? 1 - (nt - 0.35) / 0.25 : 0, nCrack = nt < 0.35 ? 0 : nt < 0.6 ? (nt - 0.35) / 0.25 : 1;
    const crDense = 0.1 + 1.9 * Math.max(0, Math.min(1, (nt - 0.35) / 0.65));   // sparse where crackle first appears, growing steadily to the top
    const cDk = 1 - Math.exp(-TAU * 900 / sr), cBr = 1 - Math.exp(-TAU * 9000 / sr), crP = 0.0025 * 48000 / sr * crDense;
    const lfM = this.N - 1;
    for (let s = 0; s < len; s++) {
      let xL = L[p + s], xR = R[p + s];
      const w = this.w;
      this.bL[w] = xL; this.bR[w] = xR;
      this.drift += (this.driftT - this.drift) * 0.00005;
      const wobble = wowD * (0.5 + 0.5 * Math.sin(TAU * this.wowPh)) + wowD * 0.4 * this.drift
        + flD * (Math.sin(TAU * this.flPh1) + 0.5 * Math.sin(TAU * this.flPh2));
      const target = (6 + wobble) * msr;
      if (this.dl < 0) this.dl = target;
      this.dl += (target - this.dl) * 0.01;
      xL = readF(this.bL, lfM, w - this.dl); xR = readF(this.bR, lfM, w - this.dl);
      this.w = (w + 1) & lfM;
      this.wowPh += wowInc; if (this.wowPh >= 1) this.wowPh -= 1;
      this.flPh1 += fl1Inc; if (this.flPh1 >= 1) this.flPh1 -= 1;
      this.flPh2 += fl2Inc; if (this.flPh2 >= 1) this.flPh2 -= 1;
      // character
      {
        const B = this.bpL, C = this.bpR;
        let v3 = xL - B[1], v1 = ba1 * B[0] + ba2 * v3, v2 = B[1] + ba2 * B[0] + ba3 * v3; B[0] = 2 * v1 - B[0]; B[1] = 2 * v2 - B[1];
        xL += v1 * bk * bump;
        v3 = xR - C[1]; v1 = ba1 * C[0] + ba2 * v3; v2 = C[1] + ba2 * C[0] + ba3 * v3; C[0] = 2 * v1 - C[0]; C[1] = 2 * v2 - C[1];
        xR += v1 * bk * bump;
        xL = (Math.tanh(cg * xL + cA) - cTa) * cOut; xR = (Math.tanh(cg * xR + cA) - cTa) * cOut;
        this.lpL += (xL - this.lpL) * lLpC; this.lpR += (xR - this.lpR) * lLpC;
        xL = this.lpL; xR = this.lpR;
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
      L[p + s] = xL; R[p + s] = xR;
    }
  }
}

/* OTT: low / mid / high always sum back to the input; each band is pulled toward a target level,
   downward above it and upward below it. Very quiet material (below about -80 dB) is left alone so
   silence doesn't turn into hiss. Gain drops land at once and rises ease in, and the audio runs 1.5 ms
   behind the detector, so a note arriving after a quiet gap is caught before its first peak. */
class FxOtt {
  constructor(sr, host, slot) {
    this.sr = sr; this.host = host; this.slot = slot;
    this.xo = new Float64Array(8);
    this.env = new Float64Array(3); this.gain = new Float64Array([1, 1, 1]);
    this.inE = 1e-6; this.outE = 1e-6; this.comp = 1; this.rep = 0;
    this.la = [0, 1, 2, 3, 4, 5].map(() => new Float64Array(128)); this.laW = 0; this.laN = Math.round(0.0015 * sr);
  }
  process(L, R, p, len, v, P) {
    const sr = this.sr, xo = this.xo;
    const od = v[P.ottdepth] * 1.5, otime = v[P.otttime], oout = Math.pow(10, v[P.ottout] / 20);
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
    const [x1a, x1b, x1c] = xa(v[P.ottlo]), [x2a, x2b, x2c] = xa(v[P.otthi]);
    const lmC = 1 - Math.exp(-1 / (0.3 * sr));
    const compT = Math.max(0.25, Math.min(4, Math.sqrt((this.inE + 1e-9) / (this.outE + 1e-9))));
    if ((this.rep += len) >= 1024) {   // band levels for the OTT picture
      this.rep = 0;
      this.host.reports.push({ type:'ott', slot: this.slot, lv: [0, 1, 2].map(b => 10 * Math.log10(this.env[b] + 1e-12)),
        g: [0, 1, 2].map(b => 20 * Math.log10(this.gain[b]) + [v[P.ottgl], v[P.ottgm], v[P.ottgh]][b] + 20 * Math.log10(this.comp)) });
    }
    const bgL = Math.pow(10, v[P.ottgl] / 20), bgM = Math.pow(10, v[P.ottgm] / 20), bgH = Math.pow(10, v[P.ottgh] / 20);
    const lp = (x, o, a1, a2, a3) => { const v3 = x - xo[o + 1], v1 = a1 * xo[o] + a2 * v3, v2 = xo[o + 1] + a2 * xo[o] + a3 * v3; xo[o] = 2 * v1 - xo[o]; xo[o + 1] = 2 * v2 - xo[o + 1]; return v2; };
    const E = this.env, G = this.gain, la = this.la;
    for (let s = 0; s < len; s++) {
      const xL = L[p + s], xR = R[p + s];
      const loL = lp(xL, 0, x1a, x1b, x1c), loR = lp(xR, 2, x1a, x1b, x1c);
      const rL = xL - loL, rR = xR - loR;
      const miL = lp(rL, 4, x2a, x2b, x2c), miR = lp(rR, 6, x2a, x2b, x2c);
      const hiL = rL - miL, hiR = rR - miR;
      const e0 = Math.max(loL * loL, loR * loR), e1 = Math.max(miL * miL, miR * miR), e2 = Math.max(hiL * hiL, hiR * hiR);
      E[0] += (e0 > E[0] ? oAtk : oRel) * (e0 - E[0]);
      E[1] += (e1 > E[1] ? oAtk : oRel) * (e1 - E[1]);
      E[2] += (e2 > E[2] ? oAtk : oRel) * (e2 - E[2]);
      for (let b = 0; b < 3; b++) { const tg = ottGain(b, E[b]); G[b] += (tg - G[b]) * (tg < G[b] ? gFall : gRise); }
      const lw = this.laW, lr = (lw - this.laN) & 127;
      la[0][lw] = loL; la[1][lw] = miL; la[2][lw] = hiL; la[3][lw] = loR; la[4][lw] = miR; la[5][lw] = hiR;
      this.laW = (lw + 1) & 127;
      const dxL = la[0][lr] + la[1][lr] + la[2][lr], dxR = la[3][lr] + la[4][lr] + la[5][lr];   // delayed input, for the level match
      const yL = la[0][lr] * G[0] * bgL + la[1][lr] * G[1] * bgM + la[2][lr] * G[2] * bgH, yR = la[3][lr] * G[0] * bgL + la[4][lr] * G[1] * bgM + la[5][lr] * G[2] * bgH;
      // Level match: OTT changes the dynamics, not the overall loudness. Slow averages of the level going in
      // and coming out set a correction (within ±12 dB), so Depth doesn't swing the volume around.
      this.inE += (dxL * dxL + dxR * dxR - this.inE) * lmC; this.outE += (yL * yL + yR * yR - this.outE) * lmC;
      this.comp += (compT - this.comp) * lmC;
      L[p + s] = yL * this.comp * oout; R[p + s] = yR * this.comp * oout;
    }
  }
}
