// De database van het schrift: Dexie boven IndexedDB. Schema en velden: PLAN.md §5.
//
// MIGRATIES: een bestaande versie wordt nooit meer aangepast. Elke schemawijziging is een
// nieuwe db.version(n).stores({...}).upgrade(tx => ...) hieronder, en SCHEMA_VERSIE gaat mee omhoog.
import Dexie from 'dexie';
import { leidAfUitDosis, splitsDosis } from '../logica/supplementen.js';
import { vandaag } from '../kern/datum.js';
import { DB_NAAM } from '../kern/demo.js';

export const SCHEMA_VERSIE = 4;

// 'bloei-dagboek', of in de demo 'bloei-demo' (kern/demo.js): de demo opent de echte database nooit, ook niet in de service worker.
export const db = new Dexie(DB_NAAM);

db.version(1).stores({
  dagen: 'datum',
  maaltijden: '[datum+soort], datum, soort',
  fotos: '++id',
  dranken: '++id, datum',
  wegingen: 'week, datum',
  favorieten: '++id, &sleutel',
  badges: 'id',
  instellingen: 'sleutel',
});

// Versie 2 (PLAN.md §15.1): supplementen en innames erbij. Alle bestaande stores en gegevens blijven zoals ze zijn.
db.version(2).stores({
  supplementen: '++id',
  innames: '[datum+supplementId], datum, supplementId',
});

// Versie 3 (PLAN.md §16.12): supplementen per moment van de dag.
// - supplementen krijgen momenten en ritme;
// - innames krijgen een moment en dus een andere sleutel ([datum+supplementId+moment]). IndexedDB kan de primaire sleutel van een
//   bestaande store niet wijzigen. Daarom komt er een nieuwe store momentinnames, waar de upgrade alle oude innames in overzet;
//   daarna wordt de oude store innames verwijderd. Alles gebeurt in één transactie: mislukt er iets, dan blijft schema 2 zoals het was.
// Hulp bij de upgrade: momenten en ritme worden afgeleid uit de vrije tekst van dosis (logica/supplementen.js); die tekst
// blijft ongewijzigd. Een oude inname (één vinkje per dag) wordt een inname op elk moment van het supplement, of op 'dag'
// bij een periodiek supplement: er gaat niets verloren.
db.version(3)
  .stores({
    innames: null,
    momentinnames: '[datum+supplementId+moment], datum, supplementId',
  })
  .upgrade(async (tx) => {
    const nu = vandaag();
    const afgeleid = new Map();
    const lijst = tx.table('supplementen');
    for (const s of await lijst.toArray()) {
      const a = leidAfUitDosis(s.dosis, nu);
      afgeleid.set(s.id, a);
      await lijst.put({ ...s, momenten: a.momenten, ritme: a.ritme });
    }
    const nieuw = tx.table('momentinnames');
    for (const i of await tx.table('innames').toArray()) {
      const a = afgeleid.get(i.supplementId);
      const momenten = a ? (a.ritme.soort === 'dagelijks' ? a.momenten : ['dag']) : ['ochtend'];
      for (const moment of momenten) await nieuw.put({ ...i, moment });
    }
  });

// Versie 4 (BESLISSING 151): een supplement krijgt hoeveelheid en aanwijzing, afgeleid uit de vrije tekst van dosis. Geen wijziging
// aan stores of sleutels. De upgrade raakt momenten, ritme en dosis niet aan en slaat supplementen over die al een
// hoeveelheid of aanwijzing hebben.
db.version(4)
  .stores({})
  .upgrade(async (tx) => {
    const lijst = tx.table('supplementen');
    for (const s of await lijst.toArray()) {
      if (s.hoeveelheid !== undefined || s.aanwijzing !== undefined) continue;
      await lijst.put({ ...s, ...splitsDosis(s.dosis) });
    }
  });

export async function openDb() {
  if (!db.isOpen()) await db.open();
}

// Vraagt de browser om de opslag niet zomaar te wissen (iOS doet dat anders na lange tijd).
export async function vraagPermanenteOpslag() {
  try {
    if (!globalThis.navigator?.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// De vlag voorbeeld: voorbeelddata laden bestaat niet meer (BESLISSING 407), maar wie ze ooit laadde, kan nog rijen met voorbeeld: true
// hebben. Die tellen nooit als eigen gegevens (reeks, teller, badges, suggesties, verslag); op het scherm blijven ze gewoon staan. Wat de
// gebruiker zelf bewaart, krijgt voorbeeld: false.
export const isEigen = (rij) => rij != null && !rij.voorbeeld;

// Wis-epoch: wisAlles() verhoogt dit getal, voor en na zijn transactie. Wie intussen
// iets las en daarna wil bewaren (teller, badges), vergelijkt het getal en bewaart niets als het
// veranderd is. Zo komt er nooit iets terug in een schrift dat net leeggemaakt is.
let epoch = 0;
export const huidigeEpoch = () => epoch;
export const verhoogEpoch = () => { epoch += 1; };
