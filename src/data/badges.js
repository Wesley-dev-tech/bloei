// Badges nakijken en bewaren na elke wijziging (47). Een bewaarde badge verdwijnt nooit,
// behalve door "Alles wissen". De voorwaarden en rekenregels staan in logica/badges.js en logica/badgeregels.js.
import { db, huidigeEpoch, isEigen } from './db.js';
import { luister, zend } from '../kern/bus.js';
import { eigenBijgehoudenDatums, leesMomentopname, leesStats } from './statistiek.js';
import { isIngevuld } from './maaltijden.js';
import { leesInstelling, zetInstelling, STANDAARD } from './instellingen.js';
import { DOEL, FEESTBADGES, HERHAALBAAR, verdiendAlle, langsteReeks, langsteWeekReeks, terugDagen, dagRondDagen, rondeDagenUit, volleMaandenUit, volleWekenUit } from '../logica/badgeregels.js';
import { isDagRond, ETEN_KLAAR } from '../logica/motivatie.js';
import { isPeriodiek, rooster, telMomenten } from '../logica/supplementen.js';
import { isStandalone } from '../kern/toestel.js';
import { OPSLAG_VOORVOEGSEL } from '../kern/demo.js';
import { eersteDatums } from '../logica/badgehistorie.js';
import { feestdagOp, geldigeVerjaardag, isJarig } from '../logica/kalender.js';
import { isBijgehouden } from '../logica/bijgehouden.js';
import { naarSleutel, vandaag } from '../kern/datum.js';

const WACHT_MS = 500;
let afmelden = null;
let timer = null;
let bezig = Promise.resolve();

