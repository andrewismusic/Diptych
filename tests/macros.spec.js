// The player's controls and the hidden FM engine (DESIGN.md section 16, 2026-11-06): the four macros, the FM
// oscillator and its randomize guardrails, the broad sequencer controls and the player's view.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const MAC = ['menv', 'mbright', 'mfx', 'mwet'];

test('macros at 50% leave every value exactly as generated', async ({ page }) => {
  await openSynth(page, { seed: 41 });
  const bad = await page.evaluate(() => {
    const out = [];
    for (let k = 0; k < 10; k++) {
      randomizeAll();
      const p = T.current(); ['menv', 'mbright', 'mfx', 'mwet'].forEach(id => { p.patch.A[IX[id]] = 0.5; p.patch.B[IX[id]] = 0.5; });
      let eng = null;
      T.render({ ...p, morph: 0.3, blocks: 4, setup: e => { eng = e; } });
      DEFS.forEach((d, i) => { if (eng.val[i] !== Math.fround(MorphEngine.denorm(eng.defs[i], eng.cur[i]))) out.push(d.id); });   // val is a Float32Array
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test('FX wet at 0% makes every effect rest (dry, and idle)', async ({ page }) => {
  await openSynth(page, { seed: 42 });
  const idle = await page.evaluate(() => {
    const out = [];
    for (let k = 0; k < 15; k++) {
      randomizeAll();
      const p = T.current(); p.patch.A[IX.mwet] = 0; p.patch.B[IX.mwet] = 0;
      let eng = null;
      T.render({ ...p, morph: 0.5, notes: [[60, 0, 50]], blocks: 120, setup: e => { eng = e; } });
      out.push(eng.fxIdle.every(Boolean));
    }
    return out;
  });
  expect(idle.every(Boolean)).toBe(true);
});

test('Envelope: 0% is a short pluck, 100% a slow pad', async ({ page }) => {
  await openSynth(page);
  const r = await page.evaluate(() => {
    const hear = e => { const x = T.render({ patch: T.flat({ menv: e, rvmix: 0, ottdepth: 0, cutoff: 6000 }), notes: [[60, 0, 300]], blocks: 450 });
      return { start: T.rms(x.L, 0, 10 * 128), held: T.rms(x.L, 200 * 128, 290 * 128), after: T.rms(x.L, 330 * 128, 360 * 128) }; };
    return { pluck: hear(0), mid: hear(0.5), pad: hear(1) };
  });
  // the pluck has died away while the key is still held; the pad is still swelling at the start and rings on after release
  expect(r.pluck.held).toBeLessThan(r.mid.held * 0.05);
  expect(r.pad.start).toBeLessThan(r.mid.start * 0.3);
  // released: the medium envelope fades quickly, the pad hardly at all
  expect(r.mid.after).toBeLessThan(r.mid.held * 0.4);
  expect(r.pad.after).toBeGreaterThan(r.pad.held * 0.8);
});

test('Brightness: darker below 50%, brighter above, without a big level change at the ends', async ({ page }) => {
  await openSynth(page);
  const r = await page.evaluate(() => {
    // brightness measured as the share of energy in the sample-to-sample difference (rises with high harmonics)
    const hear = b => { const x = T.render({ patch: T.flat({ mbright: b, rvmix: 0, ottdepth: 0, cutoff: 2000, envamt: 0.3 }), tables: { A: 'Basic shapes', B: 'Basic shapes' }, notes: [[48, 0, 400]], blocks: 300 });
      const a = 100 * 128, z = 290 * 128, d = new Float32Array(z - a); for (let i = a + 1; i < z; i++) d[i - a] = x.L[i] - x.L[i - 1];
      return { hf: T.rms(d) / T.rms(x.L, a, z), db: T.db(T.rms(x.L, a, z)) }; };
    return { dark: hear(0), mid: hear(0.5), bright: hear(1) };
  });
  expect(r.dark.hf).toBeLessThan(r.mid.hf * 0.6);
  expect(r.bright.hf).toBeGreaterThan(r.mid.hf * 1.3);
  expect(Math.abs(r.bright.db - r.mid.db)).toBeLessThan(6);
});

test('macro and FM morph jumps do not click', async ({ page }) => {
  await openSynth(page);
  const res = await page.evaluate(() => {
    const SINE = { rvmix: 0, ottdepth: 0, cutoff: 18000, reso: 0, envamt: 0, keytrack: 0, 'o1.unison': 0, vdepth: 0, aatk: 0.001, asus: 1 };
    const out = {};
    for (const [name, over] of [['Envelope', { menv: [0.5, 1] }], ['Brightness', { mbright: [1, 0] }], ['FX wet', { mwet: [1, 0], rvmix: 0.3 }],
      ['FM Patch', { 'o1.olevel': 0, 'o5.olevel': 0.8, 'o5.l2A': 0, 'o5.l2B': 0, 'o5.l3A': 0, 'o5.l3B': 0, 'o5.l4A': 0, 'o5.l4B': 0, 'o5.algA': 7, 'o5.algB': 7, 'o5.d1A': 30, 'o5.d1B': 30, 'o5.l1A': 1, 'o5.l1B': 1 }]]) {
      const r = T.render({ tables: { A: 'Sine', B: 'Sine' }, notes: [[60, 0, 9999]], blocks: 700, fxOn: T.noFx, patch: T.flat({ ...SINE, ...over }), events: { 300: { type:'morph', v:1 } } });
      const st = (a, b) => Math.max(T.maxStep(r.L, a * 128, b * 128), T.maxStep(r.R, a * 128, b * 128));
      out[name] = st(300, 340) / Math.max(st(100, 290), st(500, 690));
    }
    return out;
  });
  for (const [k, ratio] of Object.entries(res)) expect(ratio, k).toBeLessThan(1.1);
});

test('FM: a ratio-1 carrier plays at the note, and each end of the morph hears only its own patch', async ({ page }) => {
  await openSynth(page);
  const r = await page.evaluate(() => {
    const sine = { 'o1.olevel': 0, 'o5.olevel': 0.8, 'o5.algA': 7, 'o5.l1A': 1, 'o5.l2A': 0, 'o5.l3A': 0, 'o5.l4A': 0, 'o5.d1A': 30, cutoff: 18000, envamt: 0, rvmix: 0, ottdepth: 0, asus: 1, vdepth: 0 };
    const x = T.render({ patch: T.flat(sine), notes: [[69, 0, 9999]], blocks: 400 });
    let zc = 0; for (let i = 100 * 128 + 1; i < 400 * 128; i++) if (x.L[i - 1] < 0 && x.L[i] >= 0) zc++;
    const hz = zc / (300 * 128 / 48000);
    // B's patch differs completely; at full A it must not be heard at all
    const p1 = T.flat(sine), p2 = T.flat(sine);
    p2.A[IX['o5.r2B']] = p2.B[IX['o5.r2B']] = norm(DEFS[IX['o5.r2B']], 7); p2.A[IX['o5.algB']] = p2.B[IX['o5.algB']] = 0;
    p2.A[IX['o5.l2B']] = p2.B[IX['o5.l2B']] = 0.9;
    const a = T.render({ patch: p1, notes: [[60, 0, 300]], blocks: 320 }), b = T.render({ patch: p2, notes: [[60, 0, 300]], blocks: 320 });
    return { hz, same: a.L.every((v, i) => v === b.L[i]) };
  });
  expect(Math.abs(r.hz - 440)).toBeLessThan(3);
  expect(r.same).toBe(true);
});

test('FM guardrails: patches come from the archetypes, stay in bounds and play cleanly across the keyboard', async ({ page }) => {
  await openSynth(page, { seed: 43 });
  const r = await page.evaluate(() => {
    const types = {}, bad = [];
    for (let k = 0; k < 400; k++) {
      fmPatch('A');
      types[fmTypeName.A] = (types[fmTypeName.A] || 0) + 1;
      const p = fmOf('A'), routes = OscFM.ALGS[Math.round(p.algo)][0];
      const mods = [false, routes[5] > 0, routes[3] > 0 || routes[4] > 0, routes[0] > 0 || routes[1] > 0 || routes[2] > 0];
      const sumI = p.l.reduce((t, l, j) => t + (mods[j] ? OscFM.index(l) : 0), 0);
      if (sumI > 9 + 1e-6 || p.fb > 0.6 + 1e-9 || p.r.some(x => !OscFM.RATIOS.includes(x))) bad.push(JSON.stringify(p));
    }
    // a few of them, bright, across the keyboard: no NaN, no overload
    const clean = [];
    for (let k = 0; k < 6; k++) {
      randomizeAll();
      const c = T.current(); ['A', 'B'].forEach(s => { c.patch[s][oi(FM_SLOT, 'olevel')] = 0.8; c.patch[s][IX.mbright] = 1; });
      const x = T.render({ ...c, notes: [24, 48, 72, 96, 108].map((n, i) => [n, i * 30, 200 + i * 10]), blocks: 300 });
      clean.push(!T.hasNaN(x) && T.peak(x.L) <= 1);
    }
    return { types, bad, clean };
  });
  expect(r.bad).toEqual([]);
  expect(Object.keys(r.types).length).toBe(8);
  expect(r.clean.every(Boolean)).toBe(true);
});

test('Speed and Octave change what plays; Density is each side\'s own setting', async ({ page }) => {
  await openSynth(page, { seed: 44 });
  const r = await page.evaluate(() => {
    const set = (k, key, v) => { state[k][IX[key]] = norm(DEFS[IX[key]], v); seqCache = null; };
    randSeqs(); set('A', 'sqspeed', 1); set('B', 'sqspeed', 1); set('A', 'sqoct', 0); set('A', 'sqdens', 1);
    const base = buildSeq().events.filter(e => e.a).map(e => [e.tick, e.a.p]);
    set('A', 'sqspeed', 2); const fast = buildSeq().events.filter(e => e.a).map(e => [e.tick, e.a.p]);
    set('A', 'sqspeed', 1); set('A', 'sqoct', 1); const up = buildSeq().events.filter(e => e.a).map(e => [e.tick, e.a.p]);
    set('A', 'sqoct', 0); set('A', 'sqdens', 0.5); const thin = buildSeq().events.filter(e => e.a).length;
    return { base, fast, up, thin, dA: stepPos(state.seq.A).total };
  });
  // 2x: every note at half the tick, twice per loop
  expect(r.fast.filter(([t]) => t < r.dA / 2).map(([t, p]) => [t * 2, p])).toEqual(r.base.filter(([t]) => t < r.dA));
  expect(r.up.map(([t, p]) => [t, p - 12])).toEqual(r.base);
  expect(r.thin).toBeLessThan(r.base.length);
});

test('random patterns: at least 5 notes, usually more, and a note on the downbeat of every bar', async ({ page }) => {
  await openSynth(page, { seed: 45 });
  const r = await page.evaluate(() => {
    const out = { min: 99, share: [], bars: 0, barsOn: 0 };
    for (let k = 0; k < 200; k++) {
      randSeqs();
      for (const q of [state.seq.A, state.seq.B]) {
        const kept = keptSteps(q), n = kept.filter(Boolean).length;
        out.min = Math.min(out.min, n); out.share.push(n / q.steps.length);
        barSlots(q).forEach(i => { out.bars++; if (kept[i]) out.barsOn++; });
      }
    }
    out.share = out.share.reduce((a, b) => a + b, 0) / out.share.length;
    return out;
  });
  expect(r.min).toBeGreaterThanOrEqual(5);
  expect(r.share).toBeGreaterThan(0.55);
  expect(r.barsOn / r.bars).toBeGreaterThan(0.9);
});

test('ver 2 patches: each pattern\'s Density becomes its side\'s Density setting; four On/Off switches load', async ({ page }) => {
  await openSynth(page, { seed: 46, storage: {} });
  await page.waitForTimeout(700);
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('diptych-v5')));
  saved.ver = 2; saved.seq.A.density = 0.6; saved.seq.B.density = 0.35; saved.oscOn = [true, false, true, true];
  for (const id of ['sqdens', 'sqspeed', 'sqoct']) { const j = saved.ids.indexOf(id); for (const k of ['ids', 'A', 'B', 'C']) saved[k].splice(j, 1); }
  await page.evaluate(v => localStorage.setItem('diptych-v5', v), JSON.stringify(saved));
  await page.reload(); await page.click('#undo');
  expect(await page.evaluate(() => [state.A[IX.sqdens], state.B[IX.sqdens], 'density' in state.seq.A, state.oscOn])).toEqual([0.6, 0.35, false, [true, false, true, true, true]]);
});

test.describe('player\'s view on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  test('only the Sound and Sequence cards, four macros across, no padlocks; macros drag', async ({ page }) => {
    await openSynth(page, { dev: false });
    const m = await page.evaluate(() => {
      const shown = [...document.querySelectorAll('main .group')].filter(g => g.offsetParent).map(g => g.dataset.group);
      const tops = [...sections.Sound.querySelectorAll('.kn')].map(k => Math.round(k.getBoundingClientRect().top));
      return { shown, oneRow: new Set(tops).size === 1, icons: [...document.querySelectorAll('main .lock')].filter(b => b.offsetParent).length,
        side: document.documentElement.scrollWidth - innerWidth, link: !!$('rndLinked').offsetParent, view: !!$('viewFull').offsetParent };
    });
    expect(m).toEqual({ shown: ['Sound', 'Sequence'], oneRow: true, icons: 0, side: 0, link: false, view: false });
    await page.locator('#qScale').selectOption('Dorian');
    expect(await page.evaluate(() => [state.seq.A.scale, state.seq.B.scale])).toEqual(['Dorian', 'Dorian']);
  });
});
