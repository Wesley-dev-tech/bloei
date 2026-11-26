import { isBijgehouden } from './bijgehouden.js';

// Pure functie: samenvatting van één week. PLAN.md §6.3, beslissingen 50 tot 52.
// Geen gewicht en geen vergelijking met de week ervoor.

// dagen: { datum, maaltijden: number, ml: number, supplementen?: { genomen, totaal } }[]
export function vatSamen(dagen) {
  const opDatum = [...dagen].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  const metInname = (dag) => (dag.supplementen?.genomen ?? 0) > 0;
  // Een dag is bijgehouden zodra er iets genoteerd is (BESLISSING 168): één regel voor de hele app, in bijgehouden.js.
  const ingevuld = opDatum.filter((dag) => isBijgehouden({ maaltijden: dag.maaltijden, ml: dag.ml, innames: dag.supplementen?.genomen ?? 0, notitie: dag.notitie, weging: dag.weging }));
  // Geen gemiddelde hier (BESLISSING 456): het werd nergens getoond; het gemiddelde per dag komt overal uit gemiddeldPerDag (logica/drinken-week.js).

  return {
    ingevuldeDagen: ingevuld.length,
    supplementDagen: opDatum.filter(metInname).length,
    // Dagen waarop alle momenten van de supplementen afgevinkt waren (BESLISSING 150).
    supplementVolleDagen: opDatum.filter((dag) => (dag.supplementMomenten?.totaal ?? 0) > 0 && dag.supplementMomenten.klaar === dag.supplementMomenten.totaal).length,
    dagen,
  };
}
