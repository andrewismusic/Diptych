/* ---------- wave displays ---------- */
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const W = { fa:[new Float32Array(513), new Float32Array(513)], fb:[new Float32Array(513), new Float32Array(513)],
            fr:[new Float32Array(513), new Float32Array(513)], sR:new Float32Array(256), sI:new Float32Array(256), out:new Float32Array(256) };
function synthDisplay(re, im) { MorphEngine.synth(re, im, 64, 256, W.out, W.sR, W.sI); return W.out; }
function drawWave(cv, data, color, opts = {}) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  let pk = opts.fit ? 0 : 1;
  if (opts.fit) { for (const x of data) pk = Math.max(pk, Math.abs(x)); if (pk < 1e-6) pk = 1; }
  const pad = opts.pad ?? 4, mid = h / 2, amp = (h / 2 - pad) / pk;
  g.strokeStyle = css('--line'); g.lineWidth = 1; g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
  g.strokeStyle = color; g.lineWidth = opts.lw || 1.8; g.lineJoin = 'round'; g.beginPath();
  const n = data.length;
  for (let i = 0; i <= n; i++) { const x = i / n * w, y = mid - data[i % n] * amp; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
}
/* ---------- filter + envelope pictures ---------- */
const hexRgb = h => { h = h.trim(); if (h.length === 4) h = '#' + [...h.slice(1)].map(c => c + c).join(''); return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
const toLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4), toS = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklab(rgb) {
  const [r, g, b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return 'rgb(' + [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
    .map(c => Math.round(clamp(toS(Math.max(0, c))) * 255)).join(',') + ')';
}
// mix in OKLCH (shorter hue path), matching the CSS gradient and ring colors
const mixColor = t => {
  const [L1, a1, b1] = oklab(hexRgb(css('--a'))), [L2, a2, b2] = oklab(hexRgb(css('--b')));
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), h1 = Math.atan2(b1, a1);
  let dh = Math.atan2(b2, a2) - h1; if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
  const L = L1 + (L2 - L1) * t, C = C1 + (C2 - C1) * t, h = h1 + dh * t;
  return fromOklab([L, C * Math.cos(h), C * Math.sin(h)]);
};
function prep(cv) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
// three values of a parameter: A's, B's and the one you hear now
const trio = id => { const i = IX[id], d = DEFS[i]; return [MorphEngine.denorm(d, state.A[i]), MorphEngine.denorm(d, state.B[i]), MorphEngine.denorm(d, resolveNorm(i))]; };
function plotSet(c, fn, n) {
  const cols = [css('--a'), css('--b'), mixColor(state.morph)], widths = [1.2, 1.2, 3.6];
  for (const s of [0, 1, 2]) {
    c.g.strokeStyle = cols[s]; c.g.lineWidth = widths[s]; c.g.globalAlpha = s < 2 ? 0.6 : 1; c.g.lineCap = 'round'; c.g.lineJoin = 'round';
    c.g.beginPath();
    for (let k = 0; k <= n; k++) { const [x, y] = fn(s, k / n); k ? c.g.lineTo(x, y) : c.g.moveTo(x, y); }
    c.g.stroke();
  }
  c.g.globalAlpha = 1;
}
function label(c, text, x, y, align) { c.g.fillStyle = css('--muted'); c.g.font = '11px "Barlow Semi Condensed", sans-serif'; c.g.textAlign = align; c.g.fillText(text, x, y); }
function drawFilterViz() {
  const c = prep($('vzF')); if (!c) return;
  const cut = trio('cutoff'), res = trio('reso'), md = trio('mode');
  const top = 24, bot = -36, yOf = db => 6 + (top - Math.max(bot, Math.min(top, db))) / (top - bot) * (c.h - 12);
  c.g.strokeStyle = css('--line'); c.g.lineWidth = 1;
  c.g.beginPath(); c.g.moveTo(0, yOf(0)); c.g.lineTo(c.w, yOf(0)); c.g.stroke();
  [100, 1000, 10000].forEach(f => { const x = Math.log(f / 20) / Math.log(1000) * c.w; c.g.beginPath(); c.g.moveTo(x, 0); c.g.lineTo(x, c.h); c.g.stroke(); });
  label(c, '100', Math.log(5) / Math.log(1000) * c.w + 3, c.h - 5, 'left');
  label(c, '1k', Math.log(50) / Math.log(1000) * c.w + 3, c.h - 5, 'left');
  label(c, '10k', Math.log(500) / Math.log(1000) * c.w + 3, c.h - 5, 'left');
  plotSet(c, (s, t) => {
    const f = 20 * Math.pow(1000, t), w = f / cut[s], k = 2 - 1.96 * res[s], bpG = Math.sqrt(k * 2), m = md[s];
    const wl = m < 0.5 ? 1 - m * 2 : 0, wb = m < 0.5 ? m * 2 : 2 - m * 2, wh = m < 0.5 ? 0 : m * 2 - 1;
    const nr = wl - wh * w * w, ni = wb * bpG * w, dr = 1 - w * w, di = k * w;
    const db = 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di) + 1e-12);
    return [t * c.w, yOf(db)];
  }, 160);
}
function drawEnvViz(id, pre) {
  const c = prep($(id)); if (!c) return;
  const A = trio(pre + 'atk'), D = trio(pre + 'dec'), S = trio(pre + 'sus'), Rl = trio(pre + 'rel');
  const span = Math.max(...[0, 1, 2].map(s => A[s] + D[s] + Rl[s])), hold = span * 0.3, T = span + hold;
  const lvl = (s, t) => {
    const a = A[s], d = D[s], su = S[s], r = Rl[s];
    if (t < a) return t / a;
    const endHold = a + d + hold;
    const dec = u => su + (1 - su) * Math.exp(-5 * u / d);
    if (t < endHold) return dec(t - a);
    return dec(endHold - a) * Math.exp(-6.9 * (t - endHold) / r);
  };
  const yOf = v => c.h - 6 - v * (c.h - 14);
  plotSet(c, (s, t) => [t * c.w, yOf(lvl(s, t * T))], 220);
  label(c, time(T), c.w - 5, 12, 'right');
}
/* OTT: where the bands split, and each band's level going in (outline) and coming out (filled) */
const ottLive = [null, null, null, null];
let ottQueued = false;
function drawOttViz(slot) {
  if (state.fxType[slot] !== 'ott') return;
  const c = prep($('vzOT' + slot)); if (!c) return;
  const val = key => MorphEngine.denorm(DEFS[xi(slot, key)], resolveNorm(xi(slot, key)));
  const fx = f => Math.log(f / 20) / Math.log(1000) * c.w, yOf = db => c.h - 4 - (Math.max(-72, Math.min(0, db)) + 72) / 72 * (c.h - 34);
  const lo = val('ottlo'), hi = val('otthi'), gains = ['ottgl', 'ottgm', 'ottgh'].map(val);
  const edges = [0, fx(lo), fx(hi), c.w], col = mixColor(state.morph), live = ottLive[slot];
  c.g.strokeStyle = css('--line'); c.g.lineWidth = 1;
  [fx(lo), fx(hi)].forEach(x => { c.g.beginPath(); c.g.moveTo(x, 0); c.g.lineTo(x, c.h); c.g.stroke(); });
  for (let b = 0; b < 3; b++) {
    const x0 = edges[b] + 3, w = edges[b + 1] - edges[b] - 6;
    if (w > 2) {
      // fill: the band's gain setting, from nearly empty at -12 dB to full at +12 dB
      const top = 30, fh = (c.h - 4 - top) * Math.max(0.04, (gains[b] + 12) / 24);
      c.g.fillStyle = col; c.g.globalAlpha = 0.5; c.g.fillRect(x0, c.h - 4 - fh, w, fh); c.g.globalAlpha = 1;
      if (live) { const inDb = live.lv[b]; c.g.strokeStyle = css('--ink'); c.g.lineWidth = 1.5; c.g.strokeRect(x0 + 0.75, yOf(inDb), w - 1.5, c.h - 4 - yOf(inDb)); }   // outline: live level
    }
    label(c, (gains[b] > 0 ? '+' : '') + gains[b].toFixed(1) + ' dB', edges[b] + (edges[b + 1] - edges[b]) / 2, 12, 'center');
  }
  label(c, Math.round(lo) + ' Hz', fx(lo) + 3, 25, 'left');
  label(c, (hi / 1000).toFixed(1) + ' kHz', fx(hi) + 3, 25, 'left');
}
const drawOttAll = () => { for (let s = 0; s < 4; s++) drawOttViz(s); };
function onOtt(d) { ottLive[d.slot] = d; if (!ottQueued) { ottQueued = true; requestAnimationFrame(() => { ottQueued = false; drawOttAll(); }); } }
// one cycle of a slot's sound for side 'A', 'B' or 'now' (what you hear), for the wave cards
const slotVal = (s, key, which) => { const i = oi(s, key); return MorphEngine.denorm(DEFS[i], which === 'now' ? resolveNorm(i) : state[which][i]); };
const CYC = new Float32Array(256);
function slotCycle(s, which) {
  const t = state.oscType[s];
  if (t === 'sub') {
    const shape = slotVal(s, 'sshape', which), g = 1 + 7 * slotVal(s, 'sdrive', which), tg = Math.tanh(g);
    for (let n = 0; n < 256; n++) CYC[n] = OscSub.sample(n / 256, 1 / 256, shape, g, tg);
  } else CYC.fill(0);
  return CYC;
}
// a sample's outline (or the blend of two, at mix), with a line at the Start point
function drawOverview(cv, oa, ob, mix, color, start) {
  const c = prep(cv); if (!c) return;
  const mid = c.h / 2, amp = c.h / 2 - 4, n = 128;
  c.g.strokeStyle = css('--line'); c.g.lineWidth = 1; c.g.beginPath(); c.g.moveTo(0, mid); c.g.lineTo(c.w, mid); c.g.stroke();
  const val = (o, i) => (o ? o[i] : null);
  const at = (j, i) => { const a = val(oa, j), b = val(ob, j); return a && b ? a[i] + (b[i] - a[i]) * mix : a ? a[i] * (ob ? 1 - mix : 1) : b ? b[i] * mix : 0; };
  c.g.fillStyle = color; c.g.beginPath();
  for (let i = 0; i < n; i++) c.g.lineTo(i / (n - 1) * c.w, mid - at(1, i) * amp);
  for (let i = n - 1; i >= 0; i--) c.g.lineTo(i / (n - 1) * c.w, mid - at(0, i) * amp);
  c.g.fill();
  c.g.strokeStyle = css('--ink'); c.g.lineWidth = 1.5; c.g.beginPath(); c.g.moveTo(start * c.w, 2); c.g.lineTo(start * c.w, c.h - 2); c.g.stroke();
}
let wavesQueued = false;
function drawWaves() {
  if (wavesQueued) return; wavesQueued = true;
  requestAnimationFrame(() => {
    wavesQueued = false;
    const sp = state.spectral;
    for (let s = 0; s < 4; s++) {
      const t = state.oscType[s];
      if (t === 'wt') {
        MorphEngine.frameAt(spec[s].A, state.A[oi(s, 'posA')], sp, W.fa[0], W.fa[1]);
        drawWave($('cvA' + s), synthDisplay(W.fa[0], W.fa[1]), css('--a'), { fit:true });
        MorphEngine.frameAt(spec[s].B, state.A[oi(s, 'posB')], sp, W.fb[0], W.fb[1]);
        drawWave($('cvB' + s), synthDisplay(W.fb[0], W.fb[1]), css('--b'), { fit:true });
        MorphEngine.interp(W.fa[0], W.fa[1], W.fb[0], W.fb[1], resolveNorm(oi(s, 'wave')), sp, W.fr[0], W.fr[1]);
        drawWave($('cvH' + s), synthDisplay(W.fr[0], W.fr[1]), mixColor(state.morph), { fit:true, lw:2.4 });
        $('nmA' + s).textContent = tables[s].A.name; $('nmB' + s).textContent = tables[s].B.name;
      } else if (t === 'smp') {
        const oa = sampleOverview(smpData[s].A), ob = sampleOverview(smpData[s].B), mix = resolveNorm(oi(s, 'sample'));
        drawOverview($('cvA' + s), oa, null, 0, css('--a'), slotVal(s, 'sstart', 'A'));
        drawOverview($('cvB' + s), ob, null, 0, css('--b'), slotVal(s, 'sstart', 'B'));
        drawOverview($('cvH' + s), oa, ob, mix, mixColor(state.morph), slotVal(s, 'sstart', 'now'));
        $('nmA' + s).textContent = state.smp[s].A ? state.smp[s].A.name : ''; $('nmB' + s).textContent = state.smp[s].B ? state.smp[s].B.name : '';
      } else {
        drawWave($('cvA' + s), slotCycle(s, 'A'), css('--a'), { fit:true });
        drawWave($('cvB' + s), slotCycle(s, 'B'), css('--b'), { fit:true });
        drawWave($('cvH' + s), slotCycle(s, 'now'), mixColor(state.morph), { fit:true, lw:2.4 });
        const name = which => t === 'sub' ? FMT.sshape(slotVal(s, 'sshape', which)) : 'Off';
        $('nmA' + s).textContent = name('A'); $('nmB' + s).textContent = name('B');
      }
    }
    drawFilterViz(); drawEnvViz('vzFE', 'f'); drawEnvViz('vzAE', 'a'); drawOttAll(); drawLanes();
  });
}
function updateBlendUI() {}

