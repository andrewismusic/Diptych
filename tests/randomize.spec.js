// Randomization rules (DESIGN.md section 9 and the slot rules in section 13), checked statistically over many seeded runs.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const RUNS = 400;

test.describe('Randomize all (shaped)', () => {
  let S;
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await openSynth(page, { seed: 5 });
    S = await page.evaluate(RUNS => {
      const locked0 = DEFS.map((d, i) => [i, isLocked(d)]).filter(x => x[1]).map(([i]) => [i, state.A[i], state.B[i]]);
      const runs = [];
      for (let k = 0; k < RUNS; k++) {
        randomizeAll();
        // per side: key -> values of that key in every active parameter (several slots can share a key)
        const vals = { A: {}, B: {} };
        DEFS.forEach((d, i) => { if (!isActive(d)) return; for (const s of ['A', 'B']) (vals[s][d.key] = vals[s][d.key] || []).push(MorphEngine.denorm(d, state[s][i])); });
        const spreadFails = DEFS.filter((d, i) => isActive(d) && !d.single && !isLinked(i) && !isLocked(d) && !NO_SPREAD.has(d.key) && d.key !== 'cutoff'   // cutoff can be moved by the sine guard
          && Math.abs(state.A[i] - state.B[i]) < SPREAD - 1e-9).map(d => d.id);
        const lockedChanged = locked0.filter(([i, a, b]) => state.A[i] !== a || state.B[i] !== b).map(([i]) => DEFS[i].id);
        const linkedPitch = [0, 1, 2, 3].filter(s => state.oscType[s] === 'wt').map(s => [MorphEngine.denorm(DEFS[oi(s, 'pitch')], state.A[oi(s, 'pitch')]), MorphEngine.denorm(DEFS[oi(s, 'fine')], state.A[oi(s, 'fine')])]);
        runs.push({ vals, spreadFails, lockedChanged, osc: state.oscType.slice(), fx: state.fxType.slice(), linkedPitch, passed: [passedDb('A'), passedDb('B')] });
      }
      return runs;
    }, RUNS);
    await page.close();
  });
  // every value of a key, over both sides of every run
  const all = key => S.flatMap(r => [...(r.vals.A[key] || []), ...(r.vals.B[key] || [])]);
  const perSide = () => S.flatMap(r => [r.vals.A, r.vals.B]);
  const share = (xs, f) => xs.filter(f).length / xs.length;
  const near = (x, want, tol) => { expect(x).toBeGreaterThan(want - tol); expect(x).toBeLessThan(want + tol); };

  test('locked parameters never change', () => { expect([...new Set(S.flatMap(r => r.lockedChanged))]).toEqual([]); });
  test('slot types: Osc 1 Wavetable; Osc 2 Sub 40% / Wavetable 20% / Off 40%; Osc 3 and 4 Wavetable 20%', () => {
    expect(S.every(r => r.osc[0] === 'wt')).toBe(true);
    near(share(S, r => r.osc[1] === 'sub'), 0.4, 0.07); near(share(S, r => r.osc[1] === 'wt'), 0.2, 0.06);
    near(share(S, r => r.osc[2] === 'wt'), 0.2, 0.06); near(share(S, r => r.osc[3] === 'wt'), 0.2, 0.06);
  });
  test('FX types: slots 1-3 three different effects in chain order, slot 4 OTT', () => {
    const pool = ['drive', 'formant', 'mod', 'delay', 'reverb', 'lofi'];
    for (const r of S) {
      const f = r.fx.slice(0, 3).map(t => pool.indexOf(t));
      expect(f.every(x => x >= 0)).toBe(true);
      expect(f[0] < f[1] && f[1] < f[2]).toBe(true);
      expect(r.fx[3]).toBe('ott');
    }
    for (const t of pool) near(share(S, r => r.fx.includes(t)), 0.5, 0.08);
  });
  test('Wave stays at full range (A 0%, B 100%) in every Wavetable slot', () => {
    for (const r of S) { r.vals.A.wave.forEach(x => expect(x).toBe(0)); r.vals.B.wave.forEach(x => expect(x).toBe(1)); }
  });
  test('15% rule: A and B land at least 15% of the throw apart', () => {
    const fails = S.flatMap(r => r.spreadFails);
    expect(fails, fails.join(', ')).toEqual([]);
  });
  test('effect mixes: Formant 0 in 66%; Modulation, Delay, Reverb 0 in 40%', () => {
    near(share(all('fmix'), x => x === 0), 0.66, 0.07);
    for (const k of ['mmix', 'dlmix', 'rvmix']) near(share(all(k), x => x === 0), 0.4, 0.07);
  });
  test('effect mixes: at most two above 50% and at most one above 90%', () => {
    for (const v of perSide()) {
      const m = ['fmix', 'mmix', 'dlmix', 'rvmix'].flatMap(k => v[k] || []);
      expect(m.filter(x => x > 0.5).length).toBeLessThanOrEqual(2);
      expect(m.filter(x => x > 0.9).length).toBeLessThanOrEqual(1);
    }
  });
  test('delay mix mostly 0 to 35%, rarely above 50%', () => {
    expect(share(all('dlmix'), x => x <= 0.35)).toBeGreaterThan(0.8);
    expect(share(all('dlmix'), x => x > 0.5)).toBeLessThan(0.08);
  });
  test('glide: 0 in half, under 100 ms in 95%', () => { near(share(all('glide'), x => x === 0), 0.5, 0.06); expect(share(all('glide'), x => x < 0.1)).toBeGreaterThan(0.93); });
  test('unison off 40%', () => near(share(all('unison'), x => x === 0), 0.4, 0.06));
  test('vibrato depth within 30 cents about 85%', () => near(share(all('vdepth'), x => x <= 0.3), 0.85, 0.05));
  test('rate fade 0 half the time', () => near(share(all('vrfade'), x => x === 0), 0.5, 0.06));
  test('filter mode pure low-pass half the time (both filters)', () => near(share(all('mode'), x => x === 0), 0.5, 0.05));
  test('glide, unison and rate fade can be 0 on both sides', () => {
    for (const k of ['glide', 'vrfade']) expect(share(S, r => r.vals.A[k][0] === 0 && r.vals.B[k][0] === 0), k).toBeGreaterThan(0.1);
    expect(share(S, r => r.vals.A.unison[0] === 0 && r.vals.B.unison[0] === 0)).toBeGreaterThan(0.1);
  });
  test('lo-fi: Noise mix never above 35%; Wow, Flutter, Codec off 66%; Dropouts off 90%', () => {
    for (const x of all('lnmix')) expect(x).toBeLessThanOrEqual(0.35 + 1e-9);
    for (const k of ['lwow', 'lflut', 'lcodec']) near(share(all(k), x => x === 0), 0.66, 0.07);
    expect(share(all('ldrop'), x => x === 0)).toBeGreaterThan(0.85);
  });
  test('OTT band gains within ±3 dB, never all boosting or all cutting', () => {
    for (const v of perSide()) (v.ottgl || []).forEach((_, j) => {
      const g = [v.ottgl[j], v.ottgm[j], v.ottgh[j]];
      g.forEach(x => expect(Math.abs(x)).toBeLessThanOrEqual(3 + 1e-6));
      const sg = g.filter(x => Math.abs(x) > 0.05).map(Math.sign);
      expect(sg.length === 3 && sg.every(x => x === sg[0])).toBe(false);
    });
  });
  test('loudness guard: the filters pass at least 1% of the oscillators\' power on both sides', () => {
    const worst = Math.min(...S.flatMap(r => r.passed));
    expect(worst).toBeGreaterThanOrEqual(-20);
  });
  test('amp sustain 20% or more', () => { for (const x of all('asus')) expect(x).toBeGreaterThanOrEqual(0.2 - 1e-9); });
  test('slots: Filter on filter 1 in 60%, Bypass off in 80%, Sub Octave -1 in 60%', () => {
    near(share(all('flt'), x => x === 0), 0.6, 0.05);
    near(share(all('byp'), x => x === 0), 0.8, 0.05);
    near(share(all('soct'), x => x === -1), 0.6, 0.08);
  });
  test('linked Pitch and Fine: 0 about 70% of the time', () => {
    const p = S.flatMap(r => r.linkedPitch);
    near(share(p, x => x[0] === 0), 0.7, 0.06); near(share(p, x => x[1] === 0), 0.7, 0.06);
  });
});

