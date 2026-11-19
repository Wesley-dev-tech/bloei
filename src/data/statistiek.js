// Leest de gegevens voor reeks, teller, badgestats, weekoverzicht en maandkalender. Alleen lezen: niets hier schrijft (R1-18).
// Oude voorbeelddata (isEigen in db.js) telt nooit mee voor reeks, teller en badges (62).
import { db, isEigen } from './db.js';
import { leesInstelling } from './instellingen.js';
import { isIngevuld } from './maaltijden.js';
import { maandRaster, naarDatum, plusDagen, vandaag, weekDagen } from '../kern/datum.js';
import { dagenBijgehouden, lopendeReeks } from '../logica/reeks.js';
import { vatSamen } from '../logica/weekoverzicht.js';
import { isPeriodiek, rooster, telMomenten, telRooster } from '../logica/supplementen.js';
import { innamesVoorRooster } from './supplementen.js';
import { isBijgehouden } from '../logica/bijgehouden.js';

// dagStatus staat sinds R1-26 in data/dagstatus.js (de service worker haalt alleen dat). Later op te ruimen: vandaag.js rechtstreeks laten importeren.
export { dagStatus } from './dagstatus.js';

// Alle datums waarop de gebruiker zelf iets noteerde (BESLISSING 168, logica/bijgehouden.js): een maaltijd, een drank, een inname, een stemming,
// energie, een notitie of een weging. Oude voorbeelddata telt nooit mee. Ook gebruikt voor de badge "Weer thuis" (data/badges.js).
export async function eigenBijgehoudenDatums(rijen) {
  const r = rijen ?? (await leesMomentopname());
  const perDatum = new Map();
  const dag = (datum) => {
    if (!perDatum.has(datum)) perDatum.set(datum, { maaltijden: 0, ml: 0, innames: 0, stemming: null, energie: null, notitie: '', weging: false });
    return perDatum.get(datum);
  };
  for (const m of r.maaltijden) if (isEigen(m) && isIngevuld(m)) dag(m.datum).maaltijden += 1;
  for (const d of r.dranken) if (isEigen(d)) dag(d.datum).ml += d.ml;
  for (const i of r.momentinnames) if (isEigen(i)) dag(i.datum).innames += 1;
  for (const d of r.dagen) {
    if (!isEigen(d)) continue;
    const g = dag(d.datum);
    g.stemming = d.stemming ?? null;
    g.energie = d.energie ?? null;
    g.notitie = d.notitie ?? '';
  }
  for (const w of r.wegingen) if (isEigen(w)) dag(w.datum).weging = true;
  return [...perDatum].filter(([, g]) => isBijgehouden(g)).map(([datum]) => datum).sort();
}

// Momentopname (BESLISSING 735: elk scherm binnen 1,5 seconde): de zes tabellen die reeks, badges, week en maand nodig hebben, elk één keer
// gelezen met een gewone toArray (elk een eigen korte transactie, geen lange transactie over andere wachttijd heen). Een scherm leest dit
// één keer per tekening en geeft het door aan de rekenfuncties hieronder; zonder momentopname lezen die zelf, zoals vroeger.
// De rijen zijn in volgorde van de sleutel, net als .each; de rekenfuncties wijzigen ze niet.
export async function leesMomentopname() {
  const [maaltijden, dranken, momentinnames, dagen, wegingen, supplementen] = await Promise.all([
    db.maaltijden.toArray(),
    db.dranken.toArray(),
    db.momentinnames.toArray(),
    db.dagen.toArray(),
    db.wegingen.toArray(),
    db.supplementen.toArray(),
  ]);
  return { maaltijden, dranken, momentinnames, dagen, wegingen, supplementen };
}

// dagenBijgehouden is een totaalteller die nooit daalt (45): het hoogste ooit staat in 'teller.hoogste'. Bewaren gebeurt in
// controleerBadges (data/badges.js), dat na elke wijziging loopt; lezen schrijft niets (R1-18).
export async function leesReeks(rijen) {
  const datums = await eigenBijgehoudenDatums(rijen);
  const hoogste = Number(await leesInstelling('teller.hoogste')) || 0;
  return {
    dagenBijgehouden: Math.max(dagenBijgehouden(datums), hoogste),
    lopendeReeks: lopendeReeks(datums, vandaag()),
  };
}

