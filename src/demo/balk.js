// De demo-balk (BESLISSING 364): een smalle balk bovenaan met "Opnieuw beginnen". Alleen in de demo geladen.
// De balk is fixed en de app krijgt er ruimte voor (demo.css, variabele --demo-balk-h op <html>): niets van de app zit eronder.
// In de tabvolgorde staat ze na "Ga naar de inhoud" en vóór de navigatie: wie de balk niet wil, springt met de skip-link over haar heen.
import '../stijl/demo.css';
import { dt } from './teksten.js'; // de zinnen van de balk (alleen in de demo)
import { h } from '../ui/dom.js';
import { knop } from '../ui/componenten.js';
import { ICOON } from '../ui/iconenkaart.js';
import { begin } from './voorbeelddata.js';

// BESLISSING 675: tijdens het voorbeeld van het welkomscherm zegt de balk wat dit is en staat "Terug naar de demo" waar anders "Opnieuw beginnen"
// staat. zetVoorbeeldBalk(opTerug) zet die stand en geeft een functie terug die de gewone balk terugzet.
let voorbeeldStand = null;
export function zetVoorbeeldBalk(opTerug) {
  return voorbeeldStand ? voorbeeldStand(opTerug) : () => {};
}

export function toonBalk(houder = document.getElementById('app')) {
  document.documentElement.classList.add('demo');

  const tekst = h('p', { class: 'demo-balk__tekst' }, h('span', { class: 'demo-balk__lang' }, dt('balk')), h('span', { class: 'demo-balk__kort' }, dt('balkKort')));
  const opnieuw = knop(dt('opnieuw'), { soort: 'secundair', label: dt('opnieuwLabel'), opKlik: vraag });
  const balk = h('div', { class: 'demo-balk', role: 'region', 'aria-label': dt('regio') }, tekst, opnieuw);

  function normaal() {
    balk.classList.remove('is-vraag', 'is-voorbeeld');
    balk.replaceChildren(tekst, opnieuw);
  }

  function annuleer() {
    normaal();
    opnieuw.focus({ preventScroll: true });
  }

  function vraag() {
    const zeker = h('p', { class: 'demo-balk__tekst demo-balk__zeker', tabindex: '-1', role: 'group', 'aria-label': dt('zeker') }, dt('zeker'));
    const nee = knop(dt('nee'), { soort: 'primair', opKlik: annuleer });
    const ja = knop(dt('ja'), {
      soort: 'secundair',
      opKlik: async () => {
        ja.disabled = true;
        nee.disabled = true;
        balk.setAttribute('aria-busy', 'true');
        zeker.textContent = dt('bezig');
        await begin();
        window.location.hash = '#/vandaag';
        window.location.reload();
      },
    });
    balk.classList.add('is-vraag');
    balk.replaceChildren(zeker, ja, nee);
    zeker.focus({ preventScroll: true });
  }

  voorbeeldStand = (opTerug) => {
    const uitleg = h('p', { class: 'demo-balk__tekst' }, h('span', { class: 'demo-balk__lang' }, dt('voorbeeldBalk')), h('span', { class: 'demo-balk__kort' }, dt('voorbeeldBalkKort')));
    // BESLISSING 711: op een laag scherm is de balk dunner; op het laagste (320 x 480) is hij een klein zwevend knopje "Demo" met een pijltje naar links (demo.css).
    // De knop heeft beide teksten; de stijl toont er een. De naam voor een schermlezer is altijd "Terug naar de demo".
    const terug = knop(null, { soort: 'primair', icoon: ICOON.terug.naam, label: dt('voorbeeldTerug'), opKlik: () => opTerug() });
    terug.classList.add('demo-balk__terug');
    terug.append(h('span', { class: 'knop__tekst demo-balk__terug-lang' }, dt('voorbeeldTerug')), h('span', { class: 'knop__tekst demo-balk__terug-kort', 'aria-hidden': 'true' }, dt('voorbeeldTerugKort')));
    balk.classList.add('is-voorbeeld');
    balk.classList.remove('is-vraag');
    balk.removeAttribute('aria-busy');
    balk.replaceChildren(uitleg, terug);
    return normaal;
  };

  balk.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && balk.classList.contains('is-vraag') && !balk.hasAttribute('aria-busy')) {
      e.preventDefault();
      annuleer();
    }
  });

  // Na de skip-link (die is het eerste kind van de schil), vóór zijbalk en tabbalk.
  const skip = houder.querySelector('.sla-over');
  if (skip) skip.after(balk);
  else houder.prepend(balk);
  return balk;
}
