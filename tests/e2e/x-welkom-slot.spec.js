// BESLISSING 444: de vierde stap van het welkomscherm, "Wil je Bloei vergrendelen?", met Pincode, de methode van het toestel (Face ID; op
// Android vingerafdruk of schermslot) als het toestel ze heeft, en "Nu niet". Dezelfde instelstroom als Algemeen › Vergrendeling
// (src/vergrendeling/instellen.js). Daarnaast (eigenaar, 16 november): het scherm Vergrendeling werkt op Android volledig, stap voor stap,
// en op iPhone verandert er niets. Een nagebootste platformauthenticator zoals in c-slot.spec.js.
// BESLISSING 518: na de code volgt de herstelcode (rondAf); het herstellen zelf staat in x-herstel.spec.js. BESLISSING 541: de vraag "Je toestel
// als hulp" bestaat niet meer; bij Pincode vraagt het instellen het toestel niets. Schermafbeeldingen alleen op verzoek (SHOTDIR).
import { test, expect, devices } from '@playwright/test';
import { animatiesKlaar } from './wacht.js';
import { vasteKlok } from './vaste-klok.js';
import { authenticator, instelling } from './slot-hulp.js';

const PIXEL = devices['Pixel 7'];
const ANDROID = { userAgent: PIXEL.userAgent, viewport: PIXEL.viewport, deviceScaleFactor: PIXEL.deviceScaleFactor, isMobile: true, hasTouch: true };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE = { userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
// [toestel, opties, de naam van de methode op het scherm Vergrendeling, de naam in het keuzevak van het welkomscherm (BESLISSING 668),
//  de knop onder het cijferblok van het slot (BESLISSING 712: op Android "Vingerafdruk gebruiken", zodat hij op een regel past)]
const TOESTELLEN = [
  ['iPhone', IPHONE, 'Face ID', 'Face ID', 'Face ID gebruiken'],
  ['Android', ANDROID, 'Vingerafdruk of schermslot', 'Vingerafdruk', 'Vingerafdruk gebruiken'],
];

const CODE = '123456';
const LEEG = { cookies: [], origins: [] };

const verder = (page) => page.locator('.welkom__knoppen .knop--primair');
const stap4 = (page) => page.locator('.welkom__stap[data-stap="5"]');
const SLOT = (page) => page.getByRole('switch', { name: /^Bloei vergrendelen/ });
const KIES_PIN = (page) => page.getByRole('radio', { name: /^Pincode/ });

async function tik(page, code) {
  for (const cijfer of code) await page.locator(`.cijferblok__toets[data-cijfer="${cijfer}"]`).click();
}

// Na de code: meteen de herstelcode met het vinkje en Verder (BESLISSING 541: geen vraag "Je toestel als hulp" ertussen).
async function rondAf(page) {
  const stap = page.locator('[data-herstelstap]');
  await expect(stap).toBeVisible();
  await expect(page.locator('[data-toestelaanbod]')).toHaveCount(0);
  await expect(page.getByText('Je toestel als hulp')).toHaveCount(0);
  await stap.getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
  await stap.getByRole('button', { name: 'Verder' }).click();
}

// De nagebootste platformauthenticator en instelling() komen uit slot-hulp.js: echte WebAuthn-antwoorden (BESLISSING 518), want de app
// controleert elk antwoord streng (type, challenge, oorsprong, rpId-hash, vlaggen UP en UV, id).

async function slotStand(page) {
  const uit = {};
  for (const k of ['slot.aan', 'slot.pin', 'slot.passkeyId', 'slot.methode', 'start.klaar', 'profiel.naam']) uit[k] = await instelling(page, k);
  return uit;
}

async function zetZichtbaarheid(page, staat) {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    document.dispatchEvent(new Event('visibilitychange'));
  }, staat);
}

