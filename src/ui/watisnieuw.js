// "Nieuw in Bloei <versie>": één blad dat na een update één keer opengaat, en dat bij Algemeen > Over altijd op te vragen is.
//
// Waarom na het herladen en niet in de melding onderaan (BESLISSING 701): de app die op dat moment draait is nog de óúde versie.
// Zij heeft de tekst van de nieuwe versie niet in huis, en ze gaat ze niet van de server halen (dat zou een verzoek kosten en
// zonder netwerk stilvallen). De nieuwe versie brengt haar eigen lijst mee (src/data/wijzigingen.js) en toont ze bij haar eerste start.
//
// Eén keer per versie: de instelling 'versie.gezien' houdt de laatst getoonde versie bij. Ze wordt altijd weggeschreven, ook als het
// blad niet opengaat (geen regel voor deze versie, of de gebruiker staat nog op het welkomscherm): zo valt een versie nooit dubbel.
import { h } from './dom.js';
import { blad, knop } from './componenten.js';
import { begripTegel } from './iconenkaart.js';
import { t } from '../teksten.js';
import { opmaakDatum } from '../kern/datum.js';
import { leesInstelling, zetInstelling, isStartKlaar } from '../data/instellingen.js';
import { wijzigingenVan, nieuwsteWijziging } from '../data/wijzigingen.js';
import { DEMO } from '../kern/demo.js';
import { version as appVersie } from '../../package.json';

export const HUIDIGE_VERSIE = appVersie;

// Het blad zelf. Zonder wijziging: null (er valt niets te tonen).
export function maakWatIsNieuwBlad(wijziging) {
  if (!wijziging) return null;
  const punten = wijziging.punten.map((p) =>
    h('li', { class: 'watnieuw__punt' }, begripTegel(p.begrip), h('p', { class: 'watnieuw__tekst' }, p.tekst)),
  );
  const b = blad({
    titel: t('watnieuw.titel', { versie: wijziging.versie }),
    familie: 'algemeen',
    inhoud: h(
      'div',
      { class: 'stapel watnieuw' },
      wijziging.datum ? h('p', { class: 't-klein t-gedempt watnieuw__datum' }, opmaakDatum(wijziging.datum, 'lang')) : null,
      h('ul', { class: 'watnieuw__lijst' }, ...punten),
    ),
    acties: [knop(t('algemeen.sluiten'), { soort: 'primair', breed: true, opKlik: () => b.sluit() })],
  });
  b.classList.add('watnieuw__blad');
  return b;
}

// Opent het blad van een versie (standaard de nieuwste lijst, voor de ingang bij Over). Geeft false als er niets te tonen valt.
export function openWatIsNieuw(wijziging = wijzigingenVan(appVersie) ?? nieuwsteWijziging()) {
  const b = maakWatIsNieuwBlad(wijziging);
  if (!b) return false;
  b.open();
  return true;
}

// Bij de start van de app: toont het blad als deze versie nog niet getoond werd. Geeft true als het openging.
// In de demo nooit: daar begint elk bezoek opnieuw en zou het blad telkens terugkomen.
export async function toonWatIsNieuwBijStart() {
  if (DEMO) return false;
  try {
    const gezien = await leesInstelling('versie.gezien');
    if (gezien === appVersie) return false;
    await zetInstelling('versie.gezien', appVersie);
    // Een nieuwe gebruiker (welkomscherm) krijgt geen wijzigingen van vóór haar tijd te zien.
    if (!isStartKlaar()) return false;
    return openWatIsNieuw(wijzigingenVan(appVersie));
  } catch {
    return false; // de app start nooit minder goed op door dit blad
  }
}
