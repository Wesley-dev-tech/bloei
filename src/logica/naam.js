// De naam van de gebruiker (instelling 'profiel.naam'). Er is geen standaardnaam: de app vraagt de naam op het welkomscherm, en is er
// toch geen (leeg of alleen spaties), dan vallen alle schermen terug op "geen naam": een begroeting zonder aanspreking, een zin zonder
// naam, "Je verslag" en een neutraal icoon in de profielcirkel. Eén plek, zodat elk scherm dezelfde regel volgt.

// De kale voornaam: het eerste woord van de naam, of '' als er geen naam is.
export function voornaamVan(naam) {
  return String(naam ?? '').trim().split(/\s+/)[0] || '';
}

// De letter in de profielcirkel: de eerste letter van de naam, in hoofdletter. Zonder naam '' (dan toont de cirkel een neutraal icoon).
export function initiaalVan(naam) {
  const kaal = String(naam ?? '').trim();
  return kaal ? [...kaal][0].toLocaleUpperCase('nl-BE') : '';
}

// Het deel van een begroeting vóór de naam ("Goeiemorgen,"). Zonder naam vervalt de komma: "Goeiemorgen".
export function groetVoor(groet, voornaam) {
  const kaal = String(groet ?? '').trim();
  return voornaam ? kaal : kaal.replace(/[,\s]+$/, '');
}
