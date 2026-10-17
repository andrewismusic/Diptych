/* =====================================================================
   LAYOUT
   Phones and narrow windows: sections stacked, the page scrolls, the
   bottom panel stays in view. Wide landscape windows (desktop, plugin
   style): everything on one screen, laid out at a fixed design size and
   scaled to fit the window, so nothing ever scrolls.
   ===================================================================== */
const DESK_W = 1440, DESK_H = 900;
const isDesk = () => innerWidth >= 1000 && innerWidth > innerHeight * 1.15;
function applyLayout() {
  const desk = isDesk(), app = $('app');
  document.body.classList.toggle('desk', desk);
  app.style.zoom = desk ? Math.min(innerWidth / DESK_W, innerHeight / DESK_H) : '';
  document.documentElement.style.setProperty('--kbh', $('kb').getBoundingClientRect().height + 'px');   // the editors leave the bottom panel visible
  drawWaves();
}
let layoutTimer = null;
window.addEventListener('resize', () => { clearTimeout(layoutTimer); layoutTimer = setTimeout(applyLayout, 120); });
