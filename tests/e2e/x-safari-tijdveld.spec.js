// BESLISSING 713: het uur van een herinnering (Algemeen, Herinneringen) is per minuut te kiezen, in Chrome en in Safari.
// Vroeger had het tijdveld step="900" en zette de app elk gekozen uur in het veld terug op het kwartier ervoor (18:07 werd 18:00);
// op de iPhone sprong het wiel van de minuten daardoor terug. Nu: step="60", niets wordt afgerond.
// Alleen met een (nep)meldingsdienst (tag @push): zonder dienst staan er geen tijdvelden op het scherm.
//   Chromium: PW_RONDE=push npx playwright test x-safari-tijdveld
//   WebKit:   PW_RONDE=push PW_POORT=<eigen> PW_OUTDIR=<eigen map> npx playwright test -c playwright.safari.config.js x-safari-tijdveld
// Let op: WebKit op Windows kent geen <input type="time"> (het wordt een tekstveld met step="60"); het wiel van iOS kan alleen de
// iPhone zelf tonen.
import { test, expect } from '@playwright/test';

const DIENST = process.env.VITE_PUSH_URL || '';
const OORSPRONG = `http://localhost:${process.env.PW_POORT || '4173'}`;
const CORS = { 'access-control-allow-origin': OORSPRONG, 'access-control-allow-methods': 'POST, DELETE, OPTIONS', 'access-control-allow-headers': 'Content-Type' };
const UUR = /^([01]\d|2[0-3]):[0-5]\d$/;

// De nepdienst antwoordt 204. Het lichaam wordt gelezen bij het vertrek van het verzoek (gebeurtenis 'request'), niet in de route:
// WebKit van Playwright laat een verzoek met keepalive (push.js) niet door page.route of context.route gaan; het vertrekt wel, en
// mislukt dan op de verzonnen poort. Wat de app verstuurt, is in beide motoren hetzelfde te lezen.
async function nepDienst(context) {
  const posts = [];
  context.on('request', (v) => {
    if (v.url().startsWith(DIENST + '/') && v.method() === 'POST') posts.push(JSON.parse(v.postData()).uren);
  });
  await context.route(DIENST + '/**', (route) => route.fulfill({ status: 204, headers: CORS }));
  return posts;
}

