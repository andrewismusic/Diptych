// Randomization rules (DESIGN.md section 9), checked statistically over many seeded runs.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const RUNS = 400;

test.describe('Randomize all (shaped)', () => {
  let S;
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await openSynth(page, { seed: 5 });
    S = await page.evaluate(RUNS => {
      const val = (side, id) => MorphEngine.denorm(DEFS[IX[id]], state[side][IX[id]]);
      const runs = [];
      const locked0 = DEFS.filter(d => isLocked(d)).map(d => [d.id, state.A[IX[d.id]], state.B[IX[d.id]]]);
      for (let k = 0; k < RUNS; k++) {
        randomizeAll();
        const r = { spreadFails: [], sides: {} };
        DEFS.forEach((d, i) => {
          if (d.single || isLinked(i) || isLocked(d) || NO_SPREAD.has(d.id) || d.id === 'cutoff') return;   // cutoff can be moved by the sine guard
          if (Math.abs(state.A[i] - state.B[i]) < SPREAD - 1e-9) r.spreadFails.push(d.id);
        });
        for (const side of ['A', 'B']) {
          const o = {};
          ['fmix', 'mmix', 'dlmix', 'rvmix', 'glide', 'lnmix', 'ottgl', 'ottgm', 'ottgh', 'lwow', 'lflut', 'lcodec', 'ldrop', 'asus', 'wave', 'unison', 'vdepth', 'vrfade', 'mode'].forEach(id => { o[id] = val(side, id); });
          r.sides[side] = o;
        }
        r.octave = val('A', 'octave'); r.fine = val('A', 'fine');
        r.lockedChanged = locked0.filter(([id, a, b]) => state.A[IX[id]] !== a || state.B[IX[id]] !== b).map(x => x[0]);
        runs.push(r);
      }
      return runs;
    }, RUNS);
    await page.close();
  });
  const sides = () => S.flatMap(r => [r.sides.A, r.sides.B]);
  const share = (xs, f) => xs.filter(f).length / xs.length;

  test('locked parameters never change', () => {
    expect(S.flatMap(r => r.lockedChanged)).toEqual([]);
  });
  test('Wave stays at full range (A 0%, B 100%)', () => {
    for (const r of S) { expect(r.sides.A.wave).toBe(0); expect(r.sides.B.wave).toBe(1); }
  });
  test('15% rule: A and B land at least 15% of the throw apart', () => {
    const fails = S.flatMap(r => r.spreadFails);
    expect(fails, fails.join(', ')).toEqual([]);
  });
  test('effect mixes: Formant 0 in 66%; Modulation, Delay, Reverb 0 in 40%', () => {
    expect(share(sides(), s => s.fmix === 0)).toBeGreaterThan(0.6); expect(share(sides(), s => s.fmix === 0)).toBeLessThan(0.72);
    for (const id of ['mmix', 'dlmix', 'rvmix']) {
      expect(share(sides(), s => s[id] === 0), id).toBeGreaterThan(0.34); expect(share(sides(), s => s[id] === 0), id).toBeLessThan(0.46);
    }
  });
  test('effect mixes: at most two above 50% and at most one above 90%', () => {
    for (const s of sides()) {
      const m = [s.fmix, s.mmix, s.dlmix, s.rvmix];
      expect(m.filter(x => x > 0.5).length).toBeLessThanOrEqual(2);
      expect(m.filter(x => x > 0.9).length).toBeLessThanOrEqual(1);
    }
  });
  test('delay mix mostly 0 to 35%, rarely above 50%', () => {
    expect(share(sides(), s => s.dlmix <= 0.35)).toBeGreaterThan(0.8);
    expect(share(sides(), s => s.dlmix > 0.5)).toBeLessThan(0.08);
  });
  test('glide: 0 in about half', () => {
    expect(share(sides(), s => s.glide === 0)).toBeGreaterThan(0.4); expect(share(sides(), s => s.glide === 0)).toBeLessThan(0.56);
  });
  test('lo-fi: Noise mix never above 35%; Wow, Flutter, Codec off 66%; Dropouts off 90%', () => {
    for (const s of sides()) expect(s.lnmix).toBeLessThanOrEqual(0.35 + 1e-9);
    for (const id of ['lwow', 'lflut', 'lcodec']) { const z = share(sides(), s => s[id] === 0); expect(z, id).toBeGreaterThan(0.6); expect(z, id).toBeLessThan(0.72); }
    expect(share(sides(), s => s.ldrop === 0)).toBeGreaterThan(0.86);
  });
  test('OTT band gains within ±3 dB, never all boosting or all cutting', () => {
    for (const s of sides()) {
      const g = [s.ottgl, s.ottgm, s.ottgh];
      g.forEach(x => expect(Math.abs(x)).toBeLessThanOrEqual(3 + 1e-6));
      const sg = g.filter(x => Math.abs(x) > 0.05).map(Math.sign);
      expect(sg.length === 3 && sg.every(x => x === sg[0])).toBe(false);
    }
  });
  test('amp sustain 20% or more', () => {
    for (const s of sides()) expect(s.asus).toBeGreaterThanOrEqual(0.2 - 1e-9);
  });

  // These five are exempt from the 15% rule, so their stated odds hold and both sides may sit at 0.
  test('glide under 100 ms in 95%', () => { expect(share(sides(), s => s.glide < 0.1)).toBeGreaterThan(0.93); });
  test('unison off 40%', () => { const z = share(sides(), s => s.unison === 0); expect(z).toBeGreaterThan(0.34); expect(z).toBeLessThan(0.46); });
  test('vibrato depth within 30 cents about 85%', () => { const z = share(sides(), s => s.vdepth <= 0.3); expect(z).toBeGreaterThan(0.8); expect(z).toBeLessThan(0.9); });
  test('rate fade 0 half the time', () => { const z = share(sides(), s => s.vrfade === 0); expect(z).toBeGreaterThan(0.44); expect(z).toBeLessThan(0.56); });
  test('filter mode pure low-pass half the time', () => { const z = share(sides(), s => s.mode === 0); expect(z).toBeGreaterThan(0.44); expect(z).toBeLessThan(0.56); });
  test('glide, unison, rate fade and mode can be 0 on both sides', () => {
    for (const id of ['glide', 'unison', 'vrfade', 'mode']) expect(share(S, r => r.sides.A[id] === 0 && r.sides.B[id] === 0), id).toBeGreaterThan(0.1);
  });

  test('linked Octave and Fine: 0 about 70% of the time', () => {
    const o = share(S, r => r.octave === 0), f = share(S, r => r.fine === 0);
    expect(o).toBeGreaterThan(0.62); expect(o).toBeLessThan(0.78);
    expect(f).toBeGreaterThan(0.62); expect(f).toBeLessThan(0.78);
  });
});

