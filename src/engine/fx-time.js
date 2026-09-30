/* Modulation, Delay and Reverb: the effects built on delay lines. */

/* Modulation. Type: 0 chorus (3 taps, long delay) -> 0.5 flanger (1 tap, short delay, feedback) -> 1 phaser.
   Going chorus -> flanger, the outer tap fades out first, then the middle one, like unison in reverse.
   Every internal setting is smoothed per sample (block-rate stepping caused zipper noise and phaser crackles). */
class FxModulation {
  constructor(sr) {
    const pow2 = n => { let k = 1; while (k < n) k <<= 1; return k; };
    this.sr = sr;
    this.N = pow2(sr * 0.06); this.bL = new Float32Array(this.N); this.bR = new Float32Array(this.N);
    this.w = 0; this.lfo = 0; this.fbL = 0; this.fbR = 0;
    this.apL = new Float64Array(6); this.apR = new Float64Array(6); this.phL = 0; this.phR = 0;
    this.S = null;   // per-sample smoothed settings
  }
  static readF(buf, mask, pos) { const i = Math.floor(pos), f = pos - i; const a = buf[i & mask]; return a + (buf[(i + 1) & mask] - a) * f; }
  process(L, R, p, len, v, P) {
    const sr = this.sr, TAU = 2 * Math.PI, msr = sr / 1000, readF = FxModulation.readF;
    const mt = v[P.mtype], u = Math.min(1, mt * 2);
    const T = [
      15 + (1.5 - 15) * u,                          // 0 base delay (ms)
      (6 + (1.2 - 6) * u) * v[P.mdepth],            // 1 depth (ms)
      Math.max(0, Math.min(1, 2 - 2 * u)),          // 2 middle tap gain
      Math.max(0, 1 - 2 * u),                       // 3 outer tap gain
      Math.max(0, (mt - 0.5) * 2),                  // 4 phaser share
      v[P.mfb] * (0.25 + 0.75 * u) * 0.95,          // 5 delay feedback
      v[P.mfb] * 0.85,                              // 6 phaser feedback
      0.5 + 4 * v[P.mdepth],                        // 7 phaser sweep (octaves)
      v[P.mmix],                                    // 8 mix
    ];
    if (!this.S) this.S = T.slice();
    const S = this.S, lfoInc = v[P.mrate] / sr, mdL = this.bL, mdR = this.bR, mdM = this.N - 1;
    for (let s = 0; s < len; s++) {
      let xL = L[p + s], xR = R[p + s];
      for (let k = 0; k < 9; k++) S[k] += (T[k] - S[k]) * 0.002;
      const base = S[0], dep = S[1], g1 = S[2], g2 = S[3], ph = S[4], fbD = S[5], fbP = S[6], octs = S[7], mmix = S[8];
      const w = this.w;
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
      this.w = (w + 1) & mdM; this.lfo += lfoInc; if (this.lfo >= 1) this.lfo -= 1;
      L[p + s] = xL + (wL - xL) * 0.5 * mmix; R[p + s] = xR + (wR - xR) * 0.5 * mmix;   // full mix = equal dry and wet
    }
  }
}

/* Delay: tempo-synced, all 12 divisions running in parallel, each with its own feedback.
   Cut: every line hears the input, only the selected one is heard (crossfaded, ~12 ms).
   Spill: only the selected line gets the input, all are heard, so old tails ring out.
   Tone: below 50% darkens (low-pass down to 400 Hz), above 50% thins (high-pass up to 2 kHz); it filters
   the echoes and every repeat, so its effect builds with feedback. */