// Alles wat de badges nodig hebben: de oude stats uit statistiek.js plus de tellingen voor de uitgebreide badges (BESLISSING 166).
// Alleen eigen gegevens: oude voorbeelddata telt nooit mee. Hier wordt alleen gelezen; de rekenregels staan in logica/badgeregels.js.
// rijen: een momentopname (leesMomentopname in data/statistiek.js); zonder wordt hier één keer gelezen (BESLISSING 735: elke tabel één keer).
export async function leesBadgeStats(rijen) {
  const r = rijen ?? (await leesMomentopname());
  // Via leesInstelling, zoals de rest van de app: zonder bewaarde rij geldt het standaard dagdoel (R1-01).
  const [basis, favorieten, doelMlRuw, verslag, bijgehouden, verslagenRuw, rondleidingenRuw, thema, kaft, naam, avatar, slotAan, mDagboek, mDrinken, mSupplementen, medailles, geboortedatum, gevierd, jarigJaren] = await Promise.all([
    leesStats(r),
    db.favorieten.count(),
    leesInstelling('drinken.dagdoelMl'),
    leesInstelling('delen.verslagGemaakt'),
    eigenBijgehoudenDatums(r),
    leesInstelling('delen.verslagen'),
    leesInstelling('kennen.rondleidingen'),
    leesInstelling('thema.keuze'),
    leesInstelling('thema.kaft'),
    leesInstelling('profiel.naam'),
    leesInstelling('profiel.avatar'),
    leesInstelling('slot.aan'),
    leesInstelling('meldingen.dagboek'),
    leesInstelling('meldingen.drinken'),
    leesInstelling('meldingen.supplementenUren'),
    db.badges.count(),
    leesInstelling('profiel.verjaardag'),
    leesInstelling('profiel.verjaardagGevierd'),
    leesInstelling('profiel.verjaardagJaren'),
  ]);
  const maaltijden = r.maaltijden.filter((m) => isEigen(m) && isIngevuld(m));
  const dranken = r.dranken.filter(isEigen);
  const dagen = r.dagen.filter(isEigen);
  const innames = r.momentinnames.filter(isEigen);
  const supplementen = r.supplementen.filter(isEigen);
  const wegingen = r.wegingen.filter(isEigen);
  const doelMl = Number(doelMlRuw) || 0;
  // ---- De tellers van de uitbreiding naar honderd medailles (logica/badgeregels.js, DREMPELS)
  const ronde = rondeDagenUit({ maaltijden, dranken, innames, supplementen, doelMl });
  const rondeDatums = ronde.filter((d) => isDagRond(d)).map((d) => d.datum);
  const soortenPerDag = new Map();
  for (const m of maaltijden) soortenPerDag.set(m.datum, (soortenPerDag.get(m.datum) ?? new Set()).add(m.soort));
  const volleDatums = [...new Set(innames.map((i) => i.datum))].filter((datum) => {
    const { klaar, totaal } = telMomenten(rooster(datum, supplementen, innames));
    return totaal > 0 && klaar === totaal;
  });
  const periodiekIds = new Set(supplementen.filter(isPeriodiek).map((x) => x.id));
  const metStemming = dagen.filter((d) => d.stemming != null);
  const heeftNotitie = (d) => (d.notitie ?? '').trim() !== '';
  const helemaal = new Set(dagen.filter((d) => d.stemming != null && d.energie != null && heeftNotitie(d)).map((d) => d.datum));
  const aan = (m) => [m].flat().some((x) => x?.aan);
  const verslagen = Math.max(Number(verslagenRuw) || 0, verslag ? 1 : 0);
  return {
    ...basis,
    volleWeken: volleWekenUit(bijgehouden),
    volleMaanden: volleMaandenUit(bijgehouden),
    etenKlaarDagen: [...soortenPerDag.values()].filter((soorten) => ETEN_KLAAR.every((x) => soorten.has(x))).length,
    gevoelMaaltijden: maaltijden.filter((m) => m.gevoel != null).length,
    dranken: dranken.length,
    liters: Math.floor(dranken.reduce((som, d) => som + d.ml, 0) / 1000),
    drankSoorten: new Set(dranken.map((d) => d.soort)).size,
    supplementenAantal: supplementen.length,
    innames: innames.length,
    periodiekInnames: innames.filter((i) => periodiekIds.has(i.supplementId)).length,
    langsteVolReeks: langsteReeks(volleDatums),
    langsteStemmingReeks: langsteReeks(metStemming.map((d) => d.datum)),
    beideDagen: metStemming.filter((d) => d.energie != null).length,
    langsteWeegReeks: langsteWeekReeks(wegingen.map((w) => w.week)),
    langsteRondReeks: langsteReeks(rondeDatums),
    helemaalDagen: rondeDatums.filter((datum) => helemaal.has(datum)).length,
    rondleidingen: new Set([...(Array.isArray(rondleidingenRuw) ? rondleidingenRuw : []), ...eerderGezien()]).size,
    themaGekozen: thema !== STANDAARD['thema.keuze'] || kaft !== STANDAARD['thema.kaft'] ? 1 : 0,
    herinneringAan: aan(mDagboek) || aan(mDrinken) || aan(mSupplementen) ? 1 : 0,
    slotAan: slotAan ? 1 : 0,
    opBeginscherm: isStandalone() ? 1 : 0,
    eigenProfiel: String(naam ?? '').trim() !== '' && JSON.stringify(avatar) !== JSON.stringify(STANDAARD['profiel.avatar']) ? 1 : 0,
    medailles,
    // De verjaardag (logica/kalender.js): ingevuld, Bloei geopend op die dag, en iets genoteerd op die dag.
    geboortedatum: geldigeVerjaardag(geboortedatum) ? 1 : 0,
    jarigGeopend: Math.max(Array.isArray(jarigJaren) ? jarigJaren.length : 0, gevierd ? 1 : 0), // elk jaar opnieuw
    jarigGenoteerd: bijgehouden.filter((datum) => isJarig(geboortedatum, datum)).length,
    // De feestdagen: per feestdag op hoeveel van die dagen ze iets noteerde ('feest:nieuwjaar', 'feest:kerst', ...).
    ...Object.fromEntries(Object.keys(FEESTBADGES).map((feest) => ['feest:' + feest, bijgehouden.filter((datum) => feestdagOp(datum) === feest).length])),
    maaltijden: maaltijden.length,
    favorieten,
    energieDagen: dagen.filter((d) => d.energie != null).length,
    wegingen: wegingen.length,
    langsteDoelReeks: langsteReeks(dagen.filter((d) => d.doelGehaald).map((d) => d.datum)),
    dagRondDagen: dagRondDagen(ronde),
    // "Weer thuis" telt elke bijgehouden dag (BESLISSING 168), ook een dag met alleen een stemming, notitie of weging (R1-06).
    terugDagen: terugDagen(bijgehouden),
    verslagen,
  };
}

