// Pure functie: welke melding met welke tekst (BESLISSINGEN 33, 34, 110, 112, 278, 312, 313; PLAN.md §6.5).
// De Worker stuurt een leeg signaal op een gekozen uur (per minuut sinds BESLISSING 713; een oudere dienst per kwartier), elke dag hetzelfde; de service worker leest wat er op het toestel staat en vraagt hier de
// tekst. De dienst weet niet welke soort bij welk uur hoort: de app kiest zelf (BESLISSING 716: met details een melding per soort die
// op dat tijdstip staat; zonder details een algemene melding per tijdstip, zie kiesMeldingen).
// Vier soorten (BESLISSING 736): dagboek, eten, drinken en supplementen. Nooit een oordeel, nooit medisch advies. Details staan er alleen als de gebruiker ze zelf
// aanzet, of de vergrendeling nu aan of uit staat (BESLISSING 710).
import { t } from '../teksten.js';
import { opmaakLiter } from '../kern/getal.js';
import { momentVanNu } from '../logica/supplementen.js';

export const VENSTER_MINUTEN = 20;
// Een signaal kan te laat aankomen (de dienst geeft het een uur geldigheid, TTL 3600): de service worker rekent daarom met een uur ruimte (stand.js).
export const LAAT_VENSTER_MINUTEN = 60;

// Eten opent Vandaag, waar de maaltijden van vandaag staan en ze genoteerd worden (BESLISSING 736).
const PADEN = { dagboek: '#/vandaag', eten: '#/vandaag', drinken: '#/drinken', supplementen: '#/supplementen' };
// De maaltijd van elk tijdvak (ochtend, middag, avond): de melding van Eten noemt de maaltijd van het tijdvak van haar uur.
const MAAL_VAN_MOMENT = { ochtend: 'ontbijt', middag: 'middagmaal', avond: 'avondmaal' };
const ETEN = [
  ['ontbijt', 'melding.jeOntbijt'],
  ['middagmaal', 'melding.jeMiddagmaal'],
  ['avondmaal', 'melding.jeAvondmaal'],
];
// Bij een gelijk verschil gaat de belangrijkste voor.
const VOORRANG = ['supplementen', 'drinken', 'eten', 'dagboek'];

function minuten(uur) {
  const [u, m] = String(uur ?? '').split(':').map(Number);
  return Number.isFinite(u) && Number.isFinite(m) ? u * 60 + m : null;
}

// BESLISSING 714: Dagboek heeft, net als Drinken en Supplementen, een lijst van tijdstippen. De instelling 'meldingen.dagboek' blijft
// één object, zodat een oudere lezer (push.js van vóór 714) ze nog begrijpt: { aan, uur, tijdstippen: [{ aan, uur }] }. aan en uur
// spiegelen de lijst: aan = er staat een tijdstip aan; uur = het eerste tijdstip dat aan staat (anders het eerste, anders het oude uur).
// Een oude waarde zonder lijst ({ aan, uur }, "Om 20:00") wordt zonder verlies "Tijdstip 1, 20:00" met dezelfde stand.
// Staat aan op false, dan staat elk tijdstip uit (zo zet een oudere push.js bij een ingetrokken toestemming alles uit).
export function dagboekLijst(waarde) {
  if (!waarde || typeof waarde !== 'object') return [];
  if (Array.isArray(waarde)) return waarde.filter((k) => k && typeof k.uur === 'string').map((k) => ({ aan: k.aan === true, uur: k.uur }));
  if (Array.isArray(waarde.tijdstippen)) return waarde.tijdstippen.filter((k) => k && typeof k.uur === 'string').map((k) => ({ aan: waarde.aan !== false && k.aan === true, uur: k.uur }));
  return typeof waarde.uur === 'string' ? [{ aan: waarde.aan === true, uur: waarde.uur }] : [];
}
export function dagboekWaarde(lijst, vorigUur = '20:00') {
  const tijdstippen = (lijst ?? []).map((k) => ({ aan: k.aan === true, uur: k.uur }));
  const eersteAan = tijdstippen.find((k) => k.aan);
  return { aan: Boolean(eersteAan), uur: eersteAan?.uur ?? tijdstippen[0]?.uur ?? vorigUur, tijdstippen };
}

// Hoeveel minuten ligt nu van het uur (ook over middernacht heen)? null bij een ongeldig uur.
function afstand(nu, uur) {
  const doel = minuten(uur);
  if (doel === null) return null;
  const verschil = Math.abs(nu.getHours() * 60 + nu.getMinutes() - doel);
  return Math.min(verschil, 1440 - verschil);
}

// Het tijdvak van de app (ochtend, middag of avond) waarin een uur valt: dezelfde grenzen als de supplementen en de begroeting.
export function momentVanUur(uur) {
  const m = minuten(uur) ?? 0;
  return momentVanNu(new Date(2000, 0, 1, Math.floor(m / 60), m % 60));
}

