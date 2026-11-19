// Supplementen per moment van de dag: de eigen lijst van de gebruiker (naam, dosis, ritme, momenten) en per dag een vinkje per
// supplement per moment. Contract: PLAN.md §16.12, beslissingen 138 tot 141. Geen advies, geen oordeel: niet genomen is
// gewoon niet aangevinkt. Supplementen tellen nooit mee voor het drinkdoel.
//
// Opslag: de tabel momentinnames (schema 3) heeft de sleutel [datum+supplementId+moment]. De oude tabel innames van
// schema 2 is bij de upgrade volledig overgezet en verwijderd.
import { db, isEigen } from './db.js';
import { MAX_LENGTE, begrens } from './grenzen.js';
import { zend } from '../kern/bus.js';
import { isToekomst, vandaag } from '../kern/datum.js';
import { MOMENTEN, momentVanNu, rooster, schoneMomenten, schoonPeriode, schoonRitme, isPeriodiek, splitsDosis } from '../logica/supplementen.js';

// Later op te ruimen (R1-25): schermen/vandaag.js en schermen/supplementen.js halen MOMENTEN en momentVanNu nog hier; de bron is logica/supplementen.js.
export { MOMENTEN, momentVanNu };

const naarSchoon = (tekst) => String(tekst ?? '').trim();
// Bovengrenzen bij het schrijven (OW-05, grenzen.js): naam, dosis en de twee korte velden.
const kort = (tekst, max = MAX_LENGTE.supplementVeld) => begrens(naarSchoon(tekst), max).trim();
const schoneNaam = (tekst) => kort(tekst, MAX_LENGTE.supplementNaam);
const schoneDosis = (tekst) => kort(tekst, MAX_LENGTE.supplementDosis);
const ALLE_MOMENTEN = [...MOMENTEN, 'dag'];

async function volgendeVolgorde() {
  const alle = await db.supplementen.toArray();
  return alle.reduce((hoogste, s) => Math.max(hoogste, s.volgorde), 0) + 1;
}

// De lijst op volgorde. Standaard alleen de actieve; ookInactief geeft ook wat ze niet meer neemt.
export async function leesSupplementen({ ookInactief = false } = {}) {
  const alle = await db.supplementen.toArray();
  return alle.filter((s) => ookInactief || s.actief).sort((a, b) => a.volgorde - b.volgorde || a.id - b.id);
}

// hoeveelheid: wat ze per keer neemt ("1 pipetje"), aanwijzing: hoe ("oplossen in water"), beide korte vrije tekst (hoogstens 120 tekens).
// dosis blijft de oorspronkelijke notitie. Geef je alleen dosis mee, dan worden hoeveelheid en aanwijzing eruit afgeleid.
// momenten: een dagelijks supplement heeft minstens één (standaard ochtend); een periodiek supplement heeft er geen.
// ritme: { soort: 'dagelijks' } (standaard) | { soort: 'interval', dagen >= 2, start } | { soort: 'maand', start }; start is standaard vandaag.
// Fouten: Error('leeg') bij een lege naam, Error('momenten'), Error('ritme').
export async function voegSupplementToe({ naam, dosis = '', hoeveelheid, aanwijzing, momenten, ritme, vanaf, tot } = {}) {
  const schoon = schoneNaam(naam);
  if (!schoon) throw new Error('leeg');
  const nieuwRitme = schoonRitme(ritme, vandaag());
  const periode = schoonPeriode({ vanaf, tot }); // Error('periode') bij een ongeldige datum of tot vóór vanaf (BESLISSING 211)
  let nieuweMomenten = [];
  if (nieuwRitme.soort === 'dagelijks') {
    nieuweMomenten = schoneMomenten(momenten ?? ['ochtend']);
    if (nieuweMomenten.length === 0) throw new Error('momenten');
  }
  const afgeleid = hoeveelheid === undefined && aanwijzing === undefined ? splitsDosis(schoneDosis(dosis)) : { hoeveelheid: '', aanwijzing: '' };
  const supplement = {
    naam: schoon,
    dosis: schoneDosis(dosis),
    hoeveelheid: hoeveelheid === undefined ? afgeleid.hoeveelheid : kort(hoeveelheid),
    aanwijzing: aanwijzing === undefined ? afgeleid.aanwijzing : kort(aanwijzing),
    momenten: nieuweMomenten,
    ritme: nieuwRitme,
    ...periode,
    volgorde: await volgendeVolgorde(),
    actief: true,
    voorbeeld: false,
    aangemaaktOp: Date.now(),
    // BESLISSING 698: het supplement telt vanaf vandaag (de lokale dag van toevoegen); "Begint op" (vanaf) gaat voor als het ingevuld is.
    // wijzigSupplement neemt dit veld ongewijzigd over, zodat bewerken de dag van toevoegen niet verschuift.
    teltVanaf: vandaag(),
  };
  supplement.id = await db.supplementen.add(supplement);
  zend('data:gewijzigd', { store: 'supplementen' });
  return supplement;
}

