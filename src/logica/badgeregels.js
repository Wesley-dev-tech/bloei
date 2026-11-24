// Pure regels voor de uitgebreide badges (BESLISSING 166). Alleen gedrag: het bijhouden zelf telt, nooit wat ze at, nooit een gewicht of een
// verschil, nooit "minder" van iets. Voorbeelddata telt nooit mee (de data-laag geeft alleen eigen gegevens door). Een badge wordt nooit afgenomen:
// de regels worden alleen nagekeken om nieuwe toe te kennen (data/badges.js). De elf oorspronkelijke badges staan in logica/badges.js.
import { BADGES } from './badges.js';
import { plusDagen, weekStart } from '../kern/datum.js';
import { ETEN_KLAAR, isDagRond } from './motivatie.js';
import { rooster, telMomenten } from './supplementen.js';

// De groepen op het badgescherm, in volgorde. De sleutel hoort bij badge.groepen.<sleutel> in teksten.js.
export const GROEPEN = ['bijhouden', 'eten', 'drinken', 'supplementen', 'stemming', 'gewicht', 'dag', 'delen', 'kennen', 'verzameling'];

// De nieuwe badges. stats komt uit leesBadgeStats() (data/badges.js): de oude stats plus de velden hieronder.
export const NIEUWE_BADGES = [
  // Bijhouden
  { id: 'drie-op-rij', groep: 'bijhouden', voorwaarde: (s) => s.lopendeReeks >= 3 },
  { id: 'week-op-rij', groep: 'bijhouden', voorwaarde: (s) => s.lopendeReeks >= 7 },
  { id: 'maand-op-rij', groep: 'bijhouden', voorwaarde: (s) => s.lopendeReeks >= 30 },
  { id: 'vijftig-dagen', groep: 'bijhouden', voorwaarde: (s) => s.dagenBijgehouden >= 50 },
  { id: 'jaar-bloei', groep: 'bijhouden', voorwaarde: (s) => s.dagenBijgehouden >= 365 },
  { id: 'weer-thuis', groep: 'bijhouden', voorwaarde: (s) => (s.terugDagen ?? 0) >= 1 },
  // Eten
  { id: 'eerste-maaltijd', groep: 'eten', voorwaarde: (s) => (s.maaltijden ?? 0) >= 1 },
  { id: 'vijftig-maaltijden', groep: 'eten', voorwaarde: (s) => (s.maaltijden ?? 0) >= 50 },
  { id: 'eerste-favoriet', groep: 'eten', voorwaarde: (s) => (s.favorieten ?? 0) >= 1 },
  // Drinken
  { id: 'week-water', groep: 'drinken', voorwaarde: (s) => (s.langsteDoelReeks ?? 0) >= 7 },
  { id: 'dertig-dagdoelen', groep: 'drinken', voorwaarde: (s) => s.doelDagen >= 30 },
  // Supplementen: "alle momenten" telt alleen de momenten van de dag (volledigeMomentDagen, BESLISSING 150; geen periodiek supplement)
  { id: 'alles-afgevinkt', groep: 'supplementen', voorwaarde: (s) => (s.volledigeMomentDagen ?? 0) >= 1 },
  { id: 'week-trouw', groep: 'supplementen', voorwaarde: (s) => (s.volledigeMomentDagen ?? 0) >= 7 },
  { id: 'dertig-vol', groep: 'supplementen', voorwaarde: (s) => (s.volledigeMomentDagen ?? 0) >= 30 },
  // Stemming en notities
  { id: 'dertig-stemmingen', groep: 'stemming', voorwaarde: (s) => s.stemmingDagen >= 30 },
  { id: 'zeven-energie', groep: 'stemming', voorwaarde: (s) => (s.energieDagen ?? 0) >= 7 },
  { id: 'twintig-notities', groep: 'stemming', voorwaarde: (s) => s.notitieDagen >= 20 },
  // Gewicht: alleen het noteren telt, nooit een getal of een verschil
  { id: 'eerste-weging', groep: 'gewicht', voorwaarde: (s) => (s.wegingen ?? 0) >= 1 },
  { id: 'vier-wegingen', groep: 'gewicht', voorwaarde: (s) => (s.wegingen ?? 0) >= 4 },
  // De hele dag
  { id: 'dag-rond', groep: 'dag', voorwaarde: (s) => (s.dagRondDagen ?? 0) >= 1 },
  { id: 'zeven-dagen-rond', groep: 'dag', voorwaarde: (s) => (s.dagRondDagen ?? 0) >= 7 },
  // Delen: het event verslag:gemaakt (data/verslag.js) zet een instelling; zie leesBadgeStats
  { id: 'eerste-verslag', groep: 'delen', voorwaarde: (s) => (s.verslagen ?? 0) >= 1 },
];

