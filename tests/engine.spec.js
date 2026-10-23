// Offline engine checks (DESIGN.md section 11): no NaN, CPU budget, idle effects, and no clicks when
// settings jump or effects switch. Click tests play a pure sine with the filter open, so any step larger
// than the sine's own steepest slope at the louder setting is a discontinuity.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const FX_KIND_PAGE = ['drive', 'formant', 'mod', 'delay', 'reverb', 'lofi', 'ott'];
const SINE = { rvmix: 0, ottdepth: 0, cutoff: 18000, reso: 0, envamt: 0, keytrack: 0, 'o1.unison': 0, 'o2.unison': 0, vdepth: 0, aatk: 0.001, asus: 1 };

test('random patches never produce NaN and stay within full scale', async ({ page }) => {
  await openSynth(page, { seed: 11 });
  const res = await page.evaluate(() => {
    const out = [];
    for (let k = 0; k < 20; k++) {
      randomizeAll();
      const events = {}; for (let b = 0; b < 400; b += 20) events[b] = { type:'morph', v: (b / 400) % 1 };
      const notes = [36, 48, 55, 60, 63, 67, 72, 84].map((n, i) => [n, i * 10, 300 + i * 5]);
      const r = T.render({ ...T.current(), notes, blocks: 450, events });
      out.push({ nan: T.hasNaN(r), peak: Math.max(T.peak(r.L), T.peak(r.R)) });
    }
    return out;
  });
  for (const r of res) { expect(r.nan).toBe(false); expect(r.peak).toBeLessThanOrEqual(1); }
});

test('CPU: 8 notes, all four oscillators and all seven effects stay well under real time', async ({ page }) => {
  await openSynth(page);
  const ratio = await page.evaluate(() => {
    const patch = T.flat({ 'o4.sloop': 1, 'o1.unison': 1, 'o2.unison': 1, 'o2.olevel': 0.8, 'o3.olevel': 0.8, 'o4.olevel': 0.8, 'o3.sshape': 0.8, 'o2.byp': 0.5, 'o4.byp': 0.5,
      drive: 0.5, dmix: 0.5, fmix: 0.5, mmix: 0.5, lchar: 0.5, lwow: 0.5, lcodec: 0.5, lnmix: 0.2, dlmix: 0.5, rvmix: 0.5, ottdepth: 1 });
    const o = { patch, samples: { A: 'Vocal ah', B: 'Bell' }, notes: [36, 48, 55, 60, 63, 67, 72, 84].map(n => [n, 0, 9999]) };
    T.render({ ...o, blocks: 200 });   // warm up the JIT
    return T.render({ ...o, blocks: 750 }).ms / 2000;   // 2 s
  });
  console.log(`CPU: ${(ratio * 100).toFixed(1)}% of real time`);
  expect(ratio).toBeLessThan(0.5);
});

test('silent oscillators and effects cost almost nothing, and an effect turned back up has no stale tail', async ({ page }) => {
  await openSynth(page);
  const r = await page.evaluate(() => {
    const notes = [36, 48, 55, 60, 63, 67, 72, 84].map(n => [n, 0, 9999]);
    const time = over => { const o = { patch: T.flat(over), notes, samples: { A: 'Vocal ah', B: 'Vocal ah' } }; T.render({ ...o, blocks: 100 }); return T.render({ ...o, blocks: 500 }).ms; };
    const quiet = time({ rvmix: 0, ottdepth: 0 });   // one Wavetable heard; the other oscillators at Level 0, every effect at rest
    const busy = time({ 'o2.olevel': 0.8, 'o3.olevel': 0.8, 'o4.olevel': 0.8, dmix: 0.5, fmix: 0.5, mmix: 0.5, lchar: 0.5, dlmix: 0.5, rvmix: 0.5, ottdepth: 1 });
    let idle = null;
    T.render({ patch: T.flat({ rvmix: 0, ottdepth: 0 }), blocks: 20, setup: e => { idle = e; } });
    // a delay with long feedback rings, is turned down to 0 (both sides), then up again after the note has gone
    const P = T.flat({ dlmix: 0.6, dlfb: 0.9, rvmix: 0, ottdepth: 0, arel: 0.01 }), i = IX.dlmix, n = norm(DEFS[i], 0.6);
    const off = [{ type:'param', side:'A', i, v:0 }, { type:'param', side:'B', i, v:0 }], on = [{ type:'param', side:'A', i, v:n }, { type:'param', side:'B', i, v:n }];
    const d = T.render({ patch: P, notes: [[60, 0, 40]], blocks: 700, events: { 200: off, 400: on } });
    return { quiet, busy, idle: idle.fxIdle.slice(), stale: T.rms(d.L, 420 * 128, 700 * 128) };
  });
  console.log(`one Wavetable, effects at rest: ${r.quiet.toFixed(0)} ms; everything on: ${r.busy.toFixed(0)} ms`);
  expect(r.quiet).toBeLessThan(r.busy / 2);
  expect(r.idle).toEqual([true, true, true, true, true, true, true]);
  expect(r.stale).toBeLessThan(1e-5);
});

