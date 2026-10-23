// The real page in a real browser: loads cleanly, real audio comes out of the AudioWorklet,
// and the layout works at phone width with touch (the owner tests mainly on a phone).
import { test, expect, devices } from '@playwright/test';
import { openSynth } from './helpers.js';

const outputLevel = page => page.evaluate(async () => {
  let best = 0; const buf = new Float32Array(window.__tap.fftSize);
  for (let k = 0; k < 10; k++) {
    window.__tap.getFloatTimeDomainData(buf);
    let s = 0; for (const x of buf) s += x * x; best = Math.max(best, Math.sqrt(s / buf.length));
    await new Promise(r => setTimeout(r, 50));
  }
  return 20 * Math.log10(best + 1e-12);
});

async function startAudio(page) {
  await page.click('#audioBtn');
  await page.waitForFunction(() => ready && ctx.state === 'running');
  expect(await page.textContent('#engineInfo')).toContain('AudioWorklet');
}

test('loads without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await openSynth(page);
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('sequencer plays real audio through the AudioWorklet', async ({ page }) => {
  await openSynth(page, { tapAudio: true });
  await startAudio(page);
  const idle = await outputLevel(page);   // not always silent: Lo-fi noise plays even with no notes
  await page.click('#play');
  await page.waitForTimeout(800);
  const playing = await outputLevel(page);
  expect(playing).toBeGreaterThan(-65);   // random launch patches range from about -60 to -15 dB
  expect(playing - idle).toBeGreaterThan(30);
  await page.click('#play');
});

test('computer keyboard plays notes', async ({ page }) => {
  await openSynth(page, { tapAudio: true });
  await startAudio(page);
  await page.click('#pmKeys');
  const idle = await outputLevel(page);
  await page.keyboard.down('a');
  await page.waitForTimeout(400);
  const playing = await outputLevel(page);
  expect(playing).toBeGreaterThan(-65);
  expect(playing - idle).toBeGreaterThan(30);
  await page.keyboard.up('a');
});

test('patch buttons: Copy, Swap, Reset, Undo and the dice work without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openSynth(page);
  const snap = () => page.evaluate(() => JSON.stringify({ A: state.A, B: state.B, smp: state.smp, t: tables.map(t => [t.A.name, t.B.name]) }));
  await page.click('#copyAB');
  expect(await page.evaluate(() => tables.every(t => t.A.name === t.B.name))).toBe(true);
  await page.click('#swap'); await page.click('#rndAll'); await page.click('#rndA'); await page.click('#rndLinked');
  for (const g of ['Wavetable 1', 'Sampler', 'Filter', 'OTT']) {   // in the Basic view the dice sit in each section's overlay
    await page.click(`section[data-group="${g}"] .gname`);
    await page.click(`[data-dice="${g}"]:not([data-side])`);
    await page.click(`section[data-group="${g}"] .gdone`);
  }
  const before = await snap();
  await page.click('#resetAll');
  // the default patch: Wavetable 1 heard, the other oscillators at Level 0
  expect(await page.evaluate(() => OSC_KIND.map((_, s) => state.A[oi(s, 'olevel')] > 0))).toEqual([true, false, false, false]);
  await page.click('#undo');
  expect(await snap()).toEqual(before);
  await page.locator('#wtA1').click();
  await expect(page.locator('#ed')).toHaveClass(/open/);
  expect(await page.textContent('#ed')).toContain('Wavetable 2');
  expect(errors).toEqual([]);
});

