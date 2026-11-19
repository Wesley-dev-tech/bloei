// Een uitzonderlijk lang woord in een naam (bijvoorbeeld een supplement van één woord van 61 tekens).
// Een gewoon woord breekt in de app nooit midden af, ook niet als het in een smalle kolom over de rand loopt;
// alleen een naam met een woord langer dan de grens krijgt de klasse is-langwoord (overflow-wrap: anywhere).
// De grens: echte Nederlandse en farmaceutische woorden blijven eronder ("Magnesiumbisglycinaat" 21 tekens, "Methyltetrahydrofolaat" 22),
// en een woord erboven past op een telefoon van 320 breed niet meer binnen de pagina: gemeten 18 november, de naam begint op 30 px en
// "Magnesiumbisglycinaat" is 244 px breed (ongeveer 11,6 px per teken), dus vanaf ongeveer 25 tekens loopt een woord over de rand van 320 px.
export const LANGWOORD_GRENS = 24;

/** Waar als een woord (gesplitst op witruimte en op een gewoon streepje) langer is dan de grens. */
export function heeftLangWoord(tekst, grens = LANGWOORD_GRENS) {
  if (tekst == null) return false;
  return String(tekst)
    .split(/[\s-]+/)
    .some((woord) => woord.length > grens);
}
