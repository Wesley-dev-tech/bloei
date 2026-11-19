// Datumsleutels, weken, nl-BE-opmaak en dagdeel. Alles in lokale tijd; een dag eindigt om 00:00.
// Een datumsleutel is altijd 'JJJJ-MM-DD'. Nooit toISOString() gebruiken: dat rekent in UTC.

const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAGEN_KORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];
// Ook gebruikt door logica/gewichtcijfers.js (de weegkalender).
export const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const twee = (n) => String(n).padStart(2, '0');

// Is dit een datumsleutel in de vorm 'JJJJ-MM-DD'? (alleen de vorm, geen kalendercontrole)
export const isDatum = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

export function naarSleutel(d) {
  return `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())}`;
}

export function naarDatum(sleutel) {
  const [jaar, maand, dag] = sleutel.split('-').map(Number);
  return new Date(jaar, maand - 1, dag);
}

export function vandaag(nu = new Date()) {
  return naarSleutel(nu);
}

export function plusDagen(sleutel, n) {
  const d = naarDatum(sleutel);
  d.setDate(d.getDate() + n);
  return naarSleutel(d);
}

// 1 = maandag ... 7 = zondag
export function weekdag(sleutel) {
  return ((naarDatum(sleutel).getDay() + 6) % 7) + 1;
}

// De maandag van de week waarin de datum valt.
export function weekStart(sleutel) {
  return plusDagen(sleutel, 1 - weekdag(sleutel));
}

export function weekDagen(weekSleutel) {
  const start = weekStart(weekSleutel);
  return [0, 1, 2, 3, 4, 5, 6].map((n) => plusDagen(start, n));
}

// Rijen van maandag tot zondag; null voor de vakjes buiten de maand.
export function maandRaster(jaarMaand) {
  const [jaar, maand] = jaarMaand.split('-').map(Number);
  const aantalDagen = new Date(jaar, maand, 0).getDate();
  const eerste = `${jaar}-${twee(maand)}-01`;
  const vakjes = Array(weekdag(eerste) - 1).fill(null);
  for (let dag = 1; dag <= aantalDagen; dag++) vakjes.push(`${jaar}-${twee(maand)}-${twee(dag)}`);
  while (vakjes.length % 7 !== 0) vakjes.push(null);
  const rijen = [];
  for (let i = 0; i < vakjes.length; i += 7) rijen.push(vakjes.slice(i, i + 7));
  return rijen;
}

export function isToekomst(sleutel, nu = new Date()) {
  return sleutel > vandaag(nu);
}

// De grenzen van de dag (BESLISSING 145): de ochtend begint om 7 uur, de middag om 12 uur, de avond om 17 uur.
// Dit is de enige plek: de begroeting en de momenten van de supplementen steunen allebei op dagdeel().
export const DAGDEEL_UREN = { ochtend: 7, middag: 12, avond: 17 };

// Ochtend van 07:00 tot 11:59, middag van 12:00 tot 16:59, avond van 17:00 tot 06:59 (de nacht hoort bij de avond).
export function dagdeel(nu = new Date()) {
  const uur = nu.getHours();
  if (uur >= DAGDEEL_UREN.avond || uur < DAGDEEL_UREN.ochtend) return 'avond';
  if (uur >= DAGDEEL_UREN.middag) return 'middag';
  return 'ochtend';
}

export function nuAlsTijd(nu = new Date()) {
  return `${twee(nu.getHours())}:${twee(nu.getMinutes())}`;
}

// vorm: 'lang' | 'kort' | 'dag' | 'maand' | 'week'
// Voor 'maand' mag de sleutel ook 'JJJJ-MM' zijn. Het jaar staat er bij 'lang' alleen bij
// als het niet het huidige jaar is.
export function opmaakDatum(sleutel, vorm = 'lang', nu = new Date()) {
  if (vorm === 'maand') {
    const [jaar, maand] = sleutel.split('-').map(Number);
    return `${MAANDEN[maand - 1]} ${jaar}`;
  }

  const d = naarDatum(sleutel);
  const dagnaam = weekdag(sleutel) - 1;

  if (vorm === 'dag') return String(d.getDate());
  if (vorm === 'kort') return `${DAGEN_KORT[dagnaam]} ${d.getDate()} ${MAANDEN_KORT[d.getMonth()]}`;

  if (vorm === 'week') {
    const start = naarDatum(weekStart(sleutel));
    const einde = naarDatum(plusDagen(weekStart(sleutel), 6));
    const beginMaand = start.getMonth() === einde.getMonth() ? '' : ` ${MAANDEN[start.getMonth()]}`;
    return `Week van ${start.getDate()}${beginMaand} tot ${einde.getDate()} ${MAANDEN[einde.getMonth()]}`;
  }

  const jaar = d.getFullYear() === nu.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${DAGEN[dagnaam]} ${d.getDate()} ${MAANDEN[d.getMonth()]}${jaar}`;
}

// BESLISSING 473: een datum voluit, altijd met het jaar ("maandag 16 november 2026"), en een periode van twee zulke datums met " - "
// ("maandag 9 november 2026 - zondag 15 november 2026"), zoals de periode onder de titel van het verslag. periodeDelen geeft de twee helften
// (de eerste met het streepje), zodat een smal vak alleen na het streepje breekt.
export const datumVoluit = (sleutel) => opmaakDatum(sleutel, 'lang', new Date(0));
export function periodeDelen(van, tot) {
  return van === tot ? [datumVoluit(van)] : [`${datumVoluit(van)} -`, datumVoluit(tot)];
}
export const periodeVoluit = (van, tot) => periodeDelen(van, tot).join(' ');

// BESLISSING 489: de dagkop van het Dagboek op een telefoon: de dag afgekort, de maand voluit, altijd met het jaar ("ma 16 november 2026").
export function datumKortDag(sleutel) {
  const d = naarDatum(sleutel);
  return `${DAGEN_KORT[weekdag(sleutel) - 1]} ${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
}

// BESLISSING 489: de week voluit met het jaar, voor een schermlezer ("Week van 16 tot 22 november 2026"; over een jaargrens elk jaar
// bij zijn eigen datum: "Week van 28 december 2026 tot 3 januari 2027").
export function weekVoluit(sleutel) {
  const start = naarDatum(weekStart(sleutel));
  const einde = naarDatum(plusDagen(weekStart(sleutel), 6));
  const jaarA = start.getFullYear() === einde.getFullYear() ? '' : ` ${start.getFullYear()}`;
  const beginMaand = start.getMonth() === einde.getMonth() && !jaarA ? '' : ` ${MAANDEN[start.getMonth()]}`;
  return `Week van ${start.getDate()}${beginMaand}${jaarA} tot ${einde.getDate()} ${MAANDEN[einde.getMonth()]} ${einde.getFullYear()}`;
}