test.describe('phone', () => {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['iPhone 13'];   // 390 px wide
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

  test('no sideways scroll, bottom panel stays on screen', async ({ page }) => {
    await openSynth(page);
    const vw = await page.evaluate(() => innerWidth);
    expect(vw).toBeLessThanOrEqual(400);
    for (const y of [0, 1500, 99999]) {
      await page.evaluate(y => scrollTo(0, y), y);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight, kb: document.getElementById('kb').getBoundingClientRect(), morph: document.getElementById('morph').getBoundingClientRect() }));
      expect(m.sw).toBeLessThanOrEqual(m.vw);
      expect(m.kb.bottom).toBeLessThanOrEqual(m.vh + 1);
      expect(m.morph.top).toBeGreaterThanOrEqual(0);
      expect(m.morph.bottom).toBeLessThanOrEqual(m.vh);
    }
  });

  test('at most four knobs per row', async ({ page }) => {
    await openSynth(page);
    const worst = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.knobs')].map(row => {
      const tops = {}; row.querySelectorAll(':scope > .kn').forEach(k => { if (!k.offsetParent) return; const t = Math.round(k.getBoundingClientRect().top); tops[t] = (tops[t] || 0) + 1; });
      return Math.max(0, ...Object.values(tops));
    })));
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(4);
  });

  test('tapping the morph slider moves the morph', async ({ page }) => {
    await openSynth(page);
    const box = await page.locator('#morph').boundingBox();
    await page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height / 2);
    const m = await page.evaluate(() => state.morph);
    expect(m).toBeGreaterThan(0.6); expect(m).toBeLessThan(0.9);
  });

  test('editors open full screen without sideways scroll and close again', async ({ page }) => {
    await openSynth(page);
    for (const [open, panel, done] of [['#wtA0', '#ed', '#edDone'], ['#seqEdit', '#sq', '#sqDone']]) {
      await page.locator(open).tap();
      await expect(page.locator(panel)).toHaveClass(/open/);
      expect(await page.evaluate(sel => { const el = document.querySelector(sel); return el.scrollWidth <= el.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth; }, panel)).toBe(true);
      await page.locator(done).tap();
      await expect(page.locator(panel)).not.toHaveClass(/open/);
    }
  });

  test('fixed sections: four oscillators and seven effects in order, with no engine pickers; headings fit', async ({ page }) => {
    await openSynth(page);
    expect(await page.evaluate(() => [...document.querySelectorAll('main .group')].map(g => g.dataset.group))).toEqual(
      ['Wavetable 1', 'Wavetable 2', 'Sub', 'Sampler', 'Voice', 'Filter', 'Amp envelope', 'Output', 'Drive', 'Formant', 'Modulation', 'Delay', 'Reverb', 'Lo-fi', 'OTT']);
    expect(await page.locator('.typesel').count()).toBe(0);
    // headings with dice, padlock and On/Off still fit at phone width
    expect(await page.evaluate(() => [...document.querySelectorAll('.group h2')].every(h => h.scrollWidth <= h.clientWidth + 1 && h.getBoundingClientRect().right <= innerWidth))).toBe(true);
    // a side where an oscillator is at Level 0 shows its wave card dimmed
    await page.evaluate(() => { state.A[oi(1, 'olevel')] = 0; state.B[oi(1, 'olevel')] = 0.5; drawWaves(); });
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => [$('cvA1').parentNode.classList.contains('mute'), $('cvB1').parentNode.classList.contains('mute')])).toEqual([true, false]);
  });

  test('the randomize buttons sit in the bottom panel and fit', async ({ page }) => {
    await openSynth(page);
    const m = await page.evaluate(() => {
      const bar = document.querySelector('#kb .rbar'), r = bar.getBoundingClientRect();
      return { inPanel: !!bar, right: Math.max(...[...bar.querySelectorAll('button')].map(b => b.getBoundingClientRect().right)), vw: innerWidth, bottom: r.bottom, vh: innerHeight };
    });
    expect(m.inPanel).toBe(true);
    expect(m.right).toBeLessThanOrEqual(m.vw);
    expect(m.bottom).toBeLessThanOrEqual(m.vh);
    await page.locator('#rndAll').tap();
    await page.locator('#rsBoth').tap();
    await expect(page.locator('#undo')).toBeEnabled();
    // copy a sequence to the other side
    await page.locator('#seqAB').tap();
    expect(await page.evaluate(() => JSON.stringify(state.seq.A) === JSON.stringify(state.seq.B))).toBe(true);
  });

  test('Sampler: built-in sample menus, and a loaded file that survives a reload', async ({ page }) => {
    await openSynth(page, { storage: {} });
    const smp = page.locator('section[data-group="Sampler"]');
    await expect(smp.locator('select[data-side="A"]')).toBeVisible();   // the sample menus sit in the wave cards
    await smp.locator('select[data-side="A"]').selectOption('f:Bell');
    expect(await page.evaluate(() => state.smp.A)).toEqual({ name: 'Bell' });
    // a one-second 16-bit WAV of a 440 Hz sine
    const sr = 44100, n = sr, buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 20000), 44 + i * 2);
    const chooser = page.waitForEvent('filechooser');
    await smp.locator('select[data-side="B"]').selectOption('load');
    await (await chooser).setFiles({ name: 'test-sine.wav', mimeType: 'audio/wav', buffer: buf });
    await page.waitForFunction(() => state.smp.B && state.smp.B.id && smpData.B);
    expect(await page.evaluate(() => ({ name: state.smp.B.name, len: smpData.B.d.length }))).toEqual({ name: 'test-sine', len: 44100 });
    await page.waitForTimeout(700);   // saved
    await page.reload();
    await page.click('#undo');   // back to the saved session
    await page.waitForFunction(() => smpData.B && smpData.B.d.length === 44100, null, { timeout: 5000 });
    expect(await page.evaluate(() => state.smp.B.name)).toBe('test-sine');
  });
});

