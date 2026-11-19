// Notitie, stemming en energie per dag. Een dag zonder record is gewoon een lege bladzijde.
import { db, isEigen } from './db.js';
import { zend } from '../kern/bus.js';
import { isToekomst } from '../kern/datum.js';
import { MAX_LENGTE, begrens } from './grenzen.js';

export function legeDag(datum) {
  return {
    datum,
    notitie: '',
    stemming: null,
    energie: null,
    doelGehaald: false,
    voorbeeld: false,
    gewijzigdOp: 0,
  };
}

function controleerSchaal(waarde) {
  if (waarde === null) return;
  if (!Number.isInteger(waarde) || waarde < 1 || waarde > 5) throw new Error('schaal');
}

async function wijzig(datum, wijziging) {
  // Toekomstige dagen zijn te bekijken, niet in te vullen.
  if (isToekomst(datum)) throw new Error('toekomst');
  // Lezen en schrijven in één transactie, zodat een tik op Drinken die tegelijk het doel bewaart, deze wijziging niet overschrijft (R1-04).
  await db.transaction('rw', db.dagen, async () => {
    const bestaand = await db.dagen.get(datum);
    // Wat de gebruiker zelf wijzigt, is van de gebruiker: het is dan geen voorbeeld meer. Een voorbeelddag begint dan als lege bladzijde,
    // zodat de verzonnen stemming, energie en notitie niet de hare worden (R1-05).
    const basis = isEigen(bestaand) ? bestaand : legeDag(datum);
    await db.dagen.put({ ...basis, ...wijziging, voorbeeld: false, gewijzigdOp: Date.now() });
  });
  zend('data:gewijzigd', { store: 'dagen', datum });
}

export async function leesDag(datum) {
  return (await db.dagen.get(datum)) ?? legeDag(datum);
}

export async function zetNotitie(datum, tekst) {
  await wijzig(datum, { notitie: begrens(tekst, MAX_LENGTE.notitie) });
}

export async function zetStemming(datum, waarde) {
  controleerSchaal(waarde);
  await wijzig(datum, { stemming: waarde });
}

export async function zetEnergie(datum, waarde) {
  controleerSchaal(waarde);
  await wijzig(datum, { energie: waarde });
}