// Een voorbeeldsupplement dat ze wijzigt, is daarna van haar. Dezelfde regels als bij toevoegen.
export async function wijzigSupplement(id, { naam, dosis, hoeveelheid, aanwijzing, momenten, ritme, vanaf, tot } = {}) {
  const bestaand = await db.supplementen.get(id);
  if (!bestaand) throw new Error('onbekend');
  const nieuw = { ...bestaand, voorbeeld: false };
  if (naam !== undefined) {
    const schoon = schoneNaam(naam);
    if (!schoon) throw new Error('leeg');
    nieuw.naam = schoon;
  }
  if (dosis !== undefined) nieuw.dosis = schoneDosis(dosis);
  if (hoeveelheid !== undefined) nieuw.hoeveelheid = kort(hoeveelheid);
  if (aanwijzing !== undefined) nieuw.aanwijzing = kort(aanwijzing);
  if (ritme !== undefined) nieuw.ritme = schoonRitme({ ...ritme, start: ritme.start ?? (bestaand.ritme?.start ?? vandaag()) }, vandaag());
  if (vanaf !== undefined || tot !== undefined) {
    // vanaf en tot: een lege waarde (null of '') haalt de grens weg; undefined laat ze staan.
    const periode = schoonPeriode({ vanaf: vanaf === undefined ? nieuw.vanaf : vanaf, tot: tot === undefined ? nieuw.tot : tot });
    delete nieuw.vanaf;
    delete nieuw.tot;
    Object.assign(nieuw, periode);
  }
  if (nieuw.ritme.soort === 'dagelijks') {
    // Wie van periodiek naar dagelijks gaat zonder momenten op te geven, krijgt de ochtend.
    const opgegeven = momenten !== undefined;
    const gekozen = schoneMomenten(opgegeven ? momenten : bestaand.momenten?.length ? bestaand.momenten : ['ochtend']);
    if (gekozen.length === 0) throw new Error('momenten');
    nieuw.momenten = gekozen;
  } else {
    nieuw.momenten = [];
  }
  await db.supplementen.put(nieuw);
  zend('data:gewijzigd', { store: 'supplementen' });
  return nieuw;
}

// Bestaan er innames, dan wordt het supplement inactief (het verleden blijft staan); anders verdwijnt het echt.
export async function verwijderSupplement(id) {
  const aantal = await db.momentinnames.where('supplementId').equals(id).count();
  if (aantal > 0) {
    const bestaand = await db.supplementen.get(id);
    if (bestaand) await db.supplementen.put({ ...bestaand, actief: false });
  } else {
    await db.supplementen.delete(id);
  }
  zend('data:gewijzigd', { store: 'supplementen' });
}

// De id's van de supplementen waarvan die dag minstens één moment afgevinkt is. Alleen nog in tests (review R1-12).
export async function leesInnames(datum) {
  const innames = await db.momentinnames.where('datum').equals(datum).toArray();
  return [...new Set(innames.sort((a, b) => a.tijdstip - b.tijdstip).map((i) => i.supplementId))];
}

// De innames die het rooster (logica/supplementen.js) voor de dagen van van tot tot nodig heeft: alle innames van die dagen, plus van elk
// periodiek supplement alle innames (voor de reeks en de volgende datum), elk één keer. supplementen: alle supplementen.
export async function innamesVoorRooster(supplementen, van, tot = van) {
  const periodiekIds = supplementen.filter(isPeriodiek).map((s) => s.id);
  const [inBereik, periodiek] = await Promise.all([
    db.momentinnames.where('datum').between(van, tot, true, true).toArray(),
    periodiekIds.length ? db.momentinnames.where('supplementId').anyOf(periodiekIds).toArray() : [],
  ]);
  const gezien = new Set();
  return [...inBereik, ...periodiek].filter((i) => {
    const sleutel = `${i.datum}|${i.supplementId}|${i.moment}`;
    if (gezien.has(sleutel)) return false;
    gezien.add(sleutel);
    return true;
  });
}

// Het tijdstip (ms) van het laatste vinkje per moment van die dag: { ochtend: 1731..., avond: ... } (voor "Genomen om 8.15 uur").
export async function innameTijdstippen(datum) {
  const rijen = await db.momentinnames.where('datum').equals(datum).toArray();
  const uit = {};
  for (const r of rijen) if (r.tijdstip && (!uit[r.moment] || r.tijdstip > uit[r.moment])) uit[r.moment] = r.tijdstip;
  return uit;
}