// Alle herinneringen die aan staan en binnen het venster (standaard 20 minuten; invoer.venster wijkt af) van nu liggen, de dichtstbijzijnde (en bij gelijkspel de belangrijkste) eerst.
function kandidaten({ nu, dagboek, eten, supplementenUren, drinken, venster = VENSTER_MINUTEN }) {
  const lijst = [];
  for (const k of dagboekLijst(dagboek)) if (k.aan) lijst.push({ soort: 'dagboek', uur: k.uur });
  for (const k of Array.isArray(eten) ? eten : []) if (k?.aan) lijst.push({ soort: 'eten', uur: k.uur });
  for (const k of supplementenUren ?? []) if (k?.aan) lijst.push({ soort: 'supplementen', uur: k.uur });
  for (const k of drinken ?? []) if (k?.aan) lijst.push({ soort: 'drinken', uur: k.uur });
  return lijst
    .map((k) => ({ ...k, verschil: afstand(nu, k.uur) }))
    .filter((k) => k.verschil !== null && k.verschil <= venster)
    .sort((a, b) => a.verschil - b.verschil || VOORRANG.indexOf(a.soort) - VOORRANG.indexOf(b.soort));
}

// Welke soort past bij dit moment. Valt er niets binnen het venster (bv. het dagboekuur), dan is het het dagboek: er komt altijd een melding.
export function kiesSoort(invoer) {
  return kandidaten(invoer)[0]?.soort ?? 'dagboek';
}

// BESLISSING 737: staat Eten aan (minstens een tijdstip aan, op welk uur ook), dan noemt Dagboek de maaltijden niet meer.
function etenStaatAan(eten) {
  return (Array.isArray(eten) ? eten : []).slice(0, 3).some((k) => k?.aan === true && typeof k.uur === 'string');
}

function openLijst(status, doelMl, zonderMaaltijden = false) {
  const ingevuld = new Set(status.maaltijdenIngevuld ?? []);
  const open = zonderMaaltijden ? [] : ETEN.filter(([soort]) => !ingevuld.has(soort)).map(([, sleutel]) => sleutel);
  if (doelMl > 0 && (status.ml ?? 0) < doelMl) open.push('melding.jeDrinkdoel');
  const s = status.supplementen;
  if (s && s.totaal > 0 && s.genomen < s.totaal) open.push('melding.jeSupplementen');
  return open;
}

// invoer: { nu: Date, dagboek: { aan, uur }, drinken: [{ aan, uur }], supplementenUren: [{ aan, uur }], details: boolean, doelMl: number,
//           spuitVandaag: boolean, momenten: { ochtend|middag|avond: { genomen, totaal } },
//           status: { maaltijdenIngevuld: string[], ml, supplementen: { genomen, totaal }, bijgehouden } }
// Geeft { soort, titel, tekst, tag, pad }: één melding, de soort die het dichtst bij nu ligt. Het scherm Herinneringen gebruikt dit voor zijn
// voorbeeld per soort en per uur; de service worker gebruikt kiesMeldingen (BESLISSING 716: een melding per soort).
export function kiesMelding(invoer) {
  const { details = false } = invoer;
  const gekozen = kandidaten(invoer)[0];
  const soort = gekozen?.soort ?? 'dagboek';
  const basis = { soort, tag: 'bloei-' + soort, pad: PADEN[soort] };

  // BESLISSING 335: details staan er alleen als de gebruiker ze aanzet (ontbreekt de waarde, dan zijn ze uit).
  // BESLISSING 710: de vergrendeling beslist hier niet meer mee; de gebruiker kiest zelf, ook met het slot aan (invoer.slotAan telt niet).
  // BESLISSING 348: één melding per tijdstip. Een algemene melding heeft per tijdstip één tag (het toestel vervangt een melding met dezelfde tag)
  // en opent Vandaag, ongeacht de soort.
  if (details !== true) return { ...basis, tag: 'bloei-algemeen-' + (gekozen?.uur ?? 'dagboek'), pad: PADEN.dagboek, titel: t('melding.titelDagboek'), tekst: t('melding.algemeen') };
  return { ...basis, ...inhoud(soort, gekozen?.uur, invoer) };
}

