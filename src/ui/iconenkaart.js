// De iconenkaart en de kleurenkaart (BESLISSING 169): voor elk begrip precies één icoon en één familiekleur, overal in de app.
// Menu, tabbalk, kaartkop, rij, motivator, Dagboek, verslag, medaille, instellingen en uitleg halen hun icoon hier op, nooit met een losse naam.
// Bron: bloei-huisstijl/HUISSTIJL.md §5 en §5.1 (iconen en tegels), §3 (kleuren), §7 (componenten) en bloei-huisstijl/tokens.css.
//
// De kleur volgt het begrip, overal; neutraal alleen voor begrippen zonder eigen familie (BESLISSING 175).
//
// ICONEN
//  - Eén begrip = één icoon, overal. Eén icoon = één begrip, behalve de benoemde uitzonderingen onderaan (UITZONDERINGEN).
//  - Gevoel en favoriet zijn `regular`, al het andere `solid`. Een inhoudsicoon staat in een tegel van 40 x 40, radius 14, icoon 18 px
//    (--tile-size, --tile-radius). Stemming is de enige ronde tegel (HUISSTIJL §5.2), nooit een maaltijdtegel.
//  - De maaltijden (MAALTIJDICOON) en de dranken (DRANKICOON) blijven in src/ui/beeld.js de bron voor hun zes en zes iconen; hier staan alleen
//    hun familie en de verwijzing.
//
// KLEUREN per onderwerp (BESLISSING 181): elk onderwerp heeft één kleur, overal: tabbladen, instellingen en details. Elke kleur komt uit één token,
// dus in Poeder, Salie en Nacht uit hetzelfde token. De dé afspraak:
//   Onderwerp                                          Kleur       Familie     Tokens
//   Vandaag                                            pruim       dag         --tile-day-bg / --tile-day-fg; --c-day, --c-day-soft
//   Dagboek                                            kasjmier    dagboek     --tile-book-bg / --tile-book-fg; --c-book, --c-book-soft
//   Drinken, dagdoel, dranken                          mist        drank       --tile-drink-*; de vulling van glas, baan en staafjes --c-water
//   Supplementen, momenten, reeks, badges, doel gehaald  salie     gezondheid  --tile-health-*; --c-health
//   Gewicht, weging, weegdag, streefgewicht            duifblauw   gewicht     (nieuw: --tile-weight-*, zodra spoor A de familie toevoegt)
//   Algemeen: instellingen, profiel, thema, vergrendeling, uitleg, back-up   neutraal   neutraal   --tile-neutral-*
//   Delen, verslag, periode                            aubergine   delen       (nieuw: --tile-share-*, zodra spoor A de familie toevoegt)
//   Eten, de zes maaltijden, favorieten                poederroze  maaltijd    --tile-meal-*
//   Stemming                                           lavendel naar goud, rond  de vijf stappen --mood-1 tot --mood-5 en --mood-n-soft; energie de blaadjes --energy-*
//   De medailles houden hun eigen kleur per soort (schermen.css); de knoppen en links houden de gewone interactiekleuren.
//
// KLEUREN per soort bediening (één kleur voor één betekenis, overal; geen eigen waarden):
//   afgevinkt, klaar, aan             --c-health (salie) met --c-health-soft als achtergrond: een vinkvak dat aan staat en een schakelaar die aan staat zijn beide salie (BESLISSING 172)
//   actieve chip, actief deel van een segment, gekozen dag, "Nu", vandaag   --c-accent-soft (achtergrond) met --c-accent-text (tekst); de markering van vandaag in de kalender en in de week: ring --c-accent
//   primaire knop                     --c-accent met witte tekst; tekstknop en link --c-accent-text
//   hover                             --c-surface-soft; druk: transform scale(.97), nooit een eigen kleur
//   focusrand                         2 px --c-accent
//   voortgangsbaan                    vulling --c-water (drinken) of --c-health (gehaald), achtergrond --c-accent-soft
//   lijnen tussen rijen               --c-line (1 px); gedempte hint- en bijtekst --c-text-muted
import { icoon } from './iconen.js';
import { icoontegel } from './componenten.js';
import { isAndroid } from '../kern/toestel.js';

