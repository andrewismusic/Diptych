// Desktop / plugin layout (ui/layout.js): wide landscape windows show everything on one screen, scaled to fit.
import { test, expect } from '@playwright/test';
import { openSynth } from './helpers.js';

for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080], [2560, 1200]]) {
  test(`${w}x${h}: everything fits without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openSynth(page);
    for (const t of ['wt', 'smp', 'sub', 'off']) {   // whatever the slots hold, nothing moves or overflows
      await page.evaluate(t => { const s = sections['Osc 1'].querySelector('.typesel'); s.value = t; s.dispatchEvent(new Event('change', { bubbles: true })); }, t);
      const m = await page.evaluate(() => {
        const main = document.querySelector('main'), app = $('app').getBoundingClientRect();
        const cut = [...document.querySelectorAll('main .group')].filter(g => g.scrollHeight > g.clientHeight + 1 || g.getBoundingClientRect().bottom > main.getBoundingClientRect().bottom + 1).map(g => g.dataset.group);
        return { desk: document.body.classList.contains('desk'), docScroll: document.documentElement.scrollHeight - innerHeight, docSide: document.documentElement.scrollWidth - innerWidth,
          main: main.scrollHeight - main.clientHeight, appBottom: app.bottom - innerHeight, appRight: app.right - innerWidth, cut };
      });
      expect(m.desk).toBe(true);
      expect(m.docScroll).toBeLessThanOrEqual(0); expect(m.docSide).toBeLessThanOrEqual(0);
      expect(m.main, `main overflows with Osc 1 = ${t}`).toBeLessThanOrEqual(1);
      expect(m.appBottom).toBeLessThanOrEqual(1); expect(m.appRight).toBeLessThanOrEqual(1);
      expect(m.cut, t).toEqual([]);
    }
  });
}

test('knobs still drag when the layout is scaled down', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openSynth(page);
  const i = await page.evaluate(() => IX.cutoff);
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