/* Basic view and section overlays (ui/overlay.js), on desktop and on a phone */
for (const [name, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  test(`${name}: a section's overlay shows all its controls without moving anything, and closes`, async ({ page }) => {
    await page.setViewportSize(size);
    await openSynth(page);
    const rects = () => page.evaluate(() => [...document.querySelectorAll('main .group')].map(g => { const r = g.getBoundingClientRect(); return [Math.round(r.top + scrollY), Math.round(r.left), Math.round(r.width), Math.round(r.height)].join(); }));
    const shown = g => page.evaluate(g => [...sections[g].querySelectorAll('.kn')].filter(k => k.offsetParent).length, g);
    expect(await page.evaluate(() => document.body.classList.contains('full'))).toBe(false);   // Basic is the default
    const before = await rects(), basic = await shown('Delay');
    expect(basic).toBe(3);
    await page.locator('section[data-group="Delay"] .gname').click();
    expect(await shown('Delay')).toBe(5);
    await expect(page.locator('section[data-group="Delay"] [data-dice="Delay"][data-side="A"]')).toBeVisible();
    await expect(page.locator('section[data-group="Delay"] .swrow')).toBeVisible();
    expect(await rects()).toEqual(before);   // the section keeps its place underneath
    const m = await page.evaluate(() => { const c = sections.Delay.querySelector('.gcard').getBoundingClientRect(), kb = $('kb').getBoundingClientRect();
      return { right: c.right <= innerWidth + 1, left: c.left >= -1, aboveKb: c.bottom <= kb.top + 1, kbOnScreen: kb.bottom <= innerHeight + 1 }; });
    expect(m).toEqual({ right: true, left: true, aboveKb: true, kbOnScreen: true });
    // a per-side switch in the overlay sets only that side
    await page.locator('section[data-group="Delay"] .seg.b [data-v="1"]').click();
    expect(await page.evaluate(() => state.B[IX.dlspill])).toBe(1);
    await page.keyboard.press('Escape');
    expect(await shown('Delay')).toBe(3);
    await page.locator('section[data-group="Filter"] .gname').click();
    await page.locator('section[data-group="Filter"] .gdone').click();
    expect(await page.locator('.group.open').count()).toBe(0);
    expect(await rects()).toEqual(before);
  });
}

test('the Full view shows every control, and the choice is remembered', async ({ page }) => {
  await openSynth(page);
  const hidden = () => page.evaluate(() => [...document.querySelectorAll('main .kn')].filter(k => !k.offsetParent).length);
  expect(await hidden()).toBeGreaterThan(20);
  await page.click('#viewFull');
  expect(await hidden()).toBe(0);
  await page.reload();
  expect(await page.evaluate(() => document.body.classList.contains('full'))).toBe(true);
  await page.click('#viewBasic');
});

test('oscillator On/Off is a bypass: it dims the section and is never randomized', async ({ page }) => {
  await openSynth(page);
  await page.click('section[data-group="Wavetable 2"] [data-osc]');
  expect(await page.evaluate(() => [state.oscOn[1], sections['Wavetable 2'].classList.contains('fxoff')])).toEqual([false, true]);
  await page.click('#rndAll');
  expect(await page.evaluate(() => state.oscOn)).toEqual([true, false, true, true]);
});
