// "Nieuw in Bloei <versie>": één blad dat na een update één keer opengaat, en dat bij Algemeen > Over altijd op te vragen is.
//
// Waarom na het herladen en niet in de melding onderaan (BESLISSING 701): de app die op dat moment draait is nog de óúde versie.
// Zij heeft de tekst van de nieuwe versie niet in huis, en ze gaat ze niet van de server halen (dat zou een verzoek kosten en
// zonder netwerk stilvallen). De nieuwe versie brengt haar eigen lijst mee (src/data/wijzigingen.js) en toont ze bij haar eerste start.
//
// Wie updates overslaat, mist niets: de instelling 'versie.gezien' houdt bij tot waar ze mee is, en het blad toont alles wat sindsdien
// uitkwam, nieuwste versie eerst, met een tussenkopje per versie zodra het er meer dan één zijn. 'versie.gezien' wordt altijd
// weggeschreven, ook als het blad niet opengaat (geen regel voor deze versie, of de gebruiker staat nog op het welkomscherm):
// zo valt een versie nooit dubbel.
import { h } from './dom.js';
import { blad, knop } from './componenten.js';
import { begripTegel } from './iconenkaart.js';
import { t } from '../teksten.js';
import { opmaakDatum } from '../kern/datum.js';
import { leesInstelling, zetInstelling, isStartKlaar } from '../data/instellingen.js';
import { wijzigingenSinds, nieuwsteWijziging } from '../data/wijzigingen.js';
import { DEMO } from '../kern/demo.js';
import { version as appVersie } from '../../package.json';

export const HUIDIGE_VERSIE = appVersie;

// De datum van een versie, met het uur erbij als dat bekend is: "donderdag 19 november om 22.30 uur" (de app schrijft een uur met een punt).
function wanneer(w) {
  if (!w.datum) return null;
  const datum = opmaakDatum(w.datum, 'lang');
  return w.tijd ? t('watnieuw.datumTijd', { datum, tijd: String(w.tijd).replace(':', '.') }) : datum;
}

const puntenLijst = (wijziging) =>
  h(
    'ul',
    { class: 'watnieuw__lijst' },
    ...wijziging.punten.map((p) => h('li', { class: 'watnieuw__punt' }, begripTegel(p.begrip), h('p', { class: 'watnieuw__tekst' }, p.tekst))),
  );

// Het blad voor een lijst van versies (nieuwste eerst). Een lege lijst: null (er valt niets te tonen).
export function maakWatIsNieuwBlad(lijst) {
  const wijzigingen = (Array.isArray(lijst) ? lijst : [lijst]).filter(Boolean);
  if (!wijzigingen.length) return null;
  const meerdere = wijzigingen.length > 1;
  const blokken = wijzigingen.flatMap((w) => [
    // Eén versie: de titel van het blad noemt ze al, dan blijft alleen de datum staan. Meer versies: elk blok krijgt zijn eigen kopje.
    meerdere
      ? h('p', { class: 'label watnieuw__versie' }, t('watnieuw.versieKop', { versie: w.versie }), wanneer(w) ? h('span', { class: 'watnieuw__datum' }, ' - ' + wanneer(w)) : null)
      : wanneer(w)
        ? h('p', { class: 't-klein t-gedempt watnieuw__datum' }, wanneer(w))
        : null,
    puntenLijst(w),
  ]);
  const b = blad({
    titel: t('watnieuw.titel', { versie: wijzigingen[0].versie }),
    familie: 'algemeen',
    inhoud: h('div', { class: ['stapel', 'watnieuw', meerdere && 'watnieuw--meer'] }, ...blokken),
    acties: [knop(t('algemeen.sluiten'), { soort: 'primair', breed: true, opKlik: () => b.sluit() })],
  });
  b.classList.add('watnieuw__blad');
  return b;
}

// Opent het blad. Zonder lijst: alles sinds 'sinds' tot de versie die nu draait; de ingang bij Over geeft niets mee en toont dan
// de nieuwste lijst. Geeft false als er niets te tonen valt.
export function openWatIsNieuw(lijst) {
  const b = maakWatIsNieuwBlad(lijst ?? wijzigingenSinds(null, appVersie) ?? nieuwsteWijziging());
  if (!b) return false;
  b.open();
  return true;
}

// Bij de start van de app: toont alles wat uitkwam sinds de versie die dit toestel al zag. Geeft true als het blad openging.
// In de demo nooit: daar begint elk bezoek opnieuw en zou het blad telkens terugkomen.
export async function toonWatIsNieuwBijStart() {
  if (DEMO) return false;
  try {
    const gezien = await leesInstelling('versie.gezien');
    if (gezien === appVersie) return false;
    const lijst = wijzigingenSinds(gezien, appVersie);
    await zetInstelling('versie.gezien', appVersie);
    // Een nieuwe gebruiker (welkomscherm) krijgt geen wijzigingen van vóór haar tijd te zien.
    if (!isStartKlaar()) return false;
    return openWatIsNieuw(lijst);
  } catch {
    return false; // de app start nooit minder goed op door dit blad
  }
}
