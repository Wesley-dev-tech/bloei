// BESLISSING 219: in de kaart "Deze week" op Supplementen is een dag salie gevuld als alles van het hoofdscherm afgevinkt is.
import { test, expect } from '@playwright/test';
import { wachtTotWaar } from './r-wacht.js'; // page.waitForFunction wacht niet op een Promise
import { vasteKlok } from './vaste-klok.js';

const lokaleDatum = (page, dagen = 0) =>
  page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const t = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${t(d.getMonth() + 1)}-${t(d.getDate())}`;
  }, dagen);

async function wachtOpInnames(page, aantal) {
  await wachtTotWaar(page,
    (n) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => klaar(false);
        open.onsuccess = () => {
          const db = open.result;
          const vraag = db.transaction('momentinnames').objectStore('momentinnames').count();
          vraag.onsuccess = () => {
            db.close();
            klaar(vraag.result === n);
          };
          vraag.onerror = () => klaar(false);
        };
      }),
    aantal,
  );
}

// Eén verzonnen supplement op drie momenten: Ochtend, Middag en Avond.
// BESLISSING 698: een supplement telt vanaf de dag van toevoegen. Wie voorbije dagen wil afvinken, vult "Begint op" in op een vroegere dag
// (zoals een gebruiker); zonder begindatum begint het supplement vandaag.
async function maakSupplement(page, begintOp) {
  await page.goto('./#/supplementen');
  await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
  const blad = page.getByRole('dialog');
  await blad.getByRole('textbox', { name: 'Naam' }).fill('Testmiddel');
  for (const m of ['Middag', 'Avond']) await blad.getByRole('button', { name: m, exact: true }).click();
  if (begintOp) await blad.getByLabel('Begint op').fill(begintOp);
  await blad.getByRole('button', { name: 'Bewaren' }).click();
  await expect(blad).toBeHidden();
}

const salie = (page) =>
  page.evaluate(() => {
    const p = document.createElement('i');
    p.style.background = 'var(--c-health)';
    document.body.append(p);
    const kleur = getComputedStyle(p).backgroundColor;
    p.remove();
    return kleur;
  });
const bol = (page, datum) => page.locator(`.weekkaart--supp .weekdag[data-datum="${datum}"] .weekdag__bol`);
const kleurVan = (l) => l.evaluate((e) => getComputedStyle(e).backgroundColor);

test('Deze week op Supplementen: alleen een dag met alles afgevinkt is salie, ook vandaag via het hoofdscherm', async ({ page }) => {
  // De kaart toont maandag tot zondag; de test heeft drie voorbije dagen in dezelfde week nodig. Vroeger werd hij op maandag tot
  // woensdag overgeslagen (R4-01); nu staat de klok vast op donderdag 12 november 2026, 12:00.
  await vasteKlok(page, { stil: true });
  await page.goto('./#/vandaag');
  const vandaag = await lokaleDatum(page, 0);
  expect(vandaag).toBe('2026-11-12');
  expect(await page.evaluate(() => (new Date().getDay() + 6) % 7), 'donderdag').toBe(3);
  const alles = await lokaleDatum(page, -1);
  const deel = await lokaleDatum(page, -2);
  const niets = await lokaleDatum(page, -3);

  await maakSupplement(page, niets);

  // Voorbije dagen vink je af in het Dagboek.
  const moment = (m) => page.getByRole('checkbox', { name: m });
  await page.goto(`./#/dagboek/dag/${alles}`);
  for (const m of ['Ochtend', 'Middag', 'Avond']) await moment(m).click();
  await wachtOpInnames(page, 3);
  await page.goto(`./#/dagboek/dag/${deel}`);
  await moment('Ochtend').click();
  await wachtOpInnames(page, 4);

  await page.goto('./#/supplementen');
  const kleurSalie = await salie(page);
  await expect(bol(page, alles)).toBeVisible();
  expect(await kleurVan(bol(page, alles))).toBe(kleurSalie);
  expect(await kleurVan(bol(page, deel))).not.toBe(kleurSalie);
  const leeg = await kleurVan(bol(page, niets));
  expect(leeg).not.toBe(kleurSalie);
  expect(await kleurVan(bol(page, deel))).toBe(leeg); // een deel ziet er niet anders uit dan niets
  await expect(page.locator(`.weekkaart--supp .weekdag[data-datum="${alles}"]`)).toHaveAttribute('aria-label', /alles afgevinkt$/);
  await expect(page.locator(`.weekkaart--supp .weekdag[data-datum="${deel}"]`)).toHaveAttribute('aria-label', /nog niet alles afgevinkt$/);
  expect(await kleurVan(bol(page, vandaag))).toBe(leeg);

  // Vandaag: Ochtend, Middag en Avond afvinken op het hoofdscherm
  await page.goto('./#/vandaag');
  for (const m of ['ochtend', 'middag', 'avond']) await page.locator(`.vandaag .momentrij[data-moment="${m}"]`).click();
  await wachtOpInnames(page, 7);
  await page.goto('./#/supplementen');
  expect(await kleurVan(bol(page, vandaag))).toBe(kleurSalie);
  await expect(page.locator(`.weekkaart--supp .weekdag[data-datum="${vandaag}"]`)).toHaveClass(/is-vandaag/);
  if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/weekkaart-390.png`, clip: await page.locator('.weekkaart--supp').boundingBox() });
  await page.reload();
  expect(await kleurVan(bol(page, vandaag))).toBe(kleurSalie);
});

// BESLISSING 698: zonder "Begint op" telt een supplement pas vanaf de dag van toevoegen; gisteren heeft geen vinkvak.
test('Een supplement dat vandaag zonder "Begint op" is toegevoegd, staat niet op de dag van gisteren', async ({ page }) => {
  await vasteKlok(page, { stil: true });
  await page.goto('./#/vandaag');
  const gisteren = await lokaleDatum(page, -1);
  await maakSupplement(page);
  await page.goto(`./#/dagboek/dag/${gisteren}`);
  await expect(page.getByRole('checkbox', { name: 'Ochtend' })).toHaveCount(0);
  await expect(page.getByText('Testmiddel')).toHaveCount(0);
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag .momentrij[data-moment="middag"]')).toBeVisible();
});

