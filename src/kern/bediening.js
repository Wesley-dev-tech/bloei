// Houdt bij hoe de gebruiker bedient, als kenmerk data-bediening op html: "aanraak" (vinger of pen), "muis" of "toetsen".
// basis.css verbergt de focusring bij "aanraak"; bij "toetsen" (en zonder kenmerk) blijft hij. Zie ook de regels bij :focus-visible.
const TOETSEN = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Spacebar', 'Escape', 'Home', 'End', 'PageUp', 'PageDown']);

export function volgBediening(doc = document) {
  const wortel = doc.documentElement;
  const zet = (waarde) => {
    if (wortel.dataset.bediening !== waarde) wortel.dataset.bediening = waarde;
  };
  const venster = doc.defaultView;
  let alleenAanraking = false;
  try {
    alleenAanraking = !!venster?.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
  } catch {
    alleenAanraking = false;
  }
  if (alleenAanraking) zet('aanraak');
  const opties = { capture: true, passive: true };
  doc.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') zet('aanraak');
    else if (e.pointerType === 'mouse') zet('muis');
  }, opties);
  doc.addEventListener('keydown', (e) => {
    if (TOETSEN.has(e.key)) zet('toetsen');
  }, opties);
}
