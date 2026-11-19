// BESLISSING 191: elk vak van de motivator op Vandaag doet iets bij een tik.
// Eten opent de maaltijd die aan de beurt is (met de cursor in het tekstvak), Stemming zet de focus op de gevoelschaal,
// Drinken en Supplementen gaan naar hun tabblad. Op 390 en 1280 px.
import { test, expect } from '@playwright/test';
import { maaltijdblad } from './r-wacht.js';

const MATEN = [
  { naam: '390', breedte: 390, hoogte: 844 },
  { naam: '1280', breedte: 1280, hoogte: 800 },
];

const vakken = (page) => page.locator('.motiv__vak');

for (const m of MATEN) {
  test.describe(`Motivator-vakken bij een tik, ${m.naam} px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: m.breedte, height: m.hoogte });
      await page.clock.setFixedTime(new Date(2026, 10, 13, 10, 0, 0));
    });

    // BESLISSING 296: de vier vakken zijn puur informatief; een tik doet niets meer (de oude tikken van BESLISSING 191 zijn vervallen).
    test('de vier vakken zijn statisch: een tik verandert de pagina niet', async ({ page }) => {
      await page.goto('./#/vandaag');
      await expect(vakken(page).first()).toBeVisible();
      const aantal = await vakken(page).count(); // Supplementen staat er alleen als er supplementen zijn
      for (let i = 0; i < aantal; i++) await vakken(page).nth(i).click();
      await expect(page).toHaveURL(/#\/vandaag$/);
      await expect(maaltijdblad(page)).toHaveCount(0); // BESLISSING 419: geen maaltijdblad open
    });
  });
}

// BESLISSING 209: onder een moment van de kaart Supplementen staat geen aantal maar het tijdvak, en na het afvinken het tijdstip.
test('Supplementen op Vandaag: het tijdvak vóór het afvinken, "Genomen om" erna, en na herladen nog', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 13, 9, 5, 0));
  await page.goto('./#/supplementen');
  // BESLISSING 707: de lege kaart heeft ook de knop Lijst importeren; tik op de knop die het eerste supplement toevoegt.
  await page.locator('.supplementen__leegkaart').getByRole('button', { name: 'Eerste supplement toevoegen', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Naam' }).fill('Voorbeeld');
  // Wisselvallig op een drukke machine: het blad moet dicht zijn (bewaard) voor we wegnavigeren, anders ontbreekt de rij op Vandaag.
  await page.getByRole('dialog').getByRole('button', { name: 'Bewaren' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.goto('./#/vandaag');
  const rij = page.locator('.suppkaart .momentrij[data-moment="ochtend"]');
  await expect(rij).toContainText('van 7 tot 12 uur');
  await expect(page.locator('.suppkaart')).not.toContainText(/\d+ supplement/);
  await rij.click();
  await expect(rij).toContainText('Genomen om 9.05 uur');
  await page.reload();
  await expect(page.locator('.suppkaart .momentrij[data-moment="ochtend"]')).toContainText('Genomen om 9.05 uur');
});
