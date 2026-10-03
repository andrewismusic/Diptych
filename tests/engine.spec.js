// Offline engine checks (DESIGN.md section 11): no NaN, CPU budget, and no clicks when
// settings jump or types switch. Click tests play a pure sine with the filter open, so any step larger
// than the sine's own steepest slope at the louder setting is a discontinuity.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const SINE = { cutoff: 18000, reso: 0, envamt: 0, keytrack: 0, 'o1.unison': 0, 'o2.unison': 0, vdepth: 0, aatk: 0.001, asus: 1,
  'o1.fml2': 0, 'o1.fml3': 0, 'o1.fml4': 0, 'o1.fmalgo': 7, 'o1.fmd1': 30 };   // an FM slot here is one plain sine

test('random patches never produce NaN and stay within full scale', async ({ page }) => {
  await openSynth(page, { seed: 11 });
  const res = await page.evaluate(() => {
    const out = [];
    for (let k = 0; k < 20; k++) {
      randomizeAll();
      const events = {}; for (let b = 0; b < 400; b += 20) events[b] = { type:'morph', v: (b / 400) % 1 };
      const notes = [36, 48, 55, 60, 63, 67, 72, 84].map((n, i) => [n, i * 10, 300 + i * 5]);
      const r = T.render({ ...T.current(), notes, blocks: 450, events });
      out.push({ nan: T.hasNaN(r), peak: Math.max(T.peak(r.L), T.peak(r.R)), osc: state.oscType.join(), fx: state.fxType.join() });
    }
    return out;
  });
  for (const r of res) { expect(r.nan, `${r.osc} / ${r.fx}`).toBe(false); expect(r.peak).toBeLessThanOrEqual(1); }
});

test('CPU: 8 notes, four oscillators and four effects stay well under real time', async ({ page }) => {
  await openSynth(page);
  const ratio = await page.evaluate(() => {
    const patch = T.flat({ 'o1.unison': 1, 'o3.unison': 1, 'o4.unison': 1, 'o2.sshape': 0.8, 'o3.byp': 0.5, 'o4.fml2': 0.8,
      'x1.lchar': 0.5, 'x1.lwow': 0.5, 'x1.lcodec': 0.5, 'x1.lnmix': 0.2, 'x2.dlmix': 0.5, 'x3.rvmix': 0.5, 'x4.ottdepth': 1 });
    const o = { patch, osc: ['wt', 'sub', 'wt', 'fm'], fx: ['lofi', 'delay', 'reverb', 'ott'], notes: [36, 48, 55, 60, 63, 67, 72, 84].map(n => [n, 0, 9999]) };
    T.render({ ...o, blocks: 200 });   // warm up the JIT
    return T.render({ ...o, blocks: 750 }).ms / 2000;   // 2 s
  });
  console.log(`CPU: ${(ratio * 100).toFixed(1)}% of real time`);
  expect(ratio).toBeLessThan(0.5);
});

const clickCheck = async (page, o, windows) => page.evaluate(({ SINE, o, windows }) => {
  const r = T.render({ tables: { A: 'Sine', B: 'Sine' }, notes: [[60, 0, 9999]], blocks: 800, fx: ['drive', 'drive', 'drive', 'drive'], fxOn: [0, 0, 0, 0],
    ...o, patch: T.flat({ ...SINE, ...(o.over || {}) }) });
  const at = b => b * 128;
  const step = ws => Math.max(...ws.map(([a, b]) => Math.max(T.maxStep(r.L, at(a), at(b)), T.maxStep(r.R, at(a), at(b)))));
  return { steady: step(windows.steady), change: step(windows.change), ratio: step(windows.change) / step(windows.steady) };
}, { SINE, o, windows });
const JUMP = { steady: [[100, 290], [500, 700]], change: [[300, 340]] };

test('morph jumps do not click: master and slot Level and Pan, filter routing', async ({ page }) => {
  // Parameters resolve every 16 samples; gains and routing must still glide per sample.
  await openSynth(page);
  for (const over of [{ level: [0.2, 1] }, { level: [1, 0.2] }, { pan: [-1, 1] }, { 'o1.olevel': [0.2, 1] }, { 'o1.opan': [-1, 1] },
    { 'o1.byp': [0, 1] }]) {
    const r = await clickCheck(page, { over, events: { 300: { type:'morph', v:1 } } }, JUMP);
    expect(r.ratio, JSON.stringify(over)).toBeLessThan(1.1);
  }
});

test('switching an oscillator type mid-note fades instead of clicking', async ({ page }) => {
  await openSynth(page);
  const fx = ['drive', 'drive', 'drive', 'drive'];
  for (const [from, to] of [['wt', 'sub'], ['sub', 'wt'], ['wt', 'off'], ['wt', 'fm'], ['fm', 'sub']]) {
    const r = await clickCheck(page, { osc: [from, 'off', 'off', 'off'], over: { 'o1.sshape': 0 }, events: { 300: { type:'slots', osc: [to, 'off', 'off', 'off'], fx } } },
      { steady: to === 'off' ? [[100, 290]] : [[100, 290], [500, 700]], change: [[300, 340]] });   // the Sub sounds an octave lower, so measure both sides
    expect(r.ratio, `${from} -> ${to}`).toBeLessThan(1.1);
  }
});