class FxDelay {
  constructor(sr, host) {
    const pow2 = n => { let k = 1; while (k < n) k <<= 1; return k; };
    this.sr = sr; this.host = host; this.spill = false; this.first = true; this.w = 0;
    this.dls = FxDelay.DIVS.map(beats => {
      const n = pow2(beats * 1.5 * sr + 8);   // long enough at 40 bpm
      return { L: new Float32Array(n), R: new Float32Array(n), m: n - 1, t: -1, lpL: 0, lpR: 0, hpL: 0, hpR: 0, wIn: 1, wOut: 0, tgt: 0, inT: 1, outT: 0 };
    });
    this.max = Math.max(...this.dls.map(d => d.m + 1));
  }
  static get DIVS() { return [0.125, 1 / 6, 0.25, 1 / 3, 0.375, 0.5, 2 / 3, 0.75, 1, 1.5, 2, 3]; }   // delay times in beats
  process(L, R, p, len, v, P) {
    const sr = this.sr, TAU = 2 * Math.PI, readF = FxModulation.readF;
    const dIdx = Math.max(0, Math.min(11, Math.round(v[P.dltime])));
    const dfb = v[P.dlfb], pp = v[P.dlpp], dlmix = v[P.dlmix];
    const dt = v[P.dltone], dtc = 1 - Math.exp(-TAU * (dt < 0.5 ? 400 * Math.pow(2, dt * 2 * 5.5) : 18000) / sr);
    const dth = 1 - Math.exp(-TAU * (dt > 0.5 ? 20 * Math.pow(2, (dt - 0.5) * 2 * 6.6) : 20) / sr);
    const spill = this.spill, xfc = 1 - Math.exp(-1 / (0.012 * sr)), dls = this.dls;
    for (let i = 0; i < dls.length; i++) {
      const d = dls[i];
      d.tgt = Math.min(d.m - 4, FxDelay.DIVS[i] * 60 / this.host.bpm * sr);
      if (d.t < 0) d.t = d.tgt;
      d.inT = spill ? (i === dIdx ? 1 : 0) : 1;
      d.outT = spill ? 1 : (i === dIdx ? 1 : 0);
      if (this.first) { d.wIn = d.inT; d.wOut = d.outT; }
    }
    this.first = false;
    const maxM = this.max - 1;
    for (let s = 0; s < len; s++) {
      const xL = L[p + s], xR = R[p + s];
      const w = this.w, inL = xL * (1 - pp) + (xL + xR) * 0.5 * pp, inR = xR * (1 - pp);
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
      this.w = (w + 1) & maxM;
      L[p + s] = xL * (1 - 0.5 * dlmix) + oL * dlmix; R[p + s] = xR * (1 - 0.5 * dlmix) + oR * dlmix;
    }
  }
}

/* Reverb: 4 all-pass diffusers into an 8-line feedback delay network (Householder mixing).
   Size glides the line lengths; Decay sets the feedback per line; Damping low-passes each line. */
class FxReverb {
  constructor(sr) {
    const pow2 = n => { let k = 1; while (k < n) k <<= 1; return k; };
    this.sr = sr;
    this.N = pow2(sr * 0.2); this.rv = []; for (let i = 0; i < 8; i++) this.rv.push(new Float32Array(this.N));
    this.len = new Float64Array(8).fill(-1); this.lp = new Float64Array(8); this.g = new Float64Array(8); this.tg = new Float64Array(8);
    this.apLen = [142, 107, 379, 277].map(x => Math.round(x * sr / 44100));
    this.ap = this.apLen.map(l => new Float32Array(pow2(l + 1)));
    this.w = 0;
  }
  process(L, R, p, len, v, P) {
    const sr = this.sr, msr = sr / 1000, readF = FxModulation.readF;
    const scale = 0.35 + 1.4 * v[P.rvsize], RVB = [29.7, 37.1, 41.1, 43.7, 53.3, 59.9, 67.1, 73.1], rdecay = v[P.rvdecay];
    const rvLen = this.len, rvLp = this.lp, rvG = this.g, rvT = this.tg, rv = this.rv, rvM = this.N - 1;
    for (let i = 0; i < 8; i++) {
      const t = RVB[i] * scale * msr;
      if (rvLen[i] < 0) rvLen[i] = t;
      rvG[i] = Math.pow(10, -3 * rvLen[i] / (sr * rdecay));
      rvT[i] = t;
    }
    const rdc = 1 - v[P.rvdamp] * 0.85, rmix = v[P.rvmix];
    for (let s = 0; s < len; s++) {
      const xL = L[p + s], xR = R[p + s], w = this.w;
      let inp = (xL + xR) * 0.5;
      for (let j = 0; j < 4; j++) {
        const b = this.ap[j], m = b.length - 1, d = b[(w - this.apLen[j]) & m], y = -0.6 * inp + d;
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
      this.w = (w + 1) & rvM;
      const oL = (rvLp[0] - rvLp[2] + rvLp[4] - rvLp[6]) * 0.6, oR = (rvLp[1] - rvLp[3] + rvLp[5] - rvLp[7]) * 0.6;
      L[p + s] = xL * (1 - 0.5 * rmix) + oL * rmix; R[p + s] = xR * (1 - 0.5 * rmix) + oR * rmix;
    }
  }
}
