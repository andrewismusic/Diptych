/* FmEngine: 8 voices of 4-operator FM with an amp envelope. Runs in an AudioWorklet (stringified with
   OscFM, see app.js), so it may only refer to OscFM. Parameters arrive as plain values by name and are
   smoothed every 16 samples (stepped ones, ratios and algorithm, change at once). Operator envelopes restart
   with each note; Level is a carrier's output level or a modulator's index (scaled by Brightness). */
class FmEngine {
  constructor(sr) {
    this.sr = sr; this.p = {}; this.cur = {}; this.first = true; this.clock = 0;
    this.m = new Float64Array(6); this.o = new Float64Array(4);
    this.voices = [];
    for (let k = 0; k < 8; k++) this.voices.push({ active:false, note:60, vel:1, age:0, t:0, ph:new Float64Array(4), y1:0, y2:0, aSt:0, aLv:0 });
  }
  static get STEPPED() { return ['algo', 'r1', 'r2', 'r3', 'r4']; }
  handle(m) {
    if (m.type === 'params') Object.assign(this.p, m.p);
    else if (m.type === 'on') this.noteOn(m.note, m.vel);
    else if (m.type === 'off') { for (const v of this.voices) if (v.active && v.note === m.note && v.aSt !== 3) v.aSt = 3; }
    else if (m.type === 'panic') this.voices.forEach(v => { v.aSt = 3; });
  }
  noteOn(note, vel) {
    let v = this.voices.find(x => x.active && x.note === note) || this.voices.find(x => !x.active) || this.voices.reduce((a, b) => (a.age < b.age ? a : b));
    if (!v.active) { v.aLv = 0; v.ph.fill(0); v.y1 = v.y2 = 0; }
    Object.assign(v, { active:true, note, vel, age: this.clock++, t: 0, aSt: 1 });
  }
  render(L, R, n) {
    const sr = this.sr, TAU = 2 * Math.PI, P = this.p, C = this.cur;
    if (P.algo === undefined) return;
    for (let p = 0; p < n; p += 16) {
      const len = Math.min(16, n - p);
      for (const k in P) C[k] = this.first || FmEngine.STEPPED.includes(k) || C[k] === undefined ? P[k] : C[k] + (P[k] - C[k]) * 0.08;
      this.first = false;
      const m = this.m, o = this.o, g = OscFM.algo(C.algo, m, o);
      const R4 = [C.r1, C.r2, C.r3, C.r4].map(i => OscFM.RATIOS[Math.round(i)]), Lv = [C.l1, C.l2, C.l3, C.l4], D = [C.d1, C.d2, C.d3, C.d4];
      const Cv = D.map(OscFM.curve), Ix = Lv.map(l => OscFM.index(l) * C.bright), fbA = C.fb * 3;
      const aInc = 1 / (C.aatk * sr), aD = Math.exp(-5 / (C.adec * sr)), aS = C.asus, aR = Math.exp(-6.9 / (C.arel * sr)), vol = C.vol * 0.3;
      for (const v of this.voices) {
        if (!v.active) continue;
        const f0 = 440 * Math.pow(2, (v.note + C.pitch - 69) / 12), dt = f0 / sr, sc = Math.min(1, Math.pow(600 / f0, 0.7));
        const t0 = v.t / sr, t1 = (v.t + len) / sr, e0 = [], e1 = [];
        for (let k = 0; k < 4; k++) { e0.push(OscFM.env(t0, D[k], Cv[k])); e1.push(OscFM.env(t1, D[k], Cv[k])); }
        const ph = v.ph, vs = 0.4 + 0.6 * v.vel;   // velocity brightens as well as louder
        let aSt = v.aSt, aLv = v.aLv, y1 = v.y1, y2 = v.y2;
        for (let s = 0; s < len; s++) {
          const w = s / len;
          for (let k = 0; k < 4; k++) { ph[k] += dt * R4[k]; ph[k] -= Math.floor(ph[k]); }
          const o4 = Math.sin(TAU * ph[3] + fbA * (y1 + y2) * 0.5) * (e0[3] + (e1[3] - e0[3]) * w); y2 = y1; y1 = o4;
          const i4 = Ix[3] * sc * vs * o4;
          const o3 = Math.sin(TAU * ph[2] + m[0] * i4) * (e0[2] + (e1[2] - e0[2]) * w), i3 = Ix[2] * sc * vs * o3;
          const o2 = Math.sin(TAU * ph[1] + m[1] * i4 + m[3] * i3) * (e0[1] + (e1[1] - e0[1]) * w), i2 = Ix[1] * sc * vs * o2;
          const o1 = Math.sin(TAU * ph[0] + m[2] * i4 + m[4] * i3 + m[5] * i2) * (e0[0] + (e1[0] - e0[0]) * w);
          if (aSt === 1) { aLv += aInc; if (aLv >= 1) { aLv = 1; aSt = 2; } } else if (aSt === 2) aLv = aS + (aLv - aS) * aD; else aLv *= aR;
          const x = (o[0] * Lv[0] * o1 + o[1] * Lv[1] * o2 + o[2] * Lv[2] * o3 + o[3] * Lv[3] * o4) * g * aLv * v.vel * vol;
          L[p + s] += x; R[p + s] += x;
        }
        Object.assign(v, { aSt, aLv, y1, y2 }); v.t += len;
        if (aSt === 3 && aLv < 3e-4) v.active = false;
      }
    }
    for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i]); R[i] = Math.tanh(R[i]); }
  }
}