test('randomizing one side never changes the sound at the other end', async ({ page }) => {
  await openSynth(page, { seed: 9 });
  const changed = await page.evaluate(() => {
    const hear = (s, morph) => T.render({ ...s, morph, notes: [[48, 0, 200], [60, 50, 250]], blocks: 300 });
    const same = (x, y) => x.L.every((v, i) => v === y.L[i]) && x.R.every((v, i) => v === y.R[i]);
    const out = [];
    for (let k = 0; k < 15; k++) {
      randomizeAll();
      const before = T.current(); randomizeSide('B');
      if (!same(hear(before, 0), hear(T.current(), 0))) out.push(`B changed full A, run ${k}`);
      const before2 = T.current(); randomizeSide('A');
      if (!same(hear(before2, 1), hear(T.current(), 1))) out.push(`A changed full B, run ${k}`);
    }
    return out;
  });
  expect(changed).toEqual([]);
});

test('section dice (raw) respect locks, stay inside their section and keep its type', async ({ page }) => {
  await openSynth(page, { seed: 3 });
  const res = await page.evaluate(() => {
    state.locks['f1.cutoff'] = true;
    const A0 = state.A.slice(), B0 = state.B.slice(), types = state.oscType.join() + state.fxType.join();
    for (let k = 0; k < 50; k++) { randomizeSide('A', 'Filter 1', true); randomizeAll('FX 2', true); }
    const changedOutside = DEFS.filter((d, i) => d.group !== 'Filter 1' && d.group !== 'FX 2' && (state.A[i] !== A0[i] || state.B[i] !== B0[i])).map(d => d.id);
    const i = IX['f1.cutoff'];
    return { changedOutside, cutoffKept: state.A[i] === A0[i] && state.B[i] === B0[i], resoChanged: state.A[IX['f1.reso']] !== A0[IX['f1.reso']],
      typesKept: types === state.oscType.join() + state.fxType.join() };
  });
  expect(res.changedOutside).toEqual([]);
  expect(res.cutoffKept).toBe(true);
  expect(res.resoChanged).toBe(true);
  expect(res.typesKept).toBe(true);
});