test('randomizing one side never changes the sound at the other end', async ({ page }) => {
  await openSynth(page, { seed: 9 });
  const changed = await page.evaluate(() => {
    const snap = () => ({ patch: { A: state.A.slice(), B: state.B.slice(), C: state.C.slice() }, tables: { A: cloneTable(tables.A), B: cloneTable(tables.B) }, dlSpill: state.dlSpill, fxOn: state.fxOn.map(x => +x) });
    const hear = (s, morph) => T.render({ ...s, morph, notes: [[48, 0, 200], [60, 50, 250]], blocks: 300 });
    const same = (x, y) => x.L.every((v, i) => v === y.L[i]) && x.R.every((v, i) => v === y.R[i]);
    const out = [];
    for (let k = 0; k < 15; k++) {
      randomizeAll();
      const before = snap(); randomizeSide('B');
      if (!same(hear(before, 0), hear(snap(), 0))) out.push(`B changed full A, run ${k}`);
      const before2 = snap(); randomizeSide('A');
      if (!same(hear(before2, 1), hear(snap(), 1))) out.push(`A changed full B, run ${k}`);
    }
    return out;
  });
  expect(changed).toEqual([]);
});

test('section dice (raw) respect locks and stay inside their section', async ({ page }) => {
  await openSynth(page, { seed: 3 });
  const res = await page.evaluate(() => {
    state.locks.cutoff = true;
    const A0 = state.A.slice(), B0 = state.B.slice();
    for (let k = 0; k < 50; k++) randomizeSide('A', 'Filter', true);
    const changedOutside = DEFS.filter((d, i) => d.group !== 'Filter' && (state.A[i] !== A0[i] || state.B[i] !== B0[i])).map(d => d.id);
    const i = IX.cutoff;
    return { changedOutside, cutoffKept: state.A[i] === A0[i] && state.B[i] === B0[i], resoChanged: state.A[IX.reso] !== A0[IX.reso], bUntouched: DEFS.every((d, j) => d.single || state.B[j] === B0[j]) };
  });
  expect(res.changedOutside).toEqual([]);
  expect(res.cutoffKept).toBe(true);
  expect(res.resoChanged).toBe(true);
  expect(res.bUntouched).toBe(true);
});

test('Randomize linked only changes linked knobs, with one shared value', async ({ page }) => {
  await openSynth(page, { seed: 4 });
  const res = await page.evaluate(() => {
    state.links.cutoff = true; state.B[IX.cutoff] = state.A[IX.cutoff];
    const A0 = state.A.slice(), B0 = state.B.slice();
    randomizeLinked();
    const changed = DEFS.filter((d, i) => state.A[i] !== A0[i] || state.B[i] !== B0[i]).map(d => d.id);
    return { changed, unlinkedChanged: changed.filter(id => !state.links[id]), shared: changed.every(id => state.A[IX[id]] === state.B[IX[id]]) };
  });
  expect(res.changed).toContain('cutoff');
  expect(res.unlinkedChanged).toEqual([]);
  expect(res.shared).toBe(true);
});
