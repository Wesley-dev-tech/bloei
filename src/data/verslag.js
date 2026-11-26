// Het verslag voor Delen (PLAN.md §16.14, BESLISSING 154): wat in een gekozen periode is bijgehouden, per dag, alleen de gekozen
// onderdelen. Alleen eigen gegevens: voorbeelddata telt nooit mee. Geen oordeel, geen score, geen percentages: alleen wat er staat.
// Het bestand importeert niets van de UI, zodat het ook zonder scherm te testen is.
import { db } from './db.js';
import { isIngevuld, MAALTIJDSOORTEN } from './maaltijden.js';
import { plusDagen, vandaag } from '../kern/datum.js';
import { zend } from '../kern/bus.js';
import { isBijgehouden } from '../logica/bijgehouden.js';
import { WEEKDAGEN, gemiddeldPerDag } from '../logica/drinken-week.js';
import { leesInstelling } from './instellingen.js';

// Een verslag is echt bewaard of verstuurd (niet bij annuleren): spoor B kent er de badge Eerste verslag aan toe. Verder niets.
export function meldVerslagGemaakt({ van, tot, onderdelen }, manier) {
  zend('verslag:gemaakt', { van, tot, manier, onderdelen: onderdelen ? { ...onderdelen } : null });
}

// Het verslag kent precies vier onderdelen, in deze volgorde (BESLISSING 284).
export const VERSLAG_ONDERDELEN = ['eten', 'drinken', 'gewicht', 'notities'];
// Een verslag telt hoogstens zoveel dagen (R2-03): bij een langere periode komen de recentste dagen erin (tot en met de einddatum).
export const MAX_DAGEN = 366;

// De periode die echt in het verslag komt: hoogstens MAX_DAGEN dagen, de recentste. Met `nu` (vandaag) eindigt een periode die
// voorbij vandaag loopt op vandaag; een periode die helemaal in de toekomst ligt, blijft (Delen toont dan zijn lege toestand).
// ingekort zegt of de periode is aangepast.
export function begrensPeriode({ van, tot }, nu) {
  const eind = nu && tot > nu && van <= nu ? nu : tot;
  const vroegst = plusDagen(eind, -(MAX_DAGEN - 1));
  const begin = van < vroegst ? vroegst : van;
  return { van: begin, tot: eind, ingekort: begin !== van || eind !== tot };
}

// Een bewaarde keuze terug naar precies de vier onderdelen: een verdwenen onderdeel wordt genegeerd,
// een ontbrekend onderdeel krijgt de standaard (Eten en Drinken aan, Gewicht en Notities uit).
export function schoonOnderdelen(bewaard) {
  const standaard = { eten: true, drinken: true, gewicht: false, notities: false };
  const b = bewaard && typeof bewaard === 'object' ? bewaard : {};
  return Object.fromEntries(VERSLAG_ONDERDELEN.map((naam) => [naam, typeof b[naam] === 'boolean' ? b[naam] : standaard[naam]]));
}

const eigen = (rij) => rij.voorbeeld !== true;

// De keuze van de periode in Delen die een weekverslag geeft (BESLISSING 457). Delen geeft de keuze zelf mee: de datums alleen zeggen het niet
// ("Aangepast" met toevallig dezelfde datums is geen weekverslag).
export const KEUZE_DEZE_WEEK = 'deze-week';
// BESLISSING 474: "Vorige week" (de volle vorige week, maandag tot en met zondag) is ook een weekverslag.
export const KEUZE_VORIGE_WEEK = 'vorige-week';
const WEEKKEUZES = new Set([KEUZE_DEZE_WEEK, KEUZE_VORIGE_WEEK]);