// BESLISSING 242: de kaart is enkel een aanduiding, niet aanklikbaar.
test('Deze week op Supplementen is niet interactief: geen link, knop of tabindex, geen navigatie, geen hover-effect', async ({ page }) => {
  await maakSupplement(page);
  await page.goto("./#/supplementen");
  const kaart = page.locator('.weekkaart--supp');
  await expect(kaart).toBeVisible();
  await expect(kaart.locator('.weekdag')).toHaveCount(7);
  await expect(kaart.locator('a, button, [tabindex], [href]')).toHaveCount(0);
  const hash = await page.evaluate(() => location.hash);
  const bolletje = kaart.locator('.weekdag__bol').first();
  const voor = await bolletje.evaluate((e) => getComputedStyle(e).transform);
  await bolletje.hover();
  await bolletje.click();
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  expect(await bolletje.evaluate((e) => getComputedStyle(e).transform)).toBe(voor);
  const dag = kaart.locator('.weekdag').first();
  expect(await dag.evaluate((e) => getComputedStyle(e).transform)).toBe('none');
  expect(await dag.evaluate((e) => getComputedStyle(e).cursor)).not.toBe('pointer');
});

// BESLISSING 244: dagnummers en periode uit de klok; de week schuift mee.
test('Deze week op Supplementen toont de datums van de week en schuift mee met de klok', async ({ page }) => {
  const nummers = () => page.locator('.weekkaart--supp .weekdag__datum').allTextContents();
  await page.clock.setFixedTime(new Date(2026, 10, 14, 10, 0, 0)); // zaterdag 14 november
  await maakSupplement(page);
  await expect(page.locator('.weekkaart--supp .weekdag')).toHaveCount(7);
  expect(await nummers()).toEqual(['09/11', '10/11', '11/11', '12/11', '13/11', '14/11', '15/11']);
  await expect(page.locator('.weekkaart--supp .kaartkop__eind')).toHaveText('9 - 15 november');
  await expect(page.locator('.weekkaart--supp .weekdag').nth(5)).toHaveAttribute('aria-label', /^zaterdag 14 november, /);
  await expect(page.locator('.weekkaart--supp .weekdag.is-vandaag')).toHaveCount(1);
  await expect(page.locator('.weekkaart--supp .weekdag').nth(5)).toHaveClass(/is-vandaag/);
  const letters = await page.locator('.weekkaart--supp .weekdag__letter').evaluateAll((l) => new Set(l.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  const getallen = await page.locator('.weekkaart--supp .weekdag__datum').evaluateAll((l) => new Set(l.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect([letters, getallen]).toEqual([1, 1]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Naar maandag 16 november: de volgende week, de ring op maandag.
  await page.clock.setFixedTime(new Date(2026, 10, 16, 8, 0, 0));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.weekkaart--supp .weekdag__datum').first()).toHaveText('16/11');
  expect(await nummers()).toEqual(['16/11', '17/11', '18/11', '19/11', '20/11', '21/11', '22/11']);
  await expect(page.locator('.weekkaart--supp .weekdag').first()).toHaveClass(/is-vandaag/);
  // Een week over de maandgrens: 30 november tot 6 december.
  await page.clock.setFixedTime(new Date(2026, 10, 30, 9, 0, 0));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.weekkaart--supp .kaartkop__eind')).toHaveText('30 november - 6 december');
  expect(await nummers()).toEqual(['30/11', '01/12', '02/12', '03/12', '04/12', '05/12', '06/12']);
});

test('Deze week op Supplementen: zeven keer dd/mm past op 360 px zonder afbreken of scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await maakSupplement(page);
  const w = page.locator('.weekkaart--supp .weekdag__datum');
  await expect(w).toHaveCount(7);
  expect(await w.evaluateAll((l) => l.every((e) => e.getBoundingClientRect().height < 20 && e.scrollWidth <= e.parentElement.clientWidth + 1 && parseFloat(getComputedStyle(e).fontSize) >= 11))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
