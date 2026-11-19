// Het slot met Face ID blijft werken als de automatische vraag bij het openen blijft hangen, en een vraag die het toestel niet kan stellen geeft
// een rustige zin. Nagebootste authenticator uit slot-hulp.js; daarbovenop een laag die get laat hangen of falen (sessionStorage '__fh'):
//   'hang-eerst'     de eerste vraag loopt nooit af (tot ze afgebroken wordt via signal), de volgende slagen;
//   'ongeldig'       elke vraag faalt meteen met InvalidStateError;
//   'annuleer-traag' de gebruiker annuleert na een halve seconde (NotAllowedError).
import { test, expect } from '@playwright/test';
import { TEKSTEN } from '../../src/teksten.js';
import { authenticator, tik, rondAf } from './slot-hulp.js';

const CODE = '123456';
const ZIN = TEKSTEN.slot.faceIdMislukt;

async function laag(page) {
  await page.addInitScript(() => {
    const echt = navigator.credentials.get;
    window.__fhAfgebroken = 0;
    window.__fhMetSignal = 0;
    let eerste = true;
    navigator.credentials.get = (o) => {
      window.__pkAanroepen++;
      if (o?.signal) window.__fhMetSignal++;
      const modus = sessionStorage.getItem('__fh');
      if (modus === 'hang-eerst' && eerste) {
        eerste = false;
        return new Promise((_, mislukt) => {
          o?.signal?.addEventListener('abort', () => {
            window.__fhAfgebroken++;
            mislukt(new DOMException('afgebroken', 'AbortError'));
          });
        });
      }
      if (modus === 'traag-12s') {
        window.__pkAanroepen--; // de echte stub telt zelf
        return new Promise((klaar, mislukt) => {
          let afgebroken = false;
          o?.signal?.addEventListener('abort', () => {
            afgebroken = true;
            window.__fhAfgebroken++;
            mislukt(new DOMException('afgebroken', 'AbortError'));
          });
          setTimeout(() => {
            if (!afgebroken) klaar(echt.call(navigator.credentials, o));
          }, 12000);
        });
      }
      if (modus === 'ongeldig') return Promise.reject(new DOMException('kan niet', 'InvalidStateError'));
      if (modus === 'annuleer-traag') return new Promise((_, mislukt) => setTimeout(() => mislukt(new DOMException('geannuleerd', 'NotAllowedError')), 500));
      window.__pkAanroepen--; // de echte stub telt zelf
      return echt.call(navigator.credentials, o);
    };
  });
}

async function zetSlotAanMetFaceId(page) {
  await page.goto('./#/meer/vergrendeling');
  await page.getByRole('radio', { name: /^Face ID/ }).click();
  await tik(page, CODE);
  await tik(page, CODE);
  await rondAf(page);
  await expect(page.getByRole('switch', { name: /^Bloei vergrendelen/ })).toHaveAttribute('aria-checked', 'true');
}

async function naarSlot(page, modus) {
  await authenticator(page, 'ok');
  await laag(page);
  await zetSlotAanMetFaceId(page);
  await page.evaluate((m) => sessionStorage.setItem('__fh', m), modus);
  await page.reload();
  await expect(page.locator('#slot')).toBeVisible();
  await expect(page.locator('.cijferblok')).toBeVisible();
}

const knop = (page) => page.locator('#slot').getByRole('button', { name: /gebruiken$/ });

test('de automatische vraag blijft hangen: een tik breekt ze af, vraagt opnieuw en het slot gaat open', async ({ page }) => {
  await naarSlot(page, 'hang-eerst');
  await expect.poll(() => page.evaluate(() => window.__pkAanroepen)).toBe(1);
  expect(await page.evaluate(() => window.__fhMetSignal)).toBe(1);
  await knop(page).click();
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#slot')).toBeHidden();
  expect(await page.evaluate(() => [window.__fhAfgebroken, window.__pkAanroepen])).toEqual([1, 2]);
});

test('de automatische vraag loopt 12 seconden en wordt dan beantwoord: ze is niet afgebroken en het slot gaat open', async ({ page }) => {
  test.setTimeout(60000);
  await naarSlot(page, 'traag-12s');
  await page.waitForTimeout(11000);
  await expect(page.locator('#slot')).toBeVisible();
  await expect(page.locator('#tabbalk')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#slot')).toBeHidden();
  expect(await page.evaluate(() => window.__fhAfgebroken)).toBe(0);
});

test('het toestel kan de vraag niet stellen: een rustige zin, en de pincode werkt', async ({ page }) => {
  await naarSlot(page, 'ongeldig');
  await expect(page.locator('.slot__boodschap')).toHaveText(ZIN);
  await page.locator('.slot__boodschap').evaluate((el) => (el.textContent = ''));
  await knop(page).click();
  await expect(page.locator('.slot__boodschap')).toHaveText(ZIN);
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
});

test('de gebruiker annuleert: geen zin, en de pincode werkt', async ({ page }) => {
  await naarSlot(page, 'annuleer-traag');
  await expect.poll(() => page.evaluate(() => window.__pkAanroepen)).toBe(1);
  await knop(page).click();
  await expect.poll(() => page.evaluate(() => window.__pkAanroepen)).toBe(2);
  await page.waitForTimeout(800);
  await expect(page.locator('.slot__boodschap')).toHaveText('');
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
});
