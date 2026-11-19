// BESLISSING 421: een pop-upvenster op de telefoon is een gecentreerd kadertje met ruimte rondom, niet de volle breedte en niet tegen de onderrand.
// Per formaat (iPhone 390x844, klein 360x740, liggend 844x390) en per soort pop-up (weging, bevestiging, maaltijd, supplementkaart, profiel
// verwijderen): minstens 16 px ruimte links en rechts, het kadertje volledig binnen het scherm, en de laatste knop is bereikbaar (eventueel na
// schuiven binnen het kadertje: in beeld en door niets bedekt).
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { animatiesKlaar, schermKlaar } from './wacht.js';
import { wachtTotStil, maaltijdblad } from './r-wacht.js';

const POPUPS = [
  {
    naam: 'weging',
    open: async (page) => {
      await naar(page, 'gewicht');
      await page.getByRole('button', { name: /Weging noteren/ }).first().click();
    },
  },
  {
    naam: 'maaltijd',
    open: async (page) => {
      await naar(page, 'vandaag');
      await page.locator('.vandaag .maaltijd[data-soort="ontbijt"] > .rij').click();
      await maaltijdblad(page, 'ontbijt').locator('textarea').fill('Yoghurt met fruit'); // met tekst staat ook Verwijderen er (drie knoppen)
      await expect(maaltijdblad(page, 'ontbijt').getByRole('button', { name: 'Verwijderen', exact: true })).toBeVisible();
    },
  },
  {
    naam: 'bevestiging (een maaltijd verwijderen)',
    open: async (page) => {
      await naar(page, 'vandaag');
      await page.locator('.vandaag .maaltijd[data-soort="middagmaal"] > .rij').click();
      await maaltijdblad(page, 'middagmaal').locator('textarea').fill('Soep');
      await maaltijdblad(page, 'middagmaal').getByRole('button', { name: 'Verwijderen', exact: true }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(2);
    },
  },
  {
    naam: 'supplementkaart',
    open: async (page) => {
      await naar(page, 'supplementen');
      await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
    },
  },
  {
    naam: 'profiel verwijderen',
    open: async (page) => {
      await naar(page, 'meer');
      await page.getByRole('button', { name: 'Profiel verwijderen' }).click();
    },
  },
];

async function naar(page, route) {
  await page.goto('./#/' + route);
  await schermKlaar(page, route);
}

for (const [breedte, hoogte] of [[390, 844], [360, 740], [844, 390]]) {
  test.describe(`pop-ups op de telefoon ${breedte}x${hoogte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, isMobile: true, hasTouch: true });

    test(`${breedte}x${hoogte}: elke pop-up is een kadertje met 16 px ruimte links en rechts, binnen het scherm, met een bereikbare laatste knop`, async ({ page }) => {
      await vasteKlok(page);
      const fouten = [];
      for (const p of POPUPS) {
        await p.open(page);
        const venster = page.locator('dialog[open]').last(); // het bovenste venster
        await expect(venster).toBeVisible();
        await animatiesKlaar(page); // het kadertje is opgekomen (pop-in)
        const m = await venster.evaluate((d) => {
          const r = d.getBoundingClientRect();
          return { links: r.left, rechts: innerWidth - r.right, boven: r.top, onder: innerHeight - r.bottom, breed: r.width, hoog: r.height };
        });
        const info = `${p.naam}: ${JSON.stringify(m)}`;
        if (m.links < 16 - 0.5) fouten.push(`${info}: links ${m.links} px ruimte`);
        if (m.rechts < 16 - 0.5) fouten.push(`${info}: rechts ${m.rechts} px ruimte`);
        if (m.boven < -0.5 || m.onder < -0.5) fouten.push(`${info}: valt buiten het scherm`);
        // De laatste zichtbare knop van het venster: binnen het kadertje te bereiken, in beeld, en niets ligt erover.
        const knop = venster.locator('button:visible').last();
        await knop.evaluate((e) => e.scrollIntoView({ block: 'nearest', behavior: 'instant' }));
        await wachtTotStil(page, () => knop.boundingBox());
        const k = await knop.evaluate((e) => {
          const r = e.getBoundingClientRect();
          const x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { tekst: (e.getAttribute('aria-label') || e.textContent).trim(), vrij: x === e || e.contains(x), boven: r.top, onder: r.bottom, links: r.left, rechts: r.right, w: innerWidth, h: innerHeight };
        });
        if (!k.vrij || k.boven < -0.5 || k.onder > k.h + 0.5 || k.links < -0.5 || k.rechts > k.w + 0.5) fouten.push(`${p.naam}: de laatste knop "${k.tekst}" is niet bereikbaar ${JSON.stringify(k)}`);
        // Dicht zonder iets te bewaren: Escape (een bevestiging en het blad eronder)
        while (await page.locator('dialog[open]').count()) {
          const voor = await page.locator('dialog[open]').count();
          await page.keyboard.press('Escape');
          await expect(page.locator('dialog[open]')).toHaveCount(voor - 1);
        }
      }
      expect(fouten).toEqual([]);
    });
  });
}
