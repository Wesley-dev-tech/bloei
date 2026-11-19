// Drinken: elke tik is één record. Alle dranken tellen mee voor het dagdoel.
import { db, isEigen } from './db.js';
import { zend } from '../kern/bus.js';
import { isToekomst, naarDatum, vandaag } from '../kern/datum.js';
import { legeDag } from './dagen.js';
import { leesInstelling } from './instellingen.js';
import { isPasGehaald } from '../logica/drinken.js';

export const DRANKSOORTEN = ['water', 'thee', 'koffie', 'sap', 'frisdrank', 'anders'];

async function standaardMl(soort) {
  if (soort === 'water') return leesInstelling('drinken.glasMl');
  return (await leesInstelling('drinken.groottes'))[soort];
}

// Vandaag: nu. Een andere dag: die dag, op het huidige uur.
function tijdstipVoor(datum) {
  const nu = new Date();
  if (datum === vandaag(nu)) return nu.getTime();
  const d = naarDatum(datum);
  d.setHours(nu.getHours(), nu.getMinutes(), nu.getSeconds(), nu.getMilliseconds());
  return d.getTime();
}

export async function leesDranken(datum) {
  const dranken = await db.dranken.where('datum').equals(datum).toArray();
  return dranken.sort((a, b) => a.tijdstip - b.tijdstip || a.id - b.id);
}

// Alle dranken van een periode (beide dagen inbegrepen), voor het verloop en de kerncijfers op Drinken.
export async function leesDrankenBereik(van, tot) {
  const dranken = await db.dranken.where('datum').between(van, tot, true, true).toArray();
  return dranken.sort((a, b) => a.tijdstip - b.tijdstip || a.id - b.id);
}

export async function totaalMl(datum) {
  return (await leesDranken(datum)).reduce((som, drank) => som + drank.ml, 0);
}

// Zonder ml: de ingestelde grootte voor die drank.
export async function voegDrankToe(datum, soort = 'water', ml) {
  if (!DRANKSOORTEN.includes(soort)) throw new Error('soort');
  if (isToekomst(datum)) throw new Error('toekomst');

  const hoeveelheid = Math.round(ml ?? (await standaardMl(soort)));
  if (!(hoeveelheid > 0)) throw new Error('ml');

  const drank = { datum, tijdstip: tijdstipVoor(datum), soort, ml: hoeveelheid, voorbeeld: false };
  await bewaarMetDoel(drank);
  return drank;
}

// R2-12: een weggehaalde drank terugzetten ("Terugzetten" in de strook). Het hele record komt terug, met zijn eigen id en tijdstip,
// zodat "Laatst" en "laatste weghalen" de echte volgorde houden. Dezelfde doelregel als voegDrankToe: was het doel al gehaald, dan
// blijft het gehaald en volgt er geen nieuwe viering.
export async function zetDrankTerug(drank) {
  await bewaarMetDoel({ ...drank });
  return drank;
}

// Bewaren, de dag lezen, beslissen en schrijven in één transactie (R1-03, R1-04): twee snelle tikken of een notitie die tegelijk
// bewaart, wachten op elkaar. Zo komt doel:gehaald maar één keer en overschrijft de tik geen notitie of stemming.
async function bewaarMetDoel(drank) {
  const { datum } = drank;
  let pasGehaald = false;
  await db.transaction('rw', db.dranken, db.dagen, db.instellingen, async () => {
    drank.id = drank.id == null ? await db.dranken.add(drank) : await db.dranken.put(drank);
    // Het dagdoel: één keer gehaald blijft gehaald (de regel staat in logica/drinken.js).
    const dag = (await db.dagen.get(datum)) ?? legeDag(datum);
    // (!dag.doelGehaald vooraf: zo wordt het totaal alleen gelezen als het nog kan tellen.)
    if (!dag.doelGehaald && isPasGehaald({ doelGehaald: dag.doelGehaald, totaal: await totaalMl(datum), doelMl: await leesInstelling('drinken.dagdoelMl') })) {
      // Het gehaalde doel is nu van de gebruiker, ook op een voorbeelddag. Een voorbeelddag begint dan als lege bladzijde: de verzonnen
      // stemming, energie en notitie worden niet de hare (R1-05).
      await db.dagen.put({ ...(isEigen(dag) ? dag : legeDag(datum)), doelGehaald: true, voorbeeld: false, gewijzigdOp: Date.now() });
      pasGehaald = true;
    }
  });

  zend('data:gewijzigd', { store: 'dranken', datum });
  // De viering is alleen voor vandaag; een vroegere dag aanvullen blijft stil.
  if (pasGehaald && datum === vandaag()) zend('doel:gehaald', { datum });
}

export async function verwijderDrank(id) {
  const drank = await db.dranken.get(id);
  if (!drank) return;
  await db.dranken.delete(id);
  zend('data:gewijzigd', { store: 'dranken', datum: drank.datum });
}

export async function verwijderLaatste(datum) {
  const laatste = (await leesDranken(datum)).at(-1) ?? null;
  if (laatste) await verwijderDrank(laatste.id);
  return laatste;
}