// Van een lege database naar stap 4 (naam ingevuld, stap 2 en 3 met Verder).
async function naarStap4(page, naam = 'Testnaam') {
  await page.goto('./');
  await expect(page).toHaveURL(/#\/welkom$/);
  await page.getByRole('textbox', { name: 'Je naam' }).fill(naam);
  // (de naam staat nog op "naarStap4": de vergrendeling is sinds 0.4.5, met de geboortedatum als stap 2, de vijfde stap)
  await verder(page).click();
  await expect(page.getByText('Stap 2 van 5')).toBeVisible();
  await verder(page).click();
  await expect(page.getByText('Stap 3 van 5')).toBeVisible();
  await verder(page).click();
  await expect(page.getByText('Stap 4 van 5')).toBeVisible();
  await verder(page).click();
  await expect(page.getByText('Stap 5 van 5')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wil je Bloei vergrendelen?' })).toBeVisible();
}

const appTekst = (page) => page.evaluate(() => (document.getElementById('app')?.innerText ?? '') + '\n' + (document.getElementById('slot')?.innerText ?? ''));
const geenHorizontaal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// ===================================================================== het welkomscherm, stap 4

for (const [toestel, opties, methode, keuze, slotknop] of TOESTELLEN) {
  test.describe(`Welkom stap 4 (${toestel})`, () => {
    test.use({ ...opties, storageState: LEEG });
    test.beforeEach(async ({ page }) => vasteKlok(page));

    test('de stap: teksten, keuzes, focus en de knoppen Vergrendeling instellen en Nu niet', async ({ page }) => {
      await authenticator(page, 'ok');
      await naarStap4(page);
      const s = stap4(page);
      await expect(s.locator('.welkom__hint')).toHaveText('Je pincode houdt meekijkers buiten. Je gegevens zelf zijn niet versleuteld.');
      await expect(s.getByText('Bloei kan je code niet terughalen. Een herstelcode helpt je dan een nieuwe te kiezen.')).toBeVisible();
      await expect(s.getByRole('radiogroup', { name: 'Bloei openen met' })).toBeVisible();
      await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
      await expect(KIES_PIN(page)).toBeFocused();
      const bio = page.getByRole('radio', { name: new RegExp('^' + keuze) });
      await expect(bio).toBeVisible();
      // BESLISSING 668: in het keuzevak van het welkomscherm de korte naam ("Vingerafdruk" op Android); de uitleg noemt beide
      await expect(bio.locator('.slot__optielabel')).toHaveText(keuze);
      await expect(bio).toHaveAttribute('aria-checked', 'false');
      await expect(verder(page)).toHaveText('Vergrendeling instellen');
      await expect(page.getByRole('button', { name: 'Nu niet' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Terug' })).toBeVisible();
      // pijltjes kiezen binnen de groep zonder iets te starten
      await page.keyboard.press('ArrowDown');
      await expect(bio).toHaveAttribute('aria-checked', 'true');
      await expect(bio).toBeFocused();
      await expect(page.locator('.cijferblok')).toHaveCount(0);
      const tekst = await appTekst(page);
      if (toestel === 'Android') expect(tekst).not.toMatch(/Face ID|Safari|iPhone/);
      else expect(tekst).not.toMatch(/vingerafdruk/i);
      if (process.env.SHOTDIR) {
        await page.keyboard.press('ArrowUp');
        await animatiesKlaar(page);
        await page.screenshot({ path: `${process.env.SHOTDIR}/welkom-stap4-${toestel.toLowerCase()}.png`, fullPage: true });
      }
    });

    test('weg 1, Pincode: code twee keer, de app is open op Vandaag, de pincode staat in de opslag en de app vraagt ze bij terugkeer', async ({ page }) => {
      await authenticator(page, 'ok');
      await naarStap4(page);
      await verder(page).click();
      await expect(page.locator('.welkom .cijferblok')).toBeVisible();
      await expect(page.getByText('Kies een code van zes cijfers.')).toBeVisible();
      // zolang het cijferblok open is, zijn Verder, Terug en Nu niet weg
      await expect(page.locator('.welkom__knoppen')).toBeHidden();
      await tik(page, CODE);
      await expect(page.getByText('Geef de code nog eens in.')).toBeVisible();
      await tik(page, CODE);
      // BESLISSING 541: na de tweede keer meteen de herstelcode, zonder systeemvenster, ook al kan het toestel het
      await expect(page.locator('[data-herstelstap]')).toBeVisible();
      expect(await page.evaluate(() => window.__pkGemaakt + window.__pkAanroepen)).toBe(0);
      await rondAf(page);
      await expect(page).toHaveURL(/#\/vandaag$/);
      await expect(page.locator('#slot')).toBeHidden(); // open, niet meteen vergrendeld
      await expect(page.locator('#tabbalk')).toBeVisible();
      const st = await slotStand(page);
      expect(st['slot.aan']).toBe(true);
      expect(st['slot.methode']).toBe('pin');
      expect(st['slot.passkeyId']).toBeNull();
      expect(st['slot.pin'].rondes).toBe(600000);
      expect(st['start.klaar']).toBe(true);
      expect(st['profiel.naam']).toBe('Testnaam');
      expect(await page.evaluate(() => window.__pkGemaakt)).toBe(0);
      expect(await instelling(page, 'slot.herstelId')).toBeNull();
      // bij terugkeer vraagt Bloei de code
      await zetZichtbaarheid(page, 'hidden');
      await zetZichtbaarheid(page, 'visible');
      await expect(page.locator('#slot .cijferblok')).toBeVisible();
      await tik(page, CODE);
      await expect(page.locator('#slot')).toBeHidden();
      // en na herladen ook, zonder welkomscherm
      await page.reload();
      await expect(page.locator('#slot .cijferblok')).toBeVisible();
      await tik(page, CODE);
      await expect(page).toHaveURL(/#\/vandaag$/);
      await expect(page.locator('.vandaag h1')).toContainText('Testnaam');
    });

    test(`weg 2, ${methode}: eerst een code als terugval, dan de toestelvraag; methode faceid in de opslag`, async ({ page }) => {
      await authenticator(page, 'ok');
      await naarStap4(page);
      await page.getByRole('radio', { name: new RegExp('^' + keuze) }).click();
      await verder(page).click();
      const intro = toestel === 'Android' ? 'Kies eerst een code. Die gebruik je als vingerafdruk of schermslot even niet lukt.' : 'Kies eerst een code. Die gebruik je als Face ID even niet lukt.';
      await expect(page.getByText(intro)).toBeVisible();
      await tik(page, CODE);
      await tik(page, CODE);
      await rondAf(page);
      await expect(page).toHaveURL(/#\/vandaag$/);
      await expect(page.locator('#slot')).toBeHidden();
      const st = await slotStand(page);
      expect(st['slot.aan']).toBe(true);
      expect(st['slot.methode']).toBe('faceid');
      expect(st['slot.passkeyId']).toBeTruthy();
      expect(st['slot.pin']).toBeTruthy(); // de code is de terugval (BESLISSING 194)
      expect(await page.evaluate(() => window.__pkGemaakt)).toBe(1);
      // bij terugkeer vraagt Bloei de methode van het toestel; de knop draagt de naam van het toestel (BESLISSING 712).
      // Eerst de korte nazorg van de vrijstelling voor de toestelvraag laten aflopen (vrijstelling.js, NAZORG_MS = 1500).
      await page.waitForTimeout(5500); // NAZORG_TOESTEL_MS (BESLISSING 530)
      await zetZichtbaarheid(page, 'hidden');
      await page.evaluate(() => sessionStorage.setItem('__pk', 'annuleer'));
      await zetZichtbaarheid(page, 'visible');
      await expect(page.locator('#slot .cijferblok')).toBeVisible();
      await expect(page.locator('#slot').getByRole('button', { name: slotknop, exact: true })).toBeVisible();
      await tik(page, CODE);
      await expect(page.locator('#slot')).toBeHidden();
    });

    test('annuleren van de systeemvraag: de code blijft (BESLISSING 530); Annuleren stelt niets in, ze blijft op stap 4 en kan opnieuw kiezen of Nu niet nemen', async ({ page }) => {
      await authenticator(page, 'ok');
      await naarStap4(page);
      await page.evaluate(() => sessionStorage.setItem('__pkc', 'fout'));
      await page.getByRole('radio', { name: new RegExp('^' + keuze) }).click();
      await verder(page).click();
      await tik(page, CODE);
      await tik(page, CODE);
      await expect(page.locator('[data-toestelopnieuw]')).toBeVisible();
      await expect(page.locator('.welkom .cijferblok')).toHaveCount(0);
      await page.getByRole('button', { name: 'Annuleren' }).click();
      await expect(page).toHaveURL(/#\/welkom$/);
      await expect(page.getByText('Stap 5 van 5')).toBeVisible();
      await expect(page.locator('.welkom__knoppen')).toBeVisible();
      await expect(page.getByRole('radio', { name: new RegExp('^' + keuze) })).toBeFocused();
      let st = await slotStand(page);
      expect(st['slot.aan']).toBeFalsy();
      expect(st['slot.pin']).toBeNull();
      expect(st['start.klaar']).toBeFalsy();
      // opnieuw kiezen: Pincode lukt
      await KIES_PIN(page).click();
      await expect(page.locator('.welkom__slotmelding')).toBeEmpty();
      await verder(page).click();
      await tik(page, CODE);
      await tik(page, CODE);
      await rondAf(page);
      await expect(page).toHaveURL(/#\/vandaag$/);
      st = await slotStand(page);
      expect(st['slot.aan']).toBe(true);
      expect(st['slot.methode']).toBe('pin');
    });

    test('Annuleren in het cijferblok en twee verschillende codes bewaren niets; daarna Nu niet', async ({ page }) => {
      await authenticator(page, 'ok');
      await naarStap4(page);
      await verder(page).click();
      await tik(page, CODE);
      await page.getByRole('button', { name: 'Annuleren' }).click();
      await expect(KIES_PIN(page)).toBeFocused();
      await expect(page.locator('.welkom__knoppen')).toBeVisible();
      await verder(page).click();
      await tik(page, CODE);
      await tik(page, '654321');
      await expect(page.getByText('De codes komen niet overeen.')).toBeVisible();
      expect((await slotStand(page))['slot.pin']).toBeNull();
      await page.getByRole('button', { name: 'Annuleren' }).click();
      await page.getByRole('button', { name: 'Nu niet' }).click();
      await expect(page).toHaveURL(/#\/vandaag$/);
      const st = await slotStand(page);
      expect(st['slot.aan']).toBeFalsy();
      expect(st['slot.pin']).toBeNull();
      expect(st['start.klaar']).toBe(true);
    });

    test('weg 4, Nu niet: geen slot, ook niet na herladen of terugkeer; Algemeen › Vergrendeling biedt alles aan', async ({ page }) => {
      await authenticator(page, 'ok');
      await naarStap4(page);
      await page.getByRole('button', { name: 'Nu niet' }).click();
      await expect(page).toHaveURL(/#\/vandaag$/);
      expect((await slotStand(page))['slot.aan']).toBeFalsy();
      await zetZichtbaarheid(page, 'hidden');
      await zetZichtbaarheid(page, 'visible');
      await expect(page.locator('#slot .cijferblok')).toHaveCount(0);
      await page.reload();
      await expect(page.locator('#tabbalk')).toBeVisible();
      await expect(page.locator('#slot .cijferblok')).toHaveCount(0);
      await page.goto('./#/meer/vergrendeling');
      await expect(SLOT(page)).toHaveAttribute('aria-checked', 'false');
      await expect(SLOT(page)).toBeEnabled();
      await expect(KIES_PIN(page)).toBeEnabled();
      await expect(page.getByRole('radio', { name: new RegExp('^' + methode) })).toBeEnabled();
    });

    test('terug naar stap 3 en weer vooruit houdt naam, dagdoel, weegdag en de keuze', async ({ page }) => {
      await authenticator(page, 'ok');
      await page.goto('./');
      await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
      await verder(page).click();
      await verder(page).click(); // de geboortedatum (stap 2) blijft leeg
      const plus = page.locator('.welkom__stap.is-actief').getByRole('button', { name: /meer|plus|\+/i });
      await plus.click();
      await plus.click();
      await verder(page).click();
      await page.getByRole('button', { name: 'wo', exact: true }).click();
      await verder(page).click();
      await expect(page.getByText('Stap 5 van 5')).toBeVisible();
      await page.getByRole('radio', { name: new RegExp('^' + keuze) }).click();
      await page.getByRole('button', { name: 'Terug' }).click();
      await expect(page.getByText('Stap 4 van 5')).toBeVisible();
      await expect(verder(page)).toHaveText('Verder');
      await expect(page.getByRole('button', { name: 'Overslaan' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'wo', exact: true })).toHaveAttribute('aria-pressed', 'true');
      for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Terug' }).click();
      await expect(page.getByRole('textbox', { name: 'Je naam' })).toHaveValue('Testnaam');
      for (let i = 0; i < 4; i += 1) await verder(page).click();
      await expect(page.getByText('Stap 5 van 5')).toBeVisible();
      await expect(page.getByRole('radio', { name: new RegExp('^' + keuze) })).toHaveAttribute('aria-checked', 'true');
      await page.getByRole('button', { name: 'Nu niet' }).click();
      await expect(page).toHaveURL(/#\/vandaag$/);
      expect(await instelling(page, 'drinken.dagdoelMl')).toBe(3000);
      expect(await instelling(page, 'gewicht.weegdag')).toBe(3);
      expect(await instelling(page, 'profiel.naam')).toBe('Testnaam');
    });

    test('op een toestel zonder biometrie is er alleen Pincode', async ({ page }) => {
      await authenticator(page, 'geen');
      await naarStap4(page);
      await expect(page.locator('.welkom__stap[data-stap="5"] .slot__optie')).toHaveCount(1);
      await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('radio', { name: new RegExp('^' + keuze) })).toHaveCount(0);
    });

    test('mislukt het bewaren (R2-16), dan blijft ze op stap 4, staat er geen half slot en kan ze opnieuw', async ({ page }) => {
      await authenticator(page, 'ok');
      await naarStap4(page);
      await verder(page).click();
      await tik(page, CODE);
      // vanaf nu mislukt elke schrijfbeurt in IndexedDB
      await page.evaluate(() => {
        window.__echtePut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function () {
          throw new DOMException('vol', 'QuotaExceededError');
        };
      });
      await tik(page, CODE);
      await rondAf(page); // er wordt pas bewaard bij Verder onder de herstelcode
      await expect(page.locator('.welkom__slotmelding')).not.toBeEmpty();
      await expect(page).toHaveURL(/#\/welkom$/);
      await expect(page.getByText('Stap 5 van 5')).toBeVisible();
      await page.evaluate(() => (IDBObjectStore.prototype.put = window.__echtePut));
      expect((await slotStand(page))['slot.aan']).toBeFalsy();
      expect((await slotStand(page))['start.klaar']).toBeFalsy();
      await verder(page).click();
      await tik(page, CODE);
      await tik(page, CODE);
      await rondAf(page);
      await expect(page).toHaveURL(/#\/vandaag$/);
      expect((await slotStand(page))['slot.aan']).toBe(true);
    });
  });
}

// Bestaande gebruikers (start.klaar gezet door de globale opstart) krijgen het welkomscherm niet.
test('wie de app al gebruikt, krijgt het welkomscherm niet opnieuw en geen slot', async ({ page }) => {
  await vasteKlok(page);
  await page.goto('./#/welkom');
  await expect(page).toHaveURL(/#\/vandaag$/);
  await expect(page.locator('.welkom')).toHaveCount(0);
  await expect(page.locator('#slot .cijferblok')).toHaveCount(0);
});

// ===================================================================== maten en toestellen

const MATEN = [[390, 844], [360, 740], [844, 390], [820, 1180], [1180, 820], [1280, 800], [1690, 1230]];
test.describe('Welkom stap 4 op elke maat', () => {
  test.use({ storageState: LEEG });
  test.beforeEach(async ({ page }) => vasteKlok(page));
  for (const [breed, hoog] of MATEN) {
    test(`${breed}x${hoog}: geen horizontale scroll, tikvlakken van minstens 44 px, knoppen bereikbaar`, async ({ page }) => {
      await authenticator(page, 'ok');
      await page.setViewportSize({ width: breed, height: hoog });
      await naarStap4(page);
      await animatiesKlaar(page);
      expect(await geenHorizontaal(page)).toBe(true);
      for (const el of await stap4(page).locator('.slot__optie').all()) {
        const b = await el.boundingBox();
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(breed + 0.5);
        expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      }
      for (const k of [verder(page), page.getByRole('button', { name: 'Nu niet' }), page.getByRole('button', { name: 'Terug' })]) {
        await k.scrollIntoViewIfNeeded();
        await expect(k).toBeInViewport();
        expect((await k.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      if (process.env.SHOTDIR && breed === 1280) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${process.env.SHOTDIR}/welkom-stap4-1280.png` });
      }
      // het cijferblok in de stap
      await verder(page).click();
      await expect(page.locator('.welkom .cijferblok')).toBeVisible();
      expect(await geenHorizontaal(page)).toBe(true);
      for (const t of await page.locator('.welkom .cijferblok__toets').all()) expect((await t.boundingBox()).height).toBeGreaterThanOrEqual(44);
      const annuleer = page.getByRole('button', { name: 'Annuleren' });
      await annuleer.scrollIntoViewIfNeeded();
      await expect(annuleer).toBeInViewport();
      if (process.env.SHOTDIR && breed === 390) {
        await animatiesKlaar(page);
        await page.screenshot({ path: `${process.env.SHOTDIR}/welkom-stap4-code-390.png`, fullPage: true });
      }
    });
  }
});

// BESLISSING 450 en 513: "Vergrendeling instellen" en "Nu niet" zijn gelijkwaardig: even hoog (minstens 48 px), naast elkaar; even breed vanaf 480 px
// (op een smalle telefoon krijgt "Vergrendeling instellen" de breedte van haar tekst en "Nu niet" de rest).
test.describe('Welkom stap 4: twee even grote knoppen', () => {
  test.use({ storageState: LEEG });
  test.beforeEach(async ({ page }) => vasteKlok(page));
  for (const [breed, hoog] of [[390, 844], [360, 740], [844, 390], [820, 1180], [1280, 800]]) {
    test(`${breed}x${hoog}: instellen en Nu niet even breed en even hoog, beide in beeld`, async ({ page }) => {
      await authenticator(page, 'ok');
      await page.setViewportSize({ width: breed, height: hoog });
      await naarStap4(page);
      await animatiesKlaar(page);
      const nuNiet = page.getByRole('button', { name: 'Nu niet' });
      for (const k of [verder(page), nuNiet]) {
        await k.scrollIntoViewIfNeeded();
        await expect(k).toBeInViewport();
      }
      const a = await verder(page).boundingBox();
      const b = await nuNiet.boundingBox();
      if (breed >= 480) expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
      // liggend (BESLISSING 667) zijn de knoppen 44 px hoog, zoals op de slotschermen liggend
      expect(a.height).toBeGreaterThanOrEqual(hoog <= 500 && breed > hoog ? 44 : 48);
      expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1); // naast elkaar (BESLISSING 513)
      expect(b.x).toBeGreaterThan(a.x); // instellen links, Nu niet rechts
      await expect(nuNiet).toHaveClass(/knop--secundair/);
      await expect(page.getByRole('radio', { name: /^Pincode/ })).toHaveAttribute('aria-checked', 'true');
      // de vier stappen houden de kaart even hoog
      expect(await geenHorizontaal(page)).toBe(true);
    });
  }

  // BESLISSING 512: elke stap is even groot en de inhoud van een kortere stap staat verticaal in het midden
  test('de kaart verspringt niet tussen stap 1 en stap 4 en de inhoud staat in het midden', async ({ page }) => {
    await authenticator(page, 'ok');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
    await animatiesKlaar(page);
    const hoogte = () => page.locator('.welkom__kaart').evaluate((e) => Math.round(e.getBoundingClientRect().height));
    // de ruimte boven het eerste en onder het laatste zichtbare onderdeel van de actieve stap, binnen het vak van de stappen
    const lucht = () => page.evaluate(() => { const vak = document.querySelector('.welkom__stappen').getBoundingClientRect(); const delen = [...document.querySelector('.welkom__stap.is-actief').children].map((k) => k.getBoundingClientRect()).filter((b) => b.height > 0); return { boven: delen[0].top - vak.top, onder: vak.bottom - delen[delen.length - 1].bottom }; });
    const h1 = await hoogte();
    const l1 = await lucht();
    expect(Math.abs(l1.boven - l1.onder)).toBeLessThanOrEqual(16);
    for (let n = 2; n <= 5; n++) {
      await verder(page).click();
      await expect(page.getByText(`Stap ${n} van 5`)).toBeVisible();
      await animatiesKlaar(page);
      expect(Math.abs((await hoogte()) - h1)).toBeLessThanOrEqual(1);
      const l = await lucht();
      expect(Math.abs(l.boven - l.onder)).toBeLessThanOrEqual(16);
    }
  });
});

// ===================================================================== Algemeen › Vergrendeling op Android (en ter controle op iPhone)

const VERGRENDELING = './#/meer/vergrendeling';

async function zetAanMetPincode(page) {
  await page.goto(VERGRENDELING);
  await SLOT(page).click();
  await tik(page, CODE);
  await tik(page, CODE);
  await rondAf(page);
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
}

// Stap 1 tot 3 van de eigenaar, op één toestel. methode: de naam van de tweede keuze; slotknop: de knop onder het cijferblok (BESLISSING 712).
async function stappen1tot3(page, methode, slotknop) {
  const bio = page.getByRole('radio', { name: new RegExp('^' + methode) });
  // 1. aanzetten met een pincode
  await zetAanMetPincode(page);
  expect(await instelling(page, 'slot.methode')).toBe('pin');
  // 2a. de pincode wijzigen vraagt de huidige code
  await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
  await expect(page.getByText('Geef je huidige code in.')).toBeVisible();
  await tik(page, '000000');
  await expect(page.locator('.slot__boodschap')).toHaveText('Die code klopt niet.');
  await tik(page, CODE);
  await expect(page.getByText('Kies je nieuwe code van zes cijfers.')).toBeVisible();
  await tik(page, '246810'); // BESLISSING 533: de nieuwe code een keer
  await expect(page.getByRole('button', { name: 'Pincode wijzigen' })).toBeVisible();
  // 3a. naar de methode van het toestel: eerst de huidige (nieuwe) code (BESLISSING 403)
  await bio.click();
  await expect(page.getByText('Geef je huidige code in.')).toBeVisible();
  expect(await page.evaluate(() => window.__pkGemaakt)).toBe(0);
  await tik(page, '246810');
  await expect(bio).toHaveAttribute('aria-checked', 'true');
  expect(await instelling(page, 'slot.methode')).toBe('faceid');
  expect(await instelling(page, 'slot.passkeyId')).toBeTruthy();
  expect(await page.evaluate(() => window.__pkGemaakt)).toBe(1);
  // het slot vraagt de methode van het toestel (hier geannuleerd); de knop draagt haar naam en de code werkt
  await page.evaluate(() => sessionStorage.setItem('__pk', 'annuleer'));
  await page.reload();
  await expect(page.locator('#slot .cijferblok')).toBeVisible();
  await expect(page.locator('#slot').getByRole('button', { name: slotknop, exact: true })).toBeVisible();
  await tik(page, '246810');
  await expect(page.locator('#slot')).toBeHidden();
  await page.evaluate(() => sessionStorage.removeItem('__pk'));
  // 3b. terug naar Pincode (geen codevraag, de passkey wordt vergeten)
  await page.goto(VERGRENDELING);
  await KIES_PIN(page).click();
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
  expect(await instelling(page, 'slot.methode')).toBe('pin');
  expect(await instelling(page, 'slot.passkeyId')).toBeNull();
  // 2b. uitzetten vraagt de huidige code en de bestaande bevestiging
  await SLOT(page).click();
  await expect(page.getByText('Geef je huidige code in.')).toBeVisible();
  await tik(page, '246810');
  await page.getByRole('button', { name: 'Uitzetten', exact: true }).click();
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'false');
  expect(await instelling(page, 'slot.pin')).toBeNull();
  await page.reload();
  await expect(page.locator('#slot .cijferblok')).toHaveCount(0);
}

for (const [toestel, opties, methode, , slotknop] of TOESTELLEN) {
  test.describe(`Vergrendeling in de instellingen (${toestel})`, () => {
    test.use(opties);
    test.beforeEach(async ({ page }) => vasteKlok(page));

    test('stap 1 tot 3: aanzetten met pincode, wijzigen, naar de methode van het toestel en terug, uitzetten', async ({ page }) => {
      await authenticator(page, 'ok');
      await stappen1tot3(page, methode, slotknop);
    });
  });
}

test.describe('Vergrendeling op Android (Pixel 7)', () => {
  test.use(ANDROID);
  test.beforeEach(async ({ page }) => vasteKlok(page));
  const METHODE = 'Vingerafdruk of schermslot';

  test('zonder platformauthenticator: alleen Pincode, met een duidelijke regel en zonder dode knop; Pincode werkt', async ({ page }) => {
    await authenticator(page, 'geen');
    await page.goto(VERGRENDELING);
    await expect(SLOT(page)).toBeVisible();
    await expect(page.locator('.slot__optie')).toHaveCount(1);
    await expect(page.locator('.slot__optie:disabled')).toHaveCount(0);
    await expect(page.getByText('Dit toestel kan Bloei niet met je vingerafdruk of schermslot openen. Je pincode opent Bloei altijd.')).toBeVisible();
    await zetAanMetPincode(page);
    await expect(page.locator('.slot__optie')).toHaveCount(1);
  });

  test('nergens Face ID, Safari of iPhone op de schermen van de vergrendeling, en geen tekst loopt uit zijn knop of rij op 360 px', async ({ page }) => {
    await authenticator(page, 'ok');
    await page.setViewportSize({ width: 360, height: 740 });
    const controleer = async (naam) => {
      await animatiesKlaar(page);
      expect(await appTekst(page), naam).not.toMatch(/Face ID|Safari|iPhone/);
      expect(await geenHorizontaal(page), naam).toBe(true);
      const uit = await page.evaluate(() => {
        const fout = [];
        for (const el of document.querySelectorAll('#app button, #app .rij, #app .slot__optie, #slot button')) {
          if (!el.getClientRects().length) continue;
          const r = el.getBoundingClientRect();
          if (el.scrollWidth > el.clientWidth + 1) fout.push('scroll: ' + el.textContent.trim().slice(0, 40));
          for (const kind of el.querySelectorAll('span, p')) {
            const k = kind.getBoundingClientRect();
            if (k.width && (k.right > r.right + 1 || k.left < r.left - 1)) fout.push('uit: ' + kind.textContent.trim().slice(0, 40));
          }
        }
        return fout;
      });
      expect(uit, naam).toEqual([]);
    };
    await page.goto(VERGRENDELING);
    await controleer('overzicht uit');
    await page.getByRole('radio', { name: new RegExp('^' + METHODE) }).click();
    await expect(page.locator('.cijferblok')).toBeVisible();
    await controleer('code kiezen');
    await tik(page, CODE);
    await tik(page, CODE);
    await expect(page.locator('[data-herstelstap]')).toBeVisible();
    await controleer('herstelcode');
    await rondAf(page);
    await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
    await controleer('overzicht aan');
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await controleer('huidige code');
    await page.getByRole('button', { name: 'Annuleren' }).click();
    await page.evaluate(() => sessionStorage.setItem('__pk', 'annuleer'));
    await page.reload();
    await expect(page.locator('#slot .cijferblok')).toBeVisible();
    await controleer('slotscherm');
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await controleer('code kwijt');
    await expect(page.getByRole('button', { name: 'Bevestig met je vingerafdruk of schermslot' })).toBeVisible();
    if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/android-kwijt-360.png` });
  });

  test('de terugknop tijdens het instellen laat geen halve instelling achter', async ({ page }) => {
    await authenticator(page, 'ok');
    const stand = async () => [await instelling(page, 'slot.aan'), await instelling(page, 'slot.pin'), await instelling(page, 'slot.methode')];
    const heel = ([aan, pin, methode]) => (aan === true && pin && methode) || (!aan && !pin && !methode);
    await page.goto('./#/meer');
    await page.goto(VERGRENDELING);
    // cijferblok open, één keer ingegeven, dan terug
    await SLOT(page).click();
    await tik(page, CODE);
    await page.goBack();
    await expect(page).toHaveURL(/#\/meer$/);
    let s = await stand();
    expect(heel(s), JSON.stringify(s)).toBeTruthy();
    expect(s[1]).toBeNull(); // nooit een pincode die ze niet bevestigde
    // methode van het toestel: na de eerste code terug
    await page.goto(VERGRENDELING);
    await page.getByRole('radio', { name: new RegExp('^' + METHODE) }).click();
    await tik(page, CODE);
    await page.goBack();
    s = await stand();
    expect(s[1]).toBeNull();
    expect(heel(s), JSON.stringify(s)).toBeTruthy();
    // slot aan; uitzetten: huidige code, de bevestiging staat open, dan terug
    await page.goto('./#/meer');
    await zetAanMetPincode(page);
    await SLOT(page).click();
    await tik(page, CODE);
    await expect(page.getByRole('button', { name: 'Uitzetten', exact: true })).toBeVisible();
    await page.goBack();
    s = await stand();
    expect(heel(s), JSON.stringify(s)).toBeTruthy();
    // wijzigen: de huidige code, dan terug vóór de nieuwe: de oude code blijft (BESLISSING 533: de nieuwe code één keer bewaart meteen)
    await page.goto('./#/meer');
    await page.goto(VERGRENDELING);
    if ((await instelling(page, 'slot.aan')) !== true) await zetAanMetPincode(page);
    const oud = await instelling(page, 'slot.pin');
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await tik(page, CODE);
    await expect(page.getByText('Kies je nieuwe code van zes cijfers.')).toBeVisible();
    await tik(page, '1357');
    await page.goBack();
    s = await stand();
    expect(heel(s), JSON.stringify(s)).toBeTruthy();
    expect(await instelling(page, 'slot.pin')).toEqual(oud);
  });
});

test.describe('Android: na Nu niet in het welkomscherm', () => {
  test.use({ ...ANDROID, storageState: LEEG });
  test.beforeEach(async ({ page }) => vasteKlok(page));
  test('alles kan alsnog bij Algemeen › Vergrendeling', async ({ page }) => {
    await authenticator(page, 'ok');
    await naarStap4(page);
    await page.getByRole('button', { name: 'Nu niet' }).click();
    await expect(page).toHaveURL(/#\/vandaag$/);
    await stappen1tot3(page, 'Vingerafdruk of schermslot', 'Vingerafdruk gebruiken');
  });
});

test.describe('Welkom: terugknop van Android tijdens het cijferblok', () => {
  test.use({ ...ANDROID, storageState: LEEG });
  test.beforeEach(async ({ page }) => vasteKlok(page));
  test('geen halve instelling: nooit een pincode die ze niet bevestigde', async ({ page }) => {
    await authenticator(page, 'ok');
    await naarStap4(page);
    await verder(page).click();
    await tik(page, CODE);
    await page.goBack().catch(() => null);
    const st = await slotStand(page).catch(() => ({}));
    expect(st['slot.pin'] ?? null).toBeNull();
    expect(st['slot.aan'] ?? null).toBeFalsy();
  });
});
