// Wanneer is een dag "bijgehouden"? (BESLISSING 168) Zodra de gebruiker er zelf iets in noteerde: een ingevulde maaltijd, een drank, een inname van een
// supplement, een notitie of een weging. Dit is de enige plek waar dat staat: de reeks, de dagen in het
// weekoverzicht en de maand, de kerncijfers, het verslag en de motivator steunen er allemaal op, zodat ze hetzelfde zeggen.
// Voorbeelddata telt nooit mee; dat regelt wie de gegevens verzamelt (data/statistiek.js).
//
// isBijgehouden({ maaltijden, ml, innames, notitie, weging }) → boolean
//   maaltijden: aantal ingevulde maaltijden · ml: gedronken · innames: aantal afgevinkte innames
//   notitie: tekst of boolean · weging: boolean (er is op die dag gewogen)
export function isBijgehouden({ maaltijden = 0, ml = 0, innames = 0, notitie = '', weging = false } = {}) {
  const heeftNotitie = typeof notitie === 'string' ? notitie.trim() !== '' : Boolean(notitie);
  return maaltijden > 0 || ml > 0 || innames > 0 || heeftNotitie || Boolean(weging);
}
