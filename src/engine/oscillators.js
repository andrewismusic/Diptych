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


/* Sampler: reads a sample at a position (in source samples) with 4-point Hermite interpolation.
   Looping runs from the Start point to the end, crossfading over the last XF samples into the ones just
   before the loop start, so the wrap never clicks; a one-shot fades over its last 64 samples. */
class OscSmp {
  static get XF() { return 1024; }
  static at(d, i) { return i < 0 || i >= d.length ? 0 : d[i]; }
  static herm(d, pos) {
    const i = Math.floor(pos), f = pos - i, a = OscSmp.at(d, i - 1), b = OscSmp.at(d, i), c = OscSmp.at(d, i + 1), e = OscSmp.at(d, i + 2);
    return b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - e + f * (3 * (b - c) + e - a)));
  }
  /* Loop start for a buffer: the Start point, but at least XF in (the wrap crossfades into the XF samples just
     before the loop start, so they have to exist) and far enough from the end for a usable loop. */
  static loopStart(n, start) { return Math.max(Math.min(OscSmp.XF, n / 4), Math.min(start, n - 4 * OscSmp.XF)); }
  static read(d, pos, loop, ls) {
    const n = d.length;
    if (!loop) return pos >= n ? 0 : OscSmp.herm(d, pos) * Math.min(1, (n - pos) / 64);
    const L = n - ls, X = Math.min(OscSmp.XF, L * 0.5), w = pos - (n - X);
    const y = OscSmp.herm(d, pos);
    return w > 0 ? y + (OscSmp.herm(d, pos - L) - y) * (w / X) : y;
  }
  static advance(pos, r, n, loop, ls) { pos += r; if (loop && pos >= n) pos -= n - ls; return pos; }
}