// Eén begrip = { naam, familie, stijl }. Nooit een losse naam in een scherm: gebruik begripTegel() of begripIcoon().
export const ICOON = {
  // tabbladen
  vandaag: { naam: 'sun', familie: 'dag', stijl: 'solid' },
  dagboek: { naam: 'book-open', familie: 'dagboek', stijl: 'solid' },
  meer: { naam: 'sliders', familie: 'neutraal', stijl: 'solid' }, // oude naam van het tabblad Algemeen; blijft staan tot niemand het nog opvraagt
  algemeen: { naam: 'sliders', familie: 'neutraal', stijl: 'solid' }, // het tabblad Algemeen (route #/meer) en de kop "Jouw instellingen"
  // de onderdelen van de dag
  eten: { naam: 'utensils', familie: 'maaltijd', stijl: 'solid' },
  drinken: { naam: 'glass-water', familie: 'drank', stijl: 'solid' }, // ook het dagdoel en de dranktegel water
  supplementen: { naam: 'capsules', familie: 'gezondheid', stijl: 'solid' },
  spuit: { naam: 'syringe', familie: 'gezondheid', stijl: 'solid' }, // de geplande beurt van een periodiek supplement (BESLISSING 251)
  stemming: { naam: 'face-smile', familie: 'neutraal', stijl: 'regular', rond: true }, // de kop van Stemming en energie; de stap zelf: STEMMING_STAP
  energie: { naam: 'leaf', familie: 'gezondheid', stijl: 'solid' }, // de schaal zelf zijn de eigen blaadjes
  notitie: { naam: 'pen', familie: 'neutraal', stijl: 'solid' },
  gewicht: { naam: 'weight-scale', familie: 'gewicht', stijl: 'solid' }, // ook weging en het tabblad
  // reeks, badges, favoriet
  reeks: { naam: 'seedling', familie: 'gezondheid', stijl: 'solid' },
  badge: { naam: 'award', familie: 'gezondheid', stijl: 'solid' },
  favoriet: { naam: 'heart', familie: 'maaltijd', stijl: 'regular' }, // bij een maaltijd roze; in lijsten en uitleg neutraal (zelfde icoon)
  // instellingen en hulp (neutraal)
  instellingen: { naam: 'sliders', familie: 'neutraal', stijl: 'solid' },
  profiel: { naam: 'user', familie: 'neutraal', stijl: 'solid' },
  thema: { naam: 'palette', familie: 'neutraal', stijl: 'solid' },
  weegdag: { naam: 'calendar-day', familie: 'gewicht', stijl: 'solid' },
  streefgewicht: { naam: 'bullseye', familie: 'gewicht', stijl: 'solid' },
  vergrendeling: { naam: 'lock', familie: 'neutraal', stijl: 'solid' }, // ook de pincode
  pincode: { naam: 'lock', familie: 'neutraal', stijl: 'solid' },
  gezichtsherkenning: isAndroid() ? { naam: 'fingerprint', familie: 'neutraal', stijl: 'solid' } : { naam: 'face-id', familie: 'neutraal', stijl: 'eigen' }, // BESLISSING 604 en 606: het teken voor Face ID (eigen bestand, nagetekend naar het voorbeeld van de eigenaar) waar de app Face ID zegt, de vingerafdruk op Android // toestelcontrole (Face ID)
  herstelvraag: { naam: 'circle-question', familie: 'neutraal', stijl: 'solid' }, // ook de uitleg-ingang als vraagteken (spoor C voegde het icoon toe)
  delen: { naam: 'arrow-up-from-bracket', familie: 'delen', stijl: 'solid' },
  verslag: { naam: 'file-lines', familie: 'delen', stijl: 'solid' },
  periode: { naam: 'calendar-days', familie: 'delen', stijl: 'solid' },
  uitleg: { naam: 'circle-info', familie: 'neutraal', stijl: 'solid' }, // "Goed om te weten" en Over
  herinneringen: { naam: 'bell', familie: 'neutraal', stijl: 'solid' }, // het scherm Herinneringen, zijn rijen en weetjes; gevuld en neutraal, zoals vergrendeling en uitleg
  bewaren: { naam: 'floppy-disk', familie: 'neutraal', stijl: 'solid' }, // actie zonder tegel: de knop "Pdf bewaren" op het scherm Delen
  foto: { naam: 'camera', familie: 'neutraal', stijl: 'solid' },
  // acties (zonder tegel, in currentColor)
  home: { naam: 'house', familie: 'neutraal', stijl: 'solid' },
  terug: { naam: 'chevron-left', familie: 'neutraal', stijl: 'solid' },
  volgende: { naam: 'chevron-right', familie: 'neutraal', stijl: 'solid' },
  ongedaan: { naam: 'rotate-left', familie: 'neutraal', stijl: 'solid' },
  bewerken: { naam: 'pen', familie: 'neutraal', stijl: 'solid' }, // actie zonder tegel; hetzelfde potlood als de notitie
  toevoegen: { naam: 'plus', familie: 'neutraal', stijl: 'solid' },
  weghalen: { naam: 'xmark', familie: 'neutraal', stijl: 'solid' }, // ook sluiten
  verwijderen: { naam: 'trash-can', familie: 'neutraal', stijl: 'solid' }, // profiel verwijderen
};

