/* =====================================================================
   MENUS (2026-11-11): the app's own dropdowns instead of the system ones
   (iOS shows its own wheel, and leaves a focused select lit). Every <select>
   gets a key that shows its value and opens the app's menu; the select stays,
   hidden, as the value and its change events, so the code that reads it is
   unchanged. openMenu also serves the preset menus (ui/presets.js).
   ===================================================================== */
const CHEV = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let menuOpen = null;
/* items: [{ label, value, on, sep, cls }] ; onPick(item). The menu sits under the anchor (or above, if there is no room). */
function openMenu(anchor, items, onPick, opts = {}) {
  closeMenu();
  const m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'listbox');
  if (opts.label) m.setAttribute('aria-label', opts.label);
  items.forEach((it, k) => {
    if (it.sep) { m.insertAdjacentHTML('beforeend', '<div class="msep" role="separator"></div>'); return; }
    if (it.head) { m.insertAdjacentHTML('beforeend', `<div class="mhead">${it.head}</div>`); return; }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mitem' + (it.on ? ' on' : '') + (it.cls ? ' ' + it.cls : '');
    b.setAttribute('role', 'option'); b.setAttribute('aria-selected', !!it.on); b.textContent = it.label;
    b.addEventListener('click', e => { e.stopPropagation(); closeMenu(); onPick(it); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), mh = Math.min(m.scrollHeight, innerHeight * 0.6), below = innerHeight - r.bottom - 8;
  m.style.minWidth = Math.max(r.width, 140) + 'px';
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.maxHeight = mh + 'px';
  m.style.top = (below >= mh || below > r.top ? r.bottom + 6 : Math.max(8, r.top - mh - 6)) + 'px';
  const cur = m.querySelector('.mitem.on'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  menuOpen = { m, anchor }; anchor.setAttribute('aria-expanded', 'true');
  (cur || m.querySelector('.mitem'))?.focus({ preventScroll: true });
}
function closeMenu() { if (!menuOpen) return; menuOpen.m.remove(); menuOpen.anchor.setAttribute('aria-expanded', 'false'); menuOpen = null; }
document.addEventListener('pointerdown', e => { if (menuOpen && !menuOpen.m.contains(e.target) && !menuOpen.anchor.contains(e.target)) closeMenu(); }, true);
document.addEventListener('keydown', e => {
  if (!menuOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); const a = menuOpen.anchor; closeMenu(); a.focus(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); const its = [...menuOpen.m.querySelectorAll('.mitem')], k = its.indexOf(document.activeElement);
    its[Math.max(0, Math.min(its.length - 1, k + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  }
});
addEventListener('resize', closeMenu);
// a select becomes a key with the app's menu
function enhanceSelect(sel) {
  if (sel.dataset.menu) return; sel.dataset.menu = '1';
  const b = document.createElement('button'); b.type = 'button'; b.className = 'key dd'; b.setAttribute('aria-haspopup', 'listbox'); b.setAttribute('aria-expanded', 'false');
  if (sel.getAttribute('aria-label')) b.setAttribute('aria-label', sel.getAttribute('aria-label'));
  if (sel.id) b.id = sel.id + 'Btn';
  sel.after(b); sel.classList.add('selhide'); sel.tabIndex = -1;
  const label = () => { const o = sel.options[sel.selectedIndex]; b.innerHTML = `<span class="ddv">${o ? o.textContent.replace(/[<&]/g, '') : ''}</span>${CHEV}`; };
  // keep the key's label right when the code sets the value or rebuilds the options
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(sel, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); label(); } });
  new MutationObserver(label).observe(sel, { childList: true, subtree: true, attributes: true });
  sel.addEventListener('change', label);
  b.addEventListener('click', () => {
    if (menuOpen && menuOpen.anchor === b) { closeMenu(); return; }
    openMenu(b, [...sel.options].map(o => ({ label: o.textContent, value: o.value, on: o.value === sel.value })), it => {
      if (it.value === sel.value && it.value !== 'load') return;
      desc.set.call(sel, it.value); label(); sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, { label: sel.getAttribute('aria-label') || '' });
  });
  label();
}
const enhanceAll = () => document.querySelectorAll('select').forEach(enhanceSelect);
