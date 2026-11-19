// Sleutel-waarde-instellingen met standaardwaarden. Sleutels en betekenis: PLAN.md §5.
import { db } from './db.js';
import { zend } from '../kern/bus.js';
import { MAX_LENGTE, begrens } from './grenzen.js';

export const STANDAARD = {
  'start.klaar': false,
  'profiel.naam': '', // geen standaardnaam: het welkomscherm vraagt ze (BESLISSING 287); zonder naam valt elk scherm terug op niets (logica/naam.js)
  'profiel.avatar': { soort: 'figuur', nr: 1 },
  'thema.keuze': 'poeder', // poeder | salie | nacht | auto
  'thema.kaft': 'bes',
  'thema.modus': 'auto',
  'drinken.dagdoelMl': 2500, // 2,5 liter (BESLISSING 274; eerder 2 liter, BESLISSING 127)
  'drinken.dagdoelOmgezet': false, // vlag: de oude standaard van 2000 ml is al één keer naar 2500 omgezet
  'drinken.glasMl': 800, // de grootte van één tik op Water: een kan van 800 ml (BESLISSING 270); de sleutel houdt zijn oude naam
  'drinken.kanOmgezet': false, // vlag: de oude standaard van 250 ml is al één keer naar een kan omgezet
  'drinken.groottes': { thee: 200, koffie: 150, sap: 200, frisdrank: 330, anders: 250 },
  'gewicht.weegdag': 1,
  'gewicht.streefKg': null,
  'meldingen.dagboek': { aan: false, uur: '20:00' },
  // BESLISSINGEN 312 en 313: herinneringen voor drinken (tot 4 tijdstippen) en supplementen (tot 3) met elk eigen schakelaar en uur; de
  // uren zijn beginwaarden die de gebruiker zelf aanpast, toevoegt en weghaalt. Een oude bewaarde 'meldingen.weegdag' of 'meldingen.supplementen'
  // (één uur) leest niemand nog; ze blijven ongemoeid in de database staan.
  'meldingen.drinken': [{ aan: false, uur: '11:00' }, { aan: false, uur: '15:00' }, { aan: false, uur: '19:00' }],
  'meldingen.supplementenUren': [{ aan: false, uur: '08:00' }, { aan: false, uur: '13:00' }, { aan: false, uur: '19:00' }],
  'meldingen.details': false, // BESLISSING 335: standaard staat er in elke melding alleen "Bloei ligt klaar."; aan = de tekst met details (alleen lokaal, gaat nooit naar de dienst)
  'meldingen.abonnement': null,
  'slot.aan': false,
  'slot.pin': null,
  'slot.vraag': null,
  'slot.antwoord': null,
  'slot.passkeyId': null,
  'slot.methode': null, // 'pin' | 'faceid'; null = een oudere stand zonder keuze (zie bepaalMethode in pin.js)
  'slot.fouten': 0,
  'slot.wachtTot': 0,
  // BESLISSING 518: herstellen zonder herstelvraag (src/vergrendeling/herstel.js). De herstelcode staat nooit leesbaar bewaard.
  'slot.herstel': null, // { zout, hash, rondes, gemaakt, bevestigd }
  'slot.herstelFouten': 0,
  'slot.herstelWachtTot': 0,
  'slot.herstelAanbod': false, // een bestaande gebruiker zag het aanbod "Maak een herstelcode" al
  'teller.hoogste': 0,
  // Delen (stap 19): welke onderdelen in het verslag komen. Gewicht en notities staan standaard uit.
  'delen.onderdelen': { eten: true, drinken: true, gewicht: false, notities: false },
  'installatie.strookWeg': false,
};

// Een kopie, zodat niemand per ongeluk de standaardwaarden zelf wijzigt.
const kopie = (waarde) => (waarde === undefined ? undefined : structuredClone(waarde));

// De grenzen van wat in te stellen is (één bron voor de schermen en het lezen). Dezelfde getallen als de knoppen altijd hadden.
export const GRENZEN = {
  dagdoelMl: { min: 500, max: 4000, stap: 250 },
  kg: { min: 20, max: 300, stap: 0.1 },
  glasMl: { min: 100, max: 1500, stap: 50 },
  drankMl: { min: 50, max: 1000, stap: 50 },
};

