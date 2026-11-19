// BESLISSING 423: Bloei werkt op Android én blijft op iPhone zoals ze was (AN-02 tot AN-08, nagebootst; BESLISSING 425: geen echt toestel).
// Android: Pixel 7 (user-agent, 412x915, isMobile, hasTouch). iPhone: de user-agent van een iPhone in hetzelfde Chrome (alleen de herkenning
// verschilt; WebKit draait hier niet). page.goBack() is een geschiedenisstap, geen close request: zo gedraagt een browser zonder close
// requests (Safari, Firefox, oudere Chrome) en de terugknop van een desktopbrowser zich.
import { existsSync } from 'node:fs';
import { test, expect, devices } from '@playwright/test';
import { animatiesKlaar, schermKlaar } from './wacht.js';
import { vasteKlok } from './vaste-klok.js';
import { aanbod, authenticator, rondAf, stap, tik } from './slot-hulp.js';

// BESLISSING 515: de downloadknop staat er alleen als de bouw public/bloei.apk bevatte (vite.config.js, apkVlag); dezelfde regel hier.
const MET_APK = existsSync(new URL('../../public/bloei.apk', import.meta.url));
const PIXEL = devices['Pixel 7'];
const ANDROID = { userAgent: PIXEL.userAgent, viewport: PIXEL.viewport, deviceScaleFactor: PIXEL.deviceScaleFactor, isMobile: true, hasTouch: true };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE = { userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const appTekst = (page) => page.evaluate(() => document.getElementById('app')?.innerText ?? '');
const blad = (page) => page.locator('dialog.dialoog[open]');
const uitlegKaart = (page) => page.locator('.uitleg__kaart[role="dialog"]').first();

// Een nagebootst beforeinstallprompt: telt de aanroepen van prompt().
async function stuurInstallatievraag(page, outcome = 'dismissed') {
  await page.evaluate((outcome) => {
    window.__prompts = 0;
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => {
      window.__prompts += 1;
      return Promise.resolve();
    };
    e.userChoice = Promise.resolve({ outcome, platform: 'web' });
    window.dispatchEvent(e);
  }, outcome);
}

// Alle stappen van een rondleiding doorlopen; geeft de teksten van elke stap.
async function leesRondleiding(page) {
  const teksten = [];
  for (let i = 0; i < 12; i += 1) {
    const k = uitlegKaart(page);
    await expect(k).toBeVisible();
    teksten.push(await k.innerText());
    const volgende = k.locator('.uitleg__volgende');
    const label = (await volgende.innerText()).trim();
    await volgende.click();
    if (label === 'Klaar') break;
  }
  await expect(page.locator('.uitleg__kaart[role="dialog"]')).toHaveCount(0);
  return teksten.join('\n');
}

async function startHandelingBeginscherm(page) {
  await page.goto('./#/meer/uitleg');
  await schermKlaar(page, '#/meer/uitleg');
  await page.getByRole('button', { name: 'Toon het me: Bloei op mijn beginscherm zetten' }).click();
}

async function openMaaltijdblad(page) {
  const rij = page.locator('.vandaag .maaltijd[data-soort="ontbijt"] > .rij');
  await expect(rij).toBeVisible();
  await animatiesKlaar(page);
  await rij.click();
  await expect(blad(page)).toBeVisible();
}

test.describe('Android (Pixel 7)', () => {
  test.use(ANDROID);
  test.beforeEach(async ({ page }) => vasteKlok(page));

  test('AN-03 (BESLISSING 515): de installatiestrook is een downloadlink naar de apk, alleen als de bouw de apk bevat; een installatievraag van Chrome verandert niets', async ({ page }) => {
    await page.goto('./#/vandaag');
    await schermKlaar(page, '#/vandaag');
    const strook = page.locator('.installatiestrook');
    // Chrome toont zijn eigen installatiebalk niet: het event wordt tegengehouden en prompt() wordt nooit aangeroepen.
    await stuurInstallatievraag(page);
    expect(await page.evaluate(() => window.__prompts)).toBe(0);
    if (!MET_APK) {
      await expect(strook).toHaveCount(0);
      return;
    }
    await expect(strook).toBeVisible();
    await expect(strook).toContainText('Download Bloei voor je Android-toestel. Android vraagt je daarna om het bestand te openen en te installeren.');
    await expect(strook).not.toContainText(/Safari|Deel/);
    const link = strook.getByRole('link', { name: 'Download de app' });
    await expect(link).toHaveAttribute('href', '/bloei.apk');
    await expect(link).toHaveAttribute('download', '');
    await expect(page.getByRole('button', { name: 'Op beginscherm zetten' })).toHaveCount(0);
    expect(await page.evaluate(() => window.__prompts)).toBe(0);
    // Niet nu: de strook verdwijnt en blijft weg na herladen
    await strook.getByRole('button', { name: 'Niet nu' }).click();
    await expect(strook).toHaveCount(0);
    await page.reload();
    await schermKlaar(page, '#/vandaag');
    await expect(page.locator('.installatiestrook')).toHaveCount(0);
  });

  test('AN-03: in de apk zelf (referrer android-app://) geen strook', async ({ page }) => {
    // Chrome in een TWA geeft document.referrer als android-app://<pakket>; een gewone navigatie kan die schema niet nabootsen.
    await page.addInitScript(() => Object.defineProperty(document, 'referrer', { get: () => 'android-app://be.voorbeeld.bloei' }));
    await page.goto('./#/vandaag');
    await schermKlaar(page, '#/vandaag');
    await expect(page.locator('.installatiestrook')).toHaveCount(0);
  });

  test('AN-02: de uitleg "Bloei op mijn beginscherm zetten" toont de stappen van Chrome, zonder Safari of Face ID', async ({ page }) => {
    await startHandelingBeginscherm(page);
    const tekst = await leesRondleiding(page);
    if (MET_APK) {
      expect(tekst).toContain('Download de app');
      expect(tekst).not.toMatch(/Safari|iPhone|Face ID|Voeg toe|Installeren en snelkoppeling/);
    } else {
      expect(tekst).toContain('Installeren en snelkoppeling maken');
      expect(tekst).not.toMatch(/Safari|iPhone|Face ID|Voeg toe/);
    }
  });

  test('AN-04: Vergrendeling noemt nergens Face ID, wel vingerafdruk of schermslot', async ({ page }) => {
    await page.goto('./#/meer/vergrendeling');
    await schermKlaar(page, '#/meer/vergrendeling');
    const tekst = await appTekst(page);
    expect(tekst).not.toContain('Face ID');
    expect(tekst).toContain('Vingerafdruk of schermslot');
    // de rondleiding van het scherm en die van "Hoe doe ik dat?"
    await page.locator('.schermkop__uitleg').first().click();
    expect(await leesRondleiding(page)).not.toContain('Face ID');
  });

  // BESLISSING 518 en 541 op Android: het slot aanzetten, de herstelcode, Vergrendeling en "Je code niet meer weten" noemen nergens Face ID
  // (BESLISSING 423, AN-04). De weg met het toestel heet er "vingerafdruk of schermslot" en staat er zonder koppelen (geen aanbod, geen rij "Herstel met").
  test('AN-04 (BESLISSING 541): aanzetten zonder aanbod, Vergrendeling met de zin over een vergeten code, en de weg "vingerafdruk of schermslot" staat er zonder koppelen', async ({ page }) => {
    await authenticator(page, 'ok');
    await page.goto('./#/meer/vergrendeling');
    await schermKlaar(page, '#/meer/vergrendeling');
    await page.getByRole('switch', { name: /^Bloei vergrendelen/ }).click();
    await tik(page, '123456');
    await tik(page, '123456');
    await expect(stap(page)).toBeVisible(); // meteen de herstelcode: er is geen aanbod om het toestel te koppelen
    await expect(aanbod(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /koppel mijn toestel/ })).toHaveCount(0);
    expect(await appTekst(page)).not.toMatch(/Face ID/);
    await rondAf(page);
    await expect(page.getByRole('switch', { name: /^Bloei vergrendelen/ })).toHaveAttribute('aria-checked', 'true');
    await schermKlaar(page, '#/meer/vergrendeling');
    const tekst = await appTekst(page);
    expect(tekst).not.toMatch(/Face ID/);
    expect(tekst).not.toContain('Herstel met');
    await expect(page.getByRole('button', { name: /^(Toestel )?(ont)?[Kk]oppel/ })).toHaveCount(0);
    await expect(page.locator('[data-vergeet]')).toHaveText('Vergeet je je code, dan kies je een nieuwe met je vingerafdruk of schermslot, of met je herstelcode.');
    // het slotscherm en "Ik ken mijn code niet meer": de weg staat er al, zonder dat er ooit gekoppeld is
    await page.reload();
    await expect(page.locator('#slot .cijferblok')).toBeVisible();
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.getByRole('button', { name: 'Bevestig met je vingerafdruk of schermslot' })).toBeVisible();
    await expect(page.locator('#slot .slot__uitleg').filter({ hasText: 'Bevestig met je vingerafdruk of schermslot, of gebruik je herstelcode.' })).toBeVisible();
    expect(await page.locator('#slot').innerText()).not.toMatch(/Face ID/);
    await page.getByRole('button', { name: 'Bevestig met je vingerafdruk of schermslot' }).click();
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    expect(await page.locator('#slot').innerText()).not.toMatch(/Face ID/);
  });

  test('AN-04 (BESLISSING 541): een Android-toestel zonder vingerafdruk of schermslot krijgt geen dode knop voor het toestel, en de zin bij Vergrendeling noemt alleen de herstelcode', async ({ page }) => {
    await authenticator(page, 'geen');
    await page.goto('./#/meer/vergrendeling');
    await schermKlaar(page, '#/meer/vergrendeling');
    await page.getByRole('switch', { name: /^Bloei vergrendelen/ }).click();
    await tik(page, '123456');
    await tik(page, '123456');
    await expect(stap(page)).toBeVisible(); // meteen de herstelcode, zonder aanbod
    await expect(aanbod(page)).toHaveCount(0);
    await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
    await stap(page).getByRole('button', { name: 'Verder' }).click();
    await expect(page.getByRole('switch', { name: /^Bloei vergrendelen/ })).toHaveAttribute('aria-checked', 'true');
    await schermKlaar(page, '#/meer/vergrendeling');
    await expect(page.locator('[data-uitleg="slot-toestel"]')).toHaveCount(0);
    expect(await appTekst(page)).not.toMatch(/Face ID/);
    await expect(page.locator('[data-vergeet]')).toHaveText('Vergeet je je code, dan kies je een nieuwe met je herstelcode.');
    await page.reload();
    await expect(page.locator('#slot .cijferblok')).toBeVisible();
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.getByRole('button', { name: /^Bevestig met/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Gebruik je herstelcode' })).toBeVisible();
  });

  test('AN-07: terug met een open blad sluit het blad en blijft op hetzelfde scherm; daarna gaat terug gewoon terug', async ({ page }) => {
    await page.goto('./#/meer');
    await schermKlaar(page, '#/meer');
    await page.goto('./#/vandaag');
    await schermKlaar(page, '#/vandaag');
    await openMaaltijdblad(page);
    await page.goBack();
    await expect(blad(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#\/vandaag$/);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
    // het blad opnieuw, nu dicht met het kruisje: de ingang verdwijnt, één keer terug brengt je naar het vorige scherm
    await openMaaltijdblad(page);
    await blad(page).locator('.blad__sluit').click();
    await expect(blad(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/#\/meer$/);
  });

  test('AN-06: terug tijdens de rondleiding sluit de rondleiding en blijft op hetzelfde scherm', async ({ page }) => {
    await page.goto('./#/vandaag');
    await schermKlaar(page, '#/vandaag');
    await page.locator('.schermkop__uitleg').first().click();
    await expect(uitlegKaart(page)).toBeVisible();
    await page.goBack();
    await expect(page.locator('.uitleg__kaart[role="dialog"]')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/vandaag$/);
    await expect(page.locator('#scherm[data-scherm="vandaag"]')).toBeVisible();
  });

  test('AN-08: de supplementkaart gooit bij terug niets stil weg', async ({ page }) => {
    await page.goto('./#/supplementen');
    await schermKlaar(page, '#/supplementen');
    await page.getByRole('button', { name: /supplement toevoegen/i }).filter({ visible: true }).first().click();
    const kaart = page.locator('dialog.supplementkaart[open]');
    await expect(kaart).toBeVisible();
    const naam = kaart.getByRole('textbox', { name: 'Naam' });
    await naam.fill('Magnesium');
    // terug: de kaart blijft, met de vraag
    await page.goBack();
    await expect(kaart).toBeVisible();
    await expect(kaart).toContainText('Wijzigingen bewaren?');
    await expect(naam).toHaveValue('Magnesium');
    await expect(page).toHaveURL(/#\/supplementen$/);
    // nog eens terug zonder tik ertussen: nog altijd niets weg
    await page.goBack();
    await expect(kaart).toBeVisible();
    await expect(naam).toHaveValue('Magnesium');
    // een close request die niet te annuleren is (de tweede terugveeg op Android): de browser sluit de kaart; ze komt terug
    await page.evaluate(() => {
      const d = document.querySelector('dialog.supplementkaart');
      d.dispatchEvent(new Event('cancel', { cancelable: false }));
      d.close();
    });
    await expect(kaart).toBeVisible();
    await expect(naam).toHaveValue('Magnesium');
    await expect(kaart).toContainText('Wijzigingen bewaren?');
    // zonder wijzigingen: terug sluit de kaart gewoon
    await kaart.getByRole('button', { name: 'Niet bewaren' }).click();
    await expect(page.locator('dialog.supplementkaart')).toHaveCount(0);
    await page.getByRole('button', { name: /supplement toevoegen/i }).filter({ visible: true }).first().click();
    await expect(kaart).toBeVisible();
    await page.goBack();
    await expect(page.locator('dialog.supplementkaart')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/supplementen$/);
  });
});

test.describe('iPhone: alles blijft de bestaande iOS-tekst', () => {
  test.use(IPHONE);
  test.beforeEach(async ({ page }) => vasteKlok(page));

  test('de installatiestrook en de uitleg zijn die van Safari; een installatievraag verandert niets', async ({ page }) => {
    await page.goto('./#/vandaag');
    await schermKlaar(page, '#/vandaag');
    const strook = page.locator('.installatiestrook');
    await expect(strook).toBeVisible();
    await expect(strook).toContainText('Tik op “Deel” en dan op “Zet op beginscherm”. Dan opent Bloei als een gewone app.');
    await stuurInstallatievraag(page);
    await expect(page.getByRole('button', { name: 'Op beginscherm zetten' })).toHaveCount(0);
    await startHandelingBeginscherm(page);
    const tekst = await leesRondleiding(page);
    expect(tekst).toContain('Open Bloei in Safari');
    expect(tekst).toContain('Tik rechtsboven op Voeg toe.');
    expect(tekst).not.toContain('Chrome');
  });

  test('Vergrendeling zegt Face ID, zoals BESLISSING 192/193', async ({ page }) => {
    await page.goto('./#/meer/vergrendeling');
    await schermKlaar(page, '#/meer/vergrendeling');
    const tekst = await appTekst(page);
    expect(tekst).toContain('Face ID');
    expect(tekst).not.toMatch(/vingerafdruk|schermslot/i);
  });
});

// Android, 360 px breed: de langere naam van de methode van het slot breekt netjes af (BESLISSING 439; css in src/stijl/slot.css).
// Meet of niets uit zijn knop, rij of vak loopt. De knop van het slotscherm en het slotvoorbeeld tonen de naam alleen als de
// telefoon een passkey kent; die twee worden hier met dezelfde klassen en tekst in de echte omgeving gezet.
test.describe('Android 360 px: lange labels van het slot', () => {
  test.use({ ...ANDROID, viewport: { width: 360, height: 740 } });
  test.beforeEach(async ({ page }) => vasteKlok(page));

  async function lopenUit(page, kiezer) {
    return page.evaluate((k) => {
      const uit = [];
      for (const el of document.querySelectorAll(k)) {
        const r = el.getBoundingClientRect();
        const ouder = (el.closest('.slot__optie, .knop, .slotvoorbeeld, .slot__groep, .rij') || el.parentElement).getBoundingClientRect();
        if (r.width === 0) continue;
        if (el.scrollWidth > el.clientWidth + 1 || r.right > ouder.right + 1 || r.left < ouder.left - 1 || r.right > window.innerWidth) uit.push(`${el.className} ${Math.round(r.left)}-${Math.round(r.right)} in ${Math.round(ouder.left)}-${Math.round(ouder.right)}`);
      }
      return uit;
    }, kiezer);
  }

  test('Vergrendeling: de keuze en het slotvoorbeeld lopen nergens uit hun rij of vak', async ({ page }) => {
    await page.goto('./#/meer/vergrendeling');
    await schermKlaar(page, '#/meer/vergrendeling');
    await page.getByRole('switch', { name: /^Bloei vergrendelen/ }).click();
    await tik(page, '123456');
    await tik(page, '123456');
    await rondAf(page); // BESLISSING 518: eventueel het aanbod van het toestel, dan de herstelcode met het vinkje
    await expect(page.getByRole('switch', { name: /^Bloei vergrendelen/ })).toHaveAttribute('aria-checked', 'true');
    await schermKlaar(page, '#/meer/vergrendeling');
    await expect(page.locator('.slot__groep')).toContainText('Vingerafdruk of schermslot');
    expect(await lopenUit(page, '.slot__groep *')).toEqual([]);
    await page.evaluate(() => {
      const vb = document.querySelector('.slotvoorbeeld');
      const s = document.createElement('span');
      s.className = 'slotvoorbeeld__faceid';
      s.textContent = 'Vingerafdruk gebruiken'; // BESLISSING 712
      vb?.querySelector('.slotvoorbeeld__kwijt')?.before(s);
    });
    expect(await lopenUit(page, '.slotvoorbeeld, .slotvoorbeeld *')).toEqual([]);
    await page.screenshot({ path: `${process.env.PW_OUTDIR}/vergrendeling-360.png` });
    // het slotscherm zelf
    await page.reload();
    await expect(page.locator('#slot .cijferblok')).toBeVisible();
    await page.evaluate(() => {
      const a = document.querySelector('#slot .slot__acties');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'knop knop--secundair knop--breed';
      const t = document.createElement('span');
      t.className = 'knop__tekst';
      t.textContent = 'Vingerafdruk gebruiken'; // BESLISSING 712
      b.append(t);
      a.prepend(b);
    });
    expect(await lopenUit(page, '#slot .slot__acties .knop, #slot .slot__acties .knop *')).toEqual([]);
    // de tekst houdt zijn marge binnen de knop (hij loopt niet tegen de rand) en de knop is minstens zo hoog als voorheen
    const maten = await page.evaluate(() => {
      const k = document.querySelector('#slot .slot__acties .knop');
      const t = k.querySelector('.knop__tekst').getBoundingClientRect();
      const r = k.getBoundingClientRect();
      return { links: t.left - r.left, rechts: r.right - t.right, hoogte: r.height };
    });
    expect(maten.links).toBeGreaterThanOrEqual(12);
    expect(maten.rechts).toBeGreaterThanOrEqual(12);
    // de nieuwe naam (BESLISSING 451) past op één regel: de knop is niet hoger dan een gewone knop
    expect(maten.hoogte).toBeLessThanOrEqual(52);
    expect(maten.hoogte).toBeGreaterThanOrEqual(48);
    await page.screenshot({ path: `${process.env.PW_OUTDIR}/slotscherm-360.png` });
  });
});

// De installatiestrook (src/stijl/layout.css): gap en flex-wrap op .installatiestrook__acties. De Android-strook heeft twee knoppen en moet er netjes
// uitzien; de iOS-strook moet er exact hetzelfde uitzien als zonder die twee eigenschappen ("voor" = dezelfde pagina met gap: normal en nowrap).
const metenStrook = (page) =>
  page.evaluate(() => {
    const kader = (el) => {
      const r = el.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 100) / 100);
    };
    const s = document.querySelector('.installatiestrook');
    return { strook: kader(s), acties: kader(s.querySelector('.installatiestrook__acties')), knoppen: [...s.querySelectorAll('.knop')].map(kader) };
  });

test.describe('Installatiestrook: Android heeft twee knoppen, iOS blijft gelijk', () => {
  test.beforeEach(async ({ page }) => vasteKlok(page));

  test.describe('iPhone', () => {
    test.use(IPHONE);
    test('de strook is met gap en flex-wrap exact even groot als zonder', async ({ page }) => {
      await page.goto('./#/vandaag');
      await schermKlaar(page, '#/vandaag');
      await expect(page.locator('.installatiestrook')).toBeVisible();
      await animatiesKlaar(page);
      const na = await metenStrook(page);
      await page.evaluate(() => {
        const a = document.querySelector('.installatiestrook__acties');
        a.style.gap = 'normal';
        a.style.flexWrap = 'nowrap';
      });
      const voor = await metenStrook(page);
      expect(na).toEqual(voor);
    });
  });

  for (const breedte of [360, 412]) {
    test.describe(`Android ${breedte} px`, () => {
      test.use({ ...ANDROID, viewport: { width: breedte, height: 800 } });
      test('de twee knoppen staan naast elkaar met ruimte ertussen, of onder elkaar als het niet past; nooit buiten de strook', async ({ page }) => {
        await page.goto('./#/vandaag');
        await schermKlaar(page, '#/vandaag');
        if (!MET_APK) {
          await expect(page.locator('.installatiestrook')).toHaveCount(0);
          return;
        }
        await expect(page.locator('.installatiestrook')).toBeVisible();
        await animatiesKlaar(page);
        const m = await metenStrook(page);
        expect(m.knoppen).toHaveLength(2);
        const [a, b] = m.knoppen;
        const strookRechts = m.strook[0] + m.strook[2];
        for (const k of m.knoppen) {
          expect(k[0]).toBeGreaterThanOrEqual(m.strook[0]);
          expect(k[0] + k[2]).toBeLessThanOrEqual(strookRechts + 0.5);
        }
        const naastElkaar = Math.abs(a[1] - b[1]) < 2;
        if (naastElkaar) expect(b[0] - (a[0] + a[2])).toBeGreaterThanOrEqual(7.9);
        else expect(b[1] - (a[1] + a[3])).toBeGreaterThanOrEqual(7.9);
        await page.locator('.installatiestrook').screenshot({ path: `${process.env.PW_OUTDIR}/strook-android-${breedte}.png` });
      });
    });
  }
});
