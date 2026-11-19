// BESLISSING 631 (OWASP-scan, wijzigt 518): "Alles wissen" vanuit het gesloten slot vraagt eerst het slot van het toestel (Face ID, vingerafdruk of
// de toestelcode), via dezelfde weg als het herstel van een vergeten code (passkey.js, bevestigMetToestel, BESLISSING 541). Zo kan wie het toestel
// alleen vasthoudt, het dagboek niet meer in twee tikken vernietigen. De twee vragen op het scherm (Doorgaan, Zeker weten) blijven; het toestel komt
// pas bij de laatste tik op Alles wissen.
// Kan het toestel niet bevestigen (geen platformauthenticator met gebruikersverificatie, een browser zonder WebAuthn), dan kan wissen vanuit het slot
// niet: er is bewust geen andere weg (de eigenaar aanvaardde dat). Met het slot open blijft Profiel verwijderen (meer.js) gewoon werken.
// BESLISSING 638: lukt het niet met de bewaarde sleutel van het slot (methode Face ID), dan neemt de volgende tik de eenmalige bevestiging met het
// toestel (toestelweg.js), met dezelfde gebruikersverificatie en dezelfde controle.
// Dit bestand raakt de DOM niet (ook te testen zonder browser).
import { bevestigMetToestel } from './passkey.js';
import { bevestigMetTerugval } from './toestelweg.js';
import { wisAlles } from '../data/wissen.js';

// Geeft wat er gebeurde:
//   'gewist'     het toestel bevestigde en alles is gewist;
//   'kanNiet'    dit toestel kan niet bevestigen: het toestel wordt niets gevraagd en er wordt niets gewist;
//   'mislukt'    geannuleerd, geweigerd, een time-out of een antwoord dat niet klopt: niets gewist;
//   'terugval'   zoals 'mislukt' (niets gewist), maar het was de vraag met de bewaarde sleutel: de volgende tik neemt de eenmalige weg (638);
//   'afgebroken' het toestel bevestigde, maar het scherm staat er niet meer (nogGeldig): niets gewist;
//   'fout'       het wissen zelf lukte niet (één transactie, wissen.js): de oude toestand blijft.
// metToestel en passkeyId zijn bij het tekenen van het scherm al bekend: bevestig wordt zonder await ervoor aangeroepen, nog in de tik zelf
// (een browser vraagt voor WebAuthn een handeling van de gebruiker).
export async function wisNaToestel({ metToestel, passkeyId = null, nogGeldig = () => true, bevestig = bevestigMetToestel, wis = wisAlles } = {}) {
  if (!metToestel) return 'kanNiet';
  const { ok, terugval } = await bevestigMetTerugval({ passkeyId, bevestig });
  if (!ok) return terugval ? 'terugval' : 'mislukt';
  if (!nogGeldig()) return 'afgebroken';
  try {
    await wis();
  } catch (fout) {
    console.error(fout);
    return 'fout';
  }
  return 'gewist';
}