// Een bewaarde waarde die buiten de grenzen valt (bv. een dagdoel van 0 uit oude of gewijzigde gegevens), geldt als de standaard:
// zo rekent elk scherm met hetzelfde dagdoel (R5-06).
const binnen = (g) => (w) => typeof w === 'number' && Number.isFinite(w) && w >= g.min && w <= g.max;
const GELDIG = { 'drinken.dagdoelMl': binnen(GRENZEN.dagdoelMl) };

export async function leesInstelling(sleutel) {
  const rij = await db.instellingen.get(sleutel);
  if (!rij || (GELDIG[sleutel] && !GELDIG[sleutel](rij.waarde))) return kopie(STANDAARD[sleutel]);
  return rij.waarde;
}

// Vrije tekst in de instellingen krijgt een bovengrens bij het schrijven (OW-05, grenzen.js).
const TEKSTGRENS = { 'profiel.naam': MAX_LENGTE.naam };

export async function zetInstelling(sleutel, waarde) {
  if (TEKSTGRENS[sleutel] && typeof waarde === 'string') waarde = begrens(waarde, TEKSTGRENS[sleutel]);
  await db.instellingen.put({ sleutel, waarde });
  zend('instelling:gewijzigd', { sleutel, waarde });
}

// BESLISSING 270: water is een kan van 800 ml. Staat de grootte van Water nog op de oude standaard (250), dan wordt ze één keer
// omgezet; een eigen keuze blijft staan. Dranken die al genoteerd zijn houden hun eigen ml (die staan niet in de instellingen).
export async function migreerKan() {
  await migreerStart();
  if (!(await leesInstelling('drinken.kanOmgezet'))) {
    const rij = await db.instellingen.get('drinken.glasMl');
    if (rij && rij.waarde === 250) await zetInstelling('drinken.glasMl', STANDAARD['drinken.glasMl']);
    await zetInstelling('drinken.kanOmgezet', true);
  }
  // Los van de kan: ook wie de kan al eerder omgezet kreeg (tussen BESLISSING 270 en 274), krijgt de dagdoelstap één keer (BESLISSING 428).
  await migreerDagdoel();
}

// BESLISSING 274 en 428: het standaard dagdoel is 2,5 liter. Een bewaard dagdoel van precies de oude standaard (2000) wordt één keer per
// toestel omgezet, ook als de kan al eerder omgezet was; wie bewust 2000 had, zet het zelf terug. Een andere keuze blijft staan, en de
// vlag wordt altijd gezet zodat een latere bewuste 2000 blijft.
async function migreerDagdoel() {
  if (await leesInstelling('drinken.dagdoelOmgezet')) return;
  const rij = await db.instellingen.get('drinken.dagdoelMl');
  if (rij && rij.waarde === 2000) await zetInstelling('drinken.dagdoelMl', STANDAARD['drinken.dagdoelMl']);
  await zetInstelling('drinken.dagdoelOmgezet', true);
}

// Eerste start (BESLISSING 115 tot 124): zolang 'start.klaar' niet waar is, toont de app het welkomscherm. Wie al gegevens heeft
// (een naam, of iets in dagboek, drinken, supplementen of gewicht) krijgt één keer start.klaar = true en ziet het scherm nooit.
// Het resultaat staat in het geheugen, zodat de router het meteen weet (isStartKlaar); zolang het onbekend is, geldt 'klaar'.
// De app leest alleen de database (BESLISSING 288): geen sleutel in de browseropslag.
let startKlaar = true;
export const isStartKlaar = () => startKlaar;

async function migreerStart() {
  let klaar = await leesInstelling('start.klaar');
  if (!klaar) {
    const [naam, ...tellers] = await Promise.all([db.instellingen.get('profiel.naam'), db.maaltijden.count(), db.dranken.count(), db.supplementen.count(), db.wegingen.count(), db.dagen.count()]);
    if (naam || tellers.some((n) => n > 0)) {
      await zetInstelling('start.klaar', true);
      klaar = true;
    }
  }
  startKlaar = Boolean(klaar);
}

// Het welkomscherm is doorlopen (of overgeslagen).
export async function zetStartKlaar() {
  await zetInstelling('start.klaar', true);
  startKlaar = true;
}

export async function alleInstellingen() {
  const alles = kopie(STANDAARD);
  for (const rij of await db.instellingen.toArray()) alles[rij.sleutel] = rij.waarde;
  return alles;
}
