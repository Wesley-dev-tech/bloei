// Welkom: de eerste start (BESLISSING 115 tot 124, 277). De config zet voor alle andere tests de spiegel 'bloei-start-klaar';
// hier staat die uit, zodat een lege database echt het welkomscherm geeft.
import { test, expect } from '@playwright/test';
import { animatiesKlaar } from './wacht.js';
import { wachtTotStil } from './r-wacht.js';

test.use({ storageState: { cookies: [], origins: [] } });

const kaart = (page) => page.locator('.welkom__kaart');
const verder = (page) => page.getByRole('button', { name: 'Verder' });

async function hoogte(page) {
  return (await kaart(page).boundingBox()).height;
}

test('Een lege database toont het welkomscherm zonder navigatie en met focus op het naamveld', async ({ page }) => {
  const fouten = [];
  page.on('console', (b) => b.type() === 'error' && fouten.push(b.text()));
  page.on('pageerror', (f) => fouten.push(String(f)));
  await page.goto('./');
  await expect(page).toHaveURL(/#\/welkom$/);
  await expect(page.locator('[data-scherm="welkom"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welkom bij Bloei');
  await expect(page.locator('#tabbalk')).toBeHidden();
  await expect(page.locator('#zijbalk')).toBeHidden();
  await expect(page.locator('.schermkop__uitleg, .schermkop__home')).toHaveCount(0);
  await expect(page.getByText('Stap 1 van 4')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Je naam' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Terug' })).toBeHidden();
  // BESLISSING 287: de naam is verplicht: geen Overslaan, Verder uitgeschakeld, de hint komt pas na een poging
  await expect(page.getByRole('button', { name: 'Overslaan' })).toBeHidden();
  await expect(verder(page)).toBeDisabled();
  await expect(page.locator('#welkom-naamhint')).toBeEmpty();
  const veld = page.getByRole('textbox', { name: 'Je naam' });
  await expect(veld).toHaveAttribute('aria-describedby', 'welkom-naamhint');
  await veld.fill('   ');
  await expect(verder(page)).toBeDisabled(); // spaties tellen niet
  await veld.press('Enter');
  await expect(page.getByText('Stap 1 van 4')).toBeVisible();
  await expect(page.locator('#welkom-naamhint')).toHaveText('Vul je voornaam in om verder te gaan.');
  await veld.fill('Testnaam');
  await expect(page.locator('#welkom-naamhint')).toBeEmpty();
  await expect(verder(page)).toBeEnabled();
  await veld.fill('');
  // elders heen gaan lukt niet zolang de start niet klaar is
  await page.goto('./#/gewicht');
  await expect(page).toHaveURL(/#\/welkom$/);
  expect(fouten).toEqual([]);
});

test('Vier stappen doorlopen: naam, 3 l, woensdag, nu geen vergrendeling; daarna Vandaag, en na herladen komt welkom niet terug', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam Achternaam');
  await page.getByRole('textbox', { name: 'Je naam' }).press('Enter'); // Enter gaat verder
  await expect(page.getByText('Stap 2 van 4')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hoeveel wil je drinken?' })).toBeVisible();
  await expect(page.locator('.welkom__stap.is-actief .stapper__waarde')).toHaveText(/2,5/);
  await expect(page.locator('.welkom__stap.is-actief .stapper__waarde')).toBeFocused();
  await page.getByRole('button', { name: 'Terug' }).click();
  await expect(page.getByText('Stap 1 van 4')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Je naam' })).toHaveValue('Testnaam Achternaam');
  await verder(page).click();
  const plus = page.locator('.welkom__stap.is-actief').getByRole('button', { name: /meer|plus|\+/i });
  await plus.click();
  await plus.click();
  await expect(page.locator('.welkom__stap.is-actief .stapper__waarde')).toHaveText(/3/);
  await verder(page).click();
  await expect(page.getByText('Stap 3 van 4')).toBeVisible();
  await page.getByRole('radio', { name: 'wo' }).or(page.getByRole('button', { name: 'wo', exact: true })).first().click();
  await verder(page).click();
  // BESLISSING 444: stap 4, Bloei vergrendelen; "Nu niet" gaat naar Vandaag zonder slot
  await expect(page.getByText('Stap 4 van 4')).toBeVisible();
  await expect(page.locator('.welkom__stap.is-actief')).toContainText('Wil je Bloei vergrendelen?');
  const keuze = page.getByRole('radiogroup', { name: 'Bloei openen met' });
  await expect(keuze.getByRole('radio', { name: 'Pincode' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Vergrendeling instellen' })).toBeVisible();
  await page.getByRole('button', { name: 'Terug' }).click();
  await expect(page.getByText('Stap 3 van 4')).toBeVisible();
  await verder(page).click();
  await expect(page.getByText('Stap 4 van 4')).toBeVisible();
  await page.getByRole('button', { name: 'Nu niet' }).click();

  await expect(page).toHaveURL(/#\/vandaag$/);
  await expect(page.locator('.vandaag h1')).toContainText('Testnaam');
  await expect(page.locator('.vandaag h1')).not.toContainText('Achternaam');
  await expect(page.locator('#tabbalk')).toBeVisible();
  await page.goto('./#/drinken');
  await expect(page.locator('#scherm')).toContainText(/van\s3\sl/);
  await page.goto('./#/gewicht');
  await expect(page.locator('#scherm')).toContainText(/woensdag/i);

  await page.reload();
  await expect(page).toHaveURL(/#\/gewicht$/);
  await page.goto('./#/welkom'); // rechtstreeks surfen naar welkom stuurt door
  await expect(page).toHaveURL(/#\/vandaag$/);
  await page.reload();
  await expect(page.locator('.vandaag h1')).toContainText('Testnaam');
});

test('Alles overslaan geeft de standaarden: 2,5 l en maandag', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
  await verder(page).click();
  for (let i = 0; i < 2; i += 1) await page.getByRole('button', { name: 'Overslaan' }).click();
  await expect(page.getByText('Stap 4 van 4')).toBeVisible(); // BESLISSING 444: de vergrendeling is de vierde stap
  await page.getByRole('button', { name: 'Nu niet' }).click();
  await expect(page).toHaveURL(/#\/vandaag$/);
  await expect(page.locator('.vandaag h1')).toContainText('Testnaam');
  await page.goto('./#/meer/instellingen');
  await expect(page.locator('#scherm')).toContainText(/2,5\sl/);
  const dag = await page.evaluate(
    () =>
      new Promise((klaar) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onsuccess = () => {
          const g = q.result.transaction('instellingen').objectStore('instellingen').get('gewicht.weegdag');
          g.onsuccess = () => klaar(g.result?.waarde);
        };
      }),
  );
  expect(dag).toBe(1);
  await page.reload();
  await expect(page).not.toHaveURL(/welkom/);
});

test('Bestaande gegevens zonder start.klaar: geen welkomscherm', async ({ page }) => {
  await page.goto('./#/welkom'); // opent de database
  await page.evaluate(
    () =>
      new Promise((klaar) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onsuccess = () => {
          const tx = q.result.transaction('dranken', 'readwrite');
          tx.objectStore('dranken').add({ datum: '2026-11-12', soort: 'water', ml: 250, tijd: '10:00' });
          tx.oncomplete = () => { q.result.close(); klaar(); };
        };
      }),
  );
  await page.goto('./#/vandaag');
  await page.reload();
  await expect(page).toHaveURL(/#\/vandaag$/);
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('.welkom')).toHaveCount(0);
});

for (const [breed, hoog] of [[1690, 1230], [390, 844]]) {
  test(`De kaart verspringt niet van hoogte tussen de stappen (${breed}x${hoog}) en blijft gecentreerd`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await page.goto('./');
    const hoogtes = [];
    const knoppenY = [];
    // Vier stappen (BESLISSING 444); op stap 4 heet de hoofdknop "Vergrendeling instellen" in plaats van "Verder".
    const hoofdknop = (i) => (i === 3 ? page.getByRole('button', { name: 'Vergrendeling instellen' }) : verder(page));
    for (let i = 0; i < 4; i += 1) {
      await expect(page.getByText(`Stap ${i + 1} van 4`)).toBeVisible();
      if (i === 0) {
        // ook mét de hint onder het lege naamveld blijft de kaart even hoog
        await page.getByRole('textbox', { name: 'Je naam' }).press('Enter');
        await expect(page.locator('#welkom-naamhint')).not.toBeEmpty();
        if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/stap1-hint-${breed}.png` });
      }
      // meten als de overgang naar deze stap voorbij is en de kaart niet meer van maat verandert (geen vaste wachttijd)
      await animatiesKlaar(page);
      const stil = await wachtTotStil(page, async () => [await hoogte(page), (await hoofdknop(i).boundingBox()).y]);
      hoogtes.push(stil[0]);
      knoppenY.push(stil[1]);
      // Schermafbeeldingen alleen op verzoek (SHOTDIR)
      if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/stap${i + 1}-${breed}.png` });
      if (i === 0) await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
      if (i < 3) await verder(page).click();
    }
    expect(hoogtes).toHaveLength(4);
    expect(Math.max(...hoogtes) - Math.min(...hoogtes)).toBeLessThanOrEqual(1);
    expect(Math.max(...knoppenY) - Math.min(...knoppenY)).toBeLessThanOrEqual(1);
    const b = await kaart(page).boundingBox();
    expect(b.width).toBeLessThanOrEqual(520.5);
    if (breed < 500) expect(b.width).toBeGreaterThan(breed - 50);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('Geen horizontale scroll op 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('./');
  for (let i = 0; i < 4; i += 1) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (i === 0) await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
    if (i < 3) await verder(page).click();
  }
  await expect(page.getByText('Stap 4 van 4')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vergrendeling instellen' })).toBeInViewport();
});

for (const thema of ['poeder', 'salie', 'nacht']) {
  test(`Thema ${thema}: het welkomscherm werkt`, async ({ page }) => {
    await page.setViewportSize({ width: 1690, height: 1230 });
    await page.goto('./');
    await page.evaluate(
      (k) =>
        new Promise((klaar) => {
          const q = indexedDB.open('bloei-dagboek');
          q.onsuccess = () => {
            const tx = q.result.transaction('instellingen', 'readwrite');
            tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: k });
            tx.oncomplete = () => { q.result.close(); klaar(); };
          };
        }),
      thema,
    );
    await page.reload();
    await expect(kaart(page)).toBeVisible();
    if (thema !== 'poeder') await expect(page.locator('html')).toHaveAttribute('data-theme', thema);
    // Schermafbeelding alleen op verzoek (SHOTDIR), na de opkomst van de kaart
    if (process.env.SHOTDIR) {
      await animatiesKlaar(page);
      await page.screenshot({ path: `${process.env.SHOTDIR}/thema-${thema}.png` });
    }
    await expect(page.getByRole('textbox', { name: 'Je naam' })).toBeVisible();
  });
}
