// BESLISSING 203: een scherm dat 'vandaag' toont, toont na een dagwissel de nieuwe dag (nul vinkjes, nul glazen), ook als de app open bleef,
// en een nieuw vinkje krijgt de datum van de nieuwe dag. Met een valse klok: eerst dag 1 (avond), dan dag 2 (ochtend), zonder en met herladen.
import { test, expect } from '@playwright/test';
import { maaltijdblad, BEWAAR_MAALTIJD } from './r-wacht.js';

const DAG1 = new Date(2026, 10, 13, 20, 0, 0);
const DAG2 = new Date(2026, 10, 14, 8, 0, 0);

// Leest de datums van alle rijen in een tabel van de database.
const datums = (page, tabel) =>
  page.evaluate(
    (naam) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const db = open.result;
          const vraag = db.transaction(naam).objectStore(naam).getAll();
          vraag.onsuccess = () => {
            db.close();
            klaar(vraag.result.map((r) => r.datum).sort());
          };
        };
      }),
    tabel,
  );

// De app merkt de dagwissel bij terugkeer (focus), zoals bij een geïnstalleerde app die 's ochtends weer openkomt.
const keerTerug = (page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

// Het moment Avond vink je af op Vandaag (BESLISSING 213: op het tabblad Supplementen kan dat niet meer).
const avond = (page) => page.locator('.momentrij[data-moment="avond"]').first();
async function vinkAvondAf(page) {
  await page.goto('./#/vandaag');
  await avond(page).click();
}

async function voegAvondSupplementToe(page) {
  await page.goto('./#/supplementen');
  await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
  const blad = page.getByRole('dialog');
  await blad.getByRole('textbox', { name: 'Naam' }).fill('Voorbeeld avond');
  await blad.getByRole('button', { name: 'Ochtend', exact: true }).click(); // ochtend weg
  await blad.getByRole('button', { name: 'Avond', exact: true }).click();
  await blad.getByRole('button', { name: 'Bewaren' }).click();
  await expect(blad).toBeHidden();
}

test.describe('Dagwissel terwijl de app open blijft', () => {
  test('Supplementen en Vandaag tonen na de dagwissel nul vinkjes, en een nieuw vinkje krijgt de nieuwe datum', async ({ page }) => {
    await page.clock.setFixedTime(DAG1);
    await voegAvondSupplementToe(page);
    await vinkAvondAf(page);
    await expect(avond(page)).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => datums(page, 'momentinnames')).toEqual(['2026-11-13']);

    // Dag 2, zonder herladen: de app komt terug
    await page.clock.setFixedTime(DAG2);
    await keerTerug(page);
    await expect(avond(page)).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.vandaag .momentrij[aria-checked="true"]')).toHaveCount(0);

    // Een vinkje van nu krijgt de datum van dag 2; dat van dag 1 blijft bewaard
    await avond(page).click();
    await expect.poll(() => datums(page, 'momentinnames')).toEqual(['2026-11-13', '2026-11-14']);
  });

  test('met herladen: dag 2 begint met nul vinkjes en nul glazen', async ({ page }) => {
    await page.clock.setFixedTime(DAG1);
    await voegAvondSupplementToe(page);
    await vinkAvondAf(page);
    await page.goto('./#/drinken');
    await page.locator('.drankknop[data-soort="water"]').first().click();
    await expect.poll(() => datums(page, 'dranken')).toEqual(['2026-11-13']);

    await page.clock.setFixedTime(DAG2);
    await page.reload();
    await expect(page.locator('.drinkkaart, .drinkhoofd').first()).toBeVisible();
    await expect(page.locator('.drinkhoofd .cijfer-groot')).toContainText('0');
    await page.goto('./#/vandaag');
    await expect(avond(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('Drinken begint op dag 2 weer op nul, zonder herladen', async ({ page }) => {
    await page.clock.setFixedTime(DAG1);
    await page.goto('./#/drinken');
    await page.locator('.drankknop[data-soort="water"]').first().click();
    await expect(page.locator('.drinkhoofd .cijfer-groot')).not.toContainText(/^0$/);
    await page.goto('./#/vandaag');
    await expect(page.locator('.drinkkaart')).toBeVisible();

    await page.clock.setFixedTime(DAG2);
    await keerTerug(page);
    await page.goto('./#/drinken');
    await expect(page.locator('.drinkhoofd .cijfer-groot')).toContainText('0');
    await expect(page.locator('.drank__weg')).toHaveCount(0);
  });
});

// Schrijven na een dagwissel zonder dat de app het merkt (geen focus-event, geen herteken): de tik schrijft met de datum van het moment van de tik.
test('een tik net na middernacht, vóór de app de dagwissel merkt, schrijft met de nieuwe datum', async ({ page }) => {
  await page.clock.setFixedTime(DAG1);
  await voegAvondSupplementToe(page);
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag .momentrij[data-moment="avond"]')).toBeVisible();
  // De klok springt naar dag 2; er komt geen focus- of zichtbaarheidsevent, de pagina blijft zoals ze was.
  await page.clock.setFixedTime(DAG2);
  await page.locator('.drankknop[data-soort="water"]').first().click();
  await page.locator('.vandaag .momentrij[data-moment="avond"]').click();
  await expect.poll(() => datums(page, 'dranken')).toEqual(['2026-11-14']);
  await expect.poll(() => datums(page, 'momentinnames')).toEqual(['2026-11-14']);
});

// Een maaltijd die net na middernacht op Vandaag wordt ingevuld (de app merkte de dagwissel nog niet) hoort bij de nieuwe dag.
test('een maaltijd net na middernacht, vóór de app de dagwissel merkt, wordt op de nieuwe datum bewaard', async ({ page }) => {
  await page.clock.setFixedTime(DAG1);
  await page.goto('./#/vandaag');
  const regel = page.locator('.maaltijd').first();
  await expect(regel).toBeVisible();
  await page.clock.setFixedTime(DAG2);
  await regel.locator('> .rij').click();
  const blad = maaltijdblad(page); // BESLISSING 419: het invulvenster is een blad
  await blad.locator('textarea').fill('verzonnen havermout');
  await blad.getByRole('button', BEWAAR_MAALTIJD).click();
  await expect(blad).toHaveCount(0);
  await expect.poll(() => datums(page, 'maaltijden')).toEqual(['2026-11-14']);
});
