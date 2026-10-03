// Persistence (DESIGN.md section 10): patches survive reloads, Undo after launch brings back the
// previous session, parameters are matched by id, and patches from the fixed-chain version are ignored.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const KEY = 'diptych-v4';
const snapshot = page => page.evaluate(() => JSON.stringify({ A: state.A, B: state.B, C: state.C, links: state.links, locks: state.locks,
  osc: state.oscType, fx: state.fxType, fxOn: state.fxOn, dlSpill: state.dlSpill,
  tables: tables.map(t => [t.A.name, t.B.name, t.A.frames.length, t.B.frames.length]), seq: state.seq }));
const frames = page => page.evaluate(() => tables.flatMap(t => [...t.A.frames, ...t.B.frames]).map(f => Array.from(f)));
const waitForSave = page => page.waitForTimeout(700);   // saves are debounced by 400 ms

test('Undo after a relaunch restores the previous session exactly, slot types included', async ({ page }) => {
  await openSynth(page, { seed: 31, storage: {} });
  await page.evaluate(() => { state.links.reso = true; state.locks.fatk = true; state.fxOn[2] = false; state.dlSpill[1] = true; save(); });
  await waitForSave(page);
  const before = await snapshot(page), framesBefore = await frames(page);
  await page.reload();
  expect(await snapshot(page)).not.toEqual(before);   // every launch randomizes
  await page.click('#undo');
  expect(JSON.parse(await snapshot(page))).toEqual(JSON.parse(before));
  // wavetables are saved as 16-bit samples, so they come back within one 16-bit step
  const framesAfter = await frames(page);
  expect(framesAfter.length).toBe(framesBefore.length);
  let worst = 0; framesBefore.forEach((f, j) => f.forEach((x, n) => { worst = Math.max(worst, Math.abs(x - framesAfter[j][n])); }));
  expect(worst).toBeLessThanOrEqual(1 / 32767 + 1e-7);
});

test('locked parameters and locked sections survive a relaunch', async ({ page }) => {
  await openSynth(page, { seed: 32, storage: {} });
  await page.evaluate(() => {
    state.A[IX.level] = 0.37; state.B[IX.level] = 0.61;
    state.secLocks['Osc 2'] = true; state.oscType[1] = 'sub'; save();
  });
  await waitForSave(page);
  await page.reload();
  expect(await page.evaluate(() => ({ lv: [state.A[IX.level], state.B[IX.level]], osc2: state.oscType[1] })))
    .toEqual({ lv: [0.37, 0.61], osc2: 'sub' });
});

test('parameters are matched by id: unknown ids are ignored, missing ones get defaults', async ({ page }) => {
  await openSynth(page, { seed: 33, storage: {} });
  await waitForSave(page);
  const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
  const i = saved.ids.indexOf('reso');
  saved.A[i] = 0.9; saved.B[i] = 0.9;
  const ci = saved.ids.indexOf('cutoff');
  for (const k of ['A', 'B', 'C']) saved[k].splice(ci, 1);
  saved.ids.splice(ci, 1);
  saved.ids.push('bogus'); saved.A.push(0.5); saved.B.push(0.5); saved.C.push(0);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(saved)]);
  await page.reload();
  await page.click('#undo');   // back to exactly what was loaded, before the launch randomize
  const got = await page.evaluate(() => { const c = IX.cutoff; return { reso: state.A[IX.reso], cutoffA: state.A[c], cutoffB: state.B[c], defA: defaultNorm('A', c), defB: defaultNorm('B', c), n: state.A.length, nDefs: DEFS.length }; });
  expect(got.reso).toBeCloseTo(0.9, 9);
  expect(got.cutoffA).toBeCloseTo(got.defA, 9);
  expect(got.cutoffB).toBeCloseTo(got.defB, 9);
  expect(got.n).toBe(got.nDefs);
});

test('patches from the fixed-chain version (diptych-v3) are ignored', async ({ page }) => {
  const old = JSON.stringify({ ver: 9, ids: ['cutoff'], A: [0.1], B: [0.1], C: [0], bpm: 77, oscType: ['sub', 'sub', 'sub', 'sub'] });
  await openSynth(page, { seed: 34, storage: { 'diptych-v3': old } });
  await page.click('#undo');
  expect(await page.evaluate(() => ({ osc: state.oscType, cutoff: state.A[IX.cutoff] === defaultNorm('A', IX.cutoff) })))
    .toEqual({ osc: ['wt', 'off', 'off', 'off'], cutoff: true });
});

test('a corrupt saved patch falls back to defaults instead of breaking the page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openSynth(page, { seed: 35, storage: { [KEY]: '{not json' } });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => state.A.length === DEFS.length)).toBe(true);
});

test('ver 1 patches (two filters) migrate: Filter 1 becomes the filter, Filter 2 and the slot blend are dropped', async ({ page }) => {
  await openSynth(page, { seed: 36, storage: {} });
  await waitForSave(page);
  const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
  const ren = id => ['cutoff', 'reso', 'mode', 'envamt', 'keytrack'].includes(id) ? 'f1.' + id : id;
  saved.ver = 1; saved.ids = saved.ids.map(ren);
  const ci = saved.ids.indexOf('f1.cutoff'); saved.A[ci] = 0.42; saved.B[ci] = 0.43;
  saved.ids.push('f2.cutoff', 'o1.flt'); saved.A.push(0.9, 1); saved.B.push(0.9, 1); saved.C.push(0, 0);
  saved.locks = { ...saved.locks, 'f1.reso': true };
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(saved)]);
  await page.reload();
  await page.click('#undo');
  const got = await page.evaluate(() => ({ a: state.A[IX.cutoff], b: state.B[IX.cutoff], resoLocked: !!state.locks.reso }));
  expect(got.a).toBeCloseTo(0.42, 6); expect(got.b).toBeCloseTo(0.43, 6);
  expect(got.resoLocked).toBe(true);
  await waitForSave(page);
  expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).ver).toBe(3);
});

test('ver 2 patches with FM slots load, with those slots Off', async ({ page }) => {
  await openSynth(page, { seed: 37, storage: {} });
  await waitForSave(page);
  const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
  saved.ver = 2; saved.oscType = ['fm', 'wt', 'sub', 'fm'];
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(saved)]);
  await page.reload(); await page.click('#undo');
  expect(await page.evaluate(() => state.oscType)).toEqual(['off', 'wt', 'sub', 'off']);
});