const clickCheck = async (page, o, windows) => page.evaluate(({ SINE, o, windows }) => {
  const r = T.render({ tables: { A: 'Sine', B: 'Sine' }, notes: [[60, 0, 9999]], blocks: 800, fxOn: T.noFx,
    ...o, patch: T.flat({ ...SINE, ...(o.over || {}) }) });
  const at = b => b * 128;
  const step = ws => Math.max(...ws.map(([a, b]) => Math.max(T.maxStep(r.L, at(a), at(b)), T.maxStep(r.R, at(a), at(b)))));
  return { steady: step(windows.steady), change: step(windows.change), ratio: step(windows.change) / step(windows.steady) };
}, { SINE, o, windows });
const JUMP = { steady: [[100, 290], [500, 700]], change: [[300, 340]] };

test('morph jumps do not click: master and slot Level and Pan, filter routing', async ({ page }) => {
  // Parameters resolve every 16 samples; gains and routing must still glide per sample.
  await openSynth(page);
  for (const over of [{ level: [0.2, 1] }, { level: [1, 0.2] }, { pan: [-1, 1] }, { 'o1.olevel': [0.2, 1] }, { 'o1.olevel': [0.8, 0] }, { 'o1.olevel': [0, 0.8] },
    { 'o1.opan': [-1, 1] }, { 'o1.byp': [0, 1] }]) {
    const r = await clickCheck(page, { over, events: { 300: { type:'morph', v:1 } } }, JUMP);
    expect(r.ratio, JSON.stringify(over)).toBeLessThan(1.1);
  }
});

test('effect On/Off switches, and effects going idle and waking, crossfade without clicks', async ({ page }) => {
  await openSynth(page);
  for (const [type, over] of [['drive', { drive: 0.8, dshape: 0.6, dmix: 1 }], ['formant', { fmix: 1 }], ['mod', { mmix: 1, mtype: 0.5 }], ['lofi', { lchar: 1 }]]) {
    const k = FX_KIND_PAGE.indexOf(type);
    const r = await clickCheck(page, { over, fxOn: FX_KIND_PAGE.map((_, j) => +(j === k)),
      events: { 300: { type:'bypass', i:k, on:false }, 550: { type:'bypass', i:k, on:true } } },
      { steady: [[200, 290], [450, 540]], change: [[300, 320], [550, 570]] });
    expect(r.ratio, `On/Off ${type}`).toBeLessThan(1.1);
  }
  // Drive and Lo-fi delay the sound a little, so going idle (dry, no delay) and waking up again must crossfade too
  for (const [key, v] of [['dmix', 1], ['lchar', 1]]) {
    const i = await page.evaluate(k => IX[k], key), n = await page.evaluate(([k, v]) => norm(DEFS[IX[k]], v), [key, v]);
    const set = x => [{ type:'param', side:'A', i, v:x }, { type:'param', side:'B', i, v:x }];
    const r = await clickCheck(page, { over: { [key]: v, drive: 0.8 }, fxOn: FX_KIND_PAGE.map(() => 1), events: { 300: set(0), 550: set(n) } },
      { steady: [[200, 290], [450, 540]], change: [[300, 360], [550, 610]] });
    expect(r.ratio, `${key} to 0 and back`).toBeLessThan(1.1);
  }
});

test('the Sub follows Wavetable 1 pitch, an octave or two below', async ({ page }) => {
  await openSynth(page);
  const f = await page.evaluate(() => {
    const pitchOf = o => {   // zero crossings per second of the right channel
      const r = T.render({ tables: { A: 'Sine', B: 'Sine' }, notes: [[60, 0, 9999]], blocks: 400, fxOn: T.noFx, ...o });
      let n = 0; for (let i = 20000; i < 50000; i++) if (r.R[i - 1] < 0 && r.R[i] >= 0) n++;
      return n / (30000 / 48000);
    };
    const open = { 'cutoff': 18000, 'envamt': 0, 'o1.unison': 0 };
    return {
      wt: pitchOf({ patch: T.flat(open) }),
      sub1: pitchOf({ patch: T.flat({ ...open, 'o1.olevel': 0, 'o3.olevel': 0.8, 'o3.soct': -1 }) }),
      sub2: pitchOf({ patch: T.flat({ ...open, 'o1.pitch': 12, 'o1.olevel': 0, 'o3.olevel': 0.8, 'o3.soct': -2 }) }),
    };
  });
  expect(f.wt).toBeCloseTo(261.6, -1);
  expect(f.sub1).toBeCloseTo(130.8, -1);
  expect(f.sub2).toBeCloseTo(130.8, -1);   // Wavetable 1 up an octave, Sub two octaves below that
});


