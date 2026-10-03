/* =====================================================================
   OSCILLATOR ENGINES (per slot state; the per-sample voice loop lives in
   MorphEngine.render so every engine shares the filters and envelopes)
   ===================================================================== */

/* Wavetable: band-limited banks rebuilt (at most every 512 samples, with a crossfade) from table A and
   table B, each read at its own Position, blended by the Wave value. Level k of a bank holds harmonics
   1..(512 >> k). One WtBank per Wavetable slot. */
class WtBank {
  constructor() {
    this.tables = { A: null, B: null }; this.spectral = true; this.ver = 0;
    this.cur = []; this.prev = []; this.scr = [];
    for (let k = 0; k < 10; k++) {
      const N = Math.max(64, 4 * (512 >> k));
      this.cur.push(new Float32Array(N + 1)); this.prev.push(new Float32Array(N + 1));
      this.scr.push([new Float32Array(N), new Float32Array(N)]);
    }
    const sp = () => [new Float32Array(513), new Float32Array(513)];
    this.fa = sp(); this.fb = sp(); this.fr = sp();
    this.ready = false; this.xf = 1; this.xfInc = 0; this.since = 1e9; this.lastKey = '';
  }
  setTable(side, re, im) { this.tables[side] = { k: re.length, re, im }; this.ver++; }
  build(posA, posB, wave) {
    const tA = this.tables.A, tB = this.tables.B;
    if (!tA || !tB) return false;
    // Each table is read at its own position (these never morph). The Wave value, which does
    // morph and has its own curve, sets how much of B's shape is in the blend.
    MorphEngine.frameAt(tA, posA, this.spectral, this.fa[0], this.fa[1]);
    MorphEngine.frameAt(tB, posB, this.spectral, this.fb[0], this.fb[1]);
    MorphEngine.interp(this.fa[0], this.fa[1], this.fb[0], this.fb[1], wave, this.spectral, this.fr[0], this.fr[1]);
    const t = this.prev; this.prev = this.cur; this.cur = t;
    for (let k = 0; k < 10; k++) {
      const out = this.cur[k], N = out.length - 1;
      MorphEngine.synth(this.fr[0], this.fr[1], 512 >> k, N, out, this.scr[k][0], this.scr[k][1]);
      out[N] = out[0];
    }
    return true;
  }
  maybeBuild(len, posA, posB, wave) {
    this.since += len;
    if (!this.tables.A || !this.tables.B) return;
    const key = posA.toFixed(4) + '|' + posB.toFixed(4) + '|' + wave.toFixed(4) + '|' + this.ver;
    if (!this.ready) {
      if (this.build(posA, posB, wave)) {
        for (let k = 0; k < 10; k++) this.prev[k].set(this.cur[k]);
        this.ready = true; this.xf = 1; this.lastKey = key; this.since = 0;
      }
      return;
    }
    // rebuild at most every 512 samples, crossfading from the previous tables
    if (key !== this.lastKey && this.since >= 512 && this.xf >= 1) {
      this.build(posA, posB, wave); this.lastKey = key; this.since = 0; this.xf = 0; this.xfInc = 1 / 512;
    }
  }
}

/* Sub: sine -> triangle -> square (continuous), phase-aligned so the blends don't cancel,
   with a polyBLEP square so it stays clean on higher notes, then a level-held drive. */
class OscSub {
  static blep(t, dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }
  static sample(ph, dt, shape, g, tg) {
    const sine = Math.sin(2 * Math.PI * ph);
    const q = ph + 0.25 < 1 ? ph + 0.25 : ph - 0.75;
    const tri = 1 - 4 * Math.abs(q - 0.5);
    let x;
    if (shape < 0.5) x = sine + (tri - sine) * shape * 2;
    else {
      const h = ph + 0.5 < 1 ? ph + 0.5 : ph - 0.5;
      const sq = (ph < 0.5 ? 1 : -1) + OscSub.blep(ph, dt) - OscSub.blep(h, dt);
      x = tri + (sq - tri) * (shape - 0.5) * 2;
    }
    return g > 1.0001 ? Math.tanh(g * x) / tg : x;
  }
}

/* FM: four sine operators. Eight algorithms, ordered from one long stack to all carriers; Algorithm is
   continuous and blends the routings of neighbouring algorithms, so morphing it never jumps. Modulation
   only flows from higher-numbered operators to lower ones. Each operator's Level is its output level when
   it is a carrier and its modulation index (up to 10 radians, squared response) when it modulates; on high
   notes the index is scaled down to limit aliasing. Operator 4 has the feedback. */
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
