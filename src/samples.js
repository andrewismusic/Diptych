/* =====================================================================
   SAMPLES (UI side)
   Built-in samples are generated in code at middle C (so nothing has to be
   downloaded); loaded files are stored in IndexedDB, which can hold them
   (localStorage can't). A slot's choice per side is a small reference saved
   with the patch: { name } for a built-in sample, { name, id } for a file.
   ===================================================================== */
const SMP_SR = 44100, SMP_MAX_SEC = 20, C4 = 261.6256;
/* Level-match samples to the Wavetable: the loudest 50 ms is brought to the RMS of a full-level sawtooth
   (about 0.58), with peaks kept under 3 so very spiky sounds don't get out of hand. */
function smpNorm(d) {
  const W = Math.round(0.05 * SMP_SR); let best = 1e-9, acc = 0, pk = 1e-9;
  for (let i = 0; i < d.length; i++) { acc += d[i] * d[i]; if (i >= W) acc -= d[i - W] * d[i - W]; best = Math.max(best, acc / Math.min(i + 1, W)); pk = Math.max(pk, Math.abs(d[i])); }
  const g = Math.min(0.58 / Math.sqrt(best), 3 / pk);
  for (let i = 0; i < d.length; i++) d[i] *= g;
  return d;
}
const smpRand = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296 * 2 - 1; }; })();   // fixed noise, so built-ins are the same every time
const partials = (sec, list) => {   // [ratio, amplitude, decay seconds] at middle C
  const n = Math.round(sec * SMP_SR), d = new Float32Array(n);
  for (const [r, a, dec] of list) { const w = 2 * Math.PI * C4 * r / SMP_SR, k = Math.exp(-1 / (dec * SMP_SR)); let g = a; for (let i = 0; i < n; i++) { d[i] += g * Math.sin(w * i); g *= k; } }
  return d;
};
// sustained: loops well (Randomize usually turns Loop on for these)
const FACTORY = {
  'Plucked string': { sustained: false, make: () => {   // Karplus-Strong with a light loss filter, so it rings rather than going dull at once
    const n = Math.round(2 * SMP_SR), P = SMP_SR / C4 - 0.4, N = Math.floor(P), fr = P - N, d = new Float32Array(n);   // the loss filter adds 0.4 samples of delay
    const r = i => (i - N - 1 < 0 ? 0 : (1 - fr) * d[i - N] + fr * d[i - N - 1]);
    let lp = 0;   // a softened noise burst, so the string's energy goes into its tone rather than the attack
    for (let i = 0; i < n; i++) d[i] = i < N + 1 ? (lp += (smpRand() - lp) * 0.5) : 0.9985 * (0.6 * r(i) + 0.4 * r(i - 1));
    return d;
  } },
  'Bell': { sustained: false, make: () => partials(3.5, [[0.56, 1, 2.2], [0.92, 0.67, 2], [1.19, 1, 1.4], [1.71, 1.8, 1.2], [2, 2.67, 0.7], [2.74, 1.67, 0.8], [3, 1.46, 0.55], [3.76, 1.33, 0.45], [4.07, 1.33, 0.33]]) },
  'Mallet': { sustained: false, make: () => { const d = partials(1.6, [[1, 1, 0.6], [3.93, 0.5, 0.18], [9.2, 0.25, 0.05]]); for (let i = 0; i < 80; i++) d[i] += smpRand() * 0.3 * (1 - i / 80); return d; } },
  'Vocal ah': { sustained: true, make: () => {   // a pulse train through the formants of "ah"
    const n = Math.round(2.4 * SMP_SR), d = new Float32Array(n), F = [[730, 90, 1], [1090, 110, 0.5], [2440, 160, 0.3]];
    for (let h = 1; C4 * h < 8000; h++) {
      const f = C4 * h, g = F.reduce((t, [c, bw, a]) => t + a / (1 + ((f - c) / bw) ** 2), 0) / Math.sqrt(h), w = 2 * Math.PI * f / SMP_SR, ph = smpRand() * Math.PI;
      for (let i = 0; i < n; i++) d[i] += g * Math.sin(w * i * (1 + 0.004 * Math.sin(2 * Math.PI * 5 * i / SMP_SR)) + ph);
    }
    return d;
  } },
  'Breath pad': { sustained: true, make: () => {   // shaped noise over soft harmonics, swelling in
    const n = Math.round(3 * SMP_SR), d = partials(3, [[1, 0.5, 30], [2, 0.25, 30], [3, 0.12, 30], [1.5, 0.2, 30]]);
    let lp = 0, bp = 0;
    for (let i = 0; i < n; i++) { lp += (smpRand() - lp) * 0.08; bp += (lp - bp) * 0.02; d[i] = (d[i] + (lp - bp) * 2.5) * Math.min(1, i / (0.4 * SMP_SR)); }
    return d;
  } },
  'Drum': { sustained: false, make: () => {   // a tuned drum: falling sine with a click
    const n = Math.round(0.8 * SMP_SR), d = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SMP_SR, f = C4 * (0.5 + 1.5 * Math.exp(-t * 30)); ph += 2 * Math.PI * f / SMP_SR; d[i] = Math.sin(ph) * Math.exp(-t * 6) + (i < 120 ? smpRand() * 0.5 * (1 - i / 120) : 0); }
    return d;
  } },
};
const FACTORY_NAMES = Object.keys(FACTORY);
const factoryCache = {};
const factoryData = name => factoryCache[name] || (factoryCache[name] = { d: smpNorm(FACTORY[name].make()), sr: SMP_SR, name });

/* IndexedDB: loaded files, keyed by an id saved in the patch */
const idb = (() => {
  let db = null;
  const open = () => db || (db = new Promise((res, rej) => {
    const r = indexedDB.open('diptych', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('samples');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = (mode, fn) => open().then(d => new Promise((res, rej) => { const t = d.transaction('samples', mode), q = fn(t.objectStore('samples')); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); }));
  return { put: (k, v) => tx('readwrite', s => s.put(v, k)), get: k => tx('readonly', s => s.get(k)) };
})();
// decode an audio file to mono at SMP_SR, at most 20 seconds, peak-normalized
async function decodeSampleFile(file) {
  const buf = await new OfflineAudioContext(1, 1, SMP_SR).decodeAudioData(await file.arrayBuffer());
  const n = Math.min(buf.length, SMP_MAX_SEC * SMP_SR), d = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const ch = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] += ch[i] / buf.numberOfChannels; }
  return smpNorm(d);
}
// one column per pixel group: [mins, maxs], for the sample cards
const overviewCache = new WeakMap();
function sampleOverview(data, cols = 128) {
  if (!data) return null;
  let o = overviewCache.get(data.d); if (o) return o;
  const mn = new Float32Array(cols), mx = new Float32Array(cols), n = data.d.length;
  for (let c = 0; c < cols; c++) { let a = 0, b = 0; for (let i = Math.floor(c * n / cols); i < Math.floor((c + 1) * n / cols); i++) { a = Math.min(a, data.d[i]); b = Math.max(b, data.d[i]); } mn[c] = a; mx[c] = b; }
  o = [mn, mx]; overviewCache.set(data.d, o); return o;
}