// Een nep-PushManager (er gaat nooit iets naar een echte pushdienst) en toestemming; op een iPhone staat Bloei op het beginscherm.
async function nepPush(context, browserName) {
  await context.addInitScript(() => {
    const SLEUTEL = 'nep-abonnement';
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
  if (browserName === 'chromium') await context.grantPermissions(['notifications'], { origin: OORSPRONG });
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
          const w = tx.objectStore('instellingen');
          w.put({ sleutel: 'start.klaar', waarde: true });
          for (const [sleutel, waarde] of Object.entries(waarden)) w.put({ sleutel, waarde });
          tx.oncomplete = () => {
            q.result.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    waarden,
  );
  await page.goto('./?opnieuw#/meer/meldingen');
  await expect(page.locator('.meldingen .instelscherm')).toBeVisible();
}

const lees = (page, sleutel) =>
  page.evaluate(
    (sleutel) =>
      new Promise((klaar) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onsuccess = () => {
          const g = q.result.transaction('instellingen').objectStore('instellingen').get(sleutel);
          g.onsuccess = () => {
            q.result.close();
            klaar(g.result ? g.result.waarde : undefined);
          };
        };
      }),
    sleutel,
  );


// Het veld van tijdstip nr van een soort (de schakelaar van die rij draagt data-meldingen="<soort>-<nr>").
const veldVan = (page, soort, nr) => page.locator(`.meldingen__slot:has([data-meldingen="${soort}-${nr}"]) input`);
const slotUur = (page, nr) => veldVan(page, 'drinken', nr);
const voorbeeldUren = (page) => page.locator('.meldingen__melding:not([hidden]) .meldingen__nu').allTextContents();

test.describe('het tijdstip van een herinnering per minuut (713)', { tag: '@push' }, () => {
  test('een tijdstip op 18:07: blijft staan na herladen, het voorbeeld toont het en de dienst krijgt 18:07', async ({ page, context, browserName }) => {
    await nepPush(context, browserName);
    const posts = await nepDienst(context);
    await zaai(page, {
      'meldingen.dagboek': { aan: true, uur: '20:00' },
      'meldingen.drinken': [{ aan: true, uur: '11:00' }, { aan: true, uur: '15:00' }, { aan: true, uur: '19:00' }],
      'meldingen.supplementenUren': [{ aan: false, uur: '08:00' }, { aan: false, uur: '13:00' }, { aan: false, uur: '19:00' }],
    });
    await page.evaluate(() => sessionStorage.setItem('nep-abonnement', '1'));
    await expect(slotUur(page, 1)).toHaveValue('15:00');
    await expect(slotUur(page, 1)).toHaveAttribute('step', '60');

    await slotUur(page, 1).fill('18:07');
    await expect(slotUur(page, 1)).toHaveValue('18:07');
    await expect.poll(() => voorbeeldUren(page)).toContain('18:07');
    await expect.poll(() => lees(page, 'meldingen.drinken')).toEqual([{ aan: true, uur: '11:00' }, { aan: true, uur: '18:07' }, { aan: true, uur: '19:00' }]);

    await page.reload();
    await expect(slotUur(page, 1)).toHaveValue('18:07');
    await expect.poll(() => voorbeeldUren(page)).toEqual(['11:00', '18:07', '19:00', '20:00']);

    // Wat naar de dienst gaat (laatst, zodat al het andere hierboven ook gecontroleerd is): 'UU:MM' per minuut, niet afgerond.
    await expect.poll(() => posts.at(-1), { timeout: 10000 }).toEqual(['11:00', '18:07', '19:00', '20:00']);
    for (const uur of posts.at(-1)) expect(uur).toMatch(UUR);
  });

  test('08:05, 18:07 en 23:59 in een soort; Tijdstip toevoegen stelt twee uur later voor, met dezelfde minuten', async ({ page, context, browserName }) => {
    await nepPush(context, browserName);
    const posts = await nepDienst(context);
    await zaai(page, {
      'meldingen.dagboek': { aan: false, uur: '20:00' },
      'meldingen.drinken': [{ aan: true, uur: '11:00' }, { aan: true, uur: '15:00' }, { aan: true, uur: '19:00' }],
      'meldingen.supplementenUren': [{ aan: false, uur: '08:00' }, { aan: false, uur: '13:00' }, { aan: false, uur: '19:00' }],
    });
    await page.evaluate(() => sessionStorage.setItem('nep-abonnement', '1'));
    const uren = ['08:05', '18:07', '23:59'];
    for (const [i, uur] of uren.entries()) {
      await slotUur(page, i).fill(uur);
      await expect(slotUur(page, i)).toHaveValue(uur);
    }
    // BESLISSING 736: drie is het maximum; na het weghalen van 18:07 stelt Tijdstip toevoegen twee uur na 23:59 voor.
    await expect(page.getByRole('button', { name: 'Tijdstip toevoegen' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Tijdstip 2 weghalen' }).click();
    await expect(page.locator('.meldingen__slot')).toHaveCount(2);
    await page.getByRole('button', { name: 'Tijdstip toevoegen' }).first().click();
    await expect(page.locator('.meldingen__slot')).toHaveCount(3);
    await expect(slotUur(page, 2)).toHaveValue('01:59');
    await expect.poll(() => voorbeeldUren(page)).toEqual(['01:59', '08:05', '23:59']);
    await page.reload();
    await expect(page.locator('.meldingen__slot')).toHaveCount(3);
    expect(await page.locator('.meldingen__slot input').evaluateAll((els) => els.map((e) => e.value))).toEqual(['08:05', '23:59', '01:59']);
    await expect.poll(() => posts.at(-1), { timeout: 10000 }).toEqual(['01:59', '08:05', '23:59']);
  });

  test('de opmaak blijft: een uur met minuten past in het veld, even breed als een heel uur, op elke maat', async ({ page, context, browserName }) => {
    await nepPush(context, browserName);
    await nepDienst(context);
    await zaai(page, {
      'meldingen.dagboek': { aan: true, uur: '23:59' },
      'meldingen.drinken': [{ aan: true, uur: '08:05' }, { aan: true, uur: '23:59' }, { aan: true, uur: '20:00' }],
      'meldingen.supplementenUren': [{ aan: false, uur: '08:00' }],
    });
    for (const [b, h] of [[390, 660], [320, 480], [820, 1180], [1280, 800]]) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(250);
      const velden = await page.locator('.meldingen__slot input').evaluateAll((els) => els.map((e) => ({ v: e.value, b: e.getBoundingClientRect().width, sw: e.scrollWidth, cw: e.clientWidth })));
      const heel = velden.find((v) => v.v === '20:00');
      for (const v of velden) {
        expect(v.sw, `${b}x${h} ${v.v} loopt niet over`).toBeLessThanOrEqual(v.cw);
        expect(Math.abs(v.b - heel.b), `${b}x${h} ${v.v} even breed als 20:00`).toBeLessThan(0.5);
      }
      expect(await veldVan(page, 'dagboek', 0).inputValue(), 'het oude Dagboek-uur staat in Tijdstip 1').toBe('23:59');
    }
  });

  // BESLISSING 714: Dagboek krijgt dezelfde rijen als Drinken en Supplementen (Tijdstip 1 met schakelaar, uur en kruisje; Tijdstip toevoegen).
  test('Dagboek: een oud "Om 20:00" wordt Tijdstip 1 (aan, 20:00), met dezelfde rij als Drinken; toevoegen tot 3 en weghalen zoals Drinken', async ({ page, context, browserName }) => {
    await nepPush(context, browserName);
    const posts = await nepDienst(context);
    await zaai(page, {
      'meldingen.dagboek': { aan: true, uur: '20:00' },
      'meldingen.drinken': [{ aan: true, uur: '11:00' }],
      'meldingen.supplementenUren': [],
    });
    await expect(page.locator('.meldingen__uur')).toHaveCount(0); // de rij "Om" bestaat niet meer
    await expect(veldVan(page, 'dagboek', 0)).toHaveValue('20:00');
    await expect(page.locator('[data-meldingen="dagboek-0"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: 'Tijdstip 1 weghalen' })).toHaveCount(2); // Dagboek en Drinken

    // dezelfde opmaak: de rij van Dagboek is even hoog en even breed als die van Drinken, met het veld en het kruisje op dezelfde plaats
    const rij = (soort) =>
      page.locator(`.meldingen__slot:has([data-meldingen="${soort}-0"])`).evaluate((r) => {
        const b = (e) => { const x = e.getBoundingClientRect(); return [Math.round(x.left), Math.round(x.width), Math.round(x.height)]; };
        return { rij: b(r), veld: b(r.querySelector('input')), weg: b(r.querySelector('.meldingen__weg')), klasse: r.className };
      });
    expect(await rij('dagboek')).toEqual(await rij('drinken'));

    // toevoegen tot 3: daarna geen knop meer bij Dagboek
    const toevoegen = page.locator('[data-meldingen="dagboek-toevoegen"]');
    await toevoegen.click();
    await expect(veldVan(page, 'dagboek', 1)).toHaveValue('22:00');
    await toevoegen.click();
    await expect(veldVan(page, 'dagboek', 2)).toHaveValue('00:00');
    await expect(toevoegen).toHaveCount(0);
    await veldVan(page, 'dagboek', 1).fill('18:07');
    await expect.poll(() => lees(page, 'meldingen.dagboek')).toEqual({ aan: true, uur: '20:00', tijdstippen: [{ aan: true, uur: '20:00' }, { aan: true, uur: '18:07' }, { aan: true, uur: '00:00' }] });
    await expect.poll(() => voorbeeldUren(page)).toEqual(['00:00', '11:00', '18:07', '20:00']);

    // herladen: de drie tijdstippen blijven
    await page.reload();
    await expect(veldVan(page, 'dagboek', 2)).toHaveValue('00:00');
    expect([await veldVan(page, 'dagboek', 0).inputValue(), await veldVan(page, 'dagboek', 1).inputValue()]).toEqual(['20:00', '18:07']);

    // het laatste tijdstip met het kruisje weghalen: zoals bij Drinken staat de soort daarna uit, zonder tijdstippen
    for (let i = 0; i < 3; i += 1) await page.locator('.meldingen__slot:has([data-meldingen="dagboek-0"]) .meldingen__weg').click();
    await expect(page.locator('[data-meldingen="dagboek-0"]')).toHaveCount(0);
    await expect(page.locator('.meldingen [data-meldingen="dagboek"]')).toHaveAttribute('aria-checked', 'false');
    // (uur houdt het laatst bekende uur, hier dat van het laatst weggehaalde tijdstip; alleen een oudere lezer kijkt ernaar, en aan is false)
    await expect.poll(() => lees(page, 'meldingen.dagboek')).toEqual({ aan: false, uur: '00:00', tijdstippen: [] });
    // weer aanzetten: een nieuw tijdstip, net als bij Drinken (12:00, twee uur na 10:00)
    await page.locator('.meldingen [data-meldingen="dagboek"]').click();
    await expect(veldVan(page, 'dagboek', 0)).toHaveValue('12:00');

    // wat naar de dienst gaat: Dagboek 12:00 en Drinken 11:00
    await expect.poll(() => posts.at(-1), { timeout: 10000 }).toEqual(['11:00', '12:00']);
  });
});