// leesVerslag({ van, tot, onderdelen, nu, keuze }) → {
//   van, tot, onderdelen, weekverslag,   weekverslag: true voor "Deze week" en "Vorige week" (keuze "deze-week" of "vorige-week"), ook als er maar één dag getoond wordt (maandag)
//   samenvatting: { dagen, noemer, ingevuldeDagen, gemiddeldMl, maaltijden, dagdoelMl, dagdoelDagen },   gemiddeldMl is null als er niets gedronken is;
//     dagen = het aantal dagen in de lijst, noemer = waarvan "X van N dagen" gaat (7 voor "Deze week", anders gelijk aan dagen),
//     maaltijden = aantal ingevulde maaltijden in de periode, dagdoelDagen = op hoeveel dagen het dagdoel (dagdoelMl) is gehaald
//   dagen: [{ datum, leeg, eten?, drinken?, notitie? }],
//   gewicht?: [{ datum, kg }]
// }
// `leeg` zegt of er die dag iets is bijgehouden (maaltijd, drank, weging of notitie), los van welke onderdelen aan staan.
// nu (standaard vandaag) bepaalt welke dagen voorbij zijn (voor het gemiddelde). keuze is de gekozen periode in Delen (vandaag, gisteren, deze-week, twee, maand, eigen).
export async function leesVerslag({ van, tot, onderdelen = {}, nu = vandaag(), keuze = null } = {}) {
  if (!van || !tot || van > tot) throw new Error('periode');
  const aan = Object.fromEntries(VERSLAG_ONDERDELEN.map((naam) => [naam, onderdelen?.[naam] === true]));

  const periode = begrensPeriode({ van, tot });
  const datums = [];
  for (let d = periode.van; d <= periode.tot; d = plusDagen(d, 1)) datums.push(d);
  const eerste = datums[0];
  const laatste = datums.at(-1);
  const binnen = (rij) => rij.datum >= eerste && rij.datum <= laatste;

  const [maaltijden, dranken, dagRijen, wegingen] = await Promise.all([
    db.maaltijden.where('datum').between(eerste, laatste, true, true).toArray(),
    db.dranken.where('datum').between(eerste, laatste, true, true).toArray(),
    db.dagen.where('datum').between(eerste, laatste, true, true).toArray(),
    db.wegingen.toArray(),
  ]);

  const eigenMaaltijden = maaltijden.filter((m) => eigen(m) && isIngevuld(m));
  const eigenDranken = dranken.filter(eigen);
  const eigenDagen = new Map(dagRijen.filter(eigen).map((d) => [d.datum, d]));
  const eigenWegingen = new Set(wegingen.filter(eigen).map((w) => w.datum));

  const volgorde = (m) => MAALTIJDSOORTEN.indexOf(m.soort);
  const dagen = datums.map((datum) => {
    const maaltijdenVanDag = eigenMaaltijden.filter((m) => m.datum === datum).sort((a, b) => (a.tijd ?? '').localeCompare(b.tijd ?? '') || volgorde(a) - volgorde(b));
    const drankenVanDag = eigenDranken.filter((d) => d.datum === datum);
    const dag = eigenDagen.get(datum);
    const bijgehouden = isBijgehouden({
      maaltijden: maaltijdenVanDag.length,
      ml: drankenVanDag.length ? 1 : 0,
      notitie: dag?.notitie ?? '',
      weging: eigenWegingen.has(datum),
    });

    const rij = { datum, leeg: !bijgehouden };
    if (aan.eten) rij.eten = maaltijdenVanDag.map((m) => ({ soort: m.soort, tekst: (m.tekst ?? '').trim() }));
    if (aan.drinken) {
      const perSoort = {};
      const aantalPerSoort = {};
      for (const d of drankenVanDag) {
        perSoort[d.soort] = (perSoort[d.soort] ?? 0) + d.ml;
        aantalPerSoort[d.soort] = (aantalPerSoort[d.soort] ?? 0) + 1;
      }
      rij.drinken = { ml: drankenVanDag.reduce((som, d) => som + d.ml, 0), perSoort, aantalPerSoort };
    }
    if (aan.notities) rij.notitie = (dag?.notitie ?? '').trim();
    return rij;
  });

  const ingevuldeDagen = dagen.filter((d) => !d.leeg).length;
  const drankDagen = datums.map((datum) => ({ datum, ml: eigenDranken.filter((d) => d.datum === datum).reduce((som, d) => som + d.ml, 0) }));
  const mlPerDag = drankDagen.map((d) => d.ml).filter((ml) => ml > 0);
  // BESLISSING 449, dezelfde regel als op Drinken (logica/drinken-week.js): het gemiddelde over alle dagen van de periode die al voorbij zijn (vandaag
  // inbegrepen), een dag zonder drank telt als 0. Niet vooraf op ml afronden: de opmaak rondt één keer af op wat ze toont (R5-05: 1 454,5 ml is 1,45 l).
  const gemiddeldMl = gemiddeldPerDag(drankDagen, nu);

  // Voor de pdf: het totaal aantal maaltijden, het dagdoel en op hoeveel dagen het gehaald is (alleen feiten, geen oordeel).
  const dagdoelMl = Number(await leesInstelling('drinken.dagdoelMl')) || 0;
  const dagdoelDagen = dagdoelMl > 0 ? mlPerDag.filter((ml) => ml >= dagdoelMl).length : 0;
  // noemer: waarvan "X van N dagen" gaat. Gewoon het aantal dagen van de periode; voor "Deze week" (BESLISSING 448) de volle week van 7 dagen,
  // ook al loopt de lijst van dagen maar tot en met vandaag.
  const weekverslag = WEEKKEUZES.has(keuze);
  const noemer = weekverslag ? WEEKDAGEN : datums.length;
  const samenvatting = { dagen: datums.length, noemer, ingevuldeDagen, gemiddeldMl, maaltijden: eigenMaaltijden.length, dagdoelMl, dagdoelDagen };
  const verslag = { van: eerste, tot: laatste, onderdelen: aan, weekverslag, samenvatting, dagen };
  if (aan.gewicht) verslag.gewicht = wegingen.filter((w) => eigen(w) && binnen(w)).sort((a, b) => a.datum.localeCompare(b.datum)).map((w) => ({ datum: w.datum, kg: w.kg }));
  // BESLISSING 333: de laatste weging vóór de periode (voor het verschil bij het kerncijfer van één dag); null als die er niet is
  if (aan.gewicht) {
    const vroeger = wegingen.filter((w) => eigen(w) && w.datum < eerste).sort((a, b) => b.datum.localeCompare(a.datum))[0];
    verslag.vorigeWeging = vroeger ? { datum: vroeger.datum, kg: vroeger.kg } : null;
  }
  return verslag;
}
