// Persistence (DESIGN.md section 10): patches survive reloads, Undo after launch brings back the
// previous session, parameters are matched by id, and patches from earlier versions are ignored.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const KEY = 'diptych-v5';
const snapshot = page => page.evaluate(() => JSON.stringify({ A: state.A, B: state.B, C: state.C, links: state.links, locks: state.locks,
  fxOn: state.fxOn, oscOn: state.oscOn, smp: state.smp,
  tables: tables.map(t => [t.A.name, t.B.name, t.A.frames.length, t.B.frames.length]), seq: state.seq }));
const frames = page => page.evaluate(() => tables.flatMap(t => [...t.A.frames, ...t.B.frames]).map(f => Array.from(f)));
const waitForSave = page => page.waitForTimeout(700);   // saves are debounced by 400 ms

test('Undo after a relaunch restores the previous session exactly, switches included', async ({ page }) => {
  await openSynth(page, { seed: 31, storage: {} });
  await page.evaluate(() => { state.links.reso = true; state.locks.fatk = true; state.fxOn[2] = false; state.oscOn[1] = false; save(); });
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
    state.secLocks['Wavetable 2'] = true; tables[1].A = makeTable('Sync sweep'); save();
  });
  await waitForSave(page);
  await page.reload();
  expect(await page.evaluate(() => ({ lv: [state.A[IX.level], state.B[IX.level]], t: tables[1].A.name })))
    .toEqual({ lv: [0.37, 0.61], t: 'Sync sweep' });
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

test('patches from earlier versions (diptych-v4, slot types) are ignored', async ({ page }) => {
  const old = JSON.stringify({ ver: 4, ids: ['cutoff'], A: [0.1], B: [0.1], C: [0], bpm: 77, oscType: ['sub', 'sub', 'sub', 'sub'] });
  await openSynth(page, { seed: 34, storage: { 'diptych-v4': old } });
  await page.click('#undo');
  expect(await page.evaluate(() => state.A[IX.cutoff] === defaultNorm('A', IX.cutoff) && state.bpm !== 77)).toBe(true);
});

test('a corrupt saved patch falls back to defaults instead of breaking the page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openSynth(page, { seed: 35, storage: { [KEY]: '{not json' } });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => state.A.length === DEFS.length)).toBe(true);
});

test('ver 1 patches: the one Loop and Cut / Spill setting becomes both sides\' setting', async ({ page }) => {
  await openSynth(page, { seed: 38, storage: {} });
  await waitForSave(page);
  const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
  saved.ver = 1; saved.smpLoop = true; saved.dlSpill = true;
  const drop = ['o4.sloop', 'dlspill'].map(id => saved.ids.indexOf(id)).sort((a, b) => b - a);
  for (const j of drop) for (const k of ['ids', 'A', 'B', 'C']) saved[k].splice(j, 1);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(saved)]);
  await page.reload(); await page.click('#undo');
  expect(await page.evaluate(() => ['o4.sloop', 'dlspill'].flatMap(id => [state.A[IX[id]], state.B[IX[id]]]))).toEqual([1, 1, 1, 1]);
});
