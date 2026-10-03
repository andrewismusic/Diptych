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
  const snap = () => page.evaluate(() => JSON.stringify({ A: state.A, B: state.B, osc: state.oscType, fx: state.fxType, t: tables.map(t => [t.A.name, t.B.name]) }));
  await page.click('#copyAB');
  expect(await page.evaluate(() => tables.every(t => t.A.name === t.B.name))).toBe(true);
  await page.click('#swap'); await page.click('#rndAll'); await page.click('#rndA'); await page.click('#rndLinked');
  for (const g of ['Osc 1', 'Filter', 'FX 4']) await page.click(`[data-dice="${g}"]:not([data-side])`);
  const before = await snap();
  await page.click('#resetAll');
  expect(await page.evaluate(() => ({ osc: state.oscType, fx: state.fxType }))).toEqual({ osc: ['wt', 'off', 'off', 'off'], fx: ['drive', 'delay', 'reverb', 'ott'] });
  await page.click('#undo');
  expect(await snap()).toEqual(before);
  await page.evaluate(() => { const sel = sections['Osc 1'].querySelector('.typesel'); sel.value = 'wt'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#wtA0').click();
  // the full-screen editor covers the picker, so change it directly
  await page.evaluate(() => { const sel = document.querySelector('section[data-group="Osc 1"] .typesel'); sel.value = 'sub'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect(page.locator('#ed')).not.toHaveClass(/open/);   // the wavetable editor closes when its slot stops being a Wavetable
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
    await page.locator('section[data-group="Osc 1"] .typesel').selectOption('wt');   // only Wavetable slots open the editor
    for (const [open, panel, done] of [['#wtA0', '#ed', '#edDone'], ['#seqEdit', '#sq', '#sqDone']]) {
      await page.locator(open).tap();
      await expect(page.locator(panel)).toHaveClass(/open/);
      expect(await page.evaluate(sel => { const el = document.querySelector(sel); return el.scrollWidth <= el.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth; }, panel)).toBe(true);
      await page.locator(done).tap();
      await expect(page.locator(panel)).not.toHaveClass(/open/);
    }
  });

  test('slot pickers switch what is shown', async ({ page }) => {
    await openSynth(page);
    const osc2 = page.locator('section[data-group="Osc 2"]');
    await osc2.locator('.typesel').selectOption('sub');
    await expect(osc2.locator('.eng[data-eng="sub"]')).toBeVisible();
    await expect(osc2.locator('.eng[data-eng="wt"]')).toBeHidden();
    await expect(osc2.locator('.eng[data-eng="*"]')).toBeVisible();
    expect(await page.evaluate(() => state.oscType[1])).toBe('sub');
    await osc2.locator('.typesel').selectOption('off');
    await expect(osc2.locator('.eng[data-eng="*"]')).toBeHidden();
    const fx1 = page.locator('section[data-group="FX 1"]');
    await fx1.locator('.typesel').selectOption('reverb');
    await expect(fx1.locator('.eng[data-eng="reverb"]')).toBeVisible();
    // headings with a picker, dice, padlock and On/Off still fit at phone width
    expect(await page.evaluate(() => [...document.querySelectorAll('.group h2')].every(h => h.scrollWidth <= h.clientWidth + 1 && h.getBoundingClientRect().right <= innerWidth))).toBe(true);
  });

  test('slots keep a fixed height whatever type they hold', async ({ page }) => {
    await openSynth(page);
    const heights = await page.evaluate(async () => {
      const h = g => sections[g].getBoundingClientRect().height, out = {};
      for (const [g, list, pick] of [['Osc 2', OSC_TYPES, 'osc'], ['FX 3', FX_TYPES, 'fx']]) {
        out[g] = [];
        for (const [t] of list) {
          const sel = sections[g].querySelector('.typesel'); sel.value = t; sel.dispatchEvent(new Event('change', { bubbles: true }));
          out[g].push(Math.round(h(g)));
        }
      }
      return out;
    });
    for (const g of Object.keys(heights)) expect(new Set(heights[g]).size, `${g}: ${heights[g]}`).toBe(1);
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
    const osc2 = page.locator('section[data-group="Osc 2"]');
    await osc2.locator('.typesel').selectOption('smp');
    await expect(osc2.locator('select[data-side="A"]')).toBeVisible();   // the sample menus sit in the wave cards
    await osc2.locator('select[data-side="A"]').selectOption('f:Bell');
    expect(await page.evaluate(() => state.smp[1].A)).toEqual({ name: 'Bell' });
    // a one-second 16-bit WAV of a 440 Hz sine
    const sr = 44100, n = sr, buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sr) * 20000), 44 + i * 2);
    const chooser = page.waitForEvent('filechooser');
    await osc2.locator('select[data-side="B"]').selectOption('load');
    await (await chooser).setFiles({ name: 'test-sine.wav', mimeType: 'audio/wav', buffer: buf });
    await page.waitForFunction(() => state.smp[1].B && state.smp[1].B.id && smpData[1].B);
    expect(await page.evaluate(() => ({ name: state.smp[1].B.name, len: smpData[1].B.d.length }))).toEqual({ name: 'test-sine', len: 44100 });
    await page.waitForTimeout(700);   // saved
    await page.reload();
    await page.click('#undo');   // back to the saved session
    await page.waitForFunction(() => smpData[1].B && smpData[1].B.d.length === 44100, null, { timeout: 5000 });
    expect(await page.evaluate(() => state.smp[1].B.name)).toBe('test-sine');
  });
});
