// De notitie en het gehaalde dagdoel per dag. Een dag zonder record is gewoon een lege bladzijde.
import { db, isEigen } from './db.js';
import { zend } from '../kern/bus.js';
import { isToekomst } from '../kern/datum.js';
import { MAX_LENGTE, begrens } from './grenzen.js';

export function legeDag(datum) {
  return {
    datum,
    notitie: '',
    doelGehaald: false,
    voorbeeld: false,
    gewijzigdOp: 0,
    // Wanneer de notitie zelf het laatst geschreven is (ms); 0 = nog nooit. Alleen zetNotitie zet dit: het vangnet (data/vangnet.js)
    // vergelijkt hiermee, niet met gewijzigdOp, dat ook door het drinkdoel verandert.
    // Een record van voor deze stempel heeft het veld niet. Niet geindexeerd: geen nieuwe versie van de database.
    tekstOp: 0,
  };
}

async function wijzig(datum, wijziging) {
  // Toekomstige dagen zijn te bekijken, niet in te vullen.
  if (isToekomst(datum)) throw new Error('toekomst');
  // Lezen en schrijven in één transactie, zodat een tik op Drinken die tegelijk het doel bewaart, deze wijziging niet overschrijft (R1-04).
  await db.transaction('rw', db.dagen, async () => {
    const bestaand = await db.dagen.get(datum);
    // Wat de gebruiker zelf wijzigt, is van de gebruiker: het is dan geen voorbeeld meer. Een voorbeelddag begint dan als lege bladzijde,
    // zodat de verzonnen notitie niet de hare wordt (R1-05).
    const basis = isEigen(bestaand) ? bestaand : legeDag(datum);
    await db.dagen.put({ ...basis, ...wijziging, voorbeeld: false, gewijzigdOp: Date.now() });
  });
  zend('data:gewijzigd', { store: 'dagen', datum });
}

export async function leesDag(datum) {
  return (await db.dagen.get(datum)) ?? legeDag(datum);
}

export async function zetNotitie(datum, tekst) {
  await wijzig(datum, { notitie: begrens(tekst, MAX_LENGTE.notitie), tekstOp: Date.now() });
}

