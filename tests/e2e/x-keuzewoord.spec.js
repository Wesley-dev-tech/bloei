// BESLISSING 468: naast de opschriften "Hoe was je dag?" en "Energie" staat het gekozen woord niet meer herhaald
// (de keuze is al te zien in de rij eronder); een schermlezer hoort de keuze via aria-checked op de gekozen knop.
// Geldt voor Vandaag en voor de dag in het Dagboek. De kaart is met en zonder keuze even hoog.
import { test, expect } from '@playwright/test';

const SCHERMEN = [
  ['Vandaag', './#/vandaag', '.vc--stemming'],
  ['Dagboek', './#/dagboek', '.dag__stemming'],
];

const maten = [[390, 844], [820, 1180], [1280, 800], [1690, 1230]];

for (const [breedte, hoogte] of maten) {
  test.describe(`Keuzewoord ${breedte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, isMobile: breedte < 600, hasTouch: breedte < 600 });

    for (const [naam, pad, kaartSel] of SCHERMEN) {
      test(`${naam}: geen herhaald keuzewoord naast Hoe was je dag? en Energie, gekozen knop is aria-checked, kaart even hoog (${breedte} px)`, async ({ page }) => {
        await page.goto(pad);
        const kaart = page.locator(kaartSel);
        await expect(kaart.locator('.gevoel__optie')).toHaveCount(5);

        const meet = () =>
          page.evaluate((sel) => {
            const k = document.querySelector(sel);
            const rij = k.parentElement;
            const r = (e) => Math.round(e.getBoundingClientRect().height * 100) / 100;
            const kt = k.getBoundingClientRect().top;
            const koppen = [...k.querySelectorAll('.stemming__kop')].map((e) => ({ tekst: e.textContent.trim(), kinderen: e.children.length, top: Math.round((e.getBoundingClientRect().top - kt) * 100) / 100 }));
            const label = [...k.querySelectorAll('.stemming__kop .label')].map((e) => Math.round((e.getBoundingClientRect().top - kt) * 100) / 100);
            return { kaart: r(k), rij: r(rij), buren: [...rij.children].filter((c) => c !== k).map(r), koppen, label, waarden: k.querySelectorAll('.stemming__waarde').length, scroll: document.documentElement.scrollWidth - innerWidth };
          }, kaartSel);

        const zonder = await meet();
        await kaart.locator('.gevoel__optie[data-stap="3"]').click();
        await kaart.locator('.energie__tik').nth(2).click();
        const met = await meet();
        console.log('MEET', naam, breedte, JSON.stringify({ zonder, met }));

        // geen herhaald woord: de kop bevat alleen het opschrift
        for (const m of [zonder, met]) {
          expect(m.waarden).toBe(0);
          expect(m.koppen.map((x) => x.tekst)).toEqual(['Hoe was je dag?', 'Energie']);
          expect(m.koppen.map((x) => x.kinderen)).toEqual([1, 1]);
        }
        // de kaart en de rij springen niet bij het kiezen, en de opschriften blijven staan
        expect(met.kaart).toBe(zonder.kaart);
        expect(met.rij).toBe(zonder.rij);
        expect(met.label).toEqual(zonder.label);
        expect(met.koppen.map((x) => x.top)).toEqual(zonder.koppen.map((x) => x.top));
        expect(met.scroll).toBeLessThanOrEqual(0);

        // de keuze is hoorbaar: de gekozen knop is aria-checked
        await expect(kaart.locator('.gevoel__optie[data-stap="3"]')).toHaveAttribute('aria-checked', 'true');
        await expect(kaart.locator('.gevoel__optie[aria-checked="true"]')).toHaveCount(1);
        await expect(kaart.locator('.energie__tik').nth(2)).toHaveAttribute('aria-checked', 'true');
        await expect(kaart.locator('.energie__tik[aria-checked="true"]')).toHaveCount(1);
        await expect(kaart.getByRole('radiogroup', { name: 'Hoe was je dag?' })).toBeVisible();
      });
    }
  });
}
