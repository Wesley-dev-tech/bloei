// BESLISSING 433: staan weetjes naast elkaar op één rij, dan is de zichtbare ruimte tussen de items overal gelijk (±1 px, minstens 20 px), het
// eerste item op de linker en het laatste op de rechter binnenrand; in een raster gelijke kolombreedtes en gelijke rij-afstanden.
// Elk scherm met weetjes, op 1100, 1280, 1440, 1600, 1690 en 1920 px. De meting en de regels staan in weetjes-rij.js.
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar } from './wacht.js';
import { meetWeetjesRijen, verwachtGelijkeWeetjes } from './weetjes-rij.js';

const SCHERMEN = ['delen', 'drinken', 'gewicht', 'meer/instellingen', 'meer/gewicht', 'meer/uitleg', 'meer/meldingen', 'meer/vergrendeling', 'meer/profiel', 'meer/favorieten'];
const BREEDTES = [1100, 1280, 1440, 1600, 1690, 1920];

test.use({ isMobile: false, hasTouch: false });

for (const breedte of BREEDTES) {
  test(`weetjes ${breedte}x900: gelijke tussenruimte op één rij, of gelijke kolommen en rijen in een raster (BESLISSING 433)`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 900 });
    await vasteKlok(page);
    let gemeten = 0;
    for (const route of SCHERMEN) {
      await page.goto('./#/' + route);
      await schermKlaar(page, route);
      const rijen = await verwachtGelijkeWeetjes(page, '#scherm', `${route} op ${breedte}`);
      gemeten += rijen.length;
    }
    expect(gemeten, 'er zijn weetjesrijen gemeten').toBeGreaterThanOrEqual(3); // Delen, Drinken en Gewicht hebben er zeker één
  });
}

// Op 1600 px en breder staan de weetjes van Delen, Drinken en Gewicht op één rij (de vorm die BESLISSING 433 beschrijft).
for (const breedte of [1600, 1690, 1920]) {
  test(`weetjes ${breedte}: Delen, Drinken en Gewicht staan op één rij`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 900 });
    await vasteKlok(page);
    for (const [route, naam] of [['delen', 'delen__weetjesrij'], ['drinken', 'drinken__weetjesrij'], ['gewicht', 'gewicht__weetjesrij']]) {
      await page.goto('./#/' + route);
      await schermKlaar(page, route);
      const rijen = (await meetWeetjesRijen(page)).filter((r) => r.naam === naam);
      expect(rijen.length, `${route}: een ${naam}`).toBeGreaterThanOrEqual(1);
      const volle = rijen.find((r) => r.items.length >= 4) ?? rijen[0];
      const tops = volle.items.map((i) => Math.round(i.midden));
      expect(Math.max(...tops) - Math.min(...tops), `${route}: alle items op één rij ${JSON.stringify(volle)}`).toBeLessThanOrEqual(1);
    }
  });
}
