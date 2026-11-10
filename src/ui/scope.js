/* =====================================================================
   SCOPE: the wave display (2026-11-10)
   The wave you hear at the current morph (2026-11-10: only that one; A and B
   are what it shows with a side focused or the morph at an end). It is what the engine plays (Wavetable 1's blend, after the
   Harmonics control and the filter, with the four macros applied), and the
   effects each leave a fitting mark on it, scaled by how much of them is heard:
     Drive       the wave is shaped by the same kind of curve (soft clip, then folding)
     Formant     the harmonics near the vowel's resonances are lifted
     Modulation  ghost copies sway around the wave at the modulation rate
     Delay       echoes trail off to the right, smaller with each repeat (ping-pong alternates them)
     Reverb      a glow around the line, wider with size, stronger with mix
     Lo-fi       steps in level (Character), sample-and-hold (Codec), a wobble (Wow, Flutter), specks (Noise)
     OTT         the wave is squashed toward full height and the line thickens
   Time-based marks (Modulation, Wow, Flutter, Noise) animate while something can be heard.
   ===================================================================== */
const scopeEl = $('scope');
// the macros, run exactly as the engine runs them (MorphEngine.applyMacros) on the values at the current morph
const MAC = { I: IX, defs: DEFS };
MAC.macros = MorphEngine.prototype.buildMacros.call(MAC);
MAC.cur = new Float64Array(DEFS.length); MAC.val = new Float64Array(DEFS.length);
function heardValues() {
  for (let i = 0; i < DEFS.length; i++) { MAC.cur[i] = resolveNorm(i); MAC.val[i] = MorphEngine.denorm(DEFS[i], MAC.cur[i]); }
  MorphEngine.prototype.applyMacros.call(MAC);
  return key => MAC.val[IX[key]];
}
const SC = { re: new Float32Array(513), im: new Float32Array(513), n: 256 };
// the wave heard now: Wavetable 1's blend at this morph, Harmonics, then the filter's response at middle C
function scopeWave(v, side) {
  const s = 0;
  MorphEngine.frameAt(spec[s].A, state.A[oi(s, 'posA')], true, W.fa[0], W.fa[1]);
  MorphEngine.frameAt(spec[s].B, state.A[oi(s, 'posB')], true, W.fb[0], W.fb[1]);
  const t = side === 'A' ? 0 : side === 'B' ? 1 : resolveNorm(oi(s, 'wave'));
  MorphEngine.interp(W.fa[0], W.fa[1], W.fb[0], W.fb[1], t, true, SC.re, SC.im);
  if (!side) {
    WtBank.simplify(SC.re, SC.im, v('harm'));
    const f0 = 261.6, fc = Math.min(21600, Math.max(20, v('cutoff') * Math.pow(2, v('envamt') * 5 * Math.max(0.3, v('fsus')))));
    const vow = v('fvowel'), fmix = fxHeard('formant') ? v('fmix') : 0, fq = [700 + 500 * vow, 1200 + 1000 * (1 - vow), 2600];
    for (let h = 1; h <= 64; h++) {
      let g = Math.sqrt(filterMag2(f0 * h, fc, v('reso'), v('mode')));
      if (fmix > 0) { const f = f0 * h; let p = 0; for (const c of fq) p = Math.max(p, Math.exp(-(((f - c) / (c * 0.18)) ** 2))); g *= 1 + fmix * (0.5 + v('freso') * 2.5) * p - fmix * 0.4; }
      SC.re[h] *= g; SC.im[h] *= g;
    }
  }
  const out = new Float32Array(SC.n);
  MorphEngine.synth(SC.re, SC.im, 64, SC.n, out, W.sR, W.sI);
  let pk = 1e-6; for (const x of out) pk = Math.max(pk, Math.abs(x));
  return { w: out, pk };
}
// is an effect switched on and not at rest at this morph? (its On/Off and its rest settings, as the engine judges it)
const fxHeard = t => { const s = FX_KIND.indexOf(t); return state.fxOn[s] && Object.entries(MorphEngine.FX_CLASSES[t].REST).some(([k, v0]) => MAC.val[IX[k]] !== v0); };
function fxMarks(v) {
  const on = t => fxHeard(t);
  return {
    drive: on('drive') ? v('dmix') * (0.2 + v('drive')) : 0, dshape: v('dshape'),
    mod: on('mod') ? v('mmix') * (0.3 + 0.7 * v('mdepth')) : 0, mrate: v('mrate'),
    delay: on('delay') ? v('dlmix') : 0, dlfb: v('dlfb'), dlpp: v('dlpp'),
    reverb: on('reverb') ? v('rvmix') : 0, rvsize: v('rvsize'),
    crush: on('lofi') ? v('lchar') : 0, codec: on('lofi') ? v('lcodec') : 0, wow: on('lofi') ? Math.max(v('lwow'), v('lflut')) : 0, noise: on('lofi') ? v('lnmix') : 0,
    ott: on('ott') ? v('ottdepth') : 0,
  };
}
let scopeT = 0, scopeAnim = 0, scopeQueued = false;
function drawScope(now) {
  const c = prep(scopeEl); if (!c) return;
  const v = heardValues(), fx = fxMarks(v), g = c.g, H = c.h, Wd = c.w;
  const colM = mixColor(state.morph), ink = css('--ink');
  const gap = 6, mid0 = gap, midW = Wd - 2 * gap;   // only the wave heard now (2026-11-10): A and B show when a side is focused or the morph is at an end
  const t = (now || performance.now()) / 1000;
  // the wave heard now, with the effects' marks
  const { w, pk } = scopeWave(v);
  const n = SC.n, m = H / 2, amp = (H / 2 - 10) / pk;
  const shape = (x0) => {
    let y = x0;
    if (fx.ott > 0) y = Math.sign(y) * Math.pow(Math.abs(y), 1 - 0.6 * fx.ott);
    if (fx.drive > 0) {
      const k = 1 + 6 * fx.drive, sat = Math.tanh(k * y) / Math.tanh(k);
      const fold = Math.sin(y * (1 + 3 * fx.drive) * Math.PI / 2);
      y = y + (sat - y) * Math.min(1, fx.drive * 1.5); y = y + (fold - y) * fx.dshape * fx.drive;
    }
    if (fx.crush > 0.02) { const steps = Math.round(2 + 30 * (1 - fx.crush) ** 2); y = Math.round(y * steps) / steps; }
    return y;
  };
  const yAt = (i, ph) => {
    let j = i;
    if (fx.codec > 0.02) { const hold = 1 + Math.round(fx.codec * 10); j = Math.floor(i / hold) * hold; }
    const xs = (((j + ph) % n) + n) % n, k = Math.floor(xs), f = xs - k;
    const s = w[k] + (w[(k + 1) % n] - w[k]) * f;
    return shape(s / pk) * pk;
  };
  const wob = fx.wow > 0 ? fx.wow * 6 * Math.sin(t * 2.1) + fx.wow * 2 * Math.sin(t * 9.7) : 0;
  const path = (ph, scale, dx, dy) => {
    g.beginPath();
    for (let i = 0; i <= n; i++) { const x = mid0 + dx + i / n * midW, y = m + dy - yAt(i, ph + wob) * amp * scale; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  };
  g.save();
  g.beginPath(); g.rect(mid0 - gap / 2, 0, midW + gap, H); g.clip();
  g.strokeStyle = css('--line'); g.lineWidth = 1; g.beginPath(); g.moveTo(mid0, m); g.lineTo(mid0 + midW, m); g.stroke();
  g.lineJoin = 'round'; g.lineCap = 'round';
  // delay: echoes trailing right, smaller each time
  if (fx.delay > 0.01) {
    const reps = 1 + Math.round(fx.dlfb * 5);
    for (let r = reps; r >= 1; r--) {
      const a = fx.delay * Math.pow(0.35 + fx.dlfb * 0.55, r);
      g.globalAlpha = Math.min(0.9, a * 1.6); g.strokeStyle = colM; g.lineWidth = 1.5;
      path(0, Math.pow(0.7, r), r * midW * 0.07, (r % 2 ? -1 : 1) * fx.dlpp * H * 0.06 * r);
      g.stroke();
    }
  }
  // modulation: ghost copies swaying around the wave
  if (fx.mod > 0.01) {
    const sway = Math.sin(t * Math.PI * 2 * Math.min(fx.mrate, 3)) * fx.mod * 10;
    for (const k of [-1, 1]) { g.globalAlpha = 0.35 * Math.min(1, fx.mod * 1.5); g.strokeStyle = colM; g.lineWidth = 2; path(k * sway, 1 - 0.04 * k, 0, 0); g.stroke(); }
  }
  // reverb: a glow around the line
  g.globalAlpha = 1;
  if (fx.reverb > 0.01) { g.shadowColor = colM; g.shadowBlur = 6 + 30 * fx.rvsize * Math.min(1, fx.reverb * 1.5); }
  g.strokeStyle = colM; g.lineWidth = 3 + 3 * fx.ott;
  path(0, 1, 0, 0); g.stroke();
  if (fx.reverb > 0.01) { g.globalAlpha = Math.min(0.6, fx.reverb); g.lineWidth = 8 + 16 * fx.rvsize; g.globalAlpha *= 0.25; g.stroke(); }
  g.shadowBlur = 0; g.globalAlpha = 1;
  // lo-fi noise: specks around the line
  if (fx.noise > 0.01) {
    g.fillStyle = ink; const cnt = Math.round(fx.noise * 260);
    for (let k = 0; k < cnt; k++) {
      const r1 = Math.abs(Math.sin(k * 12.9898 + Math.floor(t * 12) * 78.233)) % 1, r2 = Math.abs(Math.sin(k * 4.1414 + Math.floor(t * 12) * 3.7)) % 1;
      g.globalAlpha = 0.25 + 0.4 * r2; g.fillRect(mid0 + r1 * midW, m + (r2 - 0.5) * H * 0.9, 1.6, 1.6);
    }
    g.globalAlpha = 1;
  }
  g.restore();
  return fx.mod > 0.01 || fx.wow > 0.01 || fx.noise > 0.01;
}
// draw now (next frame); while a moving mark is on screen, keep animating at about 30 frames a second
function drawScopeSoon() {
  if (scopeQueued) return; scopeQueued = true;
  requestAnimationFrame(now => { scopeQueued = false; const moving = drawScope(now); if (moving && !scopeAnim) scopeLoop(); });
}
function scopeLoop() {
  let last = 0;
  const step = now => {
    if (document.hidden) { scopeAnim = 0; return; }
    if (now - last > 33) { last = now; if (!drawScope(now)) { scopeAnim = 0; return; } }
    scopeAnim = requestAnimationFrame(step);
  };
  scopeAnim = requestAnimationFrame(step);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) drawScopeSoon(); });