// render the Sampler alone with a built-in sample on both sides
const smpRender = (page, o) => page.evaluate(o => {
  const r = T.render({ fxOn: T.noFx, blocks: o.blocks || 400, notes: o.notes, samples: { A: o.name, B: o.name },
    patch: T.flat({ cutoff: 18000, envamt: 0, asus: 1, arel: 0.01, 'o1.olevel': 0, 'o4.olevel': 0.8, 'o4.sloop': o.loop ? 1 : 0, ...(o.over || {}) }), events: o.events });
  const hz = (a, b) => {   // autocorrelation: the lag (40 to 600 samples) where the sound best matches itself
    let best = 0, bl = 0;
    for (let lag = 40; lag <= 600; lag++) { let c = 0, e = 0; for (let i = a; i < b; i++) { c += r.R[i] * r.R[i + lag]; e += r.R[i + lag] ** 2; } c /= Math.sqrt(e + 1e-12); if (c > best) { best = c; bl = lag; } }
    return 48000 / bl;
  };
  const rms = (a, b) => T.rms(r.R, a, b);
  return { hz1: hz(4800, 9600), rmsLate: rms(o.late || 0, (o.late || 0) + 4800), ratio: o.click ? T.maxStep(r.R, o.click[0], o.click[1]) / T.maxStep(r.R, o.click[2], o.click[3]) : 0 };
}, o);

test('Sampler: built-in samples play at middle C, follow the key, and stay put at 0% Key track', async ({ page }) => {
  await openSynth(page);
  expect((await smpRender(page, { name: 'Vocal ah', notes: [[60, 0, 9999]] })).hz1).toBeCloseTo(261.6, -1);
  expect((await smpRender(page, { name: 'Vocal ah', notes: [[72, 0, 9999]] })).hz1).toBeCloseTo(523.3, -1);
  expect((await smpRender(page, { name: 'Vocal ah', notes: [[72, 0, 9999]], over: { 'o4.strack': 0 } })).hz1).toBeCloseTo(261.6, -1);
});

test('Sampler: Loop keeps sounding past the end, One-shot stops', async ({ page }) => {
  await openSynth(page);
  const late = Math.round(3.2 * 48000);   // Vocal ah is 2.4 s long
  const one = await smpRender(page, { name: 'Vocal ah', notes: [[60, 0, 9999]], blocks: 1300, late });
  const loop = await smpRender(page, { name: 'Vocal ah', notes: [[60, 0, 9999]], blocks: 1300, late, loop: true });
  expect(one.rmsLate).toBeLessThan(1e-4);
  expect(loop.rmsLate).toBeGreaterThan(0.01);
});

test('Sampler: restarting a sounding note and looping do not click', async ({ page }) => {
  await openSynth(page);
  // the same note again at block 300 restarts the sample (crossfaded); compare its steepest step with the steady sound
  const r = await smpRender(page, { name: 'Vocal ah', notes: [[60, 0, 9999], [60, 300, 9999]], blocks: 600, click: [300 * 128, 300 * 128 + 600, 150 * 128, 290 * 128] });
  expect(r.ratio, 'restart').toBeLessThan(1.3);
  // the loop wrap: Vocal ah wraps at 2.4 s
  const w = Math.round(2.4 * 48000);
  const l = await smpRender(page, { name: 'Vocal ah', notes: [[60, 0, 9999]], blocks: 1000, loop: true, click: [w - 2000, w + 2000, w - 30000, w - 10000] });
  expect(l.ratio, 'loop wrap').toBeLessThan(1.3);
});

test('Loop is per side: at full A only A\'s setting counts, and the oscillator On/Off fades without clicking', async ({ page }) => {
  await openSynth(page);
  const late = Math.round(3.2 * 48000);   // Vocal ah is 2.4 s long
  const aOnly = await smpRender(page, { name: 'Vocal ah', notes: [[60, 0, 9999]], blocks: 1300, late, over: { 'o4.sloop': [1, 0] } });
  const bOnly = await smpRender(page, { name: 'Vocal ah', notes: [[60, 0, 9999]], blocks: 1300, late, over: { 'o4.sloop': [0, 1] } });
  expect(aOnly.rmsLate).toBeGreaterThan(0.01);   // morph is at A: A loops
  expect(bOnly.rmsLate).toBeLessThan(1e-4);      // B's Loop is not heard at full A
  const r = await clickCheck(page, { events: { 300: { type:'oscOn', i:0, on:false }, 400: { type:'oscOn', i:0, on:true } } },
    { steady: [[100, 290], [500, 700]], change: [[300, 330], [400, 430]] });
  expect(r.ratio, 'oscillator On/Off').toBeLessThan(1.1);
});

test('Cut / Spill is per side and switches halfway through the morph', async ({ page }) => {
  await openSynth(page);
  const r = await page.evaluate(() => {
    let seen = []; const P = T.flat({ dlspill: [0, 1], dlmix: 0.5 });
    const at = m => { T.render({ patch: P, morph: m, blocks: 10, setup: e => { const p = e.renderFx.bind(e); e.renderFx = (...a) => { p(...a); seen.push(e.fxInst[DELAY_SLOT].spill); }; } }); const x = seen[seen.length - 1]; seen = []; return x; };
    return [at(0), at(0.45), at(0.55), at(1)];
  });
  expect(r).toEqual([false, false, true, true]);
});