test('a locked section keeps its type through Randomize all', async ({ page }) => {
  await openSynth(page, { seed: 6 });
  const res = await page.evaluate(() => {
    state.secLocks['Osc 2'] = true; state.secLocks['FX 1'] = true; state.oscType[1] = 'wt'; state.fxType[0] = 'reverb';
    const seen = new Set();
    for (let k = 0; k < 40; k++) { randomizeAll(); seen.add(state.oscType[1] + '/' + state.fxType[0]); if (state.fxType.slice(1, 3).includes('reverb')) seen.add('duplicate'); }
    return [...seen];
  });
  expect(res).toEqual(['wt/reverb']);
});

test('Randomize linked only changes linked knobs, with one shared value', async ({ page }) => {
  await openSynth(page, { seed: 4 });
  const res = await page.evaluate(() => {
    state.links['f1.cutoff'] = true; state.B[IX['f1.cutoff']] = state.A[IX['f1.cutoff']];
    const A0 = state.A.slice(), B0 = state.B.slice();
    randomizeLinked();
    const changed = DEFS.filter((d, i) => state.A[i] !== A0[i] || state.B[i] !== B0[i]).map(d => d.id);
    return { changed, unlinkedChanged: changed.filter(id => !state.links[id]), shared: changed.every(id => state.A[IX[id]] === state.B[IX[id]]) };
  });
  expect(res.changed).toContain('f1.cutoff');
  expect(res.unlinkedChanged).toEqual([]);
  expect(res.shared).toBe(true);
});