// De uitbreiding naar honderd medailles (0.4.4): elke regel is "een teller haalt een drempel". [id, groep, teller, drempel, eenheid]
// De tellers komen uit leesBadgeStats (data/badges.js). Nog altijd alleen gedrag: geen medaille voor een stemming, voor wat ze at of voor
// een getal van de weegschaal. De medailles van Je verzameling tellen de behaalde medailles zelf (teller medailles).
export const DREMPELS = [
  ['tweehonderd', 'bijhouden', 'dagenBijgehouden', 200, 'dagen'],
  ['vijfhonderd', 'bijhouden', 'dagenBijgehouden', 500, 'dagen'],
  ['twee-maanden-op-rij', 'bijhouden', 'lopendeReeks', 60, 'dagen'],
  ['honderd-op-rij', 'bijhouden', 'lopendeReeks', 100, 'dagen'],
  ['volle-week', 'bijhouden', 'volleWeken', 1, 'weken'],
  ['volle-maand', 'bijhouden', 'volleMaanden', 1, 'maanden'],
  ['altijd-welkom', 'bijhouden', 'terugDagen', 3, 'keer'],
  ['vijf-op-rij', 'bijhouden', 'lopendeReeks', 5, 'dagen'],
  ['tien-op-rij', 'bijhouden', 'lopendeReeks', 10, 'dagen'],
  ['drie-weken-op-rij', 'bijhouden', 'lopendeReeks', 21, 'dagen'],
  ['vijftig-op-rij', 'bijhouden', 'lopendeReeks', 50, 'dagen'],
  ['jaar-op-rij', 'bijhouden', 'lopendeReeks', 365, 'dagen'],
  ['duizend-dagen', 'bijhouden', 'dagenBijgehouden', 1000, 'dagen'],
  ['vier-volle-weken', 'bijhouden', 'volleWeken', 4, 'weken'],
  ['honderd-maaltijden', 'eten', 'maaltijden', 100, 'maaltijden'],
  ['vijfhonderd-maaltijden', 'eten', 'maaltijden', 500, 'maaltijden'],
  ['vijf-favorieten', 'eten', 'favorieten', 5, 'favorieten'],
  ['drie-op-een-dag', 'eten', 'etenKlaarDagen', 1, 'dagen'],
  ['tien-gevoel', 'eten', 'gevoelMaaltijden', 10, 'maaltijden'],
  ['tien-maaltijden', 'eten', 'maaltijden', 10, 'maaltijden'],
  ['tien-favorieten', 'eten', 'favorieten', 10, 'favorieten'],
  ['zeven-drie-maaltijden', 'eten', 'etenKlaarDagen', 7, 'dagen'],
  ['vijftig-dagdoelen', 'drinken', 'doelDagen', 50, 'dagen'],
  ['honderd-dagdoelen', 'drinken', 'doelDagen', 100, 'dagen'],
  ['twee-weken-water', 'drinken', 'langsteDoelReeks', 14, 'dagen'],
  ['maand-water', 'drinken', 'langsteDoelReeks', 30, 'dagen'],
  ['eerste-slok', 'drinken', 'dranken', 1, 'dranken'],
  ['drie-dagen-water', 'drinken', 'langsteDoelReeks', 3, 'dagen'],
  ['honderd-liter', 'drinken', 'liters', 100, 'liter'],
  ['drie-soorten', 'drinken', 'drankSoorten', 3, 'soorten'],
  ['vijftig-vol', 'supplementen', 'volledigeMomentDagen', 50, 'dagen'],
  ['honderd-vol', 'supplementen', 'volledigeMomentDagen', 100, 'dagen'],
  ['op-ritme', 'supplementen', 'periodiekInnames', 1, 'keer'],
  ['tien-ritme', 'supplementen', 'periodiekInnames', 10, 'keer'],
  ['eigen-lijst', 'supplementen', 'supplementenAantal', 1, 'supplementen'],
  ['honderd-vinkjes', 'supplementen', 'innames', 100, 'vinkjes'],
  ['zeven-op-rij-afgevinkt', 'supplementen', 'langsteVolReeks', 7, 'dagen'],
  ['vijftig-notities', 'stemming', 'notitieDagen', 50, 'dagen'],
  ['honderd-stemmingen', 'stemming', 'stemmingDagen', 100, 'dagen'],
  ['dertig-energie', 'stemming', 'energieDagen', 30, 'dagen'],
  ['week-gezichtjes', 'stemming', 'langsteStemmingReeks', 7, 'dagen'],
  ['honderd-notities', 'stemming', 'notitieDagen', 100, 'dagen'],
  ['maand-gezichtjes', 'stemming', 'langsteStemmingReeks', 30, 'dagen'],
  ['gezichtje-en-blaadje', 'stemming', 'beideDagen', 7, 'dagen'],
  ['twaalf-wegingen', 'gewicht', 'wegingen', 12, 'wegingen'],
  ['halfjaar-wegen', 'gewicht', 'wegingen', 26, 'wegingen'],
  ['jaar-wegen', 'gewicht', 'wegingen', 52, 'wegingen'],
  ['vier-weken-wegen', 'gewicht', 'langsteWeegReeks', 4, 'weken'],
  ['drie-rond-op-rij', 'dag', 'langsteRondReeks', 3, 'dagen'],
  ['week-rond', 'dag', 'langsteRondReeks', 7, 'dagen'],
  ['dertig-rond', 'dag', 'dagRondDagen', 30, 'dagen'],
  ['twee-weken-rond', 'dag', 'langsteRondReeks', 14, 'dagen'],
  ['vijftig-rond', 'dag', 'dagRondDagen', 50, 'dagen'],
  ['volledige-dag', 'dag', 'helemaalDagen', 1, 'dagen'],
  ['vijf-verslagen', 'delen', 'verslagen', 5, 'verslagen'],
  ['tien-verslagen', 'delen', 'verslagen', 10, 'verslagen'],
  ['eerste-rondleiding', 'kennen', 'rondleidingen', 1, 'rondleidingen'],
  ['eigen-kleur', 'kennen', 'themaGekozen', 1, 'keer'],
  ['seintje-aan', 'kennen', 'herinneringAan', 1, 'keer'],
  ['achter-slot', 'kennen', 'slotAan', 1, 'keer'],
  ['op-beginscherm', 'kennen', 'opBeginscherm', 1, 'keer'],
  ['eigen-profiel', 'kennen', 'eigenProfiel', 1, 'keer'],
  ['vijf-rondleidingen', 'kennen', 'rondleidingen', 5, 'rondleidingen'],
  ['tien-medailles', 'verzameling', 'medailles', 10, 'medailles'],
  ['vijfentwintig-medailles', 'verzameling', 'medailles', 25, 'medailles'],
  ['vijftig-medailles', 'verzameling', 'medailles', 50, 'medailles'],
  ['verzameling-compleet', 'verzameling', 'medailles', 99, 'medailles'],
];
for (const [id, groep, teller, drempel] of DREMPELS) NIEUWE_BADGES.push({ id, groep, voorwaarde: (s) => (s[teller] ?? 0) >= drempel });

