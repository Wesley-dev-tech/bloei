// "Profiel verwijderen" in de demo (BESLISSING 673). Alleen in de demo geladen (dynamische import in schermen/meer.js).
// De knop blijft zichtbaar, maar een tik wist niets: dezelfde soort dialoog als bij "Profiel verwijderen" in de echte app, met een korte uitleg
// en een gevulde knop om te sluiten. Escape en een tik naast de dialoog sluiten ook; de focus gaat terug naar de knop.
// Hetzelfde kaartje dient in het voorbeeld van het welkomscherm (BESLISSING 675, voorbeeld.js) bij "Vergrendeling instellen".
// BESLISSING 682: op desktop staat "Begrepen" gecentreerd en zo breed als een gewone knop (demo.css).
import { dt } from './teksten.js';
import { h } from '../ui/dom.js';
import { knop } from '../ui/componenten.js';
import { DEMO_NAAM } from './voorbeelddata.js';

// Het kaartje "Dit is de demo": titel, tekst, de knop "Begrepen". opSluit() volgt na elke sluiting (knop, Escape of een tik ernaast).
export function toonDemoKaartje({ tekst, opener = null, opSluit = null }) {
  const dlg = h('dialog', { class: 'dialoog dialoog--wis dialoog--demo', 'aria-labelledby': 'demo-profiel-titel', 'aria-describedby': 'demo-profiel-tekst' });
  const sluit = () => {
    if (dlg.open) dlg.close();
    dlg.remove();
    if (opener?.isConnected) opener.focus?.({ preventScroll: true });
    opSluit?.();
  };
  const begrepen = knop(dt('profielKnop'), { soort: 'primair', breed: true, opKlik: sluit });
  dlg.append(
    h(
      'div',
      { class: 'dialoog__blad' },
      h('h2', { class: 't-h2 dialoog__titel', id: 'demo-profiel-titel' }, dt('profielTitel')),
      h('p', { class: 'dialoog__tekst', id: 'demo-profiel-tekst' }, tekst),
      h('div', { class: 'dialoog__acties' }, begrepen),
    ),
  );
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    sluit();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) sluit();
  });
  document.body.append(dlg);
  dlg.showModal();
  begrepen.focus();
  return dlg;
}

export function toonProfielUitleg(opener) {
  return toonDemoKaartje({ tekst: dt('profielTekst', { naam: DEMO_NAAM }), opener });
}
