// De periode achter de knop "Delen" van het Dagboek (BESLISSING 372, herzien): de knop zelf staat in de kop van het
// Dagboek, naast het huisje, net als op de andere tabbladen. Een tik opent Delen met de periode van de dag, week of
// maand die je ziet in de route (#/delen/<van>/<tot>); Delen toont meteen het voorbeeld.
import { naarSleutel, plusDagen, vandaag } from '../kern/datum.js';

// Een periode die tot in de toekomst loopt, eindigt vandaag; een periode die helemaal in de toekomst ligt, blijft zoals ze is (Delen toont dan zijn lege toestand).
function delenPeriode(van, tot) {
  const nu = vandaag();
  return { van, tot: tot > nu && van <= nu ? nu : tot };
}

export const dagPeriode = (datum) => delenPeriode(datum, datum);
export const weekPeriode = (start) => delenPeriode(start, plusDagen(start, 6));
export const maandPeriode = (jaarMaand) => {
  const laatste = naarSleutel(new Date(Number(jaarMaand.slice(0, 4)), Number(jaarMaand.slice(5)), 0));
  return delenPeriode(`${jaarMaand}-01`, laatste);
};