// De vijf stappen van de stemming: het gezichtje (regular) in de stapkleur --mood-n op een ronde tegel in --mood-n-soft (HUISSTIJL §5.2).
export const STEMMING_STAP = ['face-tired', 'face-meh', 'face-smile', 'face-grin-beam', 'face-grin-hearts'];

// Welke begrippen een icoon delen, bewust: de huisstijl zelf (koffie en ontbijt delen mug-saucer, frisdrank en iets anders bottle-water; die staan
// in beeld.js), vergrendeling en pincode zijn één begrip, en het potlood is zowel de notitie als de actie bewerken.
export const UITZONDERINGEN = [
  ['vergrendeling', 'pincode'], // lock: één begrip
  ['algemeen', 'meer', 'instellingen'], // sliders: het tabblad Algemeen (ook onder zijn oude naam meer) en de instellingen zijn één begrip
  ['notitie', 'bewerken'], // pen
];

// Een onbekend begrip laat de app nooit crashen: een duidelijke waarschuwing in de console en een neutraal vraagtekenicoon. De test in
// tests/ui/iconenkaart.test.js controleert elk letterlijk opgevraagd begrip in src/ tegen deze kaart, zodat een ontbrekend begrip npm test rood maakt.
const ONBEKEND = { naam: 'circle-question', familie: 'neutraal', stijl: 'solid' };
function begripVan(begrip) {
  const b = ICOON[begrip];
  if (b) return b;
  console.warn('Onbekend begrip in de iconenkaart:', begrip);
  return ONBEKEND;
}

// Een icoontegel voor een begrip. opties: { groot, gedimd, familie (alleen om neutraal te maken in een lijst), label }.
export function begripTegel(begrip, opties = {}) {
  const b = begripVan(begrip);
  const tegel = icoontegel(b.naam, opties.familie ?? b.familie, { groot: opties.groot, gedimd: opties.gedimd, stijl: b.stijl, label: opties.label });
  if (b.rond) tegel.classList.add('tegel--rond');
  return tegel;
}

// De tegel-opties voor componenten die { naam, familie, stijl } willen (kaartkop, rij, uitklapkaart, weetjes).
export function begripOpties(begrip, opties = {}) {
  const b = begripVan(begrip);
  return { naam: b.naam, familie: opties.familie ?? b.familie, stijl: b.stijl, ...(opties.groot ? { groot: true } : {}) };
}

// Een kaal icoon (zonder tegel) voor een begrip, in currentColor.
export function begripIcoon(begrip, opties = {}) {
  const b = begripVan(begrip);
  return icoon(b.naam, { grootte: opties.grootte ?? 18, stijl: b.stijl, label: opties.label });
}
