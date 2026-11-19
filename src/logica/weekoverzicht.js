import { isBijgehouden } from './bijgehouden.js';

// Pure functie: samenvatting van één week. PLAN.md §6.3, beslissingen 50 tot 52.
// Geen gewicht en geen vergelijking met de week ervoor.

// De meest voorkomende waarde. Bij een gelijke stand wint de waarde van de recentste dag.
function meestVoorkomend(dagenOpDatum, veld) {
  const aantal = new Map();
  for (const dag of dagenOpDatum) {
    const waarde = dag[veld];
    if (waarde == null) continue;
    aantal.set(waarde, (aantal.get(waarde) ?? 0) + 1);
  }
  if (aantal.size === 0) return null;
  const hoogste = Math.max(...aantal.values());
  // Van recent naar oud: de eerste waarde met de hoogste stand is de recentste.
  for (const dag of [...dagenOpDatum].reverse()) {
    if (dag[veld] != null && aantal.get(dag[veld]) === hoogste) return dag[veld];
  }
  return null;
}

// dagen: { datum, maaltijden: number, ml: number, stemming, energie, supplementen?: { genomen, totaal } }[]
export function vatSamen(dagen) {
  const opDatum = [...dagen].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  const metInname = (dag) => (dag.supplementen?.genomen ?? 0) > 0;
  // Een dag is bijgehouden zodra er iets genoteerd is (BESLISSING 168): één regel voor de hele app, in bijgehouden.js.
  const ingevuld = opDatum.filter((dag) => isBijgehouden({ maaltijden: dag.maaltijden, ml: dag.ml, innames: dag.supplementen?.genomen ?? 0, stemming: dag.stemming, energie: dag.energie, notitie: dag.notitie, weging: dag.weging }));
  // Geen gemiddelde hier (BESLISSING 456): het werd nergens getoond; het gemiddelde per dag komt overal uit gemiddeldPerDag (logica/drinken-week.js).

  return {
    ingevuldeDagen: ingevuld.length,
    supplementDagen: opDatum.filter(metInname).length,
    // Dagen waarop alle momenten van de supplementen afgevinkt waren (BESLISSING 150).
    supplementVolleDagen: opDatum.filter((dag) => (dag.supplementMomenten?.totaal ?? 0) > 0 && dag.supplementMomenten.klaar === dag.supplementMomenten.totaal).length,
    stemming: meestVoorkomend(opDatum, 'stemming'),
    energie: meestVoorkomend(opDatum, 'energie'),
    dagen,
  };
}
