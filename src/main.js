
labelOct();
updateIcons();
updateSlotsUI();
fixSlotHeights();
refreshAll();
updateBlendUI();
// Every launch starts from a fresh random patch and fresh 16-step sequences. Undo brings back the last session.
bulk(() => { randomizeAll(); randSeqs(); });
setBpm(85 + Math.random() * 50);
window.addEventListener('resize', () => { drawWaves(); if (ed.classList.contains('open')) { drawEditor(); renderStrip(); } });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawWaves(); if (ed.classList.contains('open')) { drawEditor(); renderStrip(); } });
