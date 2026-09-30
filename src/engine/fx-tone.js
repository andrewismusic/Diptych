/* =====================================================================
   EFFECT CLASSES
   Each effect is one class with process(L, R, p, len, v, P): it works in
   place on L/R from p for len samples (one 16-sample sub-block). v is the
   engine's resolved values and P maps this slot's keys to indexes in v.
   Settings arrive once per sub-block; anything that would click if it
   stepped is smoothed again per sample. Like MorphEngine, these classes
   are stringified into the AudioWorklet, so they may only refer to each
   other and to MorphEngine.
   ===================================================================== */

/* Drive: 4x oversampled with a 33-tap linear-phase filter (8 samples of latency, matched on the dry path).
   Level-referenced: a full-level signal comes out at the same level whatever the drive, so turning it up
   changes tone, not volume. The curve runs from warm and asymmetric (even harmonics) through a firmer knee
   to a sine wavefolder. */
class FxDrive {
  constructor(sr) {
    this.sr = sr; this.H = FxDrive.osFilter();
    this.XL = new Float64Array(9); this.XR = new Float64Array(9);
    this.ZL = new Float64Array(33); this.ZR = new Float64Array(33); this.Zw = 0;
    this.DL = new Float64Array(8); this.DR = new Float64Array(8); this.Dw = 0;
    this.lpL = 0; this.lpR = 0; this.dcXL = 0; this.dcYL = 0; this.dcXR = 0; this.dcYR = 0;
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
  process(L, R, p, len, v, P) {
    const sr = this.sr, TAU = 2 * Math.PI, H = this.H;
    const drv = v[P.drive], dsh = v[P.dshape], dmix = v[P.dmix];
    // Heavier drive squares the wave off, which raises its average level; dcomp pulls that back.
    const REF = 0.35, dg = 0.5 * Math.pow(32, drv), dcomp = 1 / Math.tanh(dg) / (1 + 3.5 * Math.pow(drv, 1.5));
    const dLpC = 1 - Math.exp(-TAU * 20000 * Math.pow(0.35, drv) / sr);
    const shape = a => {
      const soft = Math.tanh(a + 0.25) - 0.2449186624;   // tanh(0.25)
      const firm = a / Math.pow(1 + a * a * a * a, 0.25);
      return dsh < 0.5 ? soft + (firm - soft) * dsh * 2 : firm + (Math.sin(a) - firm) * (dsh - 0.5) * 2;
    };
    const XL = this.XL, XR = this.XR;
    for (let s = 0; s < len; s++) {
      const xL = L[p + s], xR = R[p + s];
      for (let j = 8; j > 0; j--) { XL[j] = XL[j - 1]; XR[j] = XR[j - 1]; }
      XL[0] = xL; XR[0] = xR;
      let zw = this.Zw;
      for (let k = 0; k < 4; k++) {
        let uL = 0, uR = 0;
        for (let j = 0, t = k; t < 33; j++, t += 4) { uL += H[t] * XL[j]; uR += H[t] * XR[j]; }
        this.ZL[zw] = REF * shape(dg * 4 * uL / REF) * dcomp;
        this.ZR[zw] = REF * shape(dg * 4 * uR / REF) * dcomp;
        zw = zw === 32 ? 0 : zw + 1;
      }
      this.Zw = zw;
      let yL = 0, yR = 0;
      for (let t = 0, q = zw === 0 ? 32 : zw - 1; t < 33; t++, q = q === 0 ? 32 : q - 1) { yL += H[t] * this.ZL[q]; yR += H[t] * this.ZR[q]; }
      this.lpL += (yL - this.lpL) * dLpC; this.lpR += (yR - this.lpR) * dLpC;
      // DC blocker (the warm curve is asymmetric)
      const dL = this.lpL - this.dcXL + 0.9995 * this.dcYL; this.dcXL = this.lpL; this.dcYL = dL;
      const dR = this.lpR - this.dcXR + 0.9995 * this.dcYR; this.dcXR = this.lpR; this.dcYR = dR;
      const dw = this.Dw, dryL = this.DL[dw], dryR = this.DR[dw];   // dry delayed to match the filters
      this.DL[dw] = xL; this.DR[dw] = xR; this.Dw = (dw + 1) & 7;
      L[p + s] = dryL + (dL - dryL) * dmix; R[p + s] = dryR + (dR - dryR) * dmix;
    }
  }
}

/* Formant filter: three band-pass resonances per channel; Vowel sweeps A-E-I-O-U, Shift moves them. */
class FxFormant {
  constructor(sr) { this.sr = sr; this.fs = new Float64Array(12); }
  static get VOWELS() { return [[650, 1080, 2650], [400, 1700, 2600], [290, 1870, 2800], [400, 800, 2600], [350, 600, 2700]]; }   // a e i o u
  process(L, R, p, len, v, P) {
    const sr = this.sr, fs = this.fs;
    const vp = v[P.fvowel] * 4, vi = Math.min(3, Math.floor(vp)), vf = vp - vi, VW = FxFormant.VOWELS, fr = Math.pow(2, v[P.fshift] / 12);
    const fk = 1 / (3 + v[P.freso] * 17), fmix = v[P.fmix], fGain = [1, 0.7, 0.45], fMake = 2.2 / Math.sqrt(fk);
    const fa1 = [], fa2 = [], fa3 = [];
    for (let b = 0; b < 3; b++) {
      const f = Math.min(sr * 0.45, (VW[vi][b] + (VW[vi + 1][b] - VW[vi][b]) * vf) * fr);
      const g = Math.tan(Math.PI * f / sr), a1 = 1 / (1 + g * (g + fk));
      fa1.push(a1); fa2.push(g * a1); fa3.push(g * g * a1);
    }
    for (let s = 0; s < len; s++) {
      let xL = L[p + s], xR = R[p + s], wL = 0, wR = 0;
      for (let b = 0; b < 3; b++) {
        const o = b * 4;
        let v3 = xL - fs[o + 1], v1 = fa1[b] * fs[o] + fa2[b] * v3, v2 = fs[o + 1] + fa2[b] * fs[o] + fa3[b] * v3;
        fs[o] = 2 * v1 - fs[o]; fs[o + 1] = 2 * v2 - fs[o + 1]; wL += v1 * fk * fGain[b];
        v3 = xR - fs[o + 3]; v1 = fa1[b] * fs[o + 2] + fa2[b] * v3; v2 = fs[o + 3] + fa2[b] * fs[o + 2] + fa3[b] * v3;
        fs[o + 2] = 2 * v1 - fs[o + 2]; fs[o + 3] = 2 * v2 - fs[o + 3]; wR += v1 * fk * fGain[b];
      }
      L[p + s] = xL + (wL * fMake - xL) * fmix; R[p + s] = xR + (wR * fMake - xR) * fmix;
    }
  }
}
