// De kerncijfers van "Je week in cijfers" op Drinken (BESLISSING 437): de lopende week van maandag tot zondag, altijd "van 7 dagen".
// Zuiver rekenwerk, zonder scherm of opslag.
//   dagen   [{ datum, ml }]  de zeven dagen van de week (maandag tot zondag)
//   doel    dagdoel in ml
//   nu      de sleutel van vandaag
// Een dag telt mee zodra hij begonnen is (vandaag inbegrepen). "Beste dag" is de dag met de meeste ml.
// Het gemiddelde (BESLISSING 449): de som over alle dagen van de week die al voorbij zijn (vandaag inbegrepen), gedeeld door dat aantal dagen;
// een dag zonder invoer telt als 0. Een eerdere week deelt dus door 7, de lopende week door het aantal verstreken dagen, een toekomstige dag telt nooit mee.
// Zonder één drank in die dagen is er geen gemiddelde (null: het scherm toont dan een streepje).
import { opmaakDatum, plusDagen, weekStart } from '../kern/datum.js';

// BESLISSINGEN 437 en 448: weekcijfers tellen overal "van 7 dagen" (de volle week maandag tot zondag). De enige bron van dat getal.
export const WEEKDAGEN = 7;

// Het gemiddelde per dag over de verstreken dagen (BESLISSING 449): dagen [{ datum, ml }], nu = de sleutel van vandaag. null als er niets gedronken is.
export function gemiddeldPerDag(dagen, nu) {
  const verstreken = dagen.filter((d) => d.datum <= nu);
  const som = verstreken.reduce((s, d) => s + (d.ml > 0 ? d.ml : 0), 0);
  return verstreken.length && som > 0 ? som / verstreken.length : null;
}

// Dezelfde regel over een willekeurige periode (de maand van het Dagboek, BESLISSING 456): van en tot (jjjj-mm-dd, inclusief), mlVan(datum) geeft de ml van die dag.
export function gemiddeldOverDagen(van, tot, mlVan, nu) {
  const dagen = [];
  for (let d = van; d <= tot; d = plusDagen(d, 1)) dagen.push({ datum: d, ml: mlVan(d) });
  return gemiddeldPerDag(dagen, nu);
}

export function drinkWeekCijfers({ dagen, doel, nu }) {
  const verstreken = dagen.filter((d) => d.datum <= nu);
  const metDrank = verstreken.filter((d) => d.ml > 0);
  const gemiddelde = gemiddeldPerDag(dagen, nu);
  const gehaald = doel > 0 ? verstreken.filter((d) => d.ml >= doel).length : 0;
  const beste = metDrank.length ? metDrank.reduce((b, d) => (d.ml > b.ml ? d : b)) : null;
  return { gemiddelde, gehaald, van: WEEKDAGEN, beste, besteIndex: beste ? dagen.indexOf(beste) : -1 };
}

// ---- Terugbladeren (BESLISSING 438)
// Welke aanduiding hoort bij de gekozen week: 'deze' (de lopende), 'vorige' (de week ervoor) of een periode ("2 - 8 november").
// opties: { jaar } voor de periode; met { vormen: true } ook de korte vormen voor een smalle kaartkop (BESLISSING 480): kort "26 okt - 1 nov 2026", kortst "26 okt - 1 nov".
export function weekAanduiding(start, vandaagSleutel, opties = {}) {
  const lopend = weekStart(vandaagSleutel);
  const soort = start === lopend ? 'deze' : start === plusDagen(lopend, -7) ? 'vorige' : 'week';
  const uit = { soort, periode: weekPeriodeTekst(start, opties) };
  if (opties.vormen) Object.assign(uit, { kort: weekPeriodeTekst(start, { jaar: opties.jaar, kort: true }), kortst: weekPeriodeTekst(start, { kort: true }) });
  return uit;
}

// "9 - 15 november" of "30 november - 6 december". Met { jaar: true } (BESLISSING 476, Drinken): "9 - 15 november 2026", "28 september - 4 oktober 2026"
// en over een jaargrens elk jaar bij zijn eigen datum: "28 december 2026 - 3 januari 2027".
// Met { kort: true } (BESLISSING 480, de kop van "Je week in cijfers" op een telefoon) staan de maanden afgekort: "26 okt - 1 nov 2026".
export function weekPeriodeTekst(start, { jaar = false, kort = false } = {}) {
  const eind = plusDagen(start, 6);
  const maandVan = (s) => (kort ? opmaakDatum(s, 'kort').split(' ')[2] : opmaakDatum(s, 'maand').split(' ')[0]);
  const [maandA, jaarA] = [maandVan(start), start.slice(0, 4)];
  const [maandB, jaarB] = [maandVan(eind), eind.slice(0, 4)];
  const b = `${opmaakDatum(eind, 'dag')} ${maandB}${jaar ? ' ' + jaarB : ''}`;
  if (jaar && jaarA !== jaarB) return `${opmaakDatum(start, 'dag')} ${maandA} ${jaarA} - ${b}`;
  return maandA === maandB ? `${opmaakDatum(start, 'dag')} - ${b}` : `${opmaakDatum(start, 'dag')} ${maandA} - ${b}`;
}

// De volle vorige week, maandag tot en met zondag (BESLISSING 474: de periodekeuze "Vorige week" in Delen). Rekent in kalenderdagen, dus ook juist over een
// maand- of jaargrens en over de wissel van zomer- naar wintertijd.
export function vorigeWeekPeriode(vandaagSleutel) {
  const maandag = weekStart(vandaagSleutel);
  return { van: plusDagen(maandag, -WEEKDAGEN), tot: plusDagen(maandag, -1) };
}

// Een stap naar een andere week: nooit voorbij de lopende week.
export function stapWeek(start, stap, vandaagSleutel) {
  const nieuw = plusDagen(start, 7 * stap);
  return nieuw > weekStart(vandaagSleutel) ? start : nieuw;
}

// Dagen op rij met het dagdoel gehaald, terug vanaf `vanaf`. haalt(dag) zegt of die dag het doel haalde.
// Voor een lopende dag die nog niet gehaald is, begint de telling gisteren (de dag is nog niet voorbij).
export function reeksVanaf({ haalt, vanaf, dagNogOpen, max = 60 }) {
  let dag = dagNogOpen && !haalt(vanaf) ? plusDagen(vanaf, -1) : vanaf;
  let reeks = 0;
  while (reeks < max && haalt(dag)) {
    reeks += 1;
    dag = plusDagen(dag, -1);
  }
  return reeks;
}

// Een veeg telt alleen als ze duidelijk horizontaal is: meer dan 48 px en een hoek van minder dan 30 graden.
// Geeft 1 (naar links geveegd: volgende week), -1 (naar rechts geveegd: vorige week) of 0 (geen veeg).
export function veegRichting(dx, dy) {
  if (Math.abs(dx) <= 48) return 0;
  if (Math.abs(dy) > Math.abs(dx) * Math.tan((30 * Math.PI) / 180)) return 0;
  return dx < 0 ? 1 : -1;
}
