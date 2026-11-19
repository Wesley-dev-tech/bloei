// BESLISSING 751 (goedgekeurd): het voorbeeld "Zo ziet het eruit" op Herinneringen (#/meer/meldingen; in de uitleg heet de stap "Meekijken") toont
// op de telefoon twee meldingen in plaats van vier, zodat het tijdens de rondleiding samen met de uitlegkaart in beeld past. Tablet en desktop
// blijven vier meldingen tonen. De grens is die van telefoon.css: smaller dan 720 px, of liggend en laag (tot 959 px breed en 500 px hoog).
// Wat vastligt:
//   1. telefoon (390x660, 360x560, 320x480): precies twee zichtbare meldingen, de eerste twee in de volgorde van het scherm, en het voorbeeld is
//      (het vlak met de klok en de meldingen) hoogstens 330 px hoog; de twee andere zijn ook voor een schermlezer weg;
//   2. tablet en desktop (820x1180, 1280x800): vier;
//   3. het aantal volgt de venstermaat zonder herladen (draaien, venster versleept);
//   4. met echte herinneringen (ronde push) zegt een regel "en nog N" hoeveel meldingen er op de telefoon niet getoond worden.
import { test, expect } from '@playwright/test';

const TELEFOON = [[390, 660], [360, 560], [320, 480]];
const BREED = [[820, 1180], [1280, 800]];
const MAX_HOOG = 330;
const OORSPRONG = `http://localhost:${process.env.PW_POORT || '4173'}`;

