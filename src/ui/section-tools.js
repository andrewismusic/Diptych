/* =====================================================================
   SECTION TOOLS
   Dice, section padlocks and effect On/Off switches in every section
   heading, plus the delay Cut / Spill switch.
   ===================================================================== */
/* effect on/off switches (for both sides), in each effect's heading */
const FX_GROUPS = ['Drive', 'Formant filter', 'Modulation', 'Delay', 'Reverb', 'Lo-fi', 'OTT'];
// every section heading gets a dice (randomize just this section) and a padlock (lock the whole section)
const DICE = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="5.3" cy="5.3" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="10.7" cy="10.7" r="1.2" fill="currentColor"/></svg>';
document.querySelectorAll('.group[data-group]').forEach(sec => {
  const g = sec.dataset.group, h = sec.querySelector('h2');
  h.classList.add('fxh');
  h.insertAdjacentHTML('beforeend', `<button type="button" class="lock sectool da" data-dice="${g}" data-side="A" aria-label="Randomize ${g} on side A">${DICE}</button><button type="button" class="lock sectool db" data-dice="${g}" data-side="B" aria-label="Randomize ${g} on side B">${DICE}</button><button type="button" class="lock sectool" data-dice="${g}" data-side="" aria-label="Randomize all of ${g}, linked knobs included">${DICE}</button><button type="button" class="lock sectool" data-seclock="${g}" aria-pressed="false"></button>`);
  const k = FX_GROUPS.indexOf(g);
  if (k >= 0) h.insertAdjacentHTML('beforeend', `<button type="button" class="fxsw" data-fx="${k}" aria-label="${g} on"></button>`);
});
function updateFxUI() {
  document.querySelectorAll('[data-fx]').forEach(b => {
    const k = +b.dataset.fx, on = state.fxOn[k];
    b.setAttribute('aria-pressed', on); b.textContent = on ? 'On' : 'Off';
    b.closest('.group').classList.toggle('fxoff', !on);
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fx]'); if (!b) return;
  const k = +b.dataset.fx; state.fxOn[k] = !state.fxOn[k];
  updateFxUI(); if (ready) send({ type:'bypass', i:k, on: state.fxOn[k] }); save();
});
updateFxUI();

/* delay time changes: Cut or Spill */
$('k' + IX.dltime).closest('.group').insertAdjacentHTML('beforeend', `
  <div class="blendrow"><span class="opt"><span>Time changes</span><span class="seg" role="group" aria-label="What happens when the delay time changes">
    <button type="button" id="dlCut">Cut</button><button type="button" id="dlSpill">Spill</button></span></span></div>`);
function updateDlUI() { $('dlCut').setAttribute('aria-pressed', !state.dlSpill); $('dlSpill').setAttribute('aria-pressed', state.dlSpill); }
$('dlCut').addEventListener('click', () => { state.dlSpill = false; updateDlUI(); if (ready) send({ type:'dlmode', v:false }); save(); });
$('dlSpill').addEventListener('click', () => { state.dlSpill = true; updateDlUI(); if (ready) send({ type:'dlmode', v:true }); save(); });
updateDlUI();
