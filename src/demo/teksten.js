// De teksten die alleen de demo gebruikt (BESLISSING 364, 673, 674). Dit bestand wordt alleen in de demo geladen (via balk.js en profiel.js),
// zodat deze zinnen niet in de bundel van de echte app staan. Lezen met dt('balk'), zoals t('...') voor de gewone teksten.
// In src/teksten.js staan onder 'demo' alleen de zinnen die ook gedeelde schermen in een demotak gebruiken.
export const DEMO_TEKSTEN = {
  regio: 'Demo',
  privacyRegel5: 'In de demo blijft alles staan. In de echte app wist Profiel verwijderen alles van dit toestel.',
  privacyRegel6: 'In de demo is het weer een voorbeeld. De echte app gebruikt je locatie voor het weer waar je bent.',
  // BESLISSING 674: eerlijk zeggen dat wat je wijzigt niet blijft staan. De korte zin staat er onder 560 px.
  balk: 'Demo · probeer gerust alles, niets blijft bewaard',
  balkKort: 'Demo · niets blijft bewaard',
  opnieuw: 'Opnieuw beginnen',
  opnieuwLabel: 'Opnieuw beginnen: alle gegevens wissen en de voorbeeldgegevens terugzetten',
  zeker: 'Alles wissen en opnieuw vullen?',
  ja: 'Ja',
  nee: 'Nee',
  bezig: 'Bezig met opnieuw vullen',
  // BESLISSING 673: "Profiel verwijderen" wist in de demo niets; dit kaartje zegt waarom en wat de knop in de echte app doet.
  profielTitel: 'Dit is de demo',
  profielTekst: 'Het profiel van {naam} blijft hier staan. In de echte app verwijder je met deze knop je profiel en al je gegevens van je toestel.',
  profielKnop: 'Begrepen',
  // BESLISSING 675: onder Rondleiding een rij die het welkomscherm als voorbeeld toont; er wordt niets bewaard.
  voorbeeldTitel: 'Zo begint een nieuwe gebruiker',
  // Kort: op een telefoon staat de knop ernaast en de uitleg mag hoogstens drie regels zijn (de langere zin werd afgekapt).
  voorbeeldTekst: 'Vijf stappen, er wordt niets bewaard.',
  voorbeeldKnop: 'Toon het me',
  voorbeeldKnopLabel: 'Toon het me: zo begint een nieuwe gebruiker',
  // De balk tijdens het voorbeeld: wat dit is en de weg terug. De korte zin staat er onder 560 px.
  voorbeeldBalk: 'Voorbeeld · zo begint een nieuwe gebruiker, niets wordt bewaard',
  voorbeeldBalkKort: 'Voorbeeld · niets wordt bewaard',
  voorbeeldTerug: 'Terug naar de demo',
  // BESLISSING 711: het zwevende knopje op het laagste scherm (320 x 480), met een pijltje naar links; de schermlezer hoort "Terug naar de demo".
  // Niet "Terug": het welkomscherm heeft vanaf stap 2 zelf een knop Terug (naar de vorige stap).
  voorbeeldTerugKort: 'Demo',
  // "Vergrendeling instellen" in het voorbeeld: het kaartje "Dit is de demo" met deze tekst.
  voorbeeldSlot: 'In de echte app kies je hier je code. In de demo blijft Bloei open.',
  // Na de laatste stap, terug op Rondleiding.
  voorbeeldKlaar: 'Er is niets bewaard: {naam} staat er nog.',
};

// Zoals t() in src/teksten.js: de tekst met {plaatshouders} ingevuld; een ontbrekende sleutel geeft de sleutel terug, met een waarschuwing.
export function dt(sleutel, waarden = {}) {
  let tekst = DEMO_TEKSTEN[sleutel];
  if (typeof tekst !== 'string') {
    console.warn('Tekst ontbreekt:', 'demo.' + sleutel);
    return sleutel;
  }
  for (const [naam, waarde] of Object.entries(waarden)) tekst = tekst.replaceAll('{' + naam + '}', waarde);
  return tekst;
}
