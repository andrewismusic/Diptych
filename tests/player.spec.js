// The redesign of 2026-11-10 (DESIGN.md section 17): side focus, undo and redo per gesture, the wave display's effect marks.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const dragKnob = async (page, i, dy) => {
  const box = await page.locator('#k' + i).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height * 0.1;   // the top of the ring, away from the curve in the center
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + dy, { steps: 5 }); await page.mouse.up();
};

test('side focus: a knob edits only the focused side, one undo step per drag, and redo brings it back', async ({ page }) => {
  await openSynth(page, { dev: false });
  const i = await page.evaluate(() => IX.mbright);
  await page.click('[data-focus="B"]');
  expect(await page.evaluate(i => [$('k' + i).classList.contains('kf-B'), $('hA' + i).style.display], i)).toEqual([true, 'none']);
  const before = await page.evaluate(i => [state.A[i], state.B[i], undoStack.length], i);
  await dragKnob(page, i, -60);
  const after = await page.evaluate(i => [state.A[i], state.B[i], undoStack.length], i);
  expect(after[0]).toBe(before[0]);              // A untouched
  expect(after[1]).toBeGreaterThan(before[1]);   // B moved up
  expect(after[2]).toBe(before[2] + 1);          // one step for the whole drag
  await page.click('#undo');
  expect(await page.evaluate(i => state.B[i], i)).toBe(before[1]);
  await page.click('#redo');
  expect(await page.evaluate(i => state.B[i], i)).toBe(after[1]);
  // Ctrl+Z / Ctrl+Shift+Z
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(i => state.B[i], i)).toBe(before[1]);
  await page.keyboard.press('Control+Shift+z');
  expect(await page.evaluate(i => state.B[i], i)).toBe(after[1]);
  // back in Morph, both handles again
  await page.click('[data-focus="B"]');
  expect(await page.evaluate(i => [$('k' + i).classList.contains('kf-B'), $('hA' + i).style.display, focus], i)).toEqual([false, '', 'M']);
});

test('the wave display marks the effects heard at this morph, and FX wet at 0% clears them', async ({ page }) => {
  await openSynth(page, { dev: false });
  const marks = over => page.evaluate(over => {
    for (const k of ['A', 'B']) {
      for (const id of ['dmix', 'fmix', 'mmix', 'dlmix', 'rvmix', 'lwow', 'lflut', 'lchar', 'lnmix', 'ldrop', 'lcodec', 'ottdepth']) state[k][IX[id]] = 0;
      for (const [id, v] of Object.entries(over)) state[k][IX[id]] = v;
    }
    const m = fxMarks(heardValues());
    return Object.fromEntries(['drive', 'mod', 'delay', 'reverb', 'crush', 'noise', 'ott'].map(k => [k, m[k] > 0]));
  }, over);
  const none = { drive: false, mod: false, delay: false, reverb: false, crush: false, noise: false, ott: false };
  expect(await marks({})).toEqual(none);
  expect(await marks({ dlmix: 0.4, rvmix: 0.3, mwet: 0.5 })).toEqual({ ...none, delay: true, reverb: true });
  expect(await marks({ dmix: 0.5, drive: 0.5, lchar: 0.5, lnmix: 0.2, ottdepth: 0.3, mwet: 0.5 })).toEqual({ ...none, drive: true, crush: true, noise: true, ott: true });
  expect(await marks({ dlmix: 0.4, rvmix: 0.3, dmix: 0.5, mwet: 0 })).toEqual(none);   // FX wet 0%: every effect rests
  // an effect switched off (On/Off) leaves no mark
  await page.evaluate(() => { state.fxOn[FX_KIND.indexOf('delay')] = false; });
  expect(await marks({ dlmix: 0.4, mwet: 0.5 })).toEqual(none);
  // it draws without errors, at phone width
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => { drawScope(performance.now()); });
  expect(errors).toEqual([]);
});

