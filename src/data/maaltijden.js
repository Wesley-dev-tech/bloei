// De zes maaltijden per dag. Een maaltijd zonder tekst, foto en gevoel bestaat niet als record:
// een overgeslagen maaltijd blijft gewoon leeg.
import { db, isEigen } from './db.js';
import { zend } from '../kern/bus.js';
import { isToekomst, nuAlsTijd, plusDagen, vandaag } from '../kern/datum.js';
import { wisFoto as wisFotoBestand } from './fotos.js';
import { MAX_LENGTE, begrens } from './grenzen.js';

export const MAALTIJDSOORTEN = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];

export const STANDAARDTIJD = {
  ontbijt: '08:00',
  tussendoortje: '10:00',
  middagmaal: '12:30',
  vieruurtje: '16:00',
  avondmaal: '18:30',
  latesnack: '21:00',
};

function controleer(datum, soort) {
  if (!MAALTIJDSOORTEN.includes(soort)) throw new Error('soort');
  if (isToekomst(datum)) throw new Error('toekomst');
}

// Vandaag staat het huidige uur er al; op een andere dag het gewone uur van die maaltijd.
function nieuweMaaltijd(datum, soort) {
  return {
    datum,
    soort,
    tijd: datum === vandaag() ? nuAlsTijd() : STANDAARDTIJD[soort],
    tekst: '',
    fotoId: null,
    gevoel: null,
    voorbeeld: false,
    gewijzigdOp: 0,
  };
}

const isHelemaalLeeg = (m) => m.tekst.trim() === '' && m.fotoId == null && m.gevoel == null;

// Een maaltijd is ingevuld als er tekst of een foto is (een foto alleen nog in oude gegevens: die blijven zo ingevuld).
export function isIngevuld(m) {
  return Boolean(m) && ((m.tekst ?? '').trim() !== '' || m.fotoId != null);
}

// Bewaart de maaltijd, of verwijdert het record als alles leeg is. Geeft de maaltijd of null.
async function schrijf(maaltijd) {
  const { datum, soort } = maaltijd;
  let resultaat = null;
  if (isHelemaalLeeg(maaltijd)) {
    await db.maaltijden.delete([datum, soort]);
  } else {
    // Wat de gebruiker zelf wijzigt, is van de gebruiker: het is dan geen voorbeeld meer.
    resultaat = { ...maaltijd, voorbeeld: false, gewijzigdOp: Date.now() };
    await db.maaltijden.put(resultaat);
  }
  return resultaat;
}

export async function leesMaaltijden(datum) {
  const perSoort = Object.fromEntries(MAALTIJDSOORTEN.map((soort) => [soort, null]));
  for (const maaltijd of await db.maaltijden.where('datum').equals(datum).toArray()) {
    perSoort[maaltijd.soort] = maaltijd;
  }
  return perSoort;
}

// wijziging: { tijd?, tekst?, gevoel? }. Alleen de velden in de wijziging veranderen, op het record zoals het nu in de database staat:
// lezen en schrijven in één transactie (R5-01), zodat een ander tabblad of een gelijktijdige tik geen ander veld overschrijft.
export async function bewaarMaaltijd(datum, soort, wijziging = {}) {
  controleer(datum, soort);
  if (wijziging.tijd !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(wijziging.tijd)) throw new Error('tijd');
  const { gevoel } = wijziging;
  if (gevoel !== undefined && gevoel !== null && (!Number.isInteger(gevoel) || gevoel < 1 || gevoel > 5)) throw new Error('schaal');
  const resultaat = await db.transaction('rw', db.maaltijden, async () => {
    const nieuw = { ...((await db.maaltijden.get([datum, soort])) ?? nieuweMaaltijd(datum, soort)) };
    if (wijziging.tijd !== undefined) nieuw.tijd = wijziging.tijd;
    if (wijziging.tekst !== undefined) nieuw.tekst = begrens(wijziging.tekst, MAX_LENGTE.maaltijd);
    if (gevoel !== undefined) nieuw.gevoel = gevoel;
    return schrijf(nieuw);
  });
  zend('data:gewijzigd', { store: 'maaltijden', datum });
  return resultaat;
}

// Annuleren in het open maaltijdvenster (BESLISSING 412): de maaltijd precies terug zoals ze was toen het venster openging.
// oud = het record van toen, of null als de maaltijd toen leeg was (dan is ze daarna weer leeg).
export async function zetMaaltijdTerug(datum, soort, oud) {
  controleer(datum, soort);
  await db.transaction('rw', db.maaltijden, async () => {
    if (oud) await db.maaltijden.put({ ...oud });
    else await db.maaltijden.delete([datum, soort]);
  });
  zend('data:gewijzigd', { store: 'maaltijden', datum });
}

// Een foto bij het eten bestaat niet meer (BESLISSING 128), maar oude gegevens kunnen nog een fotoId hebben: die foto gaat mee weg.
export async function wisMaaltijd(datum, soort) {
  controleer(datum, soort);
  const bestaand = await db.maaltijden.get([datum, soort]);
  if (!bestaand) return;
  await db.maaltijden.delete([datum, soort]);
  if (bestaand.fotoId != null) await wisFotoBestand(bestaand.fotoId);
  zend('data:gewijzigd', { store: 'maaltijden', datum });
}

// Neemt alleen de tekst van gisteren over; foto en gevoel horen bij het moment zelf.
export async function zelfdeAlsGisteren(datum, soort) {
  controleer(datum, soort);
  const gisteren = await db.maaltijden.get([plusDagen(datum, -1), soort]);
  if (!gisteren || gisteren.tekst.trim() === '') return null;
  return bewaarMaaltijd(datum, soort, { tekst: gisteren.tekst });
}

// De vaakst ingevulde teksten voor deze maaltijd in de laatste 90 dagen: minstens 2 keer, zonder
// wat al favoriet is (42). Oude voorbeelddata telt niet mee. Bij gelijke stand wint de recentste.
export async function suggesties(soort, max = 3) {
  const vanaf = plusDagen(vandaag(), -90);
  const telling = new Map();
  const maaltijden = await db.maaltijden.where('soort').equals(soort).toArray();
  for (const m of maaltijden) {
    if (!isEigen(m) || m.datum < vanaf || isToekomst(m.datum)) continue;
    const tekst = (m.tekst ?? '').trim();
    if (tekst === '') continue;
    const sleutel = tekst.toLowerCase();
    const huidig = telling.get(sleutel) ?? { tekst, aantal: 0, laatste: '' };
    huidig.aantal += 1;
    if (m.datum >= huidig.laatste) {
      huidig.laatste = m.datum;
      huidig.tekst = tekst;
    }
    telling.set(sleutel, huidig);
  }
  const favorieten = new Set((await db.favorieten.toArray()).map((f) => f.sleutel));
  return [...telling.entries()]
    .filter(([sleutel, r]) => r.aantal >= 2 && !favorieten.has(sleutel))
    .sort((a, b) => b[1].aantal - a[1].aantal || (a[1].laatste < b[1].laatste ? 1 : -1))
    .slice(0, max)
    .map(([, r]) => r.tekst);
}
