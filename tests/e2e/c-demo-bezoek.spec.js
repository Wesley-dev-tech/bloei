// De demo blijft de demo (BESLISSING 673 en 674): "Profiel verwijderen" wist niets en toont een kaartje; wat een bezoeker wijzigt, blijft niet staan:
// bij een nieuw bezoek (een nieuw tabblad of venster, als er geen ander tabblad van de demo open is) staan Sofie en haar gegevens er weer.
// Herladen in hetzelfde tabblad houdt de wijzigingen; een tweede tabblad maakt het eerste niet leeg.
//   demo:  npm run e2e:demo -- c-demo-bezoek
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar } from './wacht.js';

const LEEG = { cookies: [], origins: [] };

// Leest de demodatabase buiten de app om: een instelling of het aantal rijen van een tabel.
const instelling = (page, sleutel) =>
  page.evaluate(
    (sleutel) =>
      new Promise((klaar, mis) => {
        const q = indexedDB.open('bloei-demo');
        q.onsuccess = () => {
          const r = q.result.transaction('instellingen').objectStore('instellingen').get(sleutel);
          r.onsuccess = () => {
            q.result.close();
            klaar(r.result?.waarde ?? null);
          };
          r.onerror = () => mis(r.error);
        };
        q.onerror = () => mis(q.error);
      }),
    sleutel,
  );
const aantal = (page, tabel) =>
  page.evaluate(
    (tabel) =>
      new Promise((klaar, mis) => {
        const q = indexedDB.open('bloei-demo');
        q.onsuccess = () => {
          const r = q.result.transaction(tabel).objectStore(tabel).count();
          r.onsuccess = () => {
            q.result.close();
            klaar(r.result);
          };
          r.onerror = () => mis(r.error);
        };
        q.onerror = () => mis(q.error);
      }),
    tabel,
  );

async function open(page, pad = 'vandaag') {
  await page.goto('./#/' + pad);
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  await expect(page.locator('.demo-balk')).toBeVisible();
  await schermKlaar(page, pad);
}

// Een echte wijziging met de hand: een andere naam op het scherm Profiel, en een kan water.
async function wijzig(page) {
  await open(page, 'meer/profiel');
  const veld = page.locator('.profiel__naam input');
  await veld.fill('Bezoeker');
  await veld.blur();
  await expect.poll(() => instelling(page, 'profiel.naam')).toBe('Bezoeker');
  await open(page, 'drinken');
  await page.getByRole('button', { name: /Kan water/ }).first().click();
  await expect(page.getByText(/2,25/).first()).toBeVisible();
}

