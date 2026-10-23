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
      const locked0 = DEFS.map((d, i) => [i, isLocked(d)]).filter(x => x[1]).map(([i]) => [i, state.A[i], state.B[i]]);
      const runs = [];
      for (let k = 0; k < RUNS; k++) {
        randomizeAll();
        // per side: key -> values of that key in every parameter (oscillators share keys, in slot order)
        const vals = { A: {}, B: {} };
        DEFS.forEach((d, i) => { for (const s of ['A', 'B']) (vals[s][d.key] = vals[s][d.key] || []).push(MorphEngine.denorm(d, state[s][i])); });
        const spreadFails = DEFS.filter((d, i) => !d.single && !isLinked(i) && !isLocked(d) && !NO_SPREAD.has(d.key) && d.key !== 'cutoff'   // cutoff can be moved by the sine guard
          && Math.abs(state.A[i] - state.B[i]) < SPREAD - 1e-9).map(d => d.id);
        const lockedChanged = locked0.filter(([i, a, b]) => state.A[i] !== a || state.B[i] !== b).map(([i]) => DEFS[i].id);
        const linkedPitch = WT_SLOTS.map(s => [MorphEngine.denorm(DEFS[oi(s, 'pitch')], state.A[oi(s, 'pitch')]), MorphEngine.denorm(DEFS[oi(s, 'fine')], state.A[oi(s, 'fine')])]);
        // effects heard on each side: not every one of its rest settings at rest
        const heard = ['A', 'B'].map(k => FX_KIND.filter(t => Object.entries(MorphEngine.FX_CLASSES[t].REST).some(([key, v]) => MorphEngine.denorm(DEFS[IX[key]], state[k][IX[key]]) !== v)).length);
        // the oscillators heard together, against one full-level sawtooth (level match)
        const mixDb = ['A', 'B'].map(k => { let p = 0, clamped = false; OSC_KIND.forEach((_, s) => { const lv = state[k][oi(s, 'olevel')]; if (lv > 0) { p += oscPower(s, k) * (lv / 0.8) ** 2; if (lv >= 1 || lv <= 0.05) clamped = true; } });
          return { db: 10 * Math.log10(p / LEVEL_RMS ** 2), clamped, n: OSC_KIND.filter((_, s) => state[k][oi(s, 'olevel')] > 0).length }; });
        runs.push({ vals, spreadFails, lockedChanged, linkedPitch, heard, mixDb, passed: [passedDb('A'), passedDb('B')] });
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
  test('oscillators heard on a side: Wavetable 1 85%, Wavetable 2 40%, Sub 30%, Sampler 40%; always at least one', () => {
    const sides = perSide();
    for (const v of sides) expect(v.olevel.some(x => x > 0)).toBe(true);
    [0.86, 0.41, 0.31, 0.41].forEach((want, s) => near(share(sides, v => v.olevel[s] > 0), want, 0.06));
  });
  test('level match: whichever oscillators a side hears, together they sit at one sawtooth\'s level', () => {
    const m = S.flatMap(r => r.mixDb), free = m.filter(x => !x.clamped);
    expect(free.length / m.length).toBeGreaterThan(0.85);
    for (const x of free) expect(Math.abs(x.db)).toBeLessThan(0.01);
    for (const x of m) expect(x.db).toBeLessThan(0.01);   // a Level at 100% can leave a quiet sample short, never over
    expect(share(m, x => x.n > 1)).toBeGreaterThan(0.6);  // more than one oscillator on most sides
  });
  test('each side hears about 2.3 effects on average', () => {
    const n = S.flatMap(r => r.heard), mean = n.reduce((a, b) => a + b, 0) / n.length;
    expect(mean).toBeGreaterThan(1.9); expect(mean).toBeLessThan(2.7);
  });
  test('Cut / Spill is 50/50 on each side', () => near(share(all('dlspill'), x => x === 1), 0.5, 0.06));
  test('Wave stays at full range (A 0%, B 100%) in every Wavetable slot', () => {
    for (const r of S) { (r.vals.A.wave || []).forEach(x => expect(x).toBe(0)); (r.vals.B.wave || []).forEach(x => expect(x).toBe(1)); }
  });
  test('15% rule: A and B land at least 15% of the throw apart', () => {
    const fails = S.flatMap(r => r.spreadFails);
    expect(fails, fails.join(', ')).toEqual([]);
  });
  test('effects on for a side: Drive 20%, Formant 10%, Modulation 40%, Delay 50%, Reverb 50%, OTT 50%', () => {
    for (const [k, want] of [['dmix', 0.2], ['fmix', 0.1], ['mmix', 0.4], ['dlmix', 0.5], ['rvmix', 0.5], ['ottdepth', 0.5]]) near(share(all(k), x => x > 0), want, 0.06);
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
  test('lo-fi: off entirely on a side 90% of the time; otherwise Noise mix never above 35%, Wow, Flutter, Codec off 66%, Dropouts off 90%', () => {
    const sides = perSide(), on = sides.filter(v => ['lwow', 'lflut', 'lchar', 'lnmix', 'ldrop', 'lcodec'].some(k => v[k][0] !== 0));
    near(1 - on.length / sides.length, 0.9, 0.04);
    for (const x of all('lnmix')) expect(x).toBeLessThanOrEqual(0.35 + 1e-9);
    for (const k of ['lwow', 'lflut', 'lcodec']) near(share(on, v => v[k][0] === 0), 0.66, 0.13);   // about 80 sides with Lo-fi on
    expect(share(on, v => v.ldrop[0] === 0)).toBeGreaterThan(0.8);
  });
  test('OTT band gains within ±3 dB, never all boosting or all cutting; flat where OTT is off', () => {
    for (const v of perSide()) {
      const g = [v.ottgl[0], v.ottgm[0], v.ottgh[0]];
      if (v.ottdepth[0] === 0) { expect(g).toEqual([0, 0, 0]); continue; }
      g.forEach(x => expect(Math.abs(x)).toBeLessThanOrEqual(3 + 1e-6));
      const sg = g.filter(x => Math.abs(x) > 0.05).map(Math.sign);
      expect(sg.length === 3 && sg.every(x => x === sg[0])).toBe(false);
    }
  });
  test('loudness guard: the filters pass at least 1% of the oscillators\' power on both sides', () => {
    const worst = Math.min(...S.flatMap(r => r.passed));
    expect(worst).toBeGreaterThanOrEqual(-20);
  });
  test('amp sustain 20% or more', () => { for (const x of all('asus')) expect(x).toBeGreaterThanOrEqual(0.2 - 1e-9); });
  test('oscillators: Bypass off in 80%, Sub Octave -1 in 60%', () => {
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

test('section dice (raw) respect locks and stay inside their section', async ({ page }) => {
  await openSynth(page, { seed: 3 });
  const res = await page.evaluate(() => {
    state.locks['cutoff'] = true;
    const A0 = state.A.slice(), B0 = state.B.slice();
    for (let k = 0; k < 50; k++) { randomizeSide('A', 'Filter', true); randomizeAll('Delay', true); }
    const changedOutside = DEFS.filter((d, i) => d.group !== 'Filter' && d.group !== 'Delay' && (state.A[i] !== A0[i] || state.B[i] !== B0[i])).map(d => d.id);
    const i = IX['cutoff'];
    return { changedOutside, cutoffKept: state.A[i] === A0[i] && state.B[i] === B0[i], resoChanged: state.A[IX['reso']] !== A0[IX['reso']] };
  });
  expect(res.changedOutside).toEqual([]);
  expect(res.cutoffKept).toBe(true);
  expect(res.resoChanged).toBe(true);
});

test('a locked oscillator section keeps its tables or samples; Randomize never touches the On/Off switches', async ({ page }) => {
  await openSynth(page, { seed: 6 });
  const res = await page.evaluate(() => {
    state.secLocks['Wavetable 2'] = true; state.secLocks['Sampler'] = true; state.fxOn[3] = false;
    const t = [tables[1].A.name, tables[1].B.name].join(), smp = JSON.stringify(state.smp), on = state.fxOn.join();
    for (let k = 0; k < 20; k++) randomizeAll();
    return { tables: [tables[1].A.name, tables[1].B.name].join() === t, smp: JSON.stringify(state.smp) === smp, on: state.fxOn.join() === on, t1: tables[0].A.name };
  });
  expect(res).toMatchObject({ tables: true, smp: true, on: true });
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