// Per dag wat er in het dagboek staat, voor eersteDatums (logica/badgehistorie.js): alleen eigen gegevens, met dezelfde regels als de tellers hierboven.
async function feitenPerDag(rijen) {
  const r = rijen ?? (await leesMomentopname());
  const doelMl = Number(await leesInstelling('drinken.dagdoelMl')) || 0;
  const maaltijden = r.maaltijden.filter((m) => isEigen(m) && isIngevuld(m));
  const dranken = r.dranken.filter(isEigen);
  const innames = r.momentinnames.filter(isEigen);
  const supplementen = r.supplementen.filter(isEigen);
  const periodiekIds = new Set(supplementen.filter(isPeriodiek).map((x) => x.id));
  const dagen = new Map();
  const dag = (datum) => {
    if (!dagen.has(datum)) dagen.set(datum, { datum, maaltijden: 0, gevoel: 0, dranken: 0, ml: 0, soorten: [], innames: 0, periodiek: 0, wegingen: [], soortenEten: new Set(), stemming: null, energie: null, notitie: false, doel: false, weging: false });
    return dagen.get(datum);
  };
  for (const m of maaltijden) {
    const d = dag(m.datum);
    d.maaltijden += 1;
    d.soortenEten.add(m.soort);
    if (m.gevoel != null) d.gevoel += 1;
  }
  for (const x of dranken) {
    const d = dag(x.datum);
    d.dranken += 1;
    d.ml += x.ml;
    d.soorten.push(x.soort);
  }
  for (const i of innames) {
    const d = dag(i.datum);
    d.innames += 1;
    if (periodiekIds.has(i.supplementId)) d.periodiek += 1;
  }
  for (const x of r.dagen.filter(isEigen)) {
    const d = dag(x.datum);
    d.stemming = x.stemming ?? null;
    d.energie = x.energie ?? null;
    d.notitie = (x.notitie ?? '').trim() !== '';
    d.doel = Boolean(x.doelGehaald);
  }
  for (const w of r.wegingen.filter(isEigen)) {
    const d = dag(w.datum);
    d.wegingen.push(w.week);
    d.weging = true;
  }
  const nu = vandaag();
  return [...dagen.values()]
    .filter((d) => typeof d.datum === 'string' && d.datum <= nu)
    .map((d) => {
      const momenten = d.innames > 0 || d.soortenEten.size > 0 ? telMomenten(rooster(d.datum, supplementen, innames)) : { klaar: 0, totaal: 0 };
      const etenKlaar = ETEN_KLAAR.every((x) => d.soortenEten.has(x));
      return {
        ...d,
        etenKlaar,
        bij: isBijgehouden({ maaltijden: d.maaltijden, ml: d.ml, innames: d.innames, stemming: d.stemming, energie: d.energie, notitie: d.notitie, weging: d.weging }),
        vol: d.innames > 0 && momenten.totaal > 0 && momenten.klaar === momenten.totaal,
        rond: d.soortenEten.size > 0 && isDagRond({ etenKlaar, supplementen: { genomen: momenten.klaar, totaal: momenten.totaal }, ml: d.ml, doelMl }),
      };
    });
}

// De rondleidingen die ze voor 0.4.4 al zag (de uitleg onthoudt ze in localStorage, uitleg/rondleiding.js): zo telt ook wat ze vroeger
// al volgde mee voor Eerste rondleiding en Vijf rondleidingen. Zonder localStorage (een test, de service worker): niets.
function eerderGezien() {
  try {
    const gezien = JSON.parse(globalThis.localStorage?.getItem(OPSLAG_VOORVOEGSEL + 'uitleg') || '{}')?.gezien;
    return gezien && typeof gezien === 'object' ? Object.keys(gezien).filter((sleutel) => gezien[sleutel]) : [];
  } catch {
    return [];
  }
}