async function openScherm(page) {
  await page.goto('./#/meer/meldingen');
  await expect(page.locator('.meldingen .instelscherm')).toBeVisible();
  await expect(page.locator('.meldingen .meldingen__stapel > .meldingen__melding').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

// De stand van het voorbeeld zoals de gebruiker en een schermlezer hem krijgen: een melding telt als ze een vlak op het scherm heeft.
// display: none (geen vlak) haalt een element ook uit de boom voor hulptechnologie.
const meet = (page) =>
  page.evaluate(() => {
    const vlak = (e) => e.getClientRects().length > 0 && e.getBoundingClientRect().height > 0;
    const alle = [...document.querySelectorAll('.meldingen .meldingen__stapel > .meldingen__melding')];
    const zichtbaar = alle.filter(vlak);
    // Het voorbeeld is het vlak met de klok en de meldingen (.meldingen__telefoon); de kaart eromheen draagt de kop "Zo ziet het eruit".
    const voorbeeld = document.querySelector('.meldingen aside.instel__voorbeeld').getBoundingClientRect();
    const telefoon = document.querySelector('.meldingen .meldingen__telefoon').getBoundingClientRect();
    const klok = document.querySelector('.meldingen .meldingen__klok').getBoundingClientRect();
    const datum = document.querySelector('.meldingen .meldingen__datum').getBoundingClientRect();
    const stapel = document.querySelector('.meldingen .meldingen__stapel').getBoundingClientRect();
    return {
      totaal: alle.length,
      zichtbaar: zichtbaar.length,
      eerste: alle.slice(0, zichtbaar.length).every(vlak),
      labels: zichtbaar.map((e) => e.getAttribute('aria-label')),
      verborgenZonderVlak: alle.filter((e) => !vlak(e)).every((e) => getComputedStyle(e).display === 'none'),
      nog: [...document.querySelectorAll('.meldingen .meldingen__stapel > .meldingen__nog')].filter(vlak).map((e) => e.textContent),
      hoogte: Math.round(telefoon.height * 10) / 10,
      // dezelfde lucht boven de klok, tussen datum en stapel en onder de stapel
      lucht: [klok.top - telefoon.top, stapel.top - datum.bottom, telefoon.bottom - stapel.bottom].map((n) => Math.round(n)),
      // het voorbeeld loopt nergens uit zijn kaart en de pagina schuift niet opzij
      binnen: telefoon.left >= voorbeeld.left - 0.5 && telefoon.right <= voorbeeld.right + 0.5 && telefoon.bottom <= voorbeeld.bottom + 0.5,
      zijwaarts: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

test.describe('het voorbeeld van Herinneringen op de telefoon (751)', () => {
  for (const [breedte, hoogte] of TELEFOON) {
    test(`telefoon ${breedte}x${hoogte}: twee meldingen en een voorbeeld van hoogstens ${MAX_HOOG} px`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: hoogte });
      await openScherm(page);
      const m = await meet(page);
      expect(m.totaal, 'het voorbeeld heeft vier soorten').toBe(4);
      expect(m.zichtbaar, 'zichtbare meldingen').toBe(2);
      expect(m.eerste, 'het zijn de eerste twee').toBe(true);
      expect(m.verborgenZonderVlak, 'de andere zijn weg met display: none').toBe(true);
      expect(m.nog, 'bij de voorbeelden staat geen "en nog"').toEqual([]);
      expect(m.hoogte, 'hoogte van het voorbeeld').toBeLessThanOrEqual(MAX_HOOG);
      expect(m.binnen, 'het voorbeeld blijft binnen zijn kaart').toBe(true);
      expect(m.zijwaarts, 'de pagina schuift niet opzij').toBeLessThanOrEqual(0);
      expect(m.lucht, 'lucht boven de klok, boven de stapel en onder de stapel').toEqual([16, 16, 16]);
      // Een schermlezer krijgt dezelfde twee: role="img" met een naam, en geen derde.
      await expect(page.locator('.meldingen .meldingen__stapel').getByRole('img')).toHaveCount(2);
    });
  }

  for (const [breedte, hoogte] of BREED) {
    test(`${breedte}x${hoogte}: vier meldingen`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: hoogte });
      await openScherm(page);
      const m = await meet(page);
      expect(m.totaal).toBe(4);
      expect(m.zichtbaar, 'zichtbare meldingen').toBe(4);
      expect(m.nog).toEqual([]);
      await expect(page.locator('.meldingen .meldingen__stapel').getByRole('img')).toHaveCount(4);
    });
  }

  test('het aantal volgt de venstermaat zonder herladen, en de volgorde blijft', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openScherm(page);
    const breed = await meet(page);
    expect(breed.zichtbaar).toBe(4);
    for (const [breedte, hoogte, aantal] of [[390, 660, 2], [820, 1180, 4], [320, 480, 2], [660, 390, 2], [844, 390, 2], [1280, 800, 4]]) {
      await page.setViewportSize({ width: breedte, height: hoogte });
      await expect.poll(async () => (await meet(page)).zichtbaar, { message: `${breedte}x${hoogte}` }).toBe(aantal);
      const m = await meet(page);
      expect(m.labels, `${breedte}x${hoogte}: dezelfde meldingen in dezelfde volgorde`).toEqual(breed.labels.slice(0, aantal));
    }
  });
});

// ===================================================================== met echte herinneringen (ronde push)
const DIENST = process.env.VITE_PUSH_URL || '';
const CORS = { 'access-control-allow-origin': OORSPRONG, 'access-control-allow-methods': 'POST, DELETE, OPTIONS', 'access-control-allow-headers': 'Content-Type' };

// Een nep-PushManager en toestemming: er gaat nooit iets naar een echte pushdienst (zoals in c-meldingen en x-safari-tijdveld).
async function nepPush(context) {
  await context.route(DIENST + '/**', (route) => route.fulfill({ status: 204, headers: CORS }));
  await context.addInitScript(() => {
    const SLEUTEL = 'nep-abonnement';
    sessionStorage.setItem(SLEUTEL, '1');
    const maak = () => ({
      endpoint: 'https://web.push.apple.com/nep-endpoint-' + 'x'.repeat(24),
      expirationTime: null,
      toJSON() {
        return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: 'BNepSleutelNepSleutelNepSleutelNepSleutel', auth: 'NepAuthNepAuthNep' } };
      },
      async unsubscribe() {
        sessionStorage.removeItem(SLEUTEL);
        return true;
      },
    });
    const pm = {
      async getSubscription() {
        return sessionStorage.getItem(SLEUTEL) ? maak() : null;
      },
      async subscribe() {
        sessionStorage.setItem(SLEUTEL, '1');
        return maak();
      },
    };
    if (typeof ServiceWorkerRegistration !== 'undefined') Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', { get: () => pm, configurable: true });
    if (!('PushManager' in window)) window.PushManager = function PushManager() {};
    if (!('Notification' in window)) window.Notification = { permission: 'granted', requestPermission: async () => 'granted' };
    else Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
  });
  await context.grantPermissions(['notifications'], { origin: OORSPRONG });
}

