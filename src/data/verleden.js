// Verzamelt uit het dagboek wat de motivator over het verleden wil weten (logica/verleden.js rekent het uit). Alleen eigen gegevens:
// voorbeelddata telt nooit mee. Werkt op een momentopname (data/statistiek.js), zodat Vandaag de tabellen maar één keer leest.
import { isEigen } from './db.js';
import { isIngevuld } from './maaltijden.js';
import { eigenBijgehoudenDatums, leesMomentopname } from './statistiek.js';
import { plusDagen } from '../kern/datum.js';
import { ETEN_KLAAR, isDagRond } from '../logica/motivatie.js';
import { rooster, telMomenten } from '../logica/supplementen.js';
import { verledenUit, weekVerledenUit } from '../logica/verleden.js';

// badgeStats: leesBadgeStats(rijen) · badges: leesBadges() · doelMl: het dagdoel · weekDagen: bijgehouden dagen van deze week.
export async function leesVerleden({ datum, rijen, badgeStats = null, badges = [], doelMl = 0, weekDagen = 0 }) {
  const r = rijen ?? (await leesMomentopname());
  const datums = await eigenBijgehoudenDatums(r);
  const maaltijden = r.maaltijden.filter((m) => isEigen(m) && isIngevuld(m));
  const dranken = r.dranken.filter(isEigen);
  const innames = r.momentinnames.filter(isEigen);
  const supplementen = r.supplementen.filter(isEigen);
  const dagen = r.dagen.filter(isEigen);

  const soorten = new Map();
  for (const m of maaltijden) soorten.set(m.datum, (soorten.get(m.datum) ?? new Set()).add(m.soort));
  const ml = new Map();
  for (const d of dranken) ml.set(d.datum, (ml.get(d.datum) ?? 0) + d.ml);
  const momenten = new Map();
  const momentenVan = (dag) => {
    if (!momenten.has(dag)) momenten.set(dag, telMomenten(rooster(dag, supplementen, innames)));
    return momenten.get(dag);
  };
  // Dezelfde regel als de badge Dag rond (rondeDagenUit in logica/badgeregels.js), maar met de datum erbij.
  const rondeDatums = [...soorten]
    .filter(([dag, s]) => {
      const { klaar, totaal } = momentenVan(dag);
      return isDagRond({ etenKlaar: ETEN_KLAAR.every((x) => s.has(x)), supplementen: { genomen: klaar, totaal }, ml: ml.get(dag) ?? 0, doelMl });
    })
    .map(([dag]) => dag);
  const volleDatums = [...new Set(innames.map((i) => i.datum))].filter((dag) => {
    const { klaar, totaal } = momentenVan(dag);
    return totaal > 0 && klaar === totaal;
  });
  return verledenUit({
    datum,
    datums,
    rondeDatums,
    doelDatums: dagen.filter((d) => d.doelGehaald).map((d) => d.datum),
    volleDatums,
    wegingWeken: r.wegingen.filter(isEigen).map((w) => w.week),
    stemmingen: new Map(dagen.filter((d) => d.stemming != null).map((d) => [d.datum, d.stemming])),
    mlGisteren: ml.get(plusDagen(datum, -1)) ?? 0,
    totaal: {
      maaltijden: badgeStats?.maaltijden ?? maaltijden.length,
      doelDagen: badgeStats?.doelDagen ?? 0,
      volledigeDagen: badgeStats?.volledigeMomentDagen ?? volleDatums.length,
      rondeDagen: badgeStats?.dagRondDagen ?? rondeDatums.length,
      notitieDagen: badgeStats?.notitieDagen ?? 0,
      stemmingDagen: badgeStats?.stemmingDagen ?? 0,
      wegingen: badgeStats?.wegingen ?? 0,
      favorieten: badgeStats?.favorieten ?? 0,
    },
    badges,
    badgeStats,
    weekDagen,
  });
}

// Voor de zin boven het weekoverzicht.
export async function leesWeekVerleden(weekSleutel, rijen) {
  return weekVerledenUit(weekSleutel, await eigenBijgehoudenDatums(rijen ?? (await leesMomentopname())));
}