// Kijkt alle badges na en bewaart de nieuwe. Geeft de nieuwe ids terug. Wordt achter elkaar
// uitgevoerd, zodat twee snelle wijzigingen nooit dezelfde badge dubbel bewaren.
export function controleerBadges() {
  const taak = bezig.then(async () => {
    const epoch = huidigeEpoch();
    const stats = await leesBadgeStats();
    // De teller daalt nooit (45): het hoogste aantal bijgehouden dagen wordt hier bewaard, niet bij het lezen (R1-18). Is het schrift
    // intussen leeggemaakt, dan bewaren we niets.
    const hoogste = Number(await leesInstelling('teller.hoogste')) || 0;
    if (stats.dagenBijgehouden > hoogste && epoch === huidigeEpoch()) await zetInstelling('teller.hoogste', stats.dagenBijgehouden);
    const nieuw = [];
    const opnieuw = []; // een medaille van een feestdag of van haar verjaardag, dit jaar opnieuw behaald
    // Bij de eerste start na een uitbreiding worden de nieuwe badges voor wat al in het dagboek staat stil toegekend: geen reeks vieringen,
    // hoogstens één rustige melding. De vlaggen 'badges.uitgebreid' (naar 33), 'badges.uitgebreid2' (naar 100) en 'badges.uitgebreid3' (de feestdagen) onthouden dat
    // dit gebeurd is.
    const vlaggen = await Promise.all(['badges.uitgebreid', 'badges.uitgebreid2', 'badges.uitgebreid3'].map((sleutel) => db.instellingen.get(sleutel)));
    const stil = vlaggen.some((rij) => !rij?.waarde);
    // Stil toegekende medailles horen bij de dag waarop ze echt verdiend werden (logica/badgehistorie.js), niet bij de dag van de update.
    let historie = new Map();
    if (stil) {
      try {
        const kandidaten = verdiendAlle(stats);
        historie = eersteDatums(await feitenPerDag(), kandidaten);
      } catch (fout) {
        console.error('De datums van de medailles berekenen mislukt', fout);
      }
    }
    // De middag van die dag, of nu als de medaille geen geschiedenis heeft (of vandaag behaald is).
    const moment = (id) => {
      const dag = historie.get(id);
      if (!dag || dag >= naarSleutel(new Date())) return Date.now();
      const [j, m, d] = dag.split('-').map(Number);
      return new Date(j, m - 1, d, 12).getTime();
    };
    await db.transaction('rw', db.badges, db.instellingen, async () => {
      // Hoogstens een paar rondes: een medaille van Je verzameling (tien medailles, ...) kan pas volgen als de andere bewaard zijn.
      for (let ronde = 0; ronde < 4; ronde++) {
        let erbij = 0;
        for (const id of verdiendAlle({ ...stats, medailles: await db.badges.count() })) {
          // Het schrift is intussen leeggemaakt of vervangen: niets bewaren.
          if (epoch !== huidigeEpoch()) return;
          const rij = await db.badges.get(id);
          // Hoe vaak ze een herhaalbare medaille al verdiende: op hoeveel van die feestdagen (of verjaardagen) het klopte.
          const keer = HERHAALBAAR.has(id) ? Math.max(1, Math.floor(Number(stats[DOEL[id][0]]) || 1)) : null;
          if (rij) {
            // Al behaald. Een herhaalbare medaille behaal je elk jaar opnieuw: de teller loopt mee, de datum wordt die van vandaag en ze
            // wordt opnieuw gevierd. Stil (na een uitbreiding) komt alleen de teller bij.
            if (keer != null && keer > (rij.keer ?? 1)) {
              await db.badges.put({ ...rij, keer, behaaldOp: stil ? rij.behaaldOp : Date.now(), gezien: stil ? rij.gezien : false });
              if (!stil && !opnieuw.includes(id)) opnieuw.push(id);
            }
            continue;
          }
          await db.badges.add({ id, behaaldOp: moment(id), gezien: stil, ...(keer != null ? { keer } : {}) });
          nieuw.push(id);
          erbij += 1;
        }
        if (!erbij) break;
      }
      // De medailles van Je verzameling (tien medailles, ...) krijgen bij het stil toekennen de dag waarop de zoveelste medaille behaald werd.
      if (stil && epoch === huidigeEpoch()) {
        const alle = await db.badges.toArray();
        const gewone = alle.filter((b) => DOEL[b.id]?.[0] !== 'medailles').map((b) => b.behaaldOp).sort((a, b) => a - b);
        for (const b of alle) {
          if (!nieuw.includes(b.id) || DOEL[b.id]?.[0] !== 'medailles') continue;
          const op = gewone[Math.min(DOEL[b.id][1], gewone.length) - 1];
          if (op != null && op < b.behaaldOp) await db.badges.put({ ...b, behaaldOp: op + 1 });
        }
      }
      if (stil && epoch === huidigeEpoch()) {
        await db.instellingen.put({ sleutel: 'badges.uitgebreid', waarde: true });
        await db.instellingen.put({ sleutel: 'badges.uitgebreid2', waarde: true });
        await db.instellingen.put({ sleutel: 'badges.uitgebreid3', waarde: true });
      }
    });
    // De viering volgt pas als het bewaren gelukt is.
    if (stil) {
      if (nieuw.length) zend('badges:stil', { aantal: nieuw.length });
    } else {
      for (const id of nieuw) zend('badge:behaald', { id });
      for (const id of opnieuw) zend('badge:behaald', { id, opnieuw: true });
    }
    return nieuw;
  });
  bezig = taak.catch(() => {});
  return taak;
}

