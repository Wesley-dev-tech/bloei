// BESLISSING 638: kan Bloei niet bevestigen met de bewaarde sleutel van het slot (methode Face ID; bijvoorbeeld omdat ze uit de sleutelhanger of
// het wachtwoordbeheer verwijderd is), dan valt het terug op de eenmalige bevestiging met het toestel (passkey.js, bevestigMetToestel zonder
// passkeyId: een nieuwe sleutel voor één keer, userVerification 'required', meteen weer vergeten). Voor het herstel van de code (541) en voor
// het wissen vanuit het slot (631).
//
// Waarom niet meteen automatisch: WebAuthn wil dat elke vraag in een tik van de gebruiker vertrekt. Een tweede vraag vlak na een mislukte eerste
// kan geweigerd worden (vooral Safari op iOS). Daarom: mislukt de vraag met de bewaarde sleutel, dan meldt de oproeper een rustige zin en neemt
// DEZELFDE knop bij de volgende tik de eenmalige weg. Zo werkt het op elk platform.
// Een mislukte get zegt niet waarom (annuleren of een verdwenen sleutel geven allebei NotAllowedError, bewust, voor de privacy). Ook na annuleren
// neemt de volgende tik dus de eenmalige weg. Dat verlaagt de drempel niet: die vraagt precies dezelfde gebruikersverificatie van het toestel
// (Face ID, vingerafdruk of de toestelcode) en het antwoord gaat door dezelfde strenge controle (passkey.js, controleerBevestiging: challenge,
// origin, rpIdHash, UP en UV, bij create ook AT en het id). Een mislukte vraag wijzigt nooit iets.
//
// De stand geldt zolang het slot dicht is in deze pagina: ontgrendelen (slot.js) of herladen begint weer met de bewaarde sleutel.
// Dit bestand raakt de DOM niet (ook te testen zonder browser).
import { bevestigMetToestel } from './passkey.js';

let terugval = false;

// true als de volgende vraag de eenmalige weg neemt.
export const neemtTerugval = () => terugval;

// Weer met de bewaarde sleutel beginnen (het slot ging open).
export function vergeetTerugval() {
  terugval = false;
}

// Vraagt het toestel om te bevestigen. passkeyId: de passkey van het slot (methode Face ID) of null.
// Geeft { ok, terugval }: ok alleen als het toestel bevestigde (precies true); terugval true als net de vraag met de bewaarde sleutel mislukte
// en de volgende tik de eenmalige weg neemt (de oproeper zegt dat dan met een rustige zin). Nooit een uitzondering.
// bevestig wordt zonder await ervoor aangeroepen, nog in de tik zelf (een browser vraagt voor WebAuthn een handeling van de gebruiker).
export async function bevestigMetTerugval({ passkeyId = null, bevestig = bevestigMetToestel } = {}) {
  const metSleutel = Boolean(passkeyId) && !terugval;
  let ok = false;
  try {
    ok = (await bevestig({ passkeyId: metSleutel ? passkeyId : null })) === true;
  } catch {
    ok = false;
  }
  if (ok || !metSleutel) return { ok, terugval: false };
  terugval = true;
  return { ok: false, terugval: true };
}