// Alles wat de badges nodig hebben (logica/badges.js, Stats). Alleen eigen gegevens.
export async function leesStats(rijen) {
  const r = rijen ?? (await leesMomentopname());
  const { dagenBijgehouden: totaal, lopendeReeks: reeks } = await leesReeks(r);
  let doelDagen = 0;
  let notitieDagen = 0;
  let stemmingDagen = 0;
  for (const dag of r.dagen) {
    if (!isEigen(dag)) continue;
    if (dag.doelGehaald) doelDagen += 1;
    if ((dag.notitie ?? '').trim() !== '') notitieDagen += 1;
    if (dag.stemming != null) stemmingDagen += 1;
  }
  // Supplementen (alleen eigen gegevens): dagen met minstens één eigen inname, en (BESLISSING 150) dagen waarop elk moment van de dag
  // afgevinkt is, zonder het periodieke supplement dat aan de beurt was.
  const eigenSupplementen = r.supplementen.filter(isEigen);
  const eigenInnames = r.momentinnames.filter(isEigen);
  const innameDatums = [...new Set(eigenInnames.map((i) => i.datum))];
  const volledigeMomentDagen = innameDatums.filter((datum) => {
    const { klaar, totaal } = telMomenten(rooster(datum, eigenSupplementen, eigenInnames));
    return totaal > 0 && klaar === totaal;
  }).length;
  return {
    dagenBijgehouden: totaal,
    lopendeReeks: reeks,
    doelDagen,
    notitieDagen,
    stemmingDagen,
    innameDagen: innameDatums.length,
    volledigeMomentDagen,
  };
}

// Per dag in het bereik: { datum, maaltijden, ml, stemming, energie, notitie, weging, supplementen: { genomen, totaal }, supplementMomenten }.
// Alleen dagen waar iets staat. Oude voorbeelddata telt hier wel mee: dit is wat de gebruiker op het scherm ziet. tel en telM geven voor elke
// dag van het bereik de stand van de supplementen (volgens het schema van die dag), ook voor dagen waar verder niets staat.
// Met een momentopname (leesMomentopname) wordt in het geheugen gefilterd, in dezelfde volgorde als de bereikvragen: op datum, en bij gelijke
// datum in de volgorde van de sleutel (een stabiele sortering van de rijen, die al in sleutelvolgorde staan).
const opDatum = (rijen, van, tot) => rijen.filter((x) => typeof x.datum === 'string' && x.datum >= van && x.datum <= tot).sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));

// Zoals innamesVoorRooster (data/supplementen.js), maar uit een momentopname: eerst de innames in het bereik, dan alle innames van een
// periodiek supplement (op supplement, dan sleutel), zonder dubbels.
function innamesVoorRoosterUit(alle, supplementen, van, tot) {
  const periodiekIds = new Set(supplementen.filter(isPeriodiek).map((s) => s.id));
  const periodiek = periodiekIds.size ? alle.filter((i) => periodiekIds.has(i.supplementId)).sort((a, b) => indexedDB.cmp(a.supplementId, b.supplementId)) : [];
  const gezien = new Set();
  return [...opDatum(alle, van, tot), ...periodiek].filter((i) => {
    const sleutel = `${i.datum}|${i.supplementId}|${i.moment}`;
    if (gezien.has(sleutel)) return false;
    gezien.add(sleutel);
    return true;
  });
}

