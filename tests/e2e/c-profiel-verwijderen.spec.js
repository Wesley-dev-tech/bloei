// BESLISSING 277: na "Profiel verwijderen" (twee keer bevestigen) start de app opnieuw met het welkomscherm.
import { test, expect } from '@playwright/test';

// Telt de rijen per winkel. Bij het opstarten schrijft de app zelf enkele migratievlaggen in instellingen
// (bv. drinken.kanOmgezet); die tellen niet als gegevens van het profiel, alleen de rest van instellingen.
const tel = (page) =>
  page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    const uit = {};
    for (const info of dbs) {
      const open = await new Promise((r) => { const q = indexedDB.open(info.name); q.onsuccess = () => r(q.result); });
      for (const naam of open.objectStoreNames) {
        const alle = await new Promise((r) => { const q = open.transaction(naam).objectStore(naam).getAll(); q.onsuccess = () => r(q.result); });
        uit[naam] = naam === 'instellingen' ? alle.filter((rij) => !/Omgezet$|uitgebreid$/.test(rij.sleutel)).length : alle.length;
      }
      open.close();
    }
    return uit;
  });

test('Profiel verwijderen: twee keer bevestigen geeft het welkomscherm, ook na herladen, en de database is leeg', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/meer/profiel');
  await page.getByRole('textbox', { name: 'Je naam' }).fill('Proef');
  await page.getByRole('heading', { level: 1 }).click();
  // gegevens: een drank en een thema-spiegel
  await page.evaluate(() => localStorage.setItem('bloei-thema', 'donker'));
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag h1')).toContainText('Proef');
  const voor = await tel(page);
  expect(Object.values(voor).some((n) => n > 0)).toBe(true);

  await page.goto('./#/meer');
  await page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Ja, verwijder mijn profiel' }).click();
  const laatste = dlg.getByRole('button', { name: 'Ja, verwijder mijn profiel' });
  await expect(laatste).toBeEnabled({ timeout: 4000 });
  await laatste.click();

  await expect(page).toHaveURL(/#\/welkom$/);
  await expect(page.locator('[data-scherm="welkom"]')).toBeVisible();
  await expect(page.locator('nav, .tabbalk').first()).toBeHidden();
  expect(Object.values(await tel(page)).every((n) => n === 0)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('bloei-thema'))).not.toBe('donker');

  await page.reload();
  await expect(page).toHaveURL(/#\/welkom$/);
  await expect(page.locator('[data-scherm="welkom"]')).toBeVisible();
  expect(Object.values(await tel(page)).every((n) => n === 0)).toBe(true);
});