// De groep van de elf oorspronkelijke badges.
const OUDE_GROEP = {
  'eerste-bladzijde': 'bijhouden',
  'week-vol': 'bijhouden',
  'maand-vol': 'bijhouden',
  honderd: 'bijhouden',
  'twee-weken': 'bijhouden',
  'eerste-kan': 'drinken',
  'tien-kannen': 'drinken',
  kanttekening: 'stemming',
  gemoed: 'stemming',
  'eerste-potje': 'supplementen',
  trouw: 'supplementen',
};

// Alle badges met hun groep, per groep in de volgorde van de beloning (klein naar groot).
export const ALLE_BADGES = [...BADGES.map((b) => ({ ...b, groep: OUDE_GROEP[b.id] ?? 'bijhouden' })), ...NIEUWE_BADGES];

// Badges die pas zichtbaar zijn als ze behaald zijn. Nu geen enkele: "Veilig bewaard" is vervallen met de back-up (BESLISSING 280).
// Een oude bewaarde rij van die badge staat niet in ALLE_BADGES en wordt dus nergens getoond of geteld.
export const VERBORGEN = [];

// De telling "x van y behaald": y telt alleen wat zichtbaar is (verborgen badges pas als ze behaald zijn), x telt alleen wat in y zit.
// bewaardIds: de ids van de behaalde badges. Zo kan x nooit groter zijn dan y.
export function telBadges(bewaardIds) {
  const behaald = new Set(bewaardIds);
  const zichtbaar = ALLE_BADGES.filter((b) => !VERBORGEN.includes(b.id) || behaald.has(b.id));
  return { behaald: zichtbaar.filter((b) => behaald.has(b.id)).length, totaal: zichtbaar.length };
}

