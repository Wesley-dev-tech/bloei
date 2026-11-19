// Pure regel voor het dagdoel van drinken (R1-19). Geen database: data/dranken.js leest en schrijft.

// Is het dagdoel met deze tik pas gehaald? Eén keer gehaald blijft gehaald (ook als er later een tik wordt weggehaald), dus alleen
// een dag die het doel nog niet had, telt; dan volgt de viering.
export function isPasGehaald({ doelGehaald, totaal, doelMl }) {
  return !doelGehaald && totaal >= doelMl;
}
