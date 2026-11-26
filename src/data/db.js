// De database van het schrift: Dexie boven IndexedDB. Schema en velden: PLAN.md §5.
//
// MIGRATIES: een bestaande versie wordt nooit meer aangepast. Elke schemawijziging is een
// nieuwe db.version(n).stores({...}).upgrade(tx => ...) hieronder, en SCHEMA_VERSIE gaat mee omhoog.
import Dexie from 'dexie';
import { leidAfUitDosis, splitsDosis } from '../logica/supplementen.js';
import { vandaag } from '../kern/datum.js';
import { DB_NAAM } from '../kern/demo.js';

export const SCHEMA_VERSIE = 6;

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

// Versie 5 (0.5.8, beslissing van de eigenaar): Bloei houdt geen stemming, geen energie en geen gevoel bij een maaltijd meer bij, en bewaart
// er ook niets meer van. Deze upgrade wist wat er op het toestel nog van stond, onomkeerbaar:
// - bij elke dag de velden stemming en energie;
// - bij elke maaltijd het veld gevoel; een maaltijd die daarna niets meer heeft (geen tekst, geen foto) verdwijnt, zoals elke lege maaltijd;
// - de behaalde medailles die erover gingen.
// Geen wijziging aan stores of sleutels. Dit is de enige plek in Bloei die deze namen nog noemt: zonder kan ze ze niet wissen.
const MEDAILLES_WEG_V5 = ['gemoed', 'dertig-stemmingen', 'honderd-stemmingen', 'zeven-energie', 'dertig-energie', 'gezichtje-en-blaadje', 'week-gezichtjes', 'maand-gezichtjes', 'tien-gevoel'];
db.version(5)
  .stores({})
  .upgrade(async (tx) => {
    const dagen = tx.table('dagen');
    for (const dag of await dagen.toArray()) {
      if (!('stemming' in dag) && !('energie' in dag)) continue;
      const { stemming: _s, energie: _e, ...rest } = dag;
      await dagen.put(rest);
    }
    const maaltijden = tx.table('maaltijden');
    for (const maaltijd of await maaltijden.toArray()) {
      if (!('gevoel' in maaltijd)) continue;
      const { gevoel: _g, ...rest } = maaltijd;
      if (String(rest.tekst ?? '').trim() === '' && rest.fotoId == null) await maaltijden.delete([maaltijd.datum, maaltijd.soort]);
      else await maaltijden.put(rest);
    }
    await tx.table('badges').bulkDelete(MEDAILLES_WEG_V5);
  });

// Versie 6 (0.6.3, beslissing van de eigenaar): Bloei kent geen vaste dag van de week meer om te wegen. Een weging telt op elke dag, één
// per week. Deze upgrade wist de instellingen die erover gingen van het toestel, onomkeerbaar. Geen wijziging aan stores of sleutels.
// Dit is de enige plek in Bloei die deze namen nog noemt: zonder kan ze ze niet wissen.
const INSTELLINGEN_WEG_V6 = ['gewicht.weegdag', 'meldingen.weegdag'];
db.version(6)
  .stores({})
  .upgrade(async (tx) => {
    await tx.table('instellingen').bulkDelete(INSTELLINGEN_WEG_V6);
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