test('the header holds play, tempo, undo and redo; tempo drags up and down', async ({ page }) => {
  await openSynth(page, { dev: false });
  const b0 = await page.evaluate(() => state.bpm);
  const box = await page.locator('#bpmBox').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 30, { steps: 3 }); await page.mouse.up();
  expect(await page.evaluate(() => state.bpm)).toBe(Math.min(200, b0 + 10));
  // no Copy, Swap, Reset or Mute buttons any more
  expect(await page.locator('#copyAB, #copyBA, #swap, #resetAll').count()).toBe(0);
  expect(await page.locator('#audioBtn').textContent()).toBe('Tap to start audio');
});

test('Set A captures what you hear: same values, morph moved to A; Set B on the pattern keeps the heard sequence', async ({ page }) => {
  await openSynth(page, { dev: false });
  await page.evaluate(() => { state.morph = 0.4; updateMorphUI(); });
  const heard = await page.evaluate(() => DEFS.map((d, i) => (d.single || d.seq || d.pair || d.group === 'Sequencer' || isLinked(i) ? null : resolveNorm(i))));
  await page.click('#sendA');
  const after = await page.evaluate(() => ({ morph: state.morph, now: DEFS.map((d, i) => resolveNorm(i)) }));
  expect(after.morph).toBe(0);
  heard.forEach((v, i) => { if (v !== null) expect(Math.abs(after.now[i] - v)).toBeLessThan(1e-9); });
  // the pattern heard at the Pattern knob's value becomes sequence B, played at the B end
  const notesNow = await page.evaluate(() => { state.A[IX.pattern] = 0; state.B[IX.pattern] = 1; state.morph = 0.5; updateMorphUI(); seqCache = null;
    const s = buildSeq(), mm = resolveNorm(IX.pattern); return s.events.map(e => MorphEngine.seqEval(e, mm, state.walk, s.scale)).filter(Boolean).map(r => r.note); });
  await page.click('#patB');
  const notesB = await page.evaluate(() => { seqCache = null; const s = buildSeq(); return s.events.map(e => MorphEngine.seqEval(e, 1, state.walk, s.scale)).filter(Boolean).map(r => r.note); });
  expect(notesB.slice(0, 8)).toEqual(notesNow.slice(0, 8));
  await page.click('#undo');
});

test('Position: one knob whose A and B handles are the two tables\' positions', async ({ page }) => {
  await openSynth(page, { dev: false });
  const r = await page.evaluate(() => { setParam('A', IX.wpos, 0.2); setParam('B', IX.wpos, 0.9);
    return [state.A[oi(0, 'posA')], state.A[oi(0, 'posB')]]; });
  expect(r).toEqual([0.2, 0.9]);
  // after a roll, the knob follows the positions the randomizer chose
  await page.evaluate(() => bulk(() => randomizeAll()));
  expect(await page.evaluate(() => [state.A[IX.wpos] === state.A[oi(0, 'posA')], state.B[IX.wpos] === state.A[oi(0, 'posB')]])).toEqual([true, true]);
});

test('the MORPH cap brings back the morph view; Settings change the colours and hold Mono / Poly', async ({ page }) => {
  await openSynth(page, { dev: false });
  await page.evaluate(() => { state.morph = 0.3; updateMorphUI(); });
  await page.click('[data-focus="B"]');
  expect(await page.evaluate(() => [focus, state.morph])).toEqual(['B', 1]);
  await page.click('#mcap');
  expect(await page.evaluate(() => [focus, state.morph])).toEqual(['M', 0.3]);
  await page.click('#setBtn');
  await expect(page.locator('#settings')).toBeVisible();
  await page.click('[data-scheme="1"]');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--a').trim().toUpperCase())).toBe('#11907D');
  await page.click('#monoBtn');
  expect(await page.evaluate(() => state.mono)).toBe(true);
  await page.click('#setDone');
  await expect(page.locator('#settings')).toBeHidden();
});
