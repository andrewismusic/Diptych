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
  expect(await outputLevel(page)).toBeLessThan(-80);   // silent before anything plays
  await page.click('#play');
  await page.waitForTimeout(800);
  expect(await outputLevel(page)).toBeGreaterThan(-50);
  await page.click('#play');
});

test('computer keyboard plays notes', async ({ page }) => {
  await openSynth(page, { tapAudio: true });
  await startAudio(page);
  await page.click('#pmKeys');
  await page.keyboard.down('a');
  await page.waitForTimeout(400);
  expect(await outputLevel(page)).toBeGreaterThan(-50);
  await page.keyboard.up('a');
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
      const tops = {}; row.querySelectorAll(':scope > .kn').forEach(k => { const t = Math.round(k.getBoundingClientRect().top); tops[t] = (tops[t] || 0) + 1; });
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
    for (const [open, panel, done] of [['#wtA', '#ed', '#edDone'], ['#seqEdit', '#sq', '#sqDone']]) {
      await page.locator(open).tap();
      await expect(page.locator(panel)).toHaveClass(/open/);
      expect(await page.evaluate(sel => { const el = document.querySelector(sel); return el.scrollWidth <= el.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth; }, panel)).toBe(true);
      await page.locator(done).tap();
      await expect(page.locator(panel)).not.toHaveClass(/open/);
    }
  });
});
