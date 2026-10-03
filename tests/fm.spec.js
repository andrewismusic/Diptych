// The standalone FM sketch page (dist/fm.html): loads cleanly, makes sound, presets and algorithms work.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const open = async page => {
  const html = readFileSync(new URL('../dist/fm.html', import.meta.url), 'utf8');
  await page.route('**/*', r => { const u = r.request().url();
    if (u.startsWith('http://localhost:4174/')) return r.fulfill({ contentType: 'text/html', body: html });
    if (u.includes('fonts.googleapis.com')) return r.fulfill({ contentType: 'text/css', body: '' });
    return r.abort(); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:4174/');
  return errors;
};

test('FM sketch loads and every algorithm and preset renders sound without NaN', async ({ page }) => {
  const errors = await open(page);
  const r = await page.evaluate(() => {
    const out = [];
    const render = (p) => {
      const e = new FmEngine(48000); e.handle({ type:'params', p }); e.handle({ type:'on', note:60, vel:0.9 });
      const L = new Float32Array(128), R = new Float32Array(128); let s = 0, nan = false;
      for (let b = 0; b < 300; b++) { L.fill(0); R.fill(0); e.render(L, R, 128); for (const x of L) { s += x * x; if (!Number.isFinite(x)) nan = true; } }
      return { rms: Math.sqrt(s / (300 * 128)), nan };
    };
    for (let a = 0; a < 8; a++) out.push(render({ ...state, algo: a }));
    for (const n of Object.keys(PRESETS)) out.push(render({ ...state, ...PRESETS[n] }));
    return out;
  });
  expect(errors).toEqual([]);
  for (const x of r) { expect(x.nan).toBe(false); expect(x.rms).toBeGreaterThan(0.01); }
});

test('FM sketch plays real audio from the keyboard', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (d, ...r) { if (d instanceof AudioDestinationNode && !window.__tap) { window.__tap = this; } return orig.call(this, d, ...r); };
  });
  await open(page);
  await page.click('#audio');
  await page.waitForFunction(() => send !== null);
  await page.keyboard.down('a'); await page.waitForTimeout(400);
  const lvl = await page.evaluate(() => { const b = new Float32Array(2048); analyser.getFloatTimeDomainData(b); let s = 0; for (const x of b) s += x * x; return 20 * Math.log10(Math.sqrt(s / b.length) + 1e-12); });
  await page.keyboard.up('a');
  expect(lvl).toBeGreaterThan(-40);
  await page.click('.algo[data-a="5"]');
  expect(await page.evaluate(() => state.algo)).toBe(5);
});