// De ids van alle badges waarvan de voorwaarde nu klopt.
export function verdiendAlle(stats) {
  return ALLE_BADGES.filter((b) => b.voorwaarde(stats ?? {})).map((b) => b.id);
}

// Voor de voortgangsring: [stat, doel, eenheid]. De tekst staat in teksten.js (badge.voortgang.<eenheid>, badge.voortgangEen.<eenheid>).
export const DOEL = {
  'eerste-bladzijde': ['dagenBijgehouden', 1, 'dagen'],
  'week-vol': ['dagenBijgehouden', 7, 'dagen'],
  'maand-vol': ['dagenBijgehouden', 30, 'dagen'],
  honderd: ['dagenBijgehouden', 100, 'dagen'],
  'eerste-kan': ['doelDagen', 1, 'dagen'],
  'tien-kannen': ['doelDagen', 10, 'dagen'],
  kanttekening: ['notitieDagen', 5, 'dagen'],
  gemoed: ['stemmingDagen', 7, 'dagen'],
  'twee-weken': ['lopendeReeks', 14, 'dagen'],
  'eerste-potje': ['innameDagen', 1, 'dagen'],
  trouw: ['volledigeMomentDagen', 14, 'dagen'],
  'drie-op-rij': ['lopendeReeks', 3, 'dagen'],
  'week-op-rij': ['lopendeReeks', 7, 'dagen'],
  'maand-op-rij': ['lopendeReeks', 30, 'dagen'],
  'vijftig-dagen': ['dagenBijgehouden', 50, 'dagen'],
  'jaar-bloei': ['dagenBijgehouden', 365, 'dagen'],
  'weer-thuis': ['terugDagen', 1, 'keer'],
  'eerste-maaltijd': ['maaltijden', 1, 'maaltijden'],
  'vijftig-maaltijden': ['maaltijden', 50, 'maaltijden'],
  'eerste-favoriet': ['favorieten', 1, 'favoriet'],
  'week-water': ['langsteDoelReeks', 7, 'dagen'],
  'dertig-dagdoelen': ['doelDagen', 30, 'dagen'],
  'alles-afgevinkt': ['volledigeMomentDagen', 1, 'dagen'],
  'week-trouw': ['volledigeMomentDagen', 7, 'dagen'],
  'dertig-vol': ['volledigeMomentDagen', 30, 'dagen'],
  'dertig-stemmingen': ['stemmingDagen', 30, 'dagen'],
  'zeven-energie': ['energieDagen', 7, 'dagen'],
  'twintig-notities': ['notitieDagen', 20, 'dagen'],
  'eerste-weging': ['wegingen', 1, 'wegingen'],
  'vier-wegingen': ['wegingen', 4, 'wegingen'],
  'dag-rond': ['dagRondDagen', 1, 'dagen'],
  'zeven-dagen-rond': ['dagRondDagen', 7, 'dagen'],
  'eerste-verslag': ['verslagen', 1, 'verslag'],
};
for (const [id, , teller, drempel, eenheid] of DREMPELS) DOEL[id] = [teller, drempel, eenheid];

// { aantal (afgekapt op het doel), doel, fractie 0 tot 1, eenheid } of null als de badge geen voortgang heeft.
export function voortgangVan(id, stats) {
  const [stat, doel, eenheid] = DOEL[id] ?? [];
  if (!stat || !stats) return null;
  const aantal = Math.max(0, Math.min(doel, Number(stats[stat]) || 0));
  return { aantal, doel, eenheid, fractie: aantal / doel };
}

