/* =====================================================================
   LAYOUT
   Phones and narrow windows: sections stacked, the page scrolls, the
   bottom panel stays in view. Wide landscape windows (desktop, plugin
   style): everything on one screen, laid out at a fixed design size and
   scaled to fit the window, so nothing ever scrolls.
   ===================================================================== */
// the Full view is designed at 1440 x 900; the Basic view, with fewer controls, at 1280 x 800, so it comes out larger
const deskSize = () => (document.body.classList.contains('full') ? [1440, 900] : [1280, 800]);
const isDesk = () => innerWidth >= 1000 && innerWidth > innerHeight * 1.15;
function applyLayout() {
  const desk = isDesk(), app = $('app');
  document.body.classList.toggle('desk', desk);
  const [dw, dh] = deskSize();
  app.style.width = desk ? dw + 'px' : ''; app.style.height = desk ? dh + 'px' : '';
  app.style.zoom = desk ? Math.min(innerWidth / dw, innerHeight / dh) : '';
  document.documentElement.style.setProperty('--kbh', $('kb').getBoundingClientRect().height + 'px');   // the editors leave the bottom panel visible
  drawWaves();
}
let layoutTimer = null;
window.addEventListener('resize', () => { clearTimeout(layoutTimer); layoutTimer = setTimeout(applyLayout, 120); });