function plan() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    controleerBadges().catch((fout) => console.error('Badges nakijken mislukt', fout));
  }, WACHT_MS);
}

// Luistert op data:gewijzigd en kijkt 500 ms later na.
// Meermaals aanroepen is veilig.
export function startBadges() {
  if (afmelden) return;
  const stopData = luister('data:gewijzigd', plan);
  // Een verslag verstuurd of bewaard (scherm Delen): de badge Eerste verslag.
  // Elk verslag telt (Vijf verslagen, Tien verslagen): Bloei telt ze sinds 0.4.4; wie er vroeger al een maakte, begint bij 1.
  const stopVerslag = luister('verslag:gemaakt', async () => {
    try {
      const [aantal, eerder] = await Promise.all([leesInstelling('delen.verslagen'), leesInstelling('delen.verslagGemaakt')]);
      await zetInstelling('delen.verslagen', Math.max(Number(aantal) || 0, eerder ? 1 : 0) + 1);
      await zetInstelling('delen.verslagGemaakt', Date.now());
    } finally {
      plan();
    }
  });
  // Een rondleiding tot het einde gevolgd (uitleg/rondleiding.js): elke rondleiding telt één keer.
  const stopUitleg = luister('uitleg:klaar', async ({ sleutel } = {}) => {
    try {
      const lijst = await leesInstelling('kennen.rondleidingen');
      const gevolgd = Array.isArray(lijst) ? lijst : [];
      if (sleutel && !gevolgd.includes(sleutel)) await zetInstelling('kennen.rondleidingen', [...gevolgd, sleutel]);
    } finally {
      plan();
    }
  });
  // Een thema, een herinnering, het slot of het profiel: de medailles van Bloei leren kennen.
  const stopInstelling = luister('instelling:gewijzigd', ({ sleutel } = {}) => {
    if (/^(thema\.|meldingen\.|slot\.aan$|profiel\.)/.test(String(sleutel ?? ''))) plan(); // (ook profiel.verjaardag en profiel.verjaardagGevierd)
  });
  afmelden = () => {
    stopData();
    stopVerslag();
    stopUitleg();
    stopInstelling();
    clearTimeout(timer);
    afmelden = null;
  };
  controleerBadges().catch((fout) => console.error('Badges nakijken mislukt', fout)); // meteen bij het opstarten (ook het stil toekennen)
}

export function stopBadges() {
  afmelden?.();
}

// Oudste eerst.
export async function leesBadges() {
  return (await db.badges.toArray()).sort((a, b) => a.behaaldOp - b.behaaldOp);
}

export async function markeerGezien(id) {
  await db.badges.update(id, { gezien: true });
}
