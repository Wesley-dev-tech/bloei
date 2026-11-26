// Pure functies: wat het dagboek tot nu toe vertelt, voor de motivator (logica/motivatie.js). Alles komt binnen als gewone lijsten met
// eigen gegevens (data/verleden.js verzamelt ze); er wordt nooit iets met een gewicht of met wat ze at gedaan.
import { naarSleutel, plusDagen, weekStart } from '../kern/datum.js';
import { lopendeReeks } from './reeks.js';
import { ALLE_BADGES, DOEL, voortgangVan } from './badgeregels.js';

// Hoeveel opeenvolgende stappen (dagen, of weken met stap 7) tot en met eind in de verzameling zitten.
function opRij(verzameling, eind, stap = 1) {
  let n = 0;
  for (let d = eind; verzameling.has(d); d = plusDagen(d, -stap)) n += 1;
  return n;
}

// De langste reeks van vóór de lopende reeks (dezelfde regel als lopendeReeks, met één vergeven dag per week), of 0.
export function besteEerdereReeks(datums, vandaag) {
  const dagen = new Set(datums);
  if (dagen.size === 0) return 0;
  const eerste = [...dagen].sort()[0];
  // Het begin van de lopende reeks: dezelfde wandeling terug als lopendeReeks.
  let dag = dagen.has(vandaag) ? vandaag : plusDagen(vandaag, -1);
  let start = plusDagen(vandaag, 1);
  const vergeven = new Set();
  while (dag >= eerste) {
    if (dagen.has(dag)) start = dag;
    else {
      const week = weekStart(dag);
      if (vergeven.has(week)) break;
      vergeven.add(week);
    }
    dag = plusDagen(dag, -1);
  }
  // Een reeks is het langst op haar laatste dag: alleen de dagen zonder bijgehouden dag erna hoeven bekeken.
  let beste = 0;
  for (const d of dagen) {
    if (d >= start || dagen.has(plusDagen(d, 1))) continue;
    beste = Math.max(beste, lopendeReeks(dagen, d));
  }
  return beste;
}

// invoer: { datum, datums (bijgehouden dagen), rondeDatums, doelDatums, volleDatums (dagen met alles afgevinkt), wegingWeken (maandagen),
//           mlGisteren, totaal: { maaltijden, doelDagen, volledigeDagen, rondeDagen, notitieDagen,
//           wegingen, favorieten }, badges: [{ id, behaaldOp }], badgeStats, weekDagen }
export function verledenUit({ datum, datums = [], rondeDatums = [], doelDatums = [], volleDatums = [], wegingWeken = [], mlGisteren = 0, totaal = {}, badges = [], badgeStats = null, weekDagen = 0 } = {}) {
  const gisteren = plusDagen(datum, -1);
  const gesorteerd = [...new Set(datums)].sort();
  const eerder = gesorteerd.filter((d) => d < datum);
  const vorige = eerder[eerder.length - 1] ?? null;
  const dagenTussen = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  const rond = new Set(rondeDatums);
  const doel = new Set(doelDatums);
  const vol = new Set(volleDatums);
  const weken = new Set(wegingWeken);
  const vorigeMaand = (() => {
    const [j, m] = datum.split('-').map(Number);
    const d = new Date(j, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const behaald = new Set(badges.map((b) => b.id));
  const opDag = (dag) => [...badges].sort((a, b) => a.behaaldOp - b.behaaldOp).filter((b) => naarSleutel(new Date(b.behaaldOp)) === dag).map((b) => b.id);
  // De medaille die het dichtst bij is: de hoogste voortgang, bij gelijke stand de kleinste rest.
  const open = ALLE_BADGES.filter((b) => !behaald.has(b.id))
    .map((b) => ({ id: b.id, v: voortgangVan(b.id, badgeStats) }))
    .filter((x) => x.v && x.v.fractie < 1)
    .map(({ id, v }) => ({ id, aantal: v.aantal, doel: v.doel, fractie: v.fractie, dagTeller: ['dagenBijgehouden', 'lopendeReeks'].includes(DOEL[id]?.[0]) }))
    .sort((a, b) => b.fractie - a.fractie || a.doel - a.aantal - (b.doel - b.aantal));
  return {
    eersteDatum: gesorteerd[0] ?? null,
    dagenSinds: vorige ? dagenTussen(vorige, datum) : null,
    besteEerdereReeks: besteEerdereReeks(gesorteerd, datum),
    rondReeks: opRij(rond, datum),
    gisterenRond: rond.has(gisteren),
    gisterenDoel: doel.has(gisteren),
    gisterenMl: mlGisteren,
    doelReeks: opRij(doel, datum),
    suppReeks: opRij(vol, datum),
    wegingReeks: opRij(weken, weekStart(datum), 7),
    totaal,
    badges: { vandaag: opDag(datum), gisteren: opDag(gisteren), aantal: behaald.size, totaal: ALLE_BADGES.length, volgende: open[0] ?? null, volgendeDag: open.find((x) => x.dagTeller) ?? null },
    weekDagen,
    vorigeMaandDagen: gesorteerd.filter((d) => d.startsWith(vorigeMaand)).length,
  };
}

// Voor de zin van de week: hoe deze week zich verhoudt tot de weken ervoor. datums: alle bijgehouden dagen.
export function weekVerledenUit(weekSleutel, datums = []) {
  const perWeek = new Map();
  for (const d of new Set(datums)) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) ?? 0) + 1);
  const eerdere = [...perWeek].filter(([w]) => w < weekSleutel);
  let volleWeken = 0;
  for (let w = weekSleutel; perWeek.get(w) === 7; w = plusDagen(w, -7)) volleWeken += 1;
  const eerste = [...perWeek.keys()].sort()[0] ?? null;
  return {
    eersteWeek: eerste === weekSleutel,
    volleWeken,
    besteEerdere: eerdere.length ? Math.max(...eerdere.map(([, n]) => n)) : null,
    vorigeWeek: eerste != null && eerste < weekSleutel ? (perWeek.get(plusDagen(weekSleutel, -7)) ?? 0) : null,
  };
}