// De titel en de tekst met details van een soort op een uur.
function inhoud(soort, uur, invoer) {
  const { status = {}, doelMl = 0, spuitVandaag = false, momenten = {} } = invoer;
  if (soort === 'supplementen') {
    const moment = momentVanUur(uur);
    const leeg = { genomen: 0, totaal: 0 };
    const s = invoer.momenten ? (momenten[moment] ?? leeg) : (status.supplementen ?? leeg);
    const klaar = s.totaal === 0 || s.genomen >= s.totaal;
    const spuit = !klaar && spuitVandaag ? ' ' + t('melding.spuit') : '';
    const wanneer = t('melding.moment.' + moment);
    return { titel: t('melding.titelSupplementen'), tekst: t(klaar ? 'melding.supplementenKlaar' : 'melding.supplementen', { moment: wanneer }) + spuit };
  }

  if (soort === 'eten') {
    // De maaltijd van het tijdvak van dit uur (ochtend: ontbijt, middag: middagmaal, avond en nacht: avondmaal). Staat ze nog open, dan
    // noemt de melding ze; staat ze erin, dan een vriendelijk berichtje in plaats van een herinnering (zoals Drinken en Supplementen).
    // momentVanUur geeft altijd een van de drie tijdvakken, dus er is altijd een maaltijd: een algemene zin "noteer wat je at" bestaat niet meer.
    const ingevuld = new Set(status.maaltijdenIngevuld ?? []);
    const maal = MAAL_VAN_MOMENT[momentVanUur(uur)];
    const naam = ETEN.find(([s]) => s === maal)[1];
    return { titel: t('melding.titelEten'), tekst: ingevuld.has(maal) ? t('melding.etenKlaar.' + maal) : t('melding.etenOpen', { maaltijd: t(naam) }) };
  }

  if (soort === 'drinken') {
    const ml = status.ml ?? 0;
    let tekst;
    if (doelMl > 0 && ml >= doelMl) tekst = t('melding.drinkenKlaar');
    else if (ml <= 0) tekst = t('melding.drinkenNul', { doel: opmaakLiter(doelMl) });
    else tekst = t('melding.drinken', { nu: opmaakLiter(ml), doel: opmaakLiter(doelMl) });
    return { titel: t('melding.titelDrinken'), tekst };
  }

  // Dagboek: wat nog open staat (ontbijt, middagmaal, avondmaal, het drinkdoel en de supplementen), hoogstens twee dingen.
  const titel = t('melding.titelDagboek');
  if (!status.bijgehouden) return { titel, tekst: t('melding.dagboekLeeg') };
  const etenAan = etenStaatAan(invoer.eten);
  const open = openLijst(status, doelMl, etenAan);
  if (open.length === 0) {
    // BESLISSING 738: met Eten aan blijft een open maaltijd onbenoemd; dan is het dagboek bijna rond, niet klaar.
    const maaltijdOpen = etenAan && openLijst(status, doelMl, false).some((s) => ETEN.some(([, sleutel]) => sleutel === s));
    return { titel, tekst: t(maaltijdOpen ? 'melding.dagboekBijnaRond' : 'melding.dagboekKlaar') };
  }
  const namen = open.slice(0, 2).map((sleutel) => t(sleutel));
  return { titel, tekst: t('melding.dagboekOpen', { open: namen.join(t('melding.en')) }) };
}

// ---- BESLISSING 716: bij een signaal een melding per soort die op het tijdstip van dat signaal staat.
// De dienst stuurt per toestel een leeg signaal per tijdstip (dubbele uren samengevoegd) en haalt een gemiste minuut tot 15 minuten later in.
// De service worker weet dus niet voor welk tijdstip een signaal komt: hij leidt het af en onthoudt welke tijdstippen al een melding kregen
// (invoer.afgehandeld, sleutels 'JJJJ-MM-DD UU:MM', stand.js). Zo eet een laat signaal de melding van een ander tijdstip niet op.
export const INHAAL_MINUTEN = 15; // zo lang na het tijdstip kan het signaal nog komen
export const MARGE_MINUTEN = 2; // zo lang vóór het tijdstip (de klok van het toestel kan wat voorlopen op die van de dienst)

const twee = (n) => String(n).padStart(2, '0');
const datumVan = (d) => `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())}`;

// Hoeveel minuten nu na het uur ligt, tussen -720 en 720 (over middernacht heen); negatief = het uur komt nog. null bij een ongeldig uur.
function naHetUur(nu, uur) {
  const doel = minuten(uur);
  if (doel === null) return null;
  let d = nu.getHours() * 60 + nu.getMinutes() - doel;
  if (d > 720) d -= 1440;
  if (d <= -720) d += 1440;
  return d;
}

// De sleutel van een tijdstip: de datum waarop dat uur viel (een uur van 23:58 met een signaal om 00:03 hoort bij gisteren).
export function tijdstipSleutel(nu, uur) {
  const d = naHetUur(nu, uur);
  if (d === null) return null;
  const toen = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate(), nu.getHours(), nu.getMinutes() - d);
  return datumVan(toen) + ' ' + uur;
}

