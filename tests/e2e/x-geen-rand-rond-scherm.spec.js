// De eigenaar (iPhone, Safari): "een gekleurde rand rond een knop of rond een cijfer van het slot". De ring is voor wie met het toetsenbord bedient:
// na een tik (aanraking) en bij een houder met tabindex -1 staat er geen ring; met Tab staat hij er nog wel (basis.css, regels voor focus).
import { test, expect } from '@playwright/test';
import { schermKlaar } from './wacht.js';
import { vasteKlok } from './vaste-klok.js';

test.use({ viewport: { width: 390, height: 660 }, hasTouch: true, isMobile: true });

// De ring van het element met de focus: een outline of een schaduw die geen schaduw van een kaart is (we lezen alleen de outline en de ring in box-shadow met spreiding).
const ring = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    const s = getComputedStyle(a);
    const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    return { tag: a.tagName.toLowerCase(), id: a.id, tabindex: a.getAttribute('tabindex'), outline, schaduw: s.boxShadow };
  });

test.beforeEach(async ({ page }) => {
  await vasteKlok(page);
});

test('een tik op de tabbalk laat geen ring achter, ook niet op de schermhouder', async ({ page }) => {
  await page.goto('./#/vandaag');
  await schermKlaar(page, 'vandaag');
  await page.locator('#tabbalk a[href="#/drinken"]:visible, #zijbalk a[href="#/drinken"]:visible').first().tap();
  await schermKlaar(page, 'drinken');
  const r = await ring(page);
  expect(r.outline, JSON.stringify(r)).toBe(false);
  // een houder met tabindex -1 heeft nooit een ring, ook niet met :focus-visible
  await page.keyboard.press('Shift');
  await page.evaluate(() => document.getElementById('scherm').focus());
  expect((await ring(page)).outline).toBe(false);
});

test('tikken op een rij van Algemeen en terug laat geen ring op een knop achter', async ({ page }) => {
  await page.goto('./#/meer');
  await schermKlaar(page, 'meer');
  await page.locator('#scherm .meer__menu').getByRole('button').first().tap();
  await page.waitForTimeout(400);
  await page.goBack();
  await schermKlaar(page, 'meer');
  await page.waitForTimeout(400);
  const r = await ring(page);
  expect(r.outline, JSON.stringify(r)).toBe(false);
});

test('een toets die met Tab focus krijgt heeft de ring wel', async ({ page }) => {
  await page.goto('./#/vandaag');
  await schermKlaar(page, 'vandaag');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const r = await ring(page);
  expect(['button', 'a', 'input'], JSON.stringify(r)).toContain(r.tag);
  expect(r.outline, JSON.stringify(r)).toBe(true);
});

test('op het slotscherm heeft het cijferblok, ook de toets die bij het openen programmatisch focus krijgt, geen ring', async ({ page }) => {
  await page.goto('./#/meer/vergrendeling');
  await page.getByRole('switch', { name: /^Bloei vergrendelen/ }).click();
  await expect(page.locator('.cijferblok__toets[data-cijfer="0"]')).toBeVisible();
  await page.waitForTimeout(500);
  const open = await ring(page);
  expect(open.outline, JSON.stringify(open)).toBe(false);
  await page.locator('.cijferblok__toets[data-cijfer="7"]').tap();
  const na = await ring(page);
  expect(na.outline, JSON.stringify(na)).toBe(false);
});

test('na een aanraking staat data-bediening op aanraak en heeft een gefocuste knop geen ring; na Tab is hij er weer', async ({ page }) => {
  await page.goto('./#/vandaag');
  await schermKlaar(page, 'vandaag');
  await page.touchscreen.tap(195, 300);
  await expect(page.locator('html')).toHaveAttribute('data-bediening', 'aanraak');
  const knopRing = () =>
    page.evaluate(() => {
      const k = document.querySelector('#scherm button');
      k.focus({ focusVisible: true });
      const s = getComputedStyle(k);
      return { fv: k.matches(':focus-visible'), outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 };
    });
  expect((await knopRing()).outline).toBe(false);
  await page.keyboard.press('Tab');
  await expect(page.locator('html')).toHaveAttribute('data-bediening', 'toetsen');
  const na = await knopRing();
  expect(na.outline, JSON.stringify(na)).toBe(true);
});