test('effect On/Off switches and effect type switches crossfade without clicks', async ({ page }) => {
  await openSynth(page);
  for (const [type, over] of [['drive', { 'x1.drive': 0.8, 'x1.dshape': 0.6, 'x1.dmix': 1 }], ['formant', { 'x1.fmix': 1 }], ['mod', { 'x1.mmix': 1, 'x1.mtype': 0.5 }], ['lofi', { 'x1.lchar': 1 }]]) {
    const r = await clickCheck(page, { over, fx: [type, 'drive', 'drive', 'drive'], fxOn: [1, 0, 0, 0],
      events: { 300: { type:'bypass', i:0, on:false }, 550: { type:'bypass', i:0, on:true } } },
      { steady: [[200, 290], [450, 540]], change: [[300, 320], [550, 570]] });
    expect(r.ratio, `On/Off ${type}`).toBeLessThan(1.1);
  }
  const over = { 'x1.drive': 0.8, 'x1.dmix': 1, 'x1.lchar': 1 };
  const r = await clickCheck(page, { over, fx: ['drive', 'drive', 'drive', 'drive'], fxOn: [1, 0, 0, 0],
    events: { 300: { type:'slots', osc: ['wt', 'off', 'off', 'off'], fx: ['lofi', 'drive', 'drive', 'drive'] } } },
    { steady: [[200, 290], [450, 540]], change: [[300, 330]] });
  expect(r.ratio, 'drive -> lo-fi').toBeLessThan(1.1);
});

test('a Sub follows slot 1 pitch, an octave or two below', async ({ page }) => {
  await openSynth(page);
  const f = await page.evaluate(() => {
    const pitchOf = o => {   // zero crossings per second of the right channel
      const r = T.render({ tables: { A: 'Sine', B: 'Sine' }, notes: [[60, 0, 9999]], blocks: 400, fx: ['drive', 'drive', 'drive', 'drive'], fxOn: [0, 0, 0, 0], ...o });
      let n = 0; for (let i = 20000; i < 50000; i++) if (r.R[i - 1] < 0 && r.R[i] >= 0) n++;
      return n / (30000 / 48000);
    };
    const open = { 'cutoff': 18000, 'envamt': 0, 'o1.unison': 0 };
    return {
      wt: pitchOf({ patch: T.flat(open) }),
      sub1: pitchOf({ osc: ['off', 'sub', 'off', 'off'], patch: T.flat({ ...open, 'o2.soct': -1 }) }),
      sub2: pitchOf({ osc: ['wt', 'sub', 'off', 'off'], patch: T.flat({ ...open, 'o1.pitch': 12, 'o1.olevel': 0, 'o2.soct': -2 }) }),
    };
  });
  expect(f.wt).toBeCloseTo(261.6, -1);
  expect(f.sub1).toBeCloseTo(130.8, -1);
  expect(f.sub2).toBeCloseTo(130.8, -1);   // slot 1 up an octave, Sub two octaves below that
});

test('FM: Algorithm morphs without clicks, and the pitch is right', async ({ page }) => {
  await openSynth(page);
  // jump the morph between two algorithms with real modulation: Algorithm blends, so nothing steps
  const fmOver = { 'o1.fmalgo': [0, 7], 'o1.fml2': 0.4, 'o1.fml3': 0.3, 'o1.fml4': 0.3, 'o1.fmd2': 30, 'o1.fmd3': 30, 'o1.fmd4': 30, 'o1.fmalgo': [0, 7] };
  const page2 = await page.evaluate(({ SINE, fmOver }) => {
    const run = morphAt => T.render({ osc: ['fm', 'off', 'off', 'off'], notes: [[60, 0, 9999]], blocks: 700, fx: ['drive', 'drive', 'drive', 'drive'], fxOn: [0, 0, 0, 0],
      patch: T.flat({ ...SINE, ...fmOver }), events: morphAt ? { 300: { type:'morph', v:1 } } : {} });
    const r = run(true), at = b => b * 128;
    const steady = Math.max(T.maxStep(r.L, at(100), at(290)), T.maxStep(r.L, at(500), at(690)));
    const change = T.maxStep(r.L, at(300), at(340));
    // pitch: zero crossings of a plain FM sine (algorithm 8, only op 1 heard)
    const p = T.render({ osc: ['fm', 'off', 'off', 'off'], notes: [[60, 0, 9999]], blocks: 400, fx: ['drive', 'drive', 'drive', 'drive'], fxOn: [0, 0, 0, 0], patch: T.flat({ ...SINE, 'o1.fmpitch': 12 }) });
    let n = 0; for (let i = 20000; i < 50000; i++) if (p.R[i - 1] < 0 && p.R[i] >= 0) n++;
    return { ratio: change / steady, hz: n / (30000 / 48000) };
  }, { SINE, fmOver });
  expect(page2.ratio).toBeLessThan(1.1);
  expect(page2.hz).toBeCloseTo(523.3, -1);
});

test('FM Decay: exponential when short, linear around 4 s, holding up when long, Hold at the top', async ({ page }) => {
  await openSynth(page);
  const r = await page.evaluate(() => [0.05, 4, 20, 30].map(D => [0.25, 0.5, 0.75].map(u => OscFM.env(u * D, D, OscFM.curve(D)))));
  const [short, mid, long, hold] = r;
  expect(short[0]).toBeLessThan(0.2);                     // a pluck: most of the level gone a quarter of the way through
  mid.forEach((x, k) => expect(x).toBeCloseTo(1 - (k + 1) * 0.25, 2));   // straight line
  expect(long[1]).toBeGreaterThan(0.75);                  // still high halfway
  expect(hold).toEqual([1, 1, 1]);
});
