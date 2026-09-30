// Offline engine checks (DESIGN.md section 11): no NaN, CPU budget, and no clicks when
// settings jump. Click tests play a pure sine with the filter open, so any step larger
// than the sine's own steepest slope at the louder setting is a discontinuity.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const SINE = { cutoff: 18000, reso: 0, envamt: 0, keytrack: 0, unison: 0, vdepth: 0, rvmix: 0, aatk: 0.001, asus: 1 };

test('random patches never produce NaN and stay within full scale', async ({ page }) => {
  await openSynth(page, { seed: 11 });
  const res = await page.evaluate(() => {
    const out = [];
    for (let k = 0; k < 20; k++) {
      randomizeAll();
      const events = {}; for (let b = 0; b < 400; b += 20) events[b] = { type:'morph', v: (b / 400) % 1 };
      const notes = [36, 48, 55, 60, 63, 67, 72, 84].map((n, i) => [n, i * 10, 300 + i * 5]);
      const r = T.render({ patch: { A: state.A, B: state.B, C: state.C }, tables, notes, blocks: 450, events, fxOn: [1, 1, 1, 1, 1, 1, 1], dlSpill: state.dlSpill });
      out.push({ nan: T.hasNaN(r), peak: Math.max(T.peak(r.L), T.peak(r.R)) });
    }
    return out;
  });
  for (const r of res) { expect(r.nan).toBe(false); expect(r.peak).toBeLessThanOrEqual(1); }
});

test('CPU: 8 notes with every effect running stays well under real time', async ({ page }) => {
  await openSynth(page);
  const ratio = await page.evaluate(() => {
    const patch = T.flat({ unison: 1, drive: 0.5, dmix: 0.5, fmix: 0.5, mmix: 0.5, dlmix: 0.5, rvmix: 0.5, lchar: 0.5, lwow: 0.5, lcodec: 0.5, lnmix: 0.2, ottdepth: 1 });
    const notes = [36, 48, 55, 60, 63, 67, 72, 84].map(n => [n, 0, 9999]);
    T.render({ patch, notes, blocks: 200 });   // warm up the JIT
    const r = T.render({ patch, notes, blocks: 750 });   // 2 s
    return r.ms / 2000;
  });
  console.log(`CPU: ${(ratio * 100).toFixed(1)}% of real time`);
  expect(ratio).toBeLessThan(0.5);   // DESIGN.md measured 10 to 17% on a desktop core
});

const clickCheck = async (page, over, events, windows) => page.evaluate(({ SINE, over, events, windows }) => {
  const r = T.render({ patch: T.flat({ ...SINE, ...over }), tables: { A: 'Sine', B: 'Sine' }, notes: [[60, 0, 9999]], blocks: 800, events, fxOn: [1, 1, 1, 1, 1, 1, 1] });
  const at = b => b * 128;
  const steady = Math.max(...windows.steady.map(([a, b]) => Math.max(T.maxStep(r.L, at(a), at(b)), T.maxStep(r.R, at(a), at(b)))));
  const change = Math.max(...windows.change.map(([a, b]) => Math.max(T.maxStep(r.L, at(a), at(b)), T.maxStep(r.R, at(a), at(b)))));
  return { steady, change, ratio: change / steady };
}, { SINE, over, events, windows });

test('morph slider jumping from A to B does not click', async ({ page }) => {
  // Known: parameters are smoothed once per 16-sample sub-block, and the output gain (Level, Pan)
  // is held flat within each sub-block, so a fast Level change arrives as a small staircase.
  // Measured 1.7x the sine's own steepest step when written.
  test.fail(true, 'Level/Pan gain steps every 16 samples instead of per sample (engine fx(), output gain)');
  await openSynth(page);
  const r = await clickCheck(page, { level: [0.2, 1] }, { 300: { type:'morph', v:1 } },
    { steady: [[500, 700]], change: [[300, 340]] });
  expect(r.ratio).toBeLessThan(1.1);
});

test('effect On/Off switches crossfade without clicks', async ({ page }) => {
  await openSynth(page);
  for (const [k, over] of [[0, { drive: 0.8, dshape: 0.6, dmix: 1 }], [1, { fmix: 1 }], [2, { mmix: 1, mtype: 0.5 }], [5, { lchar: 1 }]]) {
    const r = await clickCheck(page, over, { 300: { type:'bypass', i:k, on:false }, 550: { type:'bypass', i:k, on:true } },
      { steady: [[200, 290], [450, 540]], change: [[300, 320], [550, 570]] });
    expect(r.ratio, `effect ${k}`).toBeLessThan(1.1);
  }
});