// ---- Tellingen uit ruwe gegevens (pure functies; de data-laag leest de gegevens en geeft alleen eigen gegevens door)

// De langste aaneengesloten reeks (strikt op elkaar volgende dagen) in een lijst datums.
export function langsteReeks(datums) {
  const lijst = [...new Set(datums)].sort();
  let beste = 0;
  let lopend = 0;
  let vorige = null;
  for (const d of lijst) {
    lopend = vorige && plusDagen(vorige, 1) === d ? lopend + 1 : 1;
    if (lopend > beste) beste = lopend;
    vorige = d;
  }
  return beste;
}

// De langste reeks opeenvolgende weken in een lijst maandagen (voor de wegingen).
export function langsteWeekReeks(weken) {
  const lijst = [...new Set(weken)].sort();
  let beste = 0;
  let lopend = 0;
  let vorige = null;
  for (const w of lijst) {
    lopend = vorige && plusDagen(vorige, 7) === w ? lopend + 1 : 1;
    if (lopend > beste) beste = lopend;
    vorige = w;
  }
  return beste;
}

// Hoeveel kalenderweken (maandag tot zondag) en kalendermaanden volledig bijgehouden zijn.
export function volleWekenUit(datums) {
  const perWeek = new Map();
  for (const d of new Set(datums)) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) ?? 0) + 1);
  return [...perWeek.values()].filter((n) => n === 7).length;
}
export function volleMaandenUit(datums) {
  const perMaand = new Map();
  for (const d of new Set(datums)) perMaand.set(d.slice(0, 7), (perMaand.get(d.slice(0, 7)) ?? 0) + 1);
  return [...perMaand].filter(([maand, n]) => {
    const [j, m] = maand.split('-').map(Number);
    return n === new Date(j, m, 0).getDate();
  }).length;
}

// Hoe vaak ze terugkwam na stilte: een bijgehouden dag minstens `minVerschil` dagen na de vorige (standaard 5, dus vier lege dagen).
// De allereerste dag telt niet. Geen verwijt: alleen een warme badge als ze terug is.
export function terugDagen(bijgehoudenDatums, minVerschil = 5) {
  const lijst = [...new Set(bijgehoudenDatums)].sort();
  let aantal = 0;
  for (let i = 1; i < lijst.length; i++) {
    let verschil = 0;
    for (let d = lijst[i - 1]; d < lijst[i]; d = plusDagen(d, 1)) verschil += 1;
    if (verschil >= minVerschil) aantal += 1;
  }
  return aantal;
}

// Aantal dagen die rond zijn: precies dezelfde regel als de motivatiezin (isDagRond in motivatie.js, BESLISSING 278), stemming telt niet mee.
// dagen: lijst van { etenKlaar, supplementen: { genomen, totaal }, ml, doelMl } (zie rondeDagenUit).
export function dagRondDagen(dagen = []) {
  return dagen.filter((dag) => isDagRond(dag)).length;
}

// Per dag met eten de onderdelen voor "de dag is rond" (BESLISSING 278): eten klaar (ETEN_KLAAR), de momenten van de dag afgevinkt (geen
// supplementen telt als in orde) en gedronken tegenover het huidige dagdoel. Alles komt binnen als gewone lijsten (eigen gegevens, R1-20):
// maaltijden (alleen ingevulde), dranken, innames, supplementen en doelMl.
export function rondeDagenUit({ maaltijden = [], dranken = [], innames = [], supplementen = [], doelMl = 0 } = {}) {
  const soortenPerDag = new Map();
  for (const m of maaltijden) soortenPerDag.set(m.datum, (soortenPerDag.get(m.datum) ?? new Set()).add(m.soort));
  const mlPerDag = new Map();
  for (const d of dranken) mlPerDag.set(d.datum, (mlPerDag.get(d.datum) ?? 0) + d.ml);
  return [...soortenPerDag].map(([datum, soorten]) => {
    const { klaar, totaal } = telMomenten(rooster(datum, supplementen, innames));
    return { datum, etenKlaar: ETEN_KLAAR.every((s) => soorten.has(s)), supplementen: { genomen: klaar, totaal }, ml: mlPerDag.get(datum) ?? 0, doelMl };
  });
}