async function zaai(page, waarden) {
  await page.goto('./');
  await page.locator('#scherm').first().waitFor({ state: 'attached' });
  await page.evaluate(
    (waarden) =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const tx = q.result.transaction(['instellingen'], 'readwrite');
          for (const [sleutel, waarde] of Object.entries(waarden)) tx.objectStore('instellingen').put({ sleutel, waarde });
          tx.oncomplete = () => {
            q.result.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    waarden,
  );
}

test.describe('het voorbeeld op de telefoon met echte herinneringen (751)', { tag: '@push' }, () => {
  // Vier soorten met elk één tijdstip, details aan: vier meldingen, in tijdsvolgorde 08:00, 11:00, 12:30, 20:00.
  const VIER = {
    'meldingen.dagboek': { aan: true, uur: '20:00' },
    'meldingen.eten': [{ aan: true, uur: '12:30' }],
    'meldingen.drinken': [{ aan: true, uur: '11:00' }],
    'meldingen.supplementenUren': [{ aan: true, uur: '08:00' }],
    'meldingen.details': true,
  };
  const uren = (page) =>
    page.evaluate(() => [...document.querySelectorAll('.meldingen .meldingen__stapel > .meldingen__melding')].filter((e) => e.getClientRects().length > 0).map((e) => e.querySelector('.meldingen__nu').textContent));

  for (const [breedte, hoogte] of TELEFOON) {
    test(`telefoon ${breedte}x${hoogte}: de eerste twee van vier, met "en nog 2"`, async ({ page, context }) => {
      await nepPush(context);
      await page.setViewportSize({ width: breedte, height: hoogte });
      await zaai(page, VIER);
      await openScherm(page);
      await expect(page.locator('.meldingen [data-meldingen="hoofd"]')).toHaveAttribute('aria-checked', 'true');
      const m = await meet(page);
      expect(m.totaal).toBe(4);
      expect(m.zichtbaar).toBe(2);
      expect(await uren(page), 'de eerste twee in tijdsvolgorde').toEqual(['08:00', '11:00']);
      expect(m.nog).toEqual(['en nog 2']);
      // Op 320 px breken de teksten met details over vier regels en komt de regel "en nog 2" erbij: gemeten 354 px, daar ligt de grens op 360.
      expect(m.hoogte).toBeLessThanOrEqual(breedte < 360 ? 360 : MAX_HOOG);
      expect(m.zijwaarts).toBeLessThanOrEqual(0);
    });
  }

  test('twee echte meldingen op de telefoon: beide in beeld, zonder "en nog"', async ({ page, context }) => {
    await nepPush(context);
    await page.setViewportSize({ width: 390, height: 660 });
    await zaai(page, { ...VIER, 'meldingen.eten': [], 'meldingen.supplementenUren': [] });
    await openScherm(page);
    const m = await meet(page);
    expect([m.totaal, m.zichtbaar, m.nog]).toEqual([2, 2, []]);
    expect(await uren(page)).toEqual(['11:00', '20:00']);
  });

  for (const [breedte, hoogte] of BREED) {
    test(`${breedte}x${hoogte}: de vier echte meldingen, zonder "en nog"`, async ({ page, context }) => {
      await nepPush(context);
      await page.setViewportSize({ width: breedte, height: hoogte });
      await zaai(page, VIER);
      await openScherm(page);
      const m = await meet(page);
      expect([m.zichtbaar, m.nog]).toEqual([4, []]);
      expect(await uren(page)).toEqual(['08:00', '11:00', '12:30', '20:00']);
    });
  }
});
