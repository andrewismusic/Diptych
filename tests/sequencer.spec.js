// A/B sequence morph (DESIGN.md section 7): deterministic, exact at both ends, monophonic.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

test('at 0% the sequence is exactly A and at 100% exactly B (400 random pattern pairs)', async ({ page }) => {
  await openSynth(page, { seed: 21 });
  const bad = await page.evaluate(() => {
    const out = [];
    for (let k = 0; k < 400; k++) {
      randSeqs(); seqCache = null;
      const S = buildSeq();
      for (const walk of [true, false]) for (const ev of S.events) {
        for (const [mm, side] of [[0, 'a'], [1, 'b']]) {
          const r = MorphEngine.seqEval(ev, mm, walk, S.scale), want = ev[side];
          if (!want && r) out.push(`run ${k} tick ${ev.tick}: extra note at ${mm}`);
          else if (want && (!r || r.note !== want.p || Math.abs(r.vel - want.v) > 1e-9 || Math.abs(r.len - want.l) > 1e-9))
            out.push(`run ${k} tick ${ev.tick} walk ${walk}: at ${mm} got ${JSON.stringify(r)}, want ${JSON.stringify(want)}`);
        }
      }
    }
    return out.slice(0, 10);
  });
  expect(bad).toEqual([]);
});

test('the same pair of patterns always builds the same switch points', async ({ page }) => {
  await openSynth(page, { seed: 22 });
  const same = await page.evaluate(() => {
    for (let k = 0; k < 50; k++) {
      randSeqs();
      seqCache = null; const a = JSON.stringify(buildSeq().events);
      seqCache = null; const b = JSON.stringify(buildSeq().events);
      if (a !== b) return false;
    }
    return true;
  });
  expect(same).toBe(true);
});

test('the engine plays B note for note at 100%, one note at a time (20 random pattern pairs)', async ({ page }) => {
  await openSynth(page, { seed: 23 });
  const res = await page.evaluate(() => {
    const bpm = 120, out = { mismatches: [], overlaps: 0, notes: 0 };
    for (let k = 0; k < 20; k++) {
      randSeqs(); seqCache = null;
      const S = buildSeq(), played = [], held = new Set();
      const setup = e => {
        const on = e.noteOn.bind(e), off = e.noteOff.bind(e);
        e.noteOn = (n, v) => { if ([...held].some(h => h !== n)) out.overlaps++; held.add(n); played.push(n); on(n, v); };
        e.noteOff = n => { held.delete(n); off(n); };
      };
      const loopSec = S.loop / 48 / (bpm / 60), blocks = Math.ceil(loopSec * 48000 / 128) - 2;   // just under one loop
      T.render({ patch: T.flat({ pattern: 1 }), bpm, blocks, notes: [], setup,
        events: { 0: [{ type:'seq', seq: { events: S.events, loop: S.loop, scale: S.scale } }, { type:'seqPlay', on:true }] } });
      const want = S.events.filter(ev => ev.b && ev.tick / 48 / (bpm / 60) < (blocks * 128) / 48000).map(ev => ev.b.p);
      if (JSON.stringify(played) !== JSON.stringify(want)) out.mismatches.push({ k, played, want });
      out.notes += want.length;
    }
    return out;
  });
  expect(res.notes).toBeGreaterThan(40);   // random rates and densities: 68 notes with this seed
  expect(res.mismatches).toEqual([]);
  expect(res.overlaps).toBe(0);
});