async function dagenInBereik(van, tot, rijen) {
  const [dagRecords, maaltijden, dranken, supplementen, wegingenBereik] = rijen
    ? [opDatum(rijen.dagen, van, tot), opDatum(rijen.maaltijden, van, tot), opDatum(rijen.dranken, van, tot), rijen.supplementen, opDatum(rijen.wegingen, van, tot)]
    : await Promise.all([
        db.dagen.where('datum').between(van, tot, true, true).toArray(),
        db.maaltijden.where('datum').between(van, tot, true, true).toArray(),
        db.dranken.where('datum').between(van, tot, true, true).toArray(),
        db.supplementen.toArray(),
        db.wegingen.where('datum').between(van, tot, true, true).toArray(),
      ]);
  const innames = rijen ? innamesVoorRoosterUit(rijen.momentinnames, supplementen, van, tot) : await innamesVoorRooster(supplementen, van, tot);
  const tel = new Map();
  const telM = new Map();
  for (let datum = van; datum <= tot; datum = plusDagen(datum, 1)) {
    const dagRooster = rooster(datum, supplementen, innames);
    tel.set(datum, telRooster(dagRooster));
    telM.set(datum, telMomenten(dagRooster));
  }

  const perDag = new Map();
  const dagVan = (datum) => {
    if (!perDag.has(datum)) {
      perDag.set(datum, { datum, maaltijden: 0, ml: 0, stemming: null, energie: null, notitie: false, weging: false, supplementen: tel.get(datum) ?? { genomen: 0, totaal: 0 }, supplementMomenten: telM.get(datum) ?? { klaar: 0, totaal: 0 } });
    }
    return perDag.get(datum);
  };
  for (const dag of dagRecords) {
    const r = dagVan(dag.datum);
    r.stemming = dag.stemming ?? null;
    r.energie = dag.energie ?? null;
    r.notitie = (dag.notitie ?? '').trim() !== '';
  }
  for (const w of wegingenBereik) dagVan(w.datum).weging = true;
  for (const m of maaltijden) if (isIngevuld(m)) dagVan(m.datum).maaltijden += 1;
  for (const d of dranken) dagVan(d.datum).ml += d.ml;
  for (const i of innames) if (i.datum >= van && i.datum <= tot) dagVan(i.datum);
  return { perDag, tel, telM };
}

export async function leesWeekoverzicht(weekSleutel, rijen) {
  const dagen = weekDagen(weekSleutel);
  const { perDag, tel, telM } = await dagenInBereik(dagen[0], dagen[6], rijen);
  return vatSamen(
    dagen.map((datum) => {
      const r = perDag.get(datum);
      return {
        datum,
        maaltijden: r?.maaltijden ?? 0,
        ml: r?.ml ?? 0,
        stemming: r?.stemming ?? null,
        energie: r?.energie ?? null,
        notitie: r?.notitie ?? false,
        weging: r?.weging ?? false,
        supplementen: r?.supplementen ?? tel.get(datum),
        supplementMomenten: r?.supplementMomenten ?? telM.get(datum),
      };
    }),
  );
}

// Alleen de dagen van de maand waar iets staat; een lege dag ontbreekt (geen bolletje, geen kleur).
export async function leesMaand(jaarMaand, rijen) {
  const datums = maandRaster(jaarMaand).flat().filter(Boolean);
  const { perDag } = await dagenInBereik(datums[0], datums.at(-1), rijen);
  const uitvoer = {};
  for (const [datum, r] of [...perDag].sort()) {
    if (!isBijgehouden({ maaltijden: r.maaltijden, ml: r.ml, innames: r.supplementen.genomen, stemming: r.stemming, energie: r.energie, notitie: r.notitie, weging: r.weging })) continue;
    uitvoer[datum] = { stemming: r.stemming, energie: r.energie, maaltijden: r.maaltijden, ml: r.ml, supplementen: r.supplementen, supplementMomenten: r.supplementMomenten };
  }
  return uitvoer;
}

// Aantal dagen sinds de vorige bijgehouden dag vóór deze datum (of null): voor de zin "welkom terug". Dezelfde regel als dagenSindsVorige in
// schermen/hulp.js, maar met een momentopname, zodat Vandaag de twee maanden niet opnieuw uit de database leest.
export async function dagenSindsVorigeUit(datum, rijen) {
  const [j, m] = datum.split('-').map(Number);
  const vorige = new Date(j, m - 2, 1);
  const vorigeMaand = vorige.getFullYear() + '-' + String(vorige.getMonth() + 1).padStart(2, '0');
  const gegevens = { ...(await leesMaand(vorigeMaand, rijen)), ...(await leesMaand(datum.slice(0, 7), rijen)) };
  const eerder = Object.keys(gegevens).filter((d) => d < datum).sort();
  if (!eerder.length) return null;
  return Math.round((naarDatum(datum) - naarDatum(eerder.at(-1))) / 86400000);
}
