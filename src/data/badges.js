// Badges nakijken en bewaren na elke wijziging (47). Een bewaarde badge verdwijnt nooit,
// behalve door "Alles wissen". De voorwaarden en rekenregels staan in logica/badges.js en logica/badgeregels.js.
import { db, huidigeEpoch, isEigen } from './db.js';
import { luister, zend } from '../kern/bus.js';
import { eigenBijgehoudenDatums, leesMomentopname, leesStats } from './statistiek.js';
import { isIngevuld } from './maaltijden.js';
import { leesInstelling, zetInstelling } from './instellingen.js';
import { verdiendAlle, langsteReeks, terugDagen, dagRondDagen, rondeDagenUit } from '../logica/badgeregels.js';

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
  const [basis, favorieten, doelMlRuw, verslag, bijgehouden] = await Promise.all([
    leesStats(r),
    db.favorieten.count(),
    leesInstelling('drinken.dagdoelMl'),
    leesInstelling('delen.verslagGemaakt'),
    eigenBijgehoudenDatums(r),
  ]);
  const maaltijden = r.maaltijden.filter((m) => isEigen(m) && isIngevuld(m));
  const dranken = r.dranken.filter(isEigen);
  const dagen = r.dagen.filter(isEigen);
  const innames = r.momentinnames.filter(isEigen);
  const supplementen = r.supplementen.filter(isEigen);
  const wegingen = r.wegingen.filter(isEigen);
  const doelMl = Number(doelMlRuw) || 0;
  return {
    ...basis,
    maaltijden: maaltijden.length,
    favorieten,
    energieDagen: dagen.filter((d) => d.energie != null).length,
    wegingen: wegingen.length,
    langsteDoelReeks: langsteReeks(dagen.filter((d) => d.doelGehaald).map((d) => d.datum)),
    dagRondDagen: dagRondDagen(rondeDagenUit({ maaltijden, dranken, innames, supplementen, doelMl })),
    // "Weer thuis" telt elke bijgehouden dag (BESLISSING 168), ook een dag met alleen een stemming, notitie of weging (R1-06).
    terugDagen: terugDagen(bijgehouden),
    verslagen: verslag ? 1 : 0,
  };
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
    const gehaald = verdiendAlle(stats);
    const nieuw = [];
    // Bij de eerste start na de uitbreiding worden de nieuwe badges voor wat al in het dagboek staat stil toegekend: geen reeks vieringen,
    // hoogstens één rustige melding. De vlag 'badges.uitgebreid' onthoudt dat dit gebeurd is.
    const stil = !(await db.instellingen.get('badges.uitgebreid'))?.waarde;
    await db.transaction('rw', db.badges, db.instellingen, async () => {
      for (const id of gehaald) {
        // Het schrift is intussen leeggemaakt of vervangen: niets bewaren.
        if (epoch !== huidigeEpoch()) return;
        if (await db.badges.get(id)) continue;
        await db.badges.add({ id, behaaldOp: Date.now(), gezien: stil });
        nieuw.push(id);
      }
      if (stil && epoch === huidigeEpoch()) await db.instellingen.put({ sleutel: 'badges.uitgebreid', waarde: true });
    });
    // De viering volgt pas als het bewaren gelukt is.
    if (stil) {
      if (nieuw.length) zend('badges:stil', { aantal: nieuw.length });
    } else {
      for (const id of nieuw) zend('badge:behaald', { id });
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
  const stopVerslag = luister('verslag:gemaakt', () => {
    zetInstelling('delen.verslagGemaakt', Date.now()).then(plan, plan);
  });
  afmelden = () => {
    stopData();
    stopVerslag();
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
