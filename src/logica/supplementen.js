// Pure functies voor supplementen per moment van de dag (PLAN.md §16.12, beslissingen 138 tot 141).
// Geen database, geen DOM: data/supplementen.js, data/statistiek.js en de upgrade in data/db.js bouwen erop.
import { dagdeel, isDatum, naarDatum, naarSleutel, plusDagen } from '../kern/datum.js';

export const MOMENTEN = ['ochtend', 'middag', 'avond'];
const DAGELIJKS = { soort: 'dagelijks' };

// ---------------------------------------------------------------- afleiden uit de vrije tekst van dosis

// Hulp bij de upgrade van schema 2 naar 3 (data/db.js): leidt momenten en ritme af
// uit wat de gebruiker in het veld dosis typte. De tekst zelf blijft ongewijzigd. Regels, in volgorde:
//   1. "om de N dagen"                        → ritme interval met N dagen, start vandaag
//   2. "per maand"                            → ritme maand, start vandaag
//   3. "'s avonds", "s'avonds" of "avond"     → alleen avond (gaat voor de regels hieronder)
//   4. "N x per dag" (het getal hoort bij "per dag")      → N momenten: 1 ochtend; 2 ochtend en avond; 3 ochtend, middag en avond
//   5. "N x <pil, pilletje, tablet, capsule> ... per dag"  → één moment (ochtend): het getal is de hoeveelheid per keer
//   6. "N x <andere eenheid> ... per dag" (borreltje, schepje, pipetje)  → N momenten
//   7. in alle andere gevallen                 → ochtend
// Hoofdletters en spaties maken niet uit ("3 x", "3X"). Meer dan drie keer per dag wordt drie momenten.
// leidAfUitDosis(dosis, vandaag) → { momenten, ritme }; een periodiek supplement heeft momenten [].
export function leidAfUitDosis(dosis, vandaagSleutel) {
  const tekst = String(dosis ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

  const interval = tekst.match(/om\s+de\s+(\d+)\s*dagen/);
  if (interval && Number(interval[1]) >= 2) {
    return { momenten: [], ritme: { soort: 'interval', dagen: Number(interval[1]), start: vandaagSleutel } };
  }
  if (/per\s*maand/.test(tekst)) return { momenten: [], ritme: { soort: 'maand', start: vandaagSleutel } };

  if (tekst.includes('avond')) return { momenten: ['avond'], ritme: DAGELIJKS };

  const perDag = tekst.match(/(\d+)\s*x\s*per\s*dag/);
  if (perDag) return { momenten: momentenVoor(Number(perDag[1])), ritme: DAGELIJKS };

  const metEenheid = tekst.match(/(\d+)\s*x\s*([a-zë]+)/);
  if (metEenheid && /\bper\s*dag\b/.test(tekst)) {
    const pil = /^(pil|tablet|capsul)/.test(metEenheid[2]);
    return { momenten: pil ? ['ochtend'] : momentenVoor(Number(metEenheid[1])), ritme: DAGELIJKS };
  }
  return { momenten: ['ochtend'], ritme: DAGELIJKS };
}

// ---------------------------------------------------------------- hoeveelheid en aanwijzing uit dosis

// Verdeelt de vrije tekst van dosis in wat ze per keer neemt (hoeveelheid) en hoe (aanwijzing). Het deel over hoe vaak
// ("3x per dag", "om de 14 dagen", "per maand", "'s avonds", "per dag") valt eruit: dat staat in momenten en ritme.
// Spelling van de gebruiker blijft zoals ze is getikt. Kan er niets zinnigs uit gehaald worden: lege tekst (liever leeg dan fout).
// Regels:
//   - "N x per dag <rest>": de rest is de hoeveelheid; alles vanaf een werkwoord (oplossen, innemen, mengen, ...) is de aanwijzing.
//   - "N x <pil, pilletje, tablet, capsule> ... per dag": N is het aantal per keer ("2x pilletjes per dag" geeft "2 pilletjes").
//   - "N x <andere eenheid> ... per dag": N is het aantal momenten en de hoeveelheid is één eenheid
//     ("2x borreltje van 250 ml per dag" geeft "1 borreltje van 250 ml").
//   - "1x per maand <rest>" en "om de N dagen": de rest is de hoeveelheid (leeg als er niets achter staat).
// splitsDosis(dosis) → { hoeveelheid, aanwijzing }
const WERKWOORD = /\b(oplossen|innemen|mengen|schudden|roeren|verdunnen|drinken|slikken|kauwen|doorslikken)\b/i;
const APOS = "['’`]";
const TIJD = new RegExp(
  `(?:^|\\s)(?:om\\s+de\\s+\\d+\\s*dagen|per\\s+(?:dag|maand|week)|dagelijks|${APOS}?s[\\s'’\`]*(?:avonds|ochtends|middags)|avonds)(?=\\s|$|[.,;])`,
  'gi',
);
const TIJD_DIRECT = new RegExp(`^\\s*(?:(?:om\\s+de|per|dagelijks)\\b|${APOS}\\s*s\\b|s\\s*${APOS}?\\s*avonds)`, 'i');

export function splitsDosis(dosis) {
  const leeg = { hoeveelheid: '', aanwijzing: '' };
  const tekst = String(dosis ?? '').replace(/\s+/g, ' ').trim();
  if (!tekst) return leeg;

  // Het aantal keren: "3x", "2 x", "3X".
  const aantalMatch = tekst.match(/(?:^|\s)(\d+)\s*x(?=\s|$)/i);
  const aantal = aantalMatch ? Number(aantalMatch[1]) : null;
  const zonderAantal = aantalMatch ? (tekst.slice(0, aantalMatch.index) + ' ' + tekst.slice(aantalMatch.index + aantalMatch[0].length)).trim() : tekst;
  // Hoort het getal direct bij het tijdwoord ("3x per dag ...")?
  const directBijTijd = aantalMatch ? TIJD_DIRECT.test(tekst.slice(aantalMatch.index + aantalMatch[0].length)) : false;

  const rest = zonderAantal.replace(TIJD, ' ').replace(/\s+/g, ' ').replace(/^[\s.,;:]+|[\s.,;:]+$/g, '');
  if (!rest) return leeg;

  const splits = (stuk) => {
    const w = stuk.match(WERKWOORD);
    if (!w) return { hoeveelheid: stuk.trim(), aanwijzing: '' };
    return { hoeveelheid: stuk.slice(0, w.index).trim(), aanwijzing: stuk.slice(w.index).trim() };
  };

  // Zonder "N x": alleen als de tekst met een getal begint ("1 pipetje oplossen in water") is er iets zinnigs uit te halen.
  if (aantal == null) return /^\d/.test(rest) ? splits(rest) : leeg;
  if (directBijTijd) return splits(rest);

  // "N x <eenheid> ...": een pil telt N per keer, een andere eenheid is één per keer (N is dan het aantal momenten).
  const { hoeveelheid, aanwijzing } = splits(rest);
  if (!hoeveelheid) return { hoeveelheid: '', aanwijzing };
  const pil = /^(pil|tablet|capsul)/i.test(hoeveelheid);
  return { hoeveelheid: `${pil ? aantal : 1} ${hoeveelheid}`, aanwijzing };
}

function momentenVoor(aantal) {
  if (aantal >= 3) return ['ochtend', 'middag', 'avond'];
  if (aantal === 2) return ['ochtend', 'avond'];
  return ['ochtend'];
}

// ---------------------------------------------------------------- periode van een supplement (BESLISSING 211)

// vanaf en tot zijn optionele velden op het supplement: de eerste en de laatste dag (inclusief) waarop het meetelt. Ontbrekend = geen grens.
//
// BESLISSING 698: een supplement telt vanaf de dag dat het toegevoegd wordt. Die dag staat in het eigen veld teltVanaf (JJJJ-MM-DD, de lokale
// dag van toevoegen, met de hand of uit een bestand). Het is een ander veld dan vanaf ("Begint op" in het formulier), zodat het formulier
// leeg blijft zoals het goedgekeurd is en de dag van toevoegen nooit in een bestand belandt. "Begint op" gaat voor als het ingevuld is, ook
// met een vroegere datum. Een supplement zonder teltVanaf (van vóór deze beslissing) telt zoals vroeger: zonder ondergrens.
// Een afgevinkte dag blijft altijd zichtbaar en telt mee, wat er ook in deze velden staat (zie rooster).
export const beginVan = (supplement) => supplement?.vanaf || (isDatum(supplement?.teltVanaf) ? supplement.teltVanaf : undefined);

// De grens van een supplement voor de reeks en het rooster: { vanaf, tot } met vanaf = beginVan. Ook voor de agenda (data/agenda.js).
export const grensVan = (supplement) => ({ vanaf: beginVan(supplement), tot: supplement?.tot });

export const geldigOp = (supplement, dag) => {
  const begin = beginVan(supplement);
  return (!begin || dag >= begin) && (!supplement.tot || dag <= supplement.tot);
};

// Maakt van losse invoer { vanaf, tot } een geldige periode (lege waarden vallen weg) of gooit Error('periode') bij een ongeldige datum of tot vóór vanaf.
export function schoonPeriode({ vanaf, tot } = {}) {
  const leeg = (x) => x === undefined || x === null || x === '';
  const uit = {};
  if (!leeg(vanaf)) {
    if (!isDatum(vanaf)) throw new Error('periode');
    uit.vanaf = vanaf;
  }
  if (!leeg(tot)) {
    if (!isDatum(tot)) throw new Error('periode');
    uit.tot = tot;
  }
  if (uit.vanaf && uit.tot && uit.tot < uit.vanaf) throw new Error('periode');
  return uit;
}

// ---------------------------------------------------------------- periodiek

// ---- De reeks van een periodiek supplement (BESLISSING 208)
// De reeks ligt vast vanaf ritme.start: start, start + N dagen, start + 2N, ... (bij maand: dezelfde dag van elke volgende maand, gerekend vanaf de
// start en niet vanaf de vorige datum, zodat 31 januari, 28 februari, 31 maart blijft kloppen). Afvinken, te laat afvinken of niet afvinken
// verschuift de reeks nooit; ze telt altijd door.
const MS_DAG = 86400000;
const dagenTussen = (van, tot) => Math.round((naarDatum(tot) - naarDatum(van)) / MS_DAG);

// De k-de maand na de start, dezelfde dag, hoogstens de laatste dag van die maand (31 januari + 1 wordt 28 of 29 februari).
export function plusMaanden(start, k) {
  const d = naarDatum(start);
  const doel = new Date(d.getFullYear(), d.getMonth() + k, 1);
  const laatste = new Date(doel.getFullYear(), doel.getMonth() + 1, 0).getDate();
  doel.setDate(Math.min(d.getDate(), laatste));
  return naarSleutel(doel);
}

// De k-de datum van de reeks (k = 0 is de start).
function reeksDatum(ritme, k) {
  return ritme.soort === 'maand' ? plusMaanden(ritme.start, k) : plusDagen(ritme.start, k * ritme.dagen);
}

// De index van de laatste datum van de reeks op of vóór de dag, of -1 als de dag vóór de start valt.
function reeksIndexOpOfVoor(ritme, dag) {
  if (dag < ritme.start) return -1;
  let k;
  if (ritme.soort === 'maand') {
    const a = naarDatum(ritme.start);
    const d = naarDatum(dag);
    k = (d.getFullYear() - a.getFullYear()) * 12 + (d.getMonth() - a.getMonth());
    if (plusMaanden(ritme.start, k) > dag) k -= 1;
  } else {
    k = Math.floor(dagenTussen(ritme.start, dag) / ritme.dagen);
  }
  return k;
}

// Alle datums van de reeks binnen [van, tot] (grenzen inbegrepen), voor de agenda en voor tests.
export function reeksdatums(ritme, van, tot, grens = {}) {
  if (!ritme || (ritme.soort !== 'interval' && ritme.soort !== 'maand') || tot < van) return [];
  const uit = [];
  let k = Math.max(0, reeksIndexOpOfVoor(ritme, van));
  if (reeksDatum(ritme, k) < van) k += 1;
  for (let d = reeksDatum(ritme, k); d <= tot; d = reeksDatum(ritme, (k += 1))) {
    if (grens.tot && d > grens.tot) break; // de reeks stopt na tot (BESLISSING 211)
    if (!grens.vanaf || d >= grens.vanaf) uit.push(d);
  }
  return uit;
}

// Bij welke datum van de reeks hoort een inname? Bij de laatste datum op of vóór de dag van afvinken (afvinken op zondag 29 november hoort bij
// vrijdag 27 november); een inname vóór de start hoort bij de start.
export function reeksDatumVanInname(ritme, innameDag) {
  const k = reeksIndexOpOfVoor(ritme, innameDag);
  return reeksDatum(ritme, Math.max(0, k));
}

// "Volgende keer" op een dag: de eerste datum van de reeks op of na die dag waarvoor nog niets is afgevinkt (is die van vandaag afgevinkt, dan de
// volgende in de reeks). innameDagen: de dagen waarop dit supplement is afgevinkt.
export function volgendeKeer(ritme, dag, innameDagen = [], grens = {}) {
  const afgevinkt = new Set(innameDagen.map((i) => reeksDatumVanInname(ritme, i)));
  let k = Math.max(0, reeksIndexOpOfVoor(ritme, dag));
  if (reeksDatum(ritme, k) < dag) k += 1;
  while (afgevinkt.has(reeksDatum(ritme, k)) || (grens.vanaf && reeksDatum(ritme, k) < grens.vanaf)) k += 1;
  const datum = reeksDatum(ritme, k);
  return grens.tot && datum > grens.tot ? null : datum; // na tot is er geen volgende keer meer
}

// "Te doen" op een dag: de laatste datum van de reeks op of vóór die dag is nog niet afgevinkt (door een inname vóór die dag). Dat blijft zo tot
// ze afvinkt of tot de volgende datum van de reeks aanbreekt; dan gaat het over die nieuwe datum (één open beurt tegelijk, geen stapel).
// Geeft de datum van de beurt of null.
export function teDoenDatum(ritme, dag, innameDagen = [], grens = {}) {
  // Na tot blijft de laatste beurt te doen tot ze afgevinkt is: de reeks wordt bij tot afgekapt, niet bij de dag.
  const k = reeksIndexOpOfVoor(ritme, grens.tot && dag > grens.tot ? grens.tot : dag);
  if (k < 0) return null;
  const datum = reeksDatum(ritme, k);
  if (grens.vanaf && datum < grens.vanaf) return null;
  const gedaan = innameDagen.some((i) => i < dag && reeksDatumVanInname(ritme, i) === datum);
  return gedaan ? null : datum;
}

const isPeriodiek = (s) => s.ritme?.soort === 'interval' || s.ritme?.soort === 'maand';
export { isPeriodiek };

// BESLISSING 275: een spuit herken je aan de naam. Staat "spuit" of "injectie" in de naam (hoofdletterongevoelig; ook spuiten, injecties, Voorbeeldspuit),
// dan is het een spuit (spuitje in de kalender en de rijen); een ander periodiek supplement krijgt het gewone supplement-icoon.
export const isSpuit = (supplement) => /spuit|injectie/i.test(String(supplement?.naam ?? ''));

// ---------------------------------------------------------------- de dag

// Het rooster van één dag. Alles wat nodig is komt binnen als gewone lijsten:
//   supplementen: alle supplementen (ook inactieve)
//   innames: alle innames van die dag, plus van periodieke supplementen alle innames van elke dag
// Geeft { momenten: [{ moment, items: [{ supplement, genomen }] }],
//         periodiek: [{ supplement, genomen, aanDeBeurt, volgende, beurtDatum, geplandVandaag, laatste }], binnenkort: [{ supplement, vanaf }] }.
// - Alleen momenten met minstens één item.
// - Een inactief supplement staat er alleen op dagen waarop het afgevinkt was (ook op een moment dat het niet meer heeft).
// - Vóór zijn begindag (beginVan, BESLISSING 698) is een supplement niet gepland; was het die dag toch afgevinkt, dan staat het er en telt het.
// - Een periodiek supplement is aan de beurt als de dag op of na de volgende datum valt, en blijft dat tot het afgevinkt is.
//   Daarvoor telt de laatste inname vóór die dag. Een inactief periodiek supplement staat er alleen als het die dag afgevinkt was.
export function rooster(datum, supplementen, innames) {
  const vanDag = innames.filter((i) => i.datum === datum);
  const genomenOp = (id, moment) => vanDag.some((i) => i.supplementId === id && i.moment === moment);

  const sorteer = (a, b) => a.volgorde - b.volgorde || a.id - b.id;
  const lijst = [...supplementen].sort(sorteer);

  const momenten = [];
  for (const moment of MOMENTEN) {
    const items = [];
    for (const supplement of lijst) {
      if (isPeriodiek(supplement)) continue;
      const genomen = genomenOp(supplement.id, moment);
      const gepland = supplement.actief && (supplement.momenten ?? []).includes(moment) && geldigOp(supplement, datum);
      if (gepland || genomen) items.push({ supplement, genomen });
    }
    if (items.length) momenten.push({ moment, items });
  }

  const periodiek = [];
  for (const supplement of lijst) {
    if (!isPeriodiek(supplement)) continue;
    const genomen = genomenOp(supplement.id, 'dag');
    if (!supplement.actief && !genomen) continue;
    const dagen = innames.filter((i) => i.supplementId === supplement.id && i.moment === 'dag').map((i) => i.datum);
    // De reeks ligt vast vanaf de start en telt altijd door (BESLISSING 208): afvinken of niet afvinken verschuift niets.
    // Vóór de begindag (beginVan: "Begint op", anders de dag van toevoegen, BESLISSING 698) is er geen open beurt en geen geplande beurt.
    const grens = grensVan(supplement);
    const beurtDatum = teDoenDatum(supplement.ritme, datum, dagen.filter((d) => d <= datum), grens);
    const aanDeBeurt = beurtDatum !== null;
    const volgende = volgendeKeer(supplement.ritme, datum, dagen.filter((d) => d <= datum), grens);
    // laatste: de volgende beurt is de laatste van de reeks (BESLISSING 211)
    const laatste = volgende !== null && supplement.tot ? volgendeKeer(supplement.ritme, plusDagen(volgende, 1), dagen.filter((d) => d <= datum), grens) === null : false;
    // geplandVandaag: de dag is zelf een datum van de reeks; alleen dan telt een open beurt als gepland in de statistiek, niet elke dag erna
    periodiek.push({ supplement, genomen, aanDeBeurt, volgende, beurtDatum, geplandVandaag: beurtDatum === datum, laatste });
  }
  // binnenkort: dagelijkse supplementen die nog moeten beginnen (vanaf in de toekomst); ze staan nog niet in de momenten (BESLISSING 211)
  const binnenkort = lijst.filter((s) => s.actief && !isPeriodiek(s) && s.vanaf && s.vanaf > datum).map((supplement) => ({ supplement, vanaf: supplement.vanaf }));
  return { momenten, periodiek, binnenkort };
}

// { genomen, totaal }: per dagelijks supplement één per moment, plus de periodieke die die dag aan de beurt zijn
// (of afgevinkt zijn).
export function telRooster(r) {
  let genomen = 0;
  let totaal = 0;
  for (const m of r.momenten) {
    for (const item of m.items) {
      totaal += 1;
      if (item.genomen) genomen += 1;
    }
  }
  for (const p of r.periodiek) {
    if (!p.geplandVandaag && !p.genomen) continue;
    totaal += 1;
    if (p.genomen) genomen += 1;
  }
  return { genomen, totaal };
}

// Buiten het tabblad Supplementen tellen we momenten (BESLISSING 150): { klaar, totaal } = het aantal momenten van de dag waarvan
// alle supplementen afgevinkt zijn, en het aantal momenten dat die dag een supplement heeft. Periodieke supplementen tellen niet mee.
export function telMomenten(r) {
  const totaal = r.momenten.length;
  const klaar = r.momenten.filter((m) => m.items.every((i) => i.genomen)).length;
  return { klaar, totaal };
}

// Welk moment past bij nu: dezelfde grenzen als de begroeting (dagdeel in kern/datum.js, DAGDEEL_UREN):
// ochtend 07:00 tot 11:59, middag 12:00 tot 16:59, avond 17:00 tot 06:59.
export function momentVanNu(nu = new Date()) {
  return dagdeel(nu);
}

// ---------------------------------------------------------------- controleren

// Maakt van losse invoer een geldig ritme of gooit Error('ritme'). Zonder start geldt vandaagSleutel.
export function schoonRitme(ritme, vandaagSleutel) {
  const r = ritme ?? DAGELIJKS;
  if (r.soort === 'dagelijks') return { soort: 'dagelijks' };
  const start = r.start ?? vandaagSleutel;
  if (!isDatum(start)) throw new Error('ritme');
  if (r.soort === 'interval') {
    if (!Number.isInteger(r.dagen) || r.dagen < 2) throw new Error('ritme');
    return { soort: 'interval', dagen: r.dagen, start };
  }
  if (r.soort === 'maand') return { soort: 'maand', start };
  throw new Error('ritme');
}

// Unieke momenten in de vaste volgorde; een onbekend moment geeft Error('momenten').
export function schoneMomenten(momenten) {
  const lijst = Array.isArray(momenten) ? momenten : [];
  if (lijst.some((m) => !MOMENTEN.includes(m))) throw new Error('momenten');
  return MOMENTEN.filter((m) => lijst.includes(m));
}
