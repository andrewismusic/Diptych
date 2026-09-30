// Persistence (DESIGN.md section 10): patches survive reloads, Undo after launch brings back the
// previous session, parameters are matched by id, and old versions migrate.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const KEY = 'diptych-v3';
const snapshot = page => page.evaluate(() => JSON.stringify({ A: state.A, B: state.B, C: state.C, links: state.links, locks: state.locks,
  tables: { A: tables.A.name, B: tables.B.name, nA: tables.A.frames.length, nB: tables.B.frames.length }, seq: state.seq, bpm: state.bpm }));
const frames = page => page.evaluate(() => [...tables.A.frames, ...tables.B.frames].map(f => Array.from(f)));
const waitForSave = page => page.waitForTimeout(700);   // saves are debounced by 400 ms

test('Undo after a relaunch restores the previous session exactly', async ({ page }) => {
  await openSynth(page, { seed: 31, storage: {} });
  await page.evaluate(() => { state.links.reso = true; state.locks.fatk = true; save(); });
  await waitForSave(page);
  const before = await snapshot(page), framesBefore = await frames(page);
  await page.reload(); await page.evaluate(() => 0);
  expect(await snapshot(page)).not.toEqual(before);   // every launch randomizes
  await page.click('#undo');
  const after = JSON.parse(await snapshot(page)), want = JSON.parse(before);
  delete after.bpm; delete want.bpm;   // tempo is re-rolled at launch and is not part of Undo
  expect(after).toEqual(want);
  // wavetables are saved as 16-bit samples, so they come back within one 16-bit step
  const framesAfter = await frames(page);
  expect(framesAfter.length).toBe(framesBefore.length);
  let worst = 0; framesBefore.forEach((f, j) => f.forEach((x, n) => { worst = Math.max(worst, Math.abs(x - framesAfter[j][n])); }));
  expect(worst).toBeLessThanOrEqual(1 / 32767 + 1e-7);
});

test('locked parameters keep their value across a relaunch', async ({ page }) => {
  await openSynth(page, { seed: 32, storage: {} });
  const lv = await page.evaluate(() => { state.A[IX.level] = 0.37; state.B[IX.level] = 0.61; save(); return [0.37, 0.61]; });
  await waitForSave(page);
  await page.reload();
  expect(await page.evaluate(() => [state.A[IX.level], state.B[IX.level]])).toEqual(lv);
});

test('parameters are matched by id: unknown ids are ignored, missing ones get defaults', async ({ page }) => {
  await openSynth(page, { seed: 33, storage: {} });
  await waitForSave(page);
  const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
  const i = saved.ids.indexOf('reso');
  const resoA = 0.9;
  saved.A[i] = resoA; saved.B[i] = resoA;
  const ci = saved.ids.indexOf('cutoff');
  for (const k of ['A', 'B', 'C']) saved[k].splice(ci, 1);
  saved.ids.splice(ci, 1);
  saved.ids.push('bogus'); saved.A.push(0.5); saved.B.push(0.5); saved.C.push(0);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(saved)]);
  await page.reload();
  await page.click('#undo');   // back to exactly what was loaded, before the launch randomize
  const got = await page.evaluate(() => ({ reso: state.A[IX.reso], cutoffA: state.A[IX.cutoff], cutoffB: state.B[IX.cutoff], defA: defaultNorm('A', IX.cutoff), defB: defaultNorm('B', IX.cutoff), n: state.A.length, nDefs: DEFS.length }));
  expect(got.reso).toBeCloseTo(resoA, 9);
  expect(got.cutoffA).toBeCloseTo(got.defA, 9);
  expect(got.cutoffB).toBeCloseTo(got.defB, 9);
  expect(got.n).toBe(got.nDefs);
});

test('v8 patches migrate: Wave locked at full range with an even curve', async ({ page }) => {
  await openSynth(page, { seed: 34, storage: {} });
  await waitForSave(page);
  const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
  const i = saved.ids.indexOf('wave');
  saved.ver = 8; saved.A[i] = 0.3; saved.B[i] = 0.7; saved.C[i] = 0.5; delete saved.locks.wave;
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(saved)]);
  await page.reload();
  expect(await page.evaluate(() => ({ A: state.A[IX.wave], B: state.B[IX.wave], C: state.C[IX.wave], locked: !!state.locks.wave })))
    .toEqual({ A: 0, B: 1, C: 0, locked: true });
  await waitForSave(page);
  expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).ver).toBe(9);
});

test('a corrupt saved patch falls back to defaults instead of breaking the page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openSynth(page, { seed: 35, storage: { [KEY]: '{not json' } });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => state.A.length === DEFS.length)).toBe(true);
});
