// De stand van één dag, voor Vandaag, de motivatiezin en de meldingen. Ook de service worker gebruikt dit (meldingen/stand.js) om de
// tekst van een melding te kiezen: dit bestand blijft daarom klein en importeert niets van de UI (R1-26).
import { db, isEigen } from './db.js';
import { isIngevuld } from './maaltijden.js';
import { weekStart } from '../kern/datum.js';
import { telRooster } from '../logica/supplementen.js';
import { schemaVanDag } from './supplementen.js';
import { isBijgehouden } from '../logica/bijgehouden.js';

export async function dagStatus(datum) {
  const [dag, maaltijden, dranken, weging, schema, innames] = await Promise.all([
    db.dagen.get(datum),
    db.maaltijden.where('datum').equals(datum).toArray(),
    db.dranken.where('datum').equals(datum).toArray(),
    db.wegingen.get(weekStart(datum)),
    schemaVanDag(datum),
    db.momentinnames.where('datum').equals(datum).toArray(),
  ]);
  // Voor "bijgehouden" alleen eigen gegevens, precies zoals eigenBijgehoudenDatums (de reeks): oude voorbeelddata telt nooit mee (BESLISSING 168, R1-07).
  // De andere velden blijven tonen wat op het scherm staat, oude voorbeelddata inbegrepen.
  const eigenDag = isEigen(dag) ? dag : null;
  return {
    maaltijdenIngevuld: maaltijden.filter(isIngevuld).map((m) => m.soort),
    stemming: dag?.stemming ?? null,
    notitie: (dag?.notitie ?? '').trim() !== '',
    ml: dranken.reduce((som, d) => som + d.ml, 0),
    gewogenDezeWeek: Boolean(weging),
    supplementen: telRooster(schema),
    // Is er die dag iets genoteerd (BESLISSING 168)? Dezelfde regel als de reeks; de motivator (kiesZin) steunt hierop.
    bijgehouden: isBijgehouden({
      maaltijden: maaltijden.filter((m) => isEigen(m) && isIngevuld(m)).length,
      ml: dranken.filter(isEigen).reduce((som, d) => som + d.ml, 0),
      innames: innames.filter(isEigen).length,
      stemming: eigenDag?.stemming ?? null,
      energie: eigenDag?.energie ?? null,
      notitie: eigenDag?.notitie ?? '',
      weging: isEigen(weging) && weging.datum === datum,
    }),
  };
}
