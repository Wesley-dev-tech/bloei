// De knop "Delen" van het Dagboek (BESLISSING 372): in dag, week en maand dezelfde regel, op dezelfde plaats onder de datumregel, rechts uitgelijnd.
// Een tik opent Delen met de periode van die dag, week of maand in de route (#/delen/<van>/<tot>); Delen toont meteen het voorbeeld.
import { h } from '../ui/dom.js';
import { knop } from '../ui/componenten.js';
import { t } from '../teksten.js';
import { naarSleutel, plusDagen, vandaag } from '../kern/datum.js';
import { ICOON } from '../ui/iconenkaart.js';

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

// soort: 'dag', 'week' of 'maand' (de toegankelijke naam zegt wat de knop doet)
export function delenRegel(soort, { van, tot }) {
  return h(
    'div',
    { class: 'week__delen' },
    knop(t('delen.titel'), { soort: 'tekst', icoon: ICOON.delen.naam, label: t('dagboek.delen.' + soort), opKlik: () => (window.location.hash = `#/delen/${van}/${tot}`) }),
  );
}
