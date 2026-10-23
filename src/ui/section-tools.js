/* =====================================================================
   SECTION TOOLS
   Dice, section padlocks and effect On/Off switches in every section
   heading, plus the delay Cut / Spill switch.
   ===================================================================== */
// every section heading gets three dice (randomize this section on side A, side B, or both) and a padlock
// (lock the whole section); oscillators and effects also get an On/Off switch, a bypass for auditioning (never morphed or randomized)
const DICE = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="5.3" cy="5.3" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="10.7" cy="10.7" r="1.2" fill="currentColor"/></svg>';
document.querySelectorAll('.group[data-group]').forEach(sec => {
  const g = sec.dataset.group, h = sec.querySelector('h2');
  h.classList.add('fxh');
  h.insertAdjacentHTML('beforeend', `<span class="tools"><button type="button" class="lock sectool da" data-dice="${g}" data-side="A" aria-label="Randomize ${g} on side A">${DICE}</button><button type="button" class="lock sectool db" data-dice="${g}" data-side="B" aria-label="Randomize ${g} on side B">${DICE}</button><button type="button" class="lock sectool" data-dice="${g}" aria-label="Randomize ${g} on both sides">${DICE}</button><button type="button" class="lock sectool" data-seclock="${g}" aria-pressed="false"></button></span>`);
  if (sec.dataset.kind) h.insertAdjacentHTML('beforeend', `<button type="button" class="fxsw" data-${sec.dataset.kind}="${sec.dataset.slot}" aria-label="${g} on"></button>`);
});
function updateFxUI() {
  document.querySelectorAll('[data-fx], [data-osc]').forEach(b => {
    const on = b.dataset.fx !== undefined ? state.fxOn[+b.dataset.fx] : state.oscOn[+b.dataset.osc];
    b.setAttribute('aria-pressed', on); b.textContent = on ? 'On' : 'Off';
    b.closest('.group').classList.toggle('fxoff', !on);
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fx], [data-osc]'); if (!b) return;
  if (b.dataset.fx !== undefined) { const k = +b.dataset.fx; state.fxOn[k] = !state.fxOn[k]; if (ready) send({ type:'bypass', i:k, on: state.fxOn[k] }); }
  else { const k = +b.dataset.osc; state.oscOn[k] = !state.oscOn[k]; if (ready) send({ type:'oscOn', i:k, on: state.oscOn[k] }); }
  updateFxUI(); save();
});
updateFxUI();
