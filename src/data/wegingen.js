// Gewicht: één weging per week (maandag tot en met zondag). De sleutel is de maandag van die week.
import { db } from './db.js';
import { zend } from '../kern/bus.js';
import { isToekomst, plusDagen, weekStart } from '../kern/datum.js';
import { opEenDecimaal } from '../kern/getal.js';

// Overschrijft een bestaande weging van dezelfde week. De vraag "Vervangen?" stelt het scherm.
export async function bewaarWeging(datum, kg) {
  if (isToekomst(datum)) throw new Error('toekomst');
  if (typeof kg !== 'number' || !Number.isFinite(kg) || kg < 20 || kg > 300) throw new Error('kg');
  const weging = { week: weekStart(datum), datum, kg: opEenDecimaal(kg), voorbeeld: false, gewijzigdOp: Date.now() };
  await db.wegingen.put(weging);
  zend('data:gewijzigd', { store: 'wegingen', datum });
  return weging;
}

// R2-18 (BESLISSING 409): een weging aanpassen naar een datum in een andere week verhuist ze. In één transactie: de nieuwe week krijgt
// de weging (een weging die daar al stond, wordt vervangen; die vraag stelt het scherm) en de oude week wordt leeg.
export async function verhuisWeging(oud, datum, kg) {
  if (isToekomst(datum)) throw new Error('toekomst');
  if (typeof kg !== 'number' || !Number.isFinite(kg) || kg < 20 || kg > 300) throw new Error('kg');
  const weging = { week: weekStart(datum), datum, kg: opEenDecimaal(kg), voorbeeld: false, gewijzigdOp: Date.now() };
  await db.transaction('rw', db.wegingen, async () => {
    await db.wegingen.put(weging);
    if (oud && oud.week !== weging.week) await db.wegingen.delete(oud.week);
  });
  zend('data:gewijzigd', { store: 'wegingen', datum });
  return weging;
}

// Ongedaan maken: de weken in `weg` worden leeg en de records in `terug` komen precies terug, in één transactie.
export async function herstelWegingen({ weg = [], terug = [] } = {}) {
  await db.transaction('rw', db.wegingen, async () => {
    for (const week of weg) await db.wegingen.delete(week);
    for (const rij of terug) if (rij) await db.wegingen.put({ ...rij });
  });
  zend('data:gewijzigd', { store: 'wegingen', datum: terug.find(Boolean)?.datum ?? weg[0] });
}

export async function wegingVanWeek(datum) {
  return (await db.wegingen.get(weekStart(datum))) ?? null;
}

export async function verwijderWeging(week) {
  const weging = await db.wegingen.get(week);
  if (!weging) return;
  await db.wegingen.delete(week);
  zend('data:gewijzigd', { store: 'wegingen', datum: weging.datum });
}

// Oplopend. Met vanDatum: alleen de wegingen vanaf die dag.
export async function leesWegingen(vanDatum) {
  const alles = await db.wegingen.orderBy('week').toArray();
  return vanDatum ? alles.filter((weging) => weging.datum >= vanDatum) : alles;
}

export async function laatsteWeging() {
  return (await db.wegingen.orderBy('week').last()) ?? null;
}

// De laatste weging vóór deze (ook als er weken tussen zitten); null als er geen eerdere is.
export async function vorigeWeging(weging) {
  return (await db.wegingen.where('week').below(weging.week).last()) ?? null;
}

// null als er precies één week eerder geen weging is.
export async function verschilMetVorigeWeek(weging) {
  const vorige = await db.wegingen.get(plusDagen(weging.week, -7));
  if (!vorige) return null;
  return opEenDecimaal(weging.kg - vorige.kg);
}
