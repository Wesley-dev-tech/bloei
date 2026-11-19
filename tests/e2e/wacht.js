// Wachten op een toestand in plaats van op een vaste tijd (BESLISSING 408: geen korte waitForTimeout).
//   naTekenen(page)          twee animatiekaders: wat een gebeurtenis of scroll in gang zette, is getekend
//   animatiesKlaar(page)     geen eindige animatie of overgang loopt nog (een scherm "komt zacht op"; meten tijdens een
//                            transform geeft verschoven maten). Oneindige animaties (een laadrondje) tellen niet.
//   domRustig(page)          250 ms lang geen enkele wijziging meer in #scherm (het scherm is uitgebouwd)
//   schermKlaar(page, pad)   #scherm toont de route van pad (data-scherm = het patroon zonder parameters), is gevuld,
//                            uitgebouwd (domRustig) en de opkomst is voorbij
// Gebruik: import { schermKlaar, animatiesKlaar, naTekenen } from './wacht.js';
import { expect } from '@playwright/test';

export const naTekenen = (page) => page.evaluate(() => new Promise((klaar) => requestAnimationFrame(() => requestAnimationFrame(klaar))));

export async function animatiesKlaar(page, { timeout = 8000 } = {}) {
  await page.waitForFunction(
    () =>
      document.getAnimations().every((a) => {
        if (a.playState !== 'running') return true;
        const eind = a.effect?.getComputedTiming?.().endTime;
        return !Number.isFinite(eind);
      }),
    null,
    { timeout },
  );
  await naTekenen(page);
}

// De naam in data-scherm: het patroon van de route zonder parameters (src/app.js). dagboek/maand en drinken/2026-11-12 heten
// dus "dagboek" en "drinken"; meer/instellingen blijft "meer/instellingen".
export function schermNaam(pad) {
  const [eerste, tweede] = pad.replace(/^#?\/?/, '').split('/');
  if (tweede && eerste === 'meer') return `meer/${tweede}`;
  return eerste;
}

// Het scherm is uitgebouwd: een tijd (rust, standaard 250 ms) lang verandert er niets meer in #scherm (geen knopen, geen attributen).
// Sommige schermen bouwen na de eerste tekening verder (Delen maakt het vel klaar, Uitleg vult zijn lijst): wie dan al met Tab
// of een meting begint, valt tussen twee versies. Faalt na timeout als het scherm blijft veranderen.
export async function domRustig(page, { rust = 250, timeout = 8000 } = {}) {
  await page.evaluate(
    ({ rust, timeout }) =>
      new Promise((klaar, mislukt) => {
        const doel = document.querySelector('#scherm') || document.body;
        let laatste = performance.now();
        const waarnemer = new MutationObserver(() => (laatste = performance.now()));
        waarnemer.observe(doel, { subtree: true, childList: true, attributes: true, characterData: true });
        const begin = performance.now();
        const kijk = () => {
          const nu = performance.now();
          if (nu - laatste >= rust) {
            waarnemer.disconnect();
            klaar();
          } else if (nu - begin > timeout) {
            waarnemer.disconnect();
            mislukt(new Error(`#scherm bleef ${timeout} ms lang veranderen`));
          } else requestAnimationFrame(kijk);
        };
        requestAnimationFrame(kijk);
      }),
    { rust, timeout },
  );
}

export async function schermKlaar(page, pad) {
  const scherm = page.locator(`#scherm[data-scherm="${schermNaam(pad)}"]`);
  await expect(scherm).toBeAttached();
  await expect(scherm).not.toBeEmpty();
  await domRustig(page);
  await animatiesKlaar(page);
}
