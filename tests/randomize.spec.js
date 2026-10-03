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
        const linkedPitch = [0, 1, 2, 3].filter(s => ['wt', 'fm'].includes(state.oscType[s])).map(s => { const p = state.oscType[s] === 'fm' ? 'fm' : ''; return [MorphEngine.denorm(DEFS[oi(s, p + 'pitch')], state.A[oi(s, p + 'pitch')]), MorphEngine.denorm(DEFS[oi(s, p + 'fine')], state.A[oi(s, p + 'fine')])]; });
        const fm = [0, 1, 2, 3].filter(s => state.oscType[s] === 'fm' && !isLocked(DEFS[oi(s, 'fmd1')])).flatMap(s => ['A', 'B'].map(side => {
          const heard = OscFM.ALGS[Math.round(MorphEngine.denorm(DEFS[oi(s, 'fmalgo')], state[side][oi(s, 'fmalgo')]))][1];
          const d = [1, 2, 3, 4].filter((k, j) => heard[j]).map(k => MorphEngine.denorm(DEFS[oi(s, 'fmd' + k)], state[side][oi(s, 'fmd' + k)]));
          return { heardHold: d.every(x => x >= OscFM.HOLD - 1e-6), heardPluck: d.every(x => x >= 0.15 - 1e-6 && x <= 3 + 1e-6) };
        }));
        runs.push({ fm, vals, spreadFails, lockedChanged, osc: state.oscType.slice(), fx: state.fxType.slice(), linkedPitch, passed: [passedDb('A'), passedDb('B')] });
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
  test('slot types: Osc 1 never Off (Wavetable 45%, FM 40%, Sub 15%); Osc 2 Sub 30% / Off 40%; Osc 3 and 4 Off 75%', () => {
    expect(S.every(r => r.osc[0] !== 'off')).toBe(true);
    near(share(S, r => r.osc[0] === 'wt'), 0.45, 0.07); near(share(S, r => r.osc[0] === 'fm'), 0.4, 0.07);
    near(share(S, r => r.osc[1] === 'sub'), 0.3, 0.07); near(share(S, r => r.osc[1] === 'off'), 0.4, 0.07);
    near(share(S, r => r.osc[2] === 'off'), 0.75, 0.07); near(share(S, r => r.osc[3] === 'fm'), 0.1, 0.05);
  });
  test('FX types: four different effects from all seven, in chain order; OTT is optional', () => {
    const pool = ['drive', 'formant', 'mod', 'delay', 'reverb', 'lofi', 'ott'];
    for (const r of S) {
      const f = r.fx.map(t => pool.indexOf(t));
      expect(f.every(x => x >= 0)).toBe(true);
      expect(f[0] < f[1] && f[1] < f[2] && f[2] < f[3]).toBe(true);
    }
    for (const t of pool) near(share(S, r => r.fx.includes(t)), 4 / 7, 0.08);
  });
  test('Wave stays at full range (A 0%, B 100%) in every Wavetable slot', () => {
    for (const r of S) { (r.vals.A.wave || []).forEach(x => expect(x).toBe(0)); (r.vals.B.wave || []).forEach(x => expect(x).toBe(1)); }
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
  test('filter mode pure low-pass half the time', () => near(share(all('mode'), x => x === 0), 0.5, 0.05));
  test('glide, unison and rate fade can be 0 on both sides', () => {
    for (const k of ['glide', 'vrfade']) expect(share(S, r => r.vals.A[k][0] === 0 && r.vals.B[k][0] === 0), k).toBeGreaterThan(0.1);
    expect(share(S.filter(r => r.vals.A.unison), r => r.vals.A.unison[0] === 0 && r.vals.B.unison[0] === 0)).toBeGreaterThan(0.1);
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
  test('slots: Bypass off in 80%, Sub Octave -1 in 60%', () => {
    near(share(all('byp'), x => x === 0), 0.8, 0.05);
    near(share(all('soct'), x => x === -1), 0.6, 0.08);
  });
  test('FM: carrier ratio 1 most of the time; sustained (heard operators hold) about 60% of the time', () => {
    near(share(all('fmr1'), x => x === 1), 0.7, 0.08);
    const sides = S.flatMap(r => r.fm || []);
    expect(sides.length).toBeGreaterThan(100);
    near(share(sides, f => f.heardHold), 0.6, 0.08);
    expect(sides.every(f => f.heardHold || f.heardPluck)).toBe(true);
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
    state.locks['cutoff'] = true;
    const A0 = state.A.slice(), B0 = state.B.slice(), types = state.oscType.join() + state.fxType.join();
    for (let k = 0; k < 50; k++) { randomizeSide('A', 'Filter', true); randomizeAll('FX 2', true); }
    const changedOutside = DEFS.filter((d, i) => d.group !== 'Filter' && d.group !== 'FX 2' && (state.A[i] !== A0[i] || state.B[i] !== B0[i])).map(d => d.id);
    const i = IX['cutoff'];
    return { changedOutside, cutoffKept: state.A[i] === A0[i] && state.B[i] === B0[i], resoChanged: state.A[IX['reso']] !== A0[IX['reso']],
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
    for (let k = 0; k < 40; k++) { randomizeAll(); seen.add(state.oscType[1] + '/' + state.fxType[0]); if (state.fxType.slice(1).includes('reverb')) seen.add('duplicate'); }
    return [...seen];
  });
  expect(res).toEqual(['wt/reverb']);
});

test('Randomize linked only changes linked knobs, with one shared value', async ({ page }) => {
  await openSynth(page, { seed: 4 });
  const res = await page.evaluate(() => {
    state.links['cutoff'] = true; state.B[IX['cutoff']] = state.A[IX['cutoff']];
    const A0 = state.A.slice(), B0 = state.B.slice();
    randomizeLinked();
    const changed = DEFS.filter((d, i) => state.A[i] !== A0[i] || state.B[i] !== B0[i]).map(d => d.id);
    return { changed, unlinkedChanged: changed.filter(id => !state.links[id]), shared: changed.every(id => state.A[IX[id]] === state.B[IX[id]]) };
  });
  expect(res.changed).toContain('cutoff');
  expect(res.unlinkedChanged).toEqual([]);
  expect(res.shared).toBe(true);
});