// Het schema van één dag (rooster in logica/supplementen.js):
// { momenten: [{ moment, items: [{ supplement, genomen }] }], periodiek: [{ supplement, genomen, aanDeBeurt, volgende, ... }], binnenkort }
// Alleen momenten met minstens één supplement. Inactieve supplementen staan er alleen op dagen waarop ze afgevinkt waren.
export async function schemaVanDag(datum) {
  const supplementen = await db.supplementen.toArray();
  return rooster(datum, supplementen, await innamesVoorRooster(supplementen, datum));
}

async function zetEen(datum, supplementId, moment, genomen) {
  if (genomen) {
    const bestaand = await db.momentinnames.get([datum, supplementId, moment]);
    if (!isEigen(bestaand)) await db.momentinnames.put({ datum, supplementId, moment, tijdstip: Date.now(), voorbeeld: false });
  } else {
    await db.momentinnames.delete([datum, supplementId, moment]);
  }
}

// Eén vinkje zetten of weghalen. De toekomst wordt geweigerd (Error('toekomst')). moment is ochtend, middag, avond,
// of 'dag' voor een periodiek supplement. Een inname die zij zet is van haar (voorbeeld: false).
// Overgangsvorm zetInname(datum, supplementId, genomen: boolean): zet alle momenten van dat supplement op die dag (voor een periodiek
// supplement: 'dag'). Geen enkele aanroep in de app gebruikt ze nog; alleen tests/logica/supplementen.test.js (review R1-12, op te ruimen).
export async function zetInname(datum, supplementId, moment, genomen) {
  if (isToekomst(datum)) throw new Error('toekomst');
  const supplement = await db.supplementen.get(supplementId);
  if (typeof moment === 'boolean') {
    const aan = moment;
    if (!supplement) {
      if (aan) throw new Error('onbekend');
    } else {
      const lijst = isPeriodiek(supplement) ? ['dag'] : supplement.momenten ?? [];
      if (aan) {
        for (const m of lijst) await zetEen(datum, supplementId, m, true);
      } else {
        for (const m of ALLE_MOMENTEN) await zetEen(datum, supplementId, m, false);
      }
    }
    zend('data:gewijzigd', { store: 'innames', datum });
    return;
  }
  if (!ALLE_MOMENTEN.includes(moment)) throw new Error('moment');
  if (genomen && !supplement) throw new Error('onbekend');
  if (genomen && supplement) {
    if (moment === 'dag' && !isPeriodiek(supplement)) throw new Error('moment');
    if (moment !== 'dag' && isPeriodiek(supplement)) throw new Error('moment');
  }
  await zetEen(datum, supplementId, moment, genomen);
  zend('data:gewijzigd', { store: 'innames', datum });
}

// Alles van één moment in één keer afvinken of terugzetten (de dagelijkse supplementen van dat moment).
export async function zetMoment(datum, moment, genomen) {
  if (isToekomst(datum)) throw new Error('toekomst');
  if (!MOMENTEN.includes(moment)) throw new Error('moment');
  const schema = await schemaVanDag(datum);
  const groep = schema.momenten.find((m) => m.moment === moment);
  for (const { supplement, genomen: staat } of groep?.items ?? []) {
    if (staat !== Boolean(genomen)) await zetEen(datum, supplement.id, moment, genomen);
  }
  zend('data:gewijzigd', { store: 'innames', datum });
}

// Overgangsvorm: de lijst van een dag zoals schermen van vóór stap 17 haar kenden. Alleen nog in tests (review R1-12, op te ruimen).
// genomen is waar als alle momenten van die dag afgevinkt zijn (periodiek: als het die dag afgevinkt is);
// een periodiek supplement dat niet aan de beurt is en niet afgevinkt, staat er niet in.
export async function supplementenVanDag(datum) {
  const schema = await schemaVanDag(datum);
  const perSupplement = new Map();
  for (const { items } of schema.momenten) {
    for (const { supplement, genomen } of items) {
      const stand = perSupplement.get(supplement.id) ?? { supplement, alle: true };
      stand.alle = stand.alle && genomen;
      perSupplement.set(supplement.id, stand);
    }
  }
  const uit = [...perSupplement.values()].map(({ supplement, alle }) => ({ supplement, genomen: alle }));
  for (const p of schema.periodiek) {
    if (p.aanDeBeurt || p.genomen) uit.push({ supplement: p.supplement, genomen: p.genomen });
  }
  return uit.sort((a, b) => a.supplement.volgorde - b.supplement.volgorde || a.supplement.id - b.supplement.id);
}
