// Pure functies: dagen bijgehouden en de lopende reeks. PLAN.md §6.3, beslissingen 45 en 46.
// "Bijgehouden" volgt BESLISSING 168 (logica/bijgehouden.js): er staat die dag iets genoteerd. Het bepalen daarvan (en het weglaten
// van oude voorbeelddata) gebeurt in data/statistiek.js; hier komen alleen datums binnen.
import { plusDagen, weekStart } from '../kern/datum.js';

// Het aantal verschillende bijgehouden dagen.
export function dagenBijgehouden(bijgehoudenDatums) {
  return new Set(bijgehoudenDatums).size;
}

// De lopende reeks, met één vergeven dag per kalenderweek (maandag tot en met zondag).
// - Start bij vandaag; is vandaag niet bijgehouden, dan bij gisteren: vandaag telt nooit als gemist.
// - Terug in de tijd: bijgehouden = reeks + 1. Niet bijgehouden = vergeven als die week nog geen
//   vergeven dag heeft, anders stopt de reeks. Een vergeven dag telt zelf niet mee.
// - Vóór de eerste bijgehouden dag ooit stopt de reeks ook.
export function lopendeReeks(bijgehoudenDatums, vandaagSleutel) {
  const dagen = new Set(bijgehoudenDatums);
  if (dagen.size === 0) return 0;
  const eerste = [...dagen].sort()[0];

  let dag = dagen.has(vandaagSleutel) ? vandaagSleutel : plusDagen(vandaagSleutel, -1);
  const vergevenWeken = new Set();
  let reeks = 0;

  while (dag >= eerste) {
    if (dagen.has(dag)) {
      reeks += 1;
    } else {
      const week = weekStart(dag);
      if (vergevenWeken.has(week)) break;
      vergevenWeken.add(week);
    }
    dag = plusDagen(dag, -1);
  }
  return reeks;
}