test.describe('de demo blijft de demo', { tag: '@demo' }, () => {
  test.use({ storageState: LEEG });
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  test('673: "Profiel verwijderen" toont het kaartje met één gevulde knop, wist niets en sluit met Begrepen, Escape of een tik ernaast', async ({ page }) => {
    await open(page, 'meer');
    const dranken = await aantal(page, 'dranken');
    const maaltijden = await aantal(page, 'maaltijden');
    const knop = page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' });
    await expect(knop).toBeVisible();

    await knop.click();
    const dlg = page.getByRole('dialog', { name: 'Dit is de demo' });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('Het profiel van Sofie blijft hier staan. In de echte app verwijder je met deze knop je profiel en al je gegevens van je toestel.');
    await expect(dlg.getByRole('button')).toHaveCount(1);
    const begrepen = dlg.getByRole('button', { name: 'Begrepen' });
    await expect(begrepen).toBeFocused();
    await expect(begrepen).toHaveClass(/knop--primair/);
    await begrepen.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(knop).toBeFocused();

    await knop.click();
    await expect(dlg).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await knop.click();
    await expect(dlg).toBeVisible();
    await page.mouse.click(5, 5); // naast het kaartje, op het scherm achter de dialoog
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // niets gewist, ook niet na herladen; nooit het welkomscherm
    await page.reload();
    await expect(page.locator('#scherm[data-scherm="meer"]')).toBeAttached();
    expect(await instelling(page, 'profiel.naam')).toBe('Sofie');
    expect(await instelling(page, 'start.klaar')).toBe(true);
    expect(await aantal(page, 'dranken')).toBe(dranken);
    expect(await aantal(page, 'maaltijden')).toBe(maaltijden);
    await expect(page.locator('.welkom')).toHaveCount(0);
  });

  test('673: een rechtstreeks adres #/welkom en een lege naam brengen het welkomscherm niet terug', async ({ page }) => {
    await open(page);
    await page.goto('./#/welkom');
    await expect(page).toHaveURL(/#\/vandaag$/);
    await expect(page.locator('.welkom')).toHaveCount(0);
    await open(page, 'meer/profiel');
    const veld = page.locator('.profiel__naam input');
    await veld.fill('');
    await veld.blur();
    await expect.poll(() => instelling(page, 'profiel.naam')).toBe('');
    await page.reload();
    await page.goto('./#/welkom');
    await expect(page).toHaveURL(/#\/vandaag$/);
    await expect(page.locator('.welkom')).toHaveCount(0);
  });

  test('674: herladen in hetzelfde tabblad houdt de wijzigingen; een nieuw tabblad (het eerste dicht) zet Sofie en haar gegevens terug', async ({ context, page }) => {
    await open(page);
    await wijzig(page);
    await page.reload();
    await open(page);
    await expect(page.locator('.vandaag h1')).toContainText('Bezoeker');
    await expect(page.locator('.vandaag')).toContainText('2,25');
    await page.close();

    const nieuw = await context.newPage();
    await vasteKlok(nieuw);
    await open(nieuw);
    await expect(nieuw.locator('.vandaag h1')).toHaveText(/^Goeie(morgen|middag|navond), Sofie$/);
    await expect(nieuw.locator('.vandaag')).toContainText('1,45');
    expect(await instelling(nieuw, 'profiel.naam')).toBe('Sofie');
  });

  test('674: een tweede tabblad terwijl het eerste open is, sluit aan bij hetzelfde bezoek en maakt het eerste niet leeg', async ({ context, page }) => {
    await open(page);
    await wijzig(page);
    const tweede = await context.newPage();
    await vasteKlok(tweede);
    await open(tweede);
    await expect(tweede.locator('.vandaag h1')).toContainText('Bezoeker');
    await expect(tweede.locator('.vandaag')).toContainText('2,25');
    await open(page);
    await expect(page.locator('.vandaag h1')).toContainText('Bezoeker');
    // het eerste dicht, het tweede herladen: nog altijd hetzelfde bezoek
    await page.close();
    await tweede.reload();
    await open(tweede);
    await expect(tweede.locator('.vandaag h1')).toContainText('Bezoeker');
    // ook het tweede dicht: een nieuw tabblad begint opnieuw
    await tweede.close();
    const derde = await context.newPage();
    await vasteKlok(derde);
    await open(derde);
    await expect(derde.locator('.vandaag h1')).toContainText('Sofie');
  });

  test('674 en L4: een bezoek eindigt bij de dagwissel, ook terwijl een tweede tabblad open staat; beide tabbladen tonen daarna Sofie', async ({ context, page }) => {
    await open(page);
    await wijzig(page);
    const tweede = await context.newPage();
    await vasteKlok(tweede);
    await open(tweede);
    await expect(tweede.locator('.vandaag h1')).toContainText('Bezoeker');
    await open(page);

    // Een dag later, in beide tabbladen: de app meldt de dagwissel, het bezoek eindigt, het tweede tabblad herlaadt zacht.
    const DAG = 24 * 60 * 60 * 1000;
    await page.clock.fastForward(DAG);
    await tweede.clock.fastForward(DAG);
    await page.clock.runFor(2000);
    await tweede.clock.runFor(2000);
    await expect.poll(() => instelling(page, 'profiel.naam')).toBe('Sofie');
    await expect(page.locator('.vandaag h1')).toHaveText(/^Goeie(morgen|middag|navond), Sofie$/);
    await expect(page.locator('.vandaag')).toContainText('1,45');
    await expect(tweede.locator('.vandaag h1')).toHaveText(/^Goeie(morgen|middag|navond), Sofie$/);
    await expect(tweede.locator('.vandaag')).toContainText('1,45');
    expect(await instelling(tweede, 'profiel.naam')).toBe('Sofie');
    // niet dubbel gevuld: een maal de dranken van de demo
    const dranken = await aantal(page, 'dranken');
    await page.waitForTimeout(500);
    expect(await aantal(tweede, 'dranken')).toBe(dranken);
    // wat daarna gewijzigd wordt, blijft binnen die dag gewoon staan
    await open(page, 'meer/profiel');
    const veld = page.locator('.profiel__naam input');
    await veld.fill('Tweede dag');
    await veld.blur();
    await expect.poll(() => instelling(tweede, 'profiel.naam')).toBe('Tweede dag');
  });

  test('674: een gekozen thema gaat bij een nieuw bezoek terug naar Poeder, zonder het thema van het vorige bezoek te tonen', async ({ context, page }) => {
    await open(page, 'meer');
    await page.locator('.themategel', { hasText: 'Nacht' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'nacht');
    await page.close();
    const nieuw = await context.newPage();
    await vasteKlok(nieuw);
    await open(nieuw);
    await expect(nieuw.locator('html')).not.toHaveAttribute('data-theme', 'nacht');
    expect(await instelling(nieuw, 'thema.keuze')).toBe('poeder');
  });

  test('674: "Opnieuw beginnen" blijft werken binnen een bezoek', async ({ page }) => {
    await open(page);
    await wijzig(page);
    await open(page);
    await page.locator('.demo-balk').getByRole('button', { name: /Opnieuw beginnen/ }).click();
    await Promise.all([page.waitForEvent('load', { timeout: 20000 }), page.locator('.demo-balk').getByRole('button', { name: 'Ja' }).click()]);
    await expect(page).toHaveURL(/#\/vandaag$/);
    await expect(page.locator('.vandaag h1')).toContainText('Sofie');
    await expect(page.locator('.vandaag')).toContainText('1,45');
  });
});
