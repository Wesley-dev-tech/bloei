// Meer › Uitleg (#/meer/uitleg), in de vaste opbouw van een instelscherm (layout.css): links de instellingen van de uitleg,
// een uitlegkaartje in het klein en "Goed om te weten"; rechts de lijst "Hoe doe ik dat?" met per onderwerp "Toon het me"
// Icoontegels: neutraal, behalve waar het icoon het onderdeel zelf voorstelt (een drank mist, een maaltijd roze).
import { h } from '../ui/dom.js';
import { kaart, kaartkop, knop, rij, schakelaar, schermkop, strook } from '../ui/componenten.js';
import { ICOON, begripOpties, begripTegel } from '../ui/iconenkaart.js';
import { eersteToon, komOp } from '../ui/beweging.js';
import { t } from '../teksten.js';
import { isAuto, startHandeling, wisGezien, zetAuto } from './rondleiding.js';
import { ONDERWERPEN, stappenVoor, toestelTekst } from './stappen.js';

export function toon(houder) {
  const terug = knop(t('meer.terug'), { soort: 'tekst', icoon: ICOON.terug.naam, opKlik: () => (window.location.hash = '#/meer') });
  const opent = eersteToon('meer-uitleg');

  function onderwerp(o) {
    // BESLISSING 549: na afloop van de handeling komt dit scherm terug, op dezelfde hoogte en met de focus op deze knop.
    const start = () => startHandeling(o.id, { terugNaarVorig: true });
    return rij({
      tegel: begripOpties(o.begrip),
      titel: t('uitleg.onderwerp.' + o.id),
      eind: knop(t('uitleg.toonHet'), { soort: 'secundair', label: t('uitleg.toonHet') + ': ' + t('uitleg.onderwerp.' + o.id), opKlik: start }),
    });
  }

  const wissel = schakelaar({
    label: t('uitleg.auto'),
    uitleg: t('uitleg.autoHint'),
    aan: isAuto(),
    opWissel: (aan) => zetAuto(aan),
  });
  const instellingen = kaart(
    { klasse: 'uitleg__kaart-links' },
    kaartkop({ tegel: begripOpties('herstelvraag'), label: t('uitleg.titel') }),
    h('div', { class: 'rij' }, begripTegel('herstelvraag'), wissel),
    rij({
      tegel: begripOpties('ongedaan'),
      titel: t('uitleg.opnieuw'),
      tekst: t('uitleg.opnieuwHint'),
      eind: knop(t('uitleg.opnieuwKnop'), {
        soort: 'secundair',
        label: t('uitleg.opnieuw'),
        opKlik: () => {
          wisGezien();
          strook(t('uitleg.opnieuwKlaar'));
        },
      }),
    }),
  );
  // BESLISSING 675: alleen in de demo een rij "Zo begint een nieuwe gebruiker" (het welkomscherm als voorbeeld). Rechtstreeks import.meta.env, zoals in
  // schermen/meer.js: zo valt de tak met het bestand uit de echte bouw.
  if (import.meta.env.VITE_DEMO === 'true') import('../demo/voorbeeld.js').then((m) => instellingen.append(m.voorbeeldRij()));
  const hoe = kaart({ klasse: 'uitleg__kaart-links' }, kaartkop({ tegel: begripOpties('instellingen'), label: t('uitleg.hoe') }), ...ONDERWERPEN.map(onderwerp));

  // Dezelfde vorm als elders (BESLISSING 296): statische blokken met een icoontegel en een zin.
  // BESLISSING 362: de gewone kaartkop (icoontegel, titel, lijn eronder), zoals "Goed om te weten" op Herinneringen.
  const weetjes = kaart(
    { klasse: 'uitleg__weetjes' },
    kaartkop({ tegel: begripOpties('uitleg'), label: t('uitleg.weetjes') }),
    h(
      'div',
      { class: 'instel__weetjesrij' },
      ...[['ongedaan', 'uitleg.weetje1'], ['herstelvraag', 'uitleg.weetje2'], ['instellingen', 'uitleg.weetje3']].map(([begrip, sleutel]) => h('div', { class: 'weetje' }, begripTegel(begrip), h('p', { class: 'weetje__tekst' }, toestelTekst(sleutel, t(sleutel), { muis: window.matchMedia('(hover: hover) and (pointer: fine)').matches })))),
    ),
  );

  // Het uitlegkaartje in het klein (alleen kijken, niet tikbaar): stap 1 van de rondleiding van Drinken, uit de echte stappen. Bij stap 1 staat er,
  // zoals in de echte rondleiding, geen knop Vorige.
  const lijstVoorbeeld = stappenVoor('drinken');
  const eerste = lijstVoorbeeld[0];
  const voorbeeldKaart = h(
    'div',
    { class: 'uitleg__kaart uitleg__kaart--voorbeeld', 'aria-hidden': 'true', inert: true },
    h('p', { class: 'label uitleg__stap' }, t('uitleg.stapVan', { nr: '1', totaal: String(lijstVoorbeeld.length) })),
    h('h2', { class: 't-h2 uitleg__titel' }, eerste.titel),
    h('p', { class: 'uitleg__tekst' }, eerste.tekst),
    // BESLISSING 549: zoals de echte kaart: Volgende, dan Overslaan.
    h('div', { class: 'uitleg__acties' }, h('span', { class: 'uitleg__nepknop uitleg__nepknop--primair' }, t('uitleg.volgende')), h('span', { class: 'uitleg__nepknop uitleg__nepknop--tekst' }, t('uitleg.overslaan'))),
  );
  // BESLISSING 236: links en rechts zijn even breed en even hoog. Links de instellingen, het kaartje in het klein en "Goed om te weten";
  // rechts de lijst "Hoe doe ik dat?" (twaalf onderwerpen die samen even hoog zijn als de linkerkant).
  const voorbeeld = kaart({ klasse: 'uitleg__kaart-rechts' }, kaartkop({ tegel: begripOpties('instellingen'), label: t('uitleg.voorbeeld') }), voorbeeldKaart);

  houder.replaceChildren(
    h(
      'div',
      { class: 'stapel stapel--sectie meer-sub uitleg-scherm' },
      schermkop({ titel: t('uitleg.titel'), acties: [terug] }),
      h('div', { class: 'instelscherm uitleg__tweeen' }, h('div', { class: 'instel__lijst' }, instellingen, voorbeeld, weetjes), h('div', { class: 'instel__lijst uitleg__rechts' }, hoe)),
    ),
  );
  if (opent) komOp([instellingen, hoe, voorbeeld], { stap: 80 });
}
