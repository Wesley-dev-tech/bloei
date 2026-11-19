// BESLISSING 205: het kaartje bij een medaille blijft binnen de kaart van de motivator (of op een telefoon binnen het venster met 16 px marge),
// alle tekst valt binnen het kaartje, voor alle 34 badges en in beide standen.
import { test, expect } from '@playwright/test';
import { animatiesKlaar } from './wacht.js';
import { wachtTotStil } from './r-wacht.js';

const MATEN = [
  { naam: '1720', breedte: 1720, hoogte: 950, aanraking: false },
  { naam: '1280', breedte: 1280, hoogte: 800, aanraking: false },
  { naam: '390', breedte: 390, hoogte: 844, aanraking: true },
  { naam: '360', breedte: 360, hoogte: 760, aanraking: true },
];

// Meet het open kaartje: de rechthoek, en of elk kind binnen het kaartje valt zonder afkappen.
const meetKaartje = (page, grens) =>
  page.evaluate((g) => {
    const tip = [...document.querySelectorAll('.medaille-tip')].find((e) => getComputedStyle(e).display !== 'none');
    if (!tip) return { gevonden: false };
    const r = tip.getBoundingClientRect();
    const kaart = g === 'kaart' ? document.querySelector('.voortgang').getBoundingClientRect() : { left: 16, right: window.innerWidth - 16, top: 0, bottom: window.innerHeight };
    const kinderen = [...tip.children].map((k) => {
      const kr = k.getBoundingClientRect();
      return { klasse: k.className, binnen: kr.left >= r.left - 0.5 && kr.right <= r.right + 0.5 && kr.top >= r.top - 0.5 && kr.bottom <= r.bottom + 0.5, past: k.scrollWidth <= k.clientWidth + 1 };
    });
    return { gevonden: true, rect: [r.left, r.right, r.top, r.bottom].map(Math.round), grens: [kaart.left, kaart.right].map(Math.round), binnenGrens: r.left >= kaart.left - 0.5 && r.right <= kaart.right + 0.5, binnenVenster: r.left >= 0 && r.right <= window.innerWidth, kinderen, breedte: Math.round(r.width) };
  }, grens);

for (const m of MATEN) {
  test.describe(`motivator ${m.naam}`, () => {
  if (!m.aanraking) test.use({ hasTouch: false, isMobile: false });
  test(`Medaillekaartje in de motivator, ${m.naam} px: binnen de kaart (of het venster), alle tekst binnen het kaartje`, async ({ page }) => {
    await page.setViewportSize({ width: m.breedte, height: m.hoogte });
    await page.goto('./#/drinken');
    await page.locator('.drankknop[data-soort="water"]').first().click(); // de eerste dag levert een badge op
    await page.goto('./#/vandaag');
    const medailles = page.locator('.badgeblok .medaille-hover:visible');
    await expect(medailles.first()).toBeVisible();
    await page.waitForTimeout(1800); // de kaarten komen eerst op (komOp)
    const n = await medailles.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n; i++) {
      const wissel = medailles.nth(i);
      if (m.aanraking) await wissel.tap();
      else await wissel.hover();
      await expect(page.locator('.medaille-hover.is-zicht')).toHaveCount(1);
      // het kaartje schuift zacht op zijn plek: meten als die overgang voorbij is en de maat niet meer verandert
      await animatiesKlaar(page);
      const uit = await wachtTotStil(page, () => meetKaartje(page, m.aanraking ? 'venster' : 'kaart'));
      expect(uit.gevonden).toBe(true);
      expect(uit.binnenGrens, `kaartje ${i} binnen de grens ${JSON.stringify(uit.rect)} ${JSON.stringify(uit.grens)}`).toBe(true);
      expect(uit.binnenVenster).toBe(true);
      for (const k of uit.kinderen) {
        expect(k.binnen, `${k.klasse} binnen het kaartje`).toBe(true);
        expect(k.past, `${k.klasse} past`).toBe(true);
      }
      if (m.aanraking) await page.locator('.vandaag h1').tap();
      else await page.mouse.move(2, 2);
      await expect(page.locator('.medaille-hover.is-zicht')).toHaveCount(0);
    }
  });
  });
}

test.describe('Badges', () => {
test.use({ hasTouch: false, isMobile: false });
test('Medaillekaartje op het scherm Badges: alle 34 badges, behaald en nog te behalen, tekst binnen het kaartje (1280 px)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/drinken');
  await page.locator('.drankknop[data-soort="water"]').first().click();
  await page.goto('./#/meer/badges');
  const kaarten = page.locator('.medaillekaart .medaille-hover');
  await expect(kaarten.first()).toBeVisible();
  await page.waitForTimeout(1500); // het scherm tekent zich nog een keer (nieuwe badges worden als gezien gemarkeerd)
  const n = await kaarten.count();
  expect(n).toBeGreaterThanOrEqual(30);
  for (let i = 0; i < n; i++) {
    await kaarten.nth(i).scrollIntoViewIfNeeded();
    await kaarten.nth(i).hover();
    await expect(page.locator('.medaille-hover.is-zicht')).toHaveCount(1);
    // het kaartje schuift zacht op zijn plek: meten als die overgang voorbij is en de maat niet meer verandert
    await animatiesKlaar(page);
    const uit = await wachtTotStil(page, () => meetKaartje(page, 'venster-breed'));
    expect(uit.gevonden, `kaartje ${i} gevonden`).toBe(true);
    expect(uit.binnenVenster, `kaartje ${i} binnen het venster`).toBe(true);
    for (const k of uit.kinderen) {
      expect(k.binnen, `kaartje ${i}: ${k.klasse} binnen`).toBe(true);
      expect(k.past, `kaartje ${i}: ${k.klasse} past`).toBe(true);
    }
    await page.mouse.move(2, 2);
  }
});
});

// Het kaartje sluit met Escape en met een tik of klik ernaast.
test.describe('Kaartje sluiten, muis', () => {
  test.use({ hasTouch: false, isMobile: false });
  test('Escape sluit het kaartje bij hover', async ({ page }) => {
    await page.setViewportSize({ width: 1720, height: 950 });
    await page.goto('./#/vandaag');
    const medaille = page.locator('.badgeblok .medaille-hover:visible').first();
    await expect(medaille).toBeVisible();
    await page.waitForTimeout(1500);
    await medaille.hover();
    await expect(page.locator('.medaille-hover.is-zicht')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.medaille-hover.is-zicht')).toHaveCount(0);
  });
});

test('een tik ernaast sluit het kaartje op een telefoon', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/vandaag');
  const medaille = page.locator('.badgeblok .medaille-hover:visible').first();
  await expect(medaille).toBeVisible();
  await page.waitForTimeout(1500);
  await medaille.tap();
  await expect(page.locator('.medaille-hover.is-zicht')).toHaveCount(1);
  await page.locator('.vandaag h1').tap();
  await expect(page.locator('.medaille-hover.is-zicht')).toHaveCount(0);
});