// Alle soorten en uren die aan staan, elke soort hoogstens één keer per uur.
function ingeschakeld({ nu, dagboek, eten, supplementenUren, drinken }) {
  const lijst = [];
  const bron = [['dagboek', dagboekLijst(dagboek)], ['eten', Array.isArray(eten) ? eten : []], ['supplementen', supplementenUren ?? []], ['drinken', drinken ?? []]];
  for (const [soort, uren] of bron) {
    for (const k of uren.slice(0, 3)) { // BESLISSING 736: hoogstens drie tijdstippen per soort (een vierde van een oude stand telt niet)
      if (!k?.aan || typeof k.uur !== 'string') continue;
      const d = naHetUur(nu, k.uur);
      if (d === null || lijst.some((x) => x.soort === soort && x.uur === k.uur)) continue;
      lijst.push({ soort, uur: k.uur, d, sleutel: tijdstipSleutel(nu, k.uur) });
    }
  }
  return lijst;
}

// Welk tijdstip hoort bij dit signaal? null als er geen enkel ingeschakeld tijdstip in de buurt ligt.
// 1. Het vroegste tijdstip binnen het inhaalvenster (MARGE_MINUTEN vooruit tot INHAAL_MINUTEN terug) dat nog geen melding kreeg:
//    signalen komen in volgorde, dus een signaal dat te laat komt, hoort bij het oudste open tijdstip.
// 2. Kregen ze allemaal al een melding (hetzelfde signaal nog eens), dan het jongste: dezelfde tags vervangen dezelfde meldingen.
// 3. Niets in het inhaalvenster (een signaal dat meer dan een kwartier te laat komt, de TTL is een uur; of een oudere dienst die per
//    kwartier stuurt): het tijdstip dat het dichtst bij nu ligt binnen invoer.venster (zoals vroeger), bij gelijke afstand het voorbije.
function tijdstipVanSignaal(alle, invoer) {
  const klaar = new Set(invoer.afgehandeld ?? []);
  const binnen = alle.filter((k) => k.d >= -MARGE_MINUTEN && k.d <= INHAAL_MINUTEN);
  const open = binnen.filter((k) => !klaar.has(k.sleutel));
  if (open.length) return open.reduce((a, b) => (b.d > a.d ? b : a)).uur;
  if (binnen.length) return binnen.reduce((a, b) => (b.d < a.d ? b : a)).uur;
  const venster = invoer.venster ?? VENSTER_MINUTEN;
  const dichtbij = alle.filter((k) => Math.abs(k.d) <= venster);
  if (!dichtbij.length) return null;
  return dichtbij.reduce((a, b) => (Math.abs(b.d) < Math.abs(a.d) || (Math.abs(b.d) === Math.abs(a.d) && b.d > a.d) ? b : a)).uur;
}

// invoer: zoals kiesMelding, plus afgehandeld: string[] (de tijdstippen die al een melding kregen).
// Geeft een lijst van { soort, titel, tekst, tag, pad, sleutel }, in de volgorde van VOORRANG; nooit leeg (iOS eist bij elk signaal een melding).
// Met details: een melding per soort op dat tijdstip, elk met een eigen tag ('bloei-drinken-19:00') en het eigen scherm.
// Zonder details: EEN algemene melding per tijdstip ('bloei-algemeen-19:00', opent Vandaag), want ook de naam van een soort is een detail (710).
export function kiesMeldingen(invoer) {
  const alle = ingeschakeld(invoer);
  const uur = tijdstipVanSignaal(alle, invoer);
  const soorten = uur === null ? [] : alle.filter((k) => k.uur === uur).sort((a, b) => VOORRANG.indexOf(a.soort) - VOORRANG.indexOf(b.soort));
  const sleutel = soorten[0]?.sleutel ?? null;
  if (invoer.details !== true) {
    return [{ soort: soorten[0]?.soort ?? 'dagboek', tag: 'bloei-algemeen-' + (uur ?? 'dagboek'), pad: PADEN.dagboek, titel: t('melding.titelDagboek'), tekst: t('melding.algemeen'), sleutel }];
  }
  // Geen tijdstip in de buurt: toch een melding, die van het dagboek (zoals vroeger).
  if (!soorten.length) return [{ soort: 'dagboek', tag: 'bloei-dagboek', pad: PADEN.dagboek, ...inhoud('dagboek', null, invoer), sleutel }];
  return soorten.map((k) => ({ soort: k.soort, tag: `bloei-${k.soort}-${k.uur}`, pad: PADEN[k.soort], ...inhoud(k.soort, k.uur, invoer), sleutel }));
}

// Wat de service worker toont als het lezen van de gegevens mislukt: altijd een melding, zonder details.
export function algemeneMelding() {
  return { soort: 'dagboek', tag: 'bloei-dagboek', pad: PADEN.dagboek, titel: t('melding.titelDagboek'), tekst: t('melding.algemeen') };
}
