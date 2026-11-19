// Blijvende opslag, stil (BESLISSING 423 AN-01, uitgebreid door BESLISSING 440). Op elk toestel (iPhone, iPad, desktop, Android) vraagt Bloei de
// browser bij elke start en na het toelaten van meldingen om de gegevens blijvend te bewaren. De browser beslist zelf en meestal zonder venster.
// Dat kost niets, toont niets en blokkeert niets; Bloei bewaart de uitkomst niet en slikt elke fout in. Nooit een eigen pop-up.
// Niet in Firefox (desktop en Android): die toont de gebruiker zelf een venster, en dat mag nooit vanzelf verschijnen (alleen na een tik,
// zoals op het welkomscherm, src/data/db.js vraagPermanenteOpslag).
import { isFirefox } from '../kern/toestel.js';

export async function vraagBlijvendeOpslagStil(nav = globalThis.navigator) {
  try {
    if (isFirefox(nav)) return false;
    const opslag = nav?.storage;
    if (typeof opslag?.persist !== 'function') return false;
    if (typeof opslag.persisted === 'function' && (await opslag.persisted())) return true;
    return Boolean(await opslag.persist());
  } catch {
    return false;
  }
}
