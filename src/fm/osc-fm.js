/* =====================================================================
   FM SKETCH: standalone FM synth page (dist/fm.html), split out of
   Diptych so the FM idea can be explored as its own product.
   OscFM: algorithms, ratios, decay shapes and a one-cycle renderer.
   ===================================================================== */

class OscFM {
  static get RATIOS() { return [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]; }
  static get HOLD() { return 25; }   // Decay at or above this holds (no decay)
  // routings: [4->3, 4->2, 4->1, 3->2, 3->1, 2->1] and which operators are heard [1, 2, 3, 4]
  static get ALGS() {
    return [
      [[1, 0, 0, 1, 0, 1], [1, 0, 0, 0]],   // 1: 4->3->2->1
      [[0, 1, 0, 1, 0, 1], [1, 0, 0, 0]],   // 2: (4 + 3)->2->1
      [[1, 0, 0, 0, 1, 1], [1, 0, 0, 0]],   // 3: (4->3 + 2)->1
      [[1, 1, 1, 0, 0, 0], [1, 1, 1, 0]],   // 4: 4 -> 3, 2, 1, all three heard
      [[1, 0, 0, 0, 0, 1], [1, 0, 1, 0]],   // 5: two pairs, 4->3 and 2->1
      [[1, 0, 0, 1, 0, 0], [1, 1, 0, 0]],   // 6: 4->3->2 stack plus a plain 1
      [[0, 0, 1, 0, 0, 0], [1, 1, 1, 0]],   // 7: 4->1 plus plain 2 and 3
      [[0, 0, 0, 0, 0, 0], [1, 1, 1, 1]],   // 8: all four heard (additive)
    ];
  }
  // blended routing for a continuous Algorithm value: m[6] modulation amounts, o[4] output weights, returns output gain
  static algo(x, m, o) {
    const A = OscFM.ALGS, i = Math.max(0, Math.min(6, Math.floor(x))), f = Math.max(0, Math.min(1, x - i));
    for (let k = 0; k < 6; k++) m[k] = A[i][0][k] + (A[i + 1][0][k] - A[i][0][k]) * f;
    let p = 0;
    for (let k = 0; k < 4; k++) { o[k] = A[i][1][k] + (A[i + 1][1][k] - A[i][1][k]) * f; p += o[k] * o[k]; }
    return 1 / Math.sqrt(p);
  }
  /* Decay shape follows its time: short decays are exponential (plucks), around 4 s they are linear,
     and long ones are logarithmic (they hold up, then fall). c is the curvature used by env(). */
  static curve(D) {
    const x = Math.log10(D);
    return x <= -1 ? 8 : x <= 0 ? 8 - 6 * (x + 1) : x <= 0.602 ? 2 - 2 * x / 0.602 : Math.max(-3, -3 * (x - 0.602) / 0.699);
  }
  static env(t, D, c) {
    if (D >= OscFM.HOLD) return 1;
    const u = t / D;
    if (u >= 1) return 0;
    if (Math.abs(c) < 1e-3) return 1 - u;
    const e = Math.exp(-c); return (Math.exp(-c * u) - e) / (1 - e);
  }
  static index(level) { return 10 * level * level; }
  // one fundamental period at full envelope (for displays and the loudness guard); p: { algo, fb, r[4] ratio values, l[4] }
  static cycle(p, N, out) {
    const m = new Float64Array(6), o = new Float64Array(4), g = OscFM.algo(p.algo, m, o), TAU = 2 * Math.PI;
    const I = p.l.map(OscFM.index), fbA = p.fb * 3;
    let y1 = 0, y2 = 0;
    for (let pass = 0; pass < 2; pass++) for (let n = 0; n < N; n++) {   // the first pass settles the feedback
      const t = n / N;
      const o4 = Math.sin(TAU * p.r[3] * t + fbA * (y1 + y2) * 0.5); y2 = y1; y1 = o4;
      const o3 = Math.sin(TAU * p.r[2] * t + m[0] * I[3] * o4);
      const o2 = Math.sin(TAU * p.r[1] * t + m[1] * I[3] * o4 + m[3] * I[2] * o3);
      const o1 = Math.sin(TAU * p.r[0] * t + m[2] * I[3] * o4 + m[4] * I[2] * o3 + m[5] * I[1] * o2);
      if (pass) out[n] = (o[0] * p.l[0] * o1 + o[1] * p.l[1] * o2 + o[2] * p.l[2] * o3 + o[3] * p.l[3] * o4) * g;
    }
    return out;
  }
}
