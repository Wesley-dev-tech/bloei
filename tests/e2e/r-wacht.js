// Wachten op een toestand in plaats van op een vaste tijd (R4-31), aanvullend op de gedeelde hulpen in wacht.js.
// Gebruikt door de a-, b-, r-, c- en x-specs.
import { expect } from '@playwright/test';

// wachtOpRust: de gedeelde hulp animatiesKlaar uit wacht.js (geen eindige animatie of overgang loopt nog, daarna twee beeldjes).
export { animatiesKlaar as wachtOpRust } from './wacht.js';

// Wacht tot een meting (een functie die in de test iets meet en een JSON-baar resultaat geeft) twee keer na elkaar hetzelfde
// geeft, met telkens een beeldje ertussen. Geeft de stabiele meting terug.
export async function wachtTotStil(page, meet, { timeout = 8000 } = {}) {
  let vorige;
  let laatste;
  await expect
    .poll(
      async () => {
        await page.evaluate(() => new Promise((klaar) => requestAnimationFrame(() => klaar())));
        laatste = await meet();
        const nu = JSON.stringify(laatste);
        const stil = nu === vorige;
        vorige = nu;
        return stil;
      },
      { timeout, intervals: [50, 100, 100, 200] },
    )
    .toBe(true);
  return laatste;
}

// Wacht tot een functie in de pagina waar wordt; de functie mag een Promise teruggeven (een IndexedDB-vraag).
// LET OP: page.waitForFunction wacht NIET op een Promise: een Promise-object is "waar" en de wacht is meteen voorbij (gemeten
// 16 november: waitForFunction(() => new Promise((r) => setTimeout(() => r(false), 10))) slaagt). Daarom expect.poll + evaluate.
export async function wachtTotWaar(page, fn, arg, { timeout = 8000 } = {}) {
  await expect.poll(() => page.evaluate(fn, arg), { timeout, intervals: [50, 100, 100, 200] }).toBe(true);
}

// Wacht tot een instelling echt in de database staat met de verwachte waarde (de schermen tonen een keuze meteen, de opslag
// volgt een paar milliseconden later; een herlading of een ander scherm te vroeg kan de schrijfactie afbreken).
// verwacht: een waarde (vergeleken als JSON) of undefined voor "de rij is weg".
export async function wachtOpInstelling(page, sleutel, verwacht) {
  await wachtTotWaar(
    page,
    ([s, w]) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => klaar(false);
        open.onsuccess = () => {
          const db = open.result;
          const vraag = db.transaction('instellingen').objectStore('instellingen').get(s);
          vraag.onsuccess = () => {
            db.close();
            const rij = vraag.result;
            klaar(w === '__weg__' ? !rij || rij.waarde == null : !!rij && JSON.stringify(rij.waarde) === w);
          };
          vraag.onerror = () => klaar(false);
        };
      }),
    [sleutel, verwacht === undefined ? '__weg__' : JSON.stringify(verwacht)],
  );
}

// De knop die een open maaltijd bewaart, op één plaats: "Klaar" (BESLISSING 412), links van "Annuleren" en "Verwijderen" (BESLISSING 417).
export const BEWAAR_MAALTIJD_TEKST = 'Klaar';
export const BEWAAR_MAALTIJD = { name: BEWAAR_MAALTIJD_TEKST, exact: true };
export const BEWAAR_MAALTIJD_SEL = '.maaltijd__bewaar';

// BESLISSING 419: een maaltijd vul je overal in in een blad boven het scherm (body > .blad.maaltijdblad > dialog.dialoog[open]),
// niet meer in een openklappende regel. maaltijdblad(page) is het open blad van eender welke maaltijd, maaltijdblad(page, 'ontbijt')
// dat van één maaltijd. Het kruisje rechts boven heet "Sluiten" en doet wat "Klaar" doet, net als Escape.
export const maaltijdblad = (page, soort) =>
  page.locator(`body > .blad.maaltijdblad${soort ? `[data-soort="${soort}"]` : ''} > dialog.dialoog[open]`);
// Het bevestigingsvenster dat bovenop het blad opent (Verwijderen): altijd het laatst geopende venster.
export const bovensteVenster = (page) => page.locator('dialog[open]').last();