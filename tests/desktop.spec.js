// Desktop / plugin layout (ui/layout.js): wide landscape windows show the player's view on one screen, scaled to fit.
// The developer view (?dev) holds more than fits, so its sections scroll inside the window; the page itself never scrolls.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

const measure = page => page.evaluate(() => {
  const main = document.querySelector('main'), app = $('app').getBoundingClientRect();
  const cut = [...document.querySelectorAll('main .group')].filter(g => g.offsetParent && (g.scrollHeight > g.clientHeight + 1 || g.getBoundingClientRect().bottom > main.getBoundingClientRect().bottom + 1)).map(g => g.dataset.group);
  return { desk: document.body.classList.contains('desk'), docScroll: document.documentElement.scrollHeight - innerHeight, docSide: document.documentElement.scrollWidth - innerWidth,
    main: main.scrollHeight - main.clientHeight, appBottom: app.bottom - innerHeight, appRight: app.right - innerWidth, cut };
});

for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080], [2560, 1200]]) {
  test(`${w}x${h}: the player's view fits without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openSynth(page, { dev: false });
    const m = await measure(page);
    expect(m.desk).toBe(true);
    expect(m.docScroll).toBeLessThanOrEqual(0); expect(m.docSide).toBeLessThanOrEqual(0);
    expect(m.main).toBeLessThanOrEqual(1);
    expect(m.appBottom).toBeLessThanOrEqual(1); expect(m.appRight).toBeLessThanOrEqual(1);
    expect(m.cut).toEqual([]);
    // all four panels show, and none is cut off
    expect(await page.evaluate(() => [...document.querySelectorAll('.panel')].filter(p => p.offsetParent && p.scrollHeight <= p.clientHeight + 1).map(p => p.dataset.panel))).toEqual(['synth', 'amp', 'filt', 'fx', 'seq', 'play']);
  });
  test(`${w}x${h}: the developer view never scrolls the page`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openSynth(page);
    for (const t of ['Basic', 'Basic, everything off', 'Full', 'Full, everything back on']) {   // switching off dims but must not move anything
      if (t.includes('off') || t.includes('back on')) await page.evaluate(() => document.querySelectorAll('[data-fx], [data-osc]').forEach(b => b.click()));
      if (t === 'Full') await page.click('#viewPill');
      const m = await measure(page);
      expect(m.desk).toBe(true);
      expect(m.docScroll, t).toBeLessThanOrEqual(0); expect(m.docSide, t).toBeLessThanOrEqual(0);
      expect(m.appBottom).toBeLessThanOrEqual(1); expect(m.appRight).toBeLessThanOrEqual(1);
    }
  });
}

test('the Basic view comes out larger than the Full view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSynth(page);
  const size = () => page.evaluate(() => $('k' + IX.aatk).getBoundingClientRect().width);
  const basic = await size(); await page.click('#viewPill'); const full = await size();
  expect(basic).toBeGreaterThan(full * 1.15);
});

test('knobs still drag when the layout is scaled down', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openSynth(page, { dev: false });
  const i = await page.evaluate(() => IX.menv);   // A and B sit apart (15% rule), so the A handle is unambiguous
  await page.evaluate(i => { state.A[i] = 0.3; state.B[i] = 0.8; updateKnob(i); }, i);
  const before = await page.evaluate(i => state.A[i], i);
  const box = await page.locator(`#hA${i}`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 6 }); await page.mouse.up();
  expect(await page.evaluate(i => state.A[i], i)).toBeGreaterThan(before + 0.1);
});

test('narrow or portrait windows keep the stacked, scrolling layout', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1200 });
  await openSynth(page);
  expect(await page.evaluate(() => document.body.classList.contains('desk'))).toBe(false);
});
