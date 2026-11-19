// De vergrendeling (E10): aanzetten, slot bij openen, juiste en foute code, wachttijd, vijf minuten op de
// achtergrond, een vergeten code (herstelwegen en als laatste uitweg opnieuw beginnen, BESLISSING 518), uitzetten, en dat met het slot dicht
// niets van het dagboek te zien of te bereiken is. Het herstellen zelf: x-herstel.spec.js.
import { test, expect } from '@playwright/test';
import { TEKSTEN } from '../../src/teksten.js';
import { wachtTotStil } from './r-wacht.js';

const TERUG = TEKSTEN.meer.terug;
// Eén schakelaar Vergrendeling en daaronder een keuze uit twee, Pincode of Face ID (BESLISSING 194; op elk toestel heet het Face ID).
const SLOT = (page) => page.getByRole('switch', { name: /^Bloei vergrendelen/ });
const KIES_PIN = (page) => page.getByRole('radio', { name: /^Pincode/ });
const FACE = (page) => page.getByRole('radio', { name: /^Face ID/ });

const CODE = '123456';

// Een verschuifbare klok: Date.now() loopt op met window.__verschil (ms). Zo kunnen we vijf minuten overslaan.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__verschil = window.__verschil || 0;
    const echt = Date.now.bind(Date);
    Date.now = () => echt() + window.__verschil;
  });
});

async function tik(page, code) {
  for (const cijfer of code) await page.locator(`.cijferblok__toets[data-cijfer="${cijfer}"]`).click();
}

// BESLISSING 518: na de code de herstelcode met het vinkje. BESLISSING 541: geen vraag "Je toestel als hulp" meer ertussen.
async function rondAf(page) {
  const stap = page.locator('[data-herstelstap]');
  await expect(stap).toBeVisible();
  await expect(page.locator('[data-toestelaanbod]')).toHaveCount(0);
  await stap.getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
  await stap.getByRole('button', { name: 'Verder' }).click();
}

async function zetSlotAan(page, code = CODE) {
  await page.goto('./#/meer/vergrendeling');
  await SLOT(page).click();
  await tik(page, code);
  await tik(page, code);
  await rondAf(page);
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
}

async function wachtOpSlot(page) {
  await expect(page.locator('#slot')).toBeVisible();
  await expect(page.locator('.cijferblok')).toBeVisible();
}

async function zetZichtbaarheid(page, staat) {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    document.dispatchEvent(new Event('visibilitychange'));
  }, staat);
}

async function zetInstellingInDb(page, sleutel, waarde) {
  await page.evaluate(
    ([s, w]) =>
      new Promise((klaar, mislukt) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => mislukt(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: s, waarde: w });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
        };
      }),
    [sleutel, waarde],
  );
}

test('standaard staat het slot uit: de app opent meteen', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#slot')).toBeHidden();
});

test('aanzetten, herladen: het slot verschijnt en er is niets van het dagboek te zien of te bereiken', async ({ page }) => {
  await page.goto('./#/vandaag');
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');

  await zetSlotAan(page);
  await page.goto('./#/vandaag');
  await page.reload();
  await wachtOpSlot(page);

  // Niets van het dagboek in de DOM-boom die zichtbaar of bereikbaar is.
  const zichtbaar = await page.evaluate(() => document.body.innerText);
  for (const woord of ['Vandaag', 'Dagboek', 'Drinken', 'Gewicht', 'Goeie', 'liter']) expect(zichtbaar).not.toContain(woord);
  expect(await page.getByRole('navigation').count()).toBe(0);
  expect(await page.getByRole('link', { name: 'Vandaag' }).count()).toBe(0);
  const app = await page.evaluate(() => {
    const a = document.getElementById('app');
    return { leeg: a.childElementCount === 0, verborgen: a.hidden && a.inert };
  });
  expect(app.leeg || app.verborgen).toBe(true);

  // Juiste code: de app opent en de gegevens zijn er nog.
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#slot')).toBeHidden();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
});

test('een foute code geeft een melding; vijf fouten geven een wachttijd die ook na herladen blijft, en daarna werkt de juiste code', async ({ page }) => {
  await page.goto('./#/vandaag');
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
  await zetSlotAan(page);
  await page.reload();
  await wachtOpSlot(page);

  await tik(page, '999999');
  await expect(page.locator('.slot__boodschap')).toHaveText('Die code klopt niet.');
  for (let i = 0; i < 4; i++) await tik(page, '999999');
  await expect(page.locator('.slot__boodschap')).toContainText('Even wachten');
  await expect(page.locator('.cijferblok__toets[data-cijfer="1"]')).toBeDisabled();

  await page.reload();
  await wachtOpSlot(page);
  await expect(page.locator('.slot__boodschap')).toContainText('Even wachten');
  await expect(page.locator('.cijferblok__toets[data-cijfer="1"]')).toBeDisabled();

  // De wachttijd is voorbij: de juiste code werkt en niets is gewist.
  await zetInstellingInDb(page, 'slot.wachtTot', 1);
  await page.reload();
  await wachtOpSlot(page);
  await expect(page.locator('.cijferblok__toets[data-cijfer="1"]')).toBeEnabled();
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
  await page.locator('#tabbalk a', { hasText: 'Vandaag' }).click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
});

test('terugkeren naar de app vraagt de code, na een seconde, een minuut en een uur; het gordijn komt eerst; een foute code telt mee', async ({ page }) => {
  await zetSlotAan(page);
  await page.goto('./#/vandaag');
  await page.reload();
  await wachtOpSlot(page);
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();

  for (const verschil of [1000, 60 * 1000, 60 * 60 * 1000]) {
    // Naar de achtergrond: meteen een gordijn zonder invoer; de app is verborgen en inert.
    await zetZichtbaarheid(page, 'hidden');
    await expect(page.locator('#slot')).toBeVisible();
    await expect(page.locator('.cijferblok')).toHaveCount(0);
    expect(await page.evaluate(() => document.getElementById('app').inert && document.getElementById('app').hidden)).toBe(true);
    expect(await page.evaluate(() => document.body.innerText)).not.toContain('Vandaag');
    // Terug na een seconde, een minuut of een uur: het slotscherm staat er, met het cijferblok.
    await page.evaluate((v) => (window.__verschil += v), verschil);
    await zetZichtbaarheid(page, 'visible');
    await wachtOpSlot(page);
    expect(await page.evaluate(() => document.getElementById('app').inert)).toBe(true);
    await tik(page, CODE);
    await expect(page.locator('#tabbalk')).toBeVisible();
    await expect(page.locator('#slot')).toBeHidden();
  }

  // Een foute code na terugkeer telt mee voor de wachttijd.
  await zetZichtbaarheid(page, 'hidden');
  await zetZichtbaarheid(page, 'visible');
  await wachtOpSlot(page);
  await tik(page, '999999');
  await expect(page.locator('.slot__boodschap')).toHaveText('Die code klopt niet.');
  const fouten = await page.evaluate(
    () =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const v = open.result.transaction('instellingen').objectStore('instellingen').get('slot.fouten');
          v.onsuccess = () => klaar(v.result?.waarde ?? 0);
        };
      }),
  );
  expect(fouten).toBe(1);
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();

  // Een herlading (een nieuwe start) vraagt de code ook.
  await page.reload();
  await wachtOpSlot(page);
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
});

test('een code met zes cijfers: zes stippen, en een vergeten cijfer opent niets', async ({ page }) => {
  await zetSlotAan(page);
  await page.reload();
  await wachtOpSlot(page);
  await expect(page.locator('.cijferblok__stip')).toHaveCount(6);
  await tik(page, '12345');
  await expect(page.locator('.slot__boodschap')).toHaveText('');
  await expect(page.locator('#slot')).toBeVisible();
  await tik(page, '6');
  await expect(page.locator('#tabbalk')).toBeVisible();
});

test('na het zesde cijfer zijn eerst alle zes de stippen gevuld, daarna pas opent het slot of komt de foutmelding', async ({ page }) => {
  await zetSlotAan(page);
  await page.reload();
  await wachtOpSlot(page);
  // Foute code: zes gevulde stippen, daarna leeg.
  await tik(page, '12345');
  await page.locator('.cijferblok__toets[data-cijfer="7"]').click();
  await expect(page.locator('.cijferblok__stip.is-gevuld')).toHaveCount(6);
  await expect(page.locator('.cijferblok__stippen')).toHaveAttribute('aria-label', /6/);
  await expect(page.locator('.cijferblok__stip.is-gevuld')).toHaveCount(0);
  await expect(page.locator('#slot')).toBeVisible();
  // Juiste code: zes gevulde stippen terwijl het slot er nog staat.
  await tik(page, '12345');
  await page.locator('.cijferblok__toets[data-cijfer="6"]').click();
  await expect(page.locator('.cijferblok__stip.is-gevuld')).toHaveCount(6);
  await expect(page.locator('#slot')).toBeVisible();
  await expect(page.locator('#tabbalk')).toBeVisible();
});

test('een oude code van vier cijfers blijft werken met vier stippen, en wijzigen vraagt er zes', async ({ page }) => {
  await page.goto('./#/meer/vergrendeling');
  await expect(SLOT(page)).toBeVisible();
  // Een code zoals de eerste versie hem bewaarde: PBKDF2, 100 000 rondes, zonder 'lengte'.
  await page.evaluate(async () => {
    const b64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u)));
    const zout = crypto.getRandomValues(new Uint8Array(16));
    const sleutel = await crypto.subtle.importKey('raw', new TextEncoder().encode('1234'), 'PBKDF2', false, ['deriveBits']);
    const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: zout, iterations: 100000 }, sleutel, 256);
    const zetten = { 'slot.pin': { zout: b64(zout), hash: b64(hash) }, 'slot.aan': true, 'slot.vraag': 'Wat is de naam van je eerste huisdier?', 'slot.antwoord': { zout: b64(zout), hash: b64(hash) } };
    await new Promise((klaar) => {
      const open = indexedDB.open('bloei-dagboek');
      open.onsuccess = () => {
        const tx = open.result.transaction('instellingen', 'readwrite');
        for (const [sleutel2, waarde] of Object.entries(zetten)) tx.objectStore('instellingen').put({ sleutel: sleutel2, waarde });
        tx.oncomplete = () => {
          open.result.close();
          klaar();
        };
      };
    });
  });
  await page.reload();
  await wachtOpSlot(page);
  await expect(page.locator('.cijferblok__stip')).toHaveCount(4);
  await tik(page, '1234');
  await expect(page.locator('#tabbalk')).toBeVisible();

  // Wijzigen: eerst de huidige code (vier cijfers), dan een nieuwe van zes.
  await page.goto('./#/meer/vergrendeling');
  await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
  await expect(page.locator('.cijferblok__stip')).toHaveCount(4);
  await tik(page, '1234');
  await expect(page.locator('.cijferblok__stip')).toHaveCount(6);
  await tik(page, '246810'); // BESLISSING 533: de nieuwe code een keer
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await wachtOpSlot(page);
  await expect(page.locator('.cijferblok__stip')).toHaveCount(6);
  await tik(page, '246810');
  await expect(page.locator('#tabbalk')).toBeVisible();
});

// Een toestel zonder platformauthenticator (geen Face ID, vingerafdruk of schermslot dat de browser kan gebruiken).
const zonderToestel = (page) => page.addInitScript(() => {
  window.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: async () => false };
});

test('code vergeten (BESLISSING 518): geen herstelvraag; een rustig scherm zegt dat de code niet terug te halen is, biedt de herstelcode aan en als laatste opnieuw beginnen', async ({ page }) => {
  await zonderToestel(page);
  await zetSlotAan(page);
  await page.reload();
  await wachtOpSlot(page);

  // De link staat er altijd (ook zonder herstelvraag), en opent een scherm zonder invoerveld.
  await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
  await expect(page.getByRole('heading', { name: 'Je code niet meer weten' })).toBeVisible();
  await expect(page.locator('#slot')).toContainText('Bloei kan je code niet terughalen.');
  await expect(page.locator('#slot')).toContainText('Gebruik je herstelcode. Daarna kies je een nieuwe code, en je dagboek blijft staan.');
  // BESLISSING 631: alles wissen vraagt eerst het toestel; dit toestel kan dat niet, en de zin zegt dat eerlijk.
  await expect(page.locator('#slot')).toContainText('Opnieuw beginnen kan op dit toestel niet, want alles wissen vraagt eerst Face ID.');
  await expect(page.locator('#slot input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gebruik je herstelcode' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' })).toBeVisible();
  // Met Pincode gekozen staat er geen knop Face ID; een toestel dat het niet kan, krijgt ook geen weg met het toestel (geen dode knop).
  await expect(page.getByRole('button', { name: /Face ID gebruiken/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Bevestig met/ })).toHaveCount(0);

  // De knop van het wissen zegt waarom het hier niet kan, zonder vragen en zonder iets te wissen; Terug brengt haar terug.
  await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
  await expect(page.getByRole('heading', { name: 'Alles wissen kan hier niet' })).toBeVisible();
  await expect(page.locator('#slot')).toContainText('Alles wissen vraagt eerst Face ID. Zo kan niemand die je toestel even vasthoudt je dagboek wissen. Bloei kan op dit toestel niet met Face ID bevestigen, dus blijft alles staan.');
  await expect(page.getByRole('button', { name: 'Doorgaan' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Alles wissen', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Terug', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Je code niet meer weten' })).toBeVisible();

  // Terug naar het cijferblok: de code werkt nog.
  await page.getByRole('button', { name: 'Terug', exact: true }).click();
  await wachtOpSlot(page);
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
});

test('code vergeten: alles wissen en opnieuw beginnen vraagt twee keer en dan het toestel (BESLISSING 631); annuleren wist niets, bevestigen wist alles en haalt het slot weg', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await page.goto('./#/vandaag');
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
  await zetSlotAan(page);
  await page.reload();
  await wachtOpSlot(page);

  await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
  await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
  await expect(page.getByRole('heading', { name: 'Alles wissen?' })).toBeVisible();
  // Stap 1 terug: niets gewist.
  await page.getByRole('button', { name: 'Terug', exact: true }).click();
  await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
  await page.getByRole('button', { name: 'Doorgaan' }).click();
  await expect(page.getByRole('heading', { name: 'Zeker weten?' })).toBeVisible();
  // Stap 2 laten staan: terug op het scherm van de vergeten code, niets gewist.
  await page.getByRole('button', { name: 'Laten staan' }).click();
  await expect(page.getByRole('heading', { name: 'Je code niet meer weten' })).toBeVisible();
  await page.getByRole('button', { name: 'Terug', exact: true }).click();
  await wachtOpSlot(page);
  await page.reload();
  await wachtOpSlot(page);

  // Nu echt: twee keer bevestigen. Tot hier vroeg Bloei het toestel niets.
  await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
  await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
  await page.getByRole('button', { name: 'Doorgaan' }).click();
  expect(await page.evaluate(() => window.__pkGemaakt)).toBe(0);
  // Het toestel weigert of ze annuleert: niets gewist, ze blijft op de vraag, met een rustige melding.
  await zetSessie(page, '__pkc', 'fout');
  await page.getByRole('button', { name: 'Alles wissen', exact: true }).click();
  await expect(page.locator('#slot .slot__boodschap')).toHaveText('Dat lukte niet. Er is niets gewist.');
  await expect(page.getByRole('heading', { name: 'Zeker weten?' })).toBeVisible();
  expect(await page.evaluate(() => window.__pkGemaakt)).toBe(1);
  // Een antwoord zonder verificatie van de gebruiker (UV) telt ook niet.
  await zetSessie(page, '__pkc', null);
  await zetSessie(page, '__uv', 'nee');
  await page.getByRole('button', { name: 'Alles wissen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__pkGemaakt)).toBe(2);
  await expect(page.locator('#slot .slot__boodschap')).toHaveText('Dat lukte niet. Er is niets gewist.');
  await expect(page.locator('#slot')).toBeVisible();
  expect(await page.evaluate(() => new Promise((klaar) => {
    const open = indexedDB.open('bloei-dagboek');
    open.onsuccess = () => {
      const tx = open.result.transaction(['instellingen', 'dranken'], 'readonly');
      const p = tx.objectStore('instellingen').get('slot.pin');
      const d = tx.objectStore('dranken').count();
      tx.oncomplete = () => {
        open.result.close();
        klaar({ pin: Boolean(p.result?.waarde), dranken: d.result });
      };
    };
  }))).toEqual({ pin: true, dranken: 1 });
  // Het toestel bevestigt: nu wordt alles gewist.
  await zetSessie(page, '__uv', null);
  await page.getByRole('button', { name: 'Alles wissen', exact: true }).click();
  await page.waitForLoadState('load');
  await expect(page.locator('#slot')).toBeHidden();
  await expect(page.locator('.cijferblok')).toHaveCount(0);
  const rest = await page.evaluate(
    () =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const db = open.result;
          const uit = {};
          const tx = db.transaction(['instellingen', 'dranken'], 'readonly');
          const i = tx.objectStore('instellingen').getAll();
          const d = tx.objectStore('dranken').count();
          tx.oncomplete = () => {
            db.close();
            klaar({ slot: i.result.filter((r) => r.sleutel === 'slot.pin' || (r.sleutel === 'slot.aan' && r.waarde)).length, dranken: d.result });
          };
        };
      }),
  );
  expect(rest).toEqual({ slot: 0, dranken: 0 });
});

test('uitzetten vraagt de huidige code en een bevestiging; daarna geen slot meer na herladen', async ({ page }) => {
  await zetSlotAan(page);
  await SLOT(page).click();
  await tik(page, '000000');
  await expect(page.locator('.slot__boodschap')).toHaveText('Die code klopt niet.');
  await tik(page, CODE);
  await page.getByRole('button', { name: 'Uitzetten', exact: true }).click();
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'false');

  await page.goto('./#/vandaag');
  await page.reload();
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#slot')).toBeHidden();
});

// BESLISSING 536: het slotscherm is kleiner (toetsen 52 px); de eis blijft een tikvlak van minstens 44 px en alles past zonder scrollen op 360 px.
test('het slotscherm past op 360 px in alle thema\'s: geen horizontaal scrollen en tikvlakken van minstens 44 px (toetsen 52 px)', async ({ page }) => {
  await zetSlotAan(page);
  await page.setViewportSize({ width: 360, height: 640 });
  for (const thema of ['salie', 'nacht', 'poeder']) {
    await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), thema);
    await page.reload();
    await wachtOpSlot(page);
    const m = await page.evaluate(() => ({
      horizontaal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      toetsen: [...document.querySelectorAll('.cijferblok__toets')].map((k) => k.getBoundingClientRect().height),
    }));
    expect(m.horizontaal, thema).toBe(false);
    for (const hoogte of m.toetsen) {
      expect(hoogte).toBeGreaterThanOrEqual(44);
      expect(Math.round(hoogte)).toBe(52);
    }
    // alles past zonder te scrollen: de onderste rij toetsen ligt binnen het venster
    const onder = await page.evaluate(() => Math.max(...[...document.querySelectorAll('#slot .cijferblok__toets')].map((k) => k.getBoundingClientRect().bottom)));
    expect(onder).toBeLessThanOrEqual(640);
  }
});

// ---- Face ID en pincode samen (een nagebootste passkey) ----
// Antwoorden zoals een echte platformauthenticator ze geeft (clientDataJSON met type, challenge en oorsprong; authenticatordata met de hash van het
// rpId en de vlaggen UP, UV en bij create AT met het id), want Bloei kijkt elk antwoord na (passkey.js, controleerBevestiging). Regelknoppen in
// sessionStorage: '__pk' = 'annuleer' laat get mislukken, '__pkc' = 'fout' create; '__uv' = 'nee' laat de vlag UV weg; '__pkfout' = 'challenge'
// (een andere challenge), 'oorsprong' (een andere oorsprong), 'rp' (de hash van een ander rpId), 'type' (het verkeerde type), 'id' (bij get een andere
// sleutel dan gevraagd, bij create een ander id in de authenticatordata dan rawId). Houdt bij: __pkAanroepen, __pkGemaakt, __pkVergeten.
async function nabootsPasskey(page, modus = 'ok') {
  await page.addInitScript((m) => {
    if (!sessionStorage.getItem('__pk')) sessionStorage.setItem('__pk', m);
    window.PublicKeyCredential = window.PublicKeyCredential || function () {};
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
    window.PublicKeyCredential.signalUnknownCredential = async (o) => window.__pkVergeten.push(o.credentialId);
    window.__pkAanroepen = 0;
    window.__pkGemaakt = 0;
    window.__pkVergeten = [];
    const tekst = (s) => new TextEncoder().encode(s);
    const b64url = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const samen = (...delen) => Uint8Array.from(delen.flatMap((d) => [...d]));
    const kop = (soort, n) => (n < 24 ? [(soort << 5) | n] : n < 256 ? [(soort << 5) | 24, n] : [(soort << 5) | 25, n >> 8, n & 255]);
    const tk = (s) => [...kop(3, s.length), ...tekst(s)];
    const fout = () => sessionStorage.getItem('__pkfout');
    async function bouw(soort, o) {
      const pk = o.publicKey;
      const challenge = fout() === 'challenge' ? new Uint8Array(32) : new Uint8Array(pk.challenge);
      const type = 'webauthn.' + (fout() === 'type' ? (soort === 'create' ? 'get' : 'create') : soort);
      const client = tekst(JSON.stringify({ type, challenge: b64url(challenge), origin: fout() === 'oorsprong' ? 'https://ander.example' : location.origin, crossOrigin: false }));
      const rp = fout() === 'rp' ? 'ander.example' : pk.rp?.id || pk.rpId || location.hostname;
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', tekst(rp)));
      const vlaggen = 0x01 | (sessionStorage.getItem('__uv') === 'nee' ? 0 : 0x04) | (soort === 'create' ? 0x40 : 0);
      if (soort === 'create') {
        const id = Uint8Array.of(1, 2, 3, window.__pkGemaakt);
        const zichtbaar = fout() === 'id' ? Uint8Array.of(9, 9, 9, 9) : id;
        const ad = samen(hash, [vlaggen], new Uint8Array(4), new Uint8Array(16), [0, zichtbaar.length], zichtbaar, [0xa0]);
        const att = Uint8Array.from([...kop(5, 3), ...tk('fmt'), ...tk('none'), ...tk('attStmt'), 0xa0, ...tk('authData'), ...kop(2, ad.length), ...ad]);
        return { type: 'public-key', id: b64url(id), rawId: id.buffer, authenticatorAttachment: 'platform', response: { clientDataJSON: client.buffer, attestationObject: att.buffer, getAuthenticatorData: () => ad.buffer }, getClientExtensionResults: () => ({}) };
      }
      const id = fout() === 'id' ? Uint8Array.of(5, 5, 5, 5) : new Uint8Array(pk.allowCredentials?.[0]?.id ?? [0]);
      const ad = samen(hash, [vlaggen], new Uint8Array(4));
      return { type: 'public-key', id: b64url(id), rawId: id.buffer, authenticatorAttachment: 'platform', response: { clientDataJSON: client.buffer, authenticatorData: ad.buffer, signature: new ArrayBuffer(8), userHandle: null }, getClientExtensionResults: () => ({}) };
    }
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        create: async (o) => {
          window.__pkGemaakt++;
          if (sessionStorage.getItem('__pkc') === 'fout') throw new DOMException('geannuleerd', 'NotAllowedError');
          return bouw('create', o);
        },
        get: async (o) => {
          window.__pkAanroepen++;
          if (sessionStorage.getItem('__pk') === 'annuleer') throw new DOMException('geannuleerd', 'NotAllowedError');
          return bouw('get', o);
        },
      },
    });
  }, modus);
}
const zetSessie = (page, sleutel, waarde) => page.evaluate(([s, w]) => (w === null ? sessionStorage.removeItem(s) : sessionStorage.setItem(s, w)), [sleutel, waarde]);
// Elk antwoord dat niet klopt: zonder UV, een andere challenge, oorsprong of rpId, het verkeerde type, een ander id.
const SLECHT = [['__uv', 'nee'], ['__pkfout', 'challenge'], ['__pkfout', 'oorsprong'], ['__pkfout', 'rp'], ['__pkfout', 'type'], ['__pkfout', 'id']];
const zetSlecht = async (page, [sleutel, waarde]) => {
  await zetSessie(page, '__uv', null);
  await zetSessie(page, '__pkfout', null);
  if (sleutel) await zetSessie(page, sleutel, waarde);
};
const zetPasskeyModus = (page, modus) => page.evaluate((m) => sessionStorage.setItem('__pk', m), modus);

async function zetSlotAanMetPasskey(page) {
  await page.goto('./#/meer/vergrendeling');
  await FACE(page).click();
  await tik(page, CODE);
  await tik(page, CODE);
  await rondAf(page);
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  // De keuze staat op Face ID (en dus niet op Pincode); eronder de rijen Pincode wijzigen en Herstelcode (BESLISSING 518); geen herstelvraag.
  await expect(FACE(page)).toHaveAttribute('aria-checked', 'true');
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.slot__rij')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Pincode wijzigen' })).toBeVisible();
}

test('Face ID: het cijferblok en de knop staan samen; annuleren is geen foute poging; de pincode opent altijd', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await zetSlotAanMetPasskey(page);
  await zetPasskeyModus(page, 'annuleer');
  await page.reload();
  await wachtOpSlot(page);
  // De vraag startte vanzelf, werd geannuleerd, en het cijferblok staat klaar zonder melding.
  expect(await page.evaluate(() => window.__pkAanroepen)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: /gebruiken$/ })).toBeVisible();
  await expect(page.locator('.cijferblok__toets[data-cijfer="1"]')).toBeEnabled();
  await expect(page.locator('.slot__boodschap')).toHaveText('');
  // De knop vraagt het opnieuw en een geannuleerde poging telt niet mee.
  await page.getByRole('button', { name: /gebruiken$/ }).click();
  await expect(page.locator('.slot__boodschap')).toHaveText('');
  const fouten = await page.evaluate(
    () =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const vraag = open.result.transaction('instellingen').objectStore('instellingen').get('slot.fouten');
          vraag.onsuccess = () => klaar(vraag.result?.waarde ?? 0);
        };
      }),
  );
  expect(fouten).toBe(0);
  // De pincode opent altijd.
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
});

test('Face ID: een geslaagde passkey opent het slot vanzelf, ook tijdens de wachttijd van de pincode', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await zetSlotAanMetPasskey(page);
  await zetInstellingInDb(page, 'slot.fouten', 5);
  await zetInstellingInDb(page, 'slot.wachtTot', Date.now() + 10 * 60 * 1000);
  await page.reload();
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#slot')).toBeHidden();
});

test('Face ID: tijdens de wachttijd blijft Face ID mogelijk via de knop', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await zetSlotAanMetPasskey(page);
  await zetPasskeyModus(page, 'annuleer');
  await zetInstellingInDb(page, 'slot.fouten', 5);
  await zetInstellingInDb(page, 'slot.wachtTot', Date.now() + 10 * 60 * 1000);
  await page.reload();
  await wachtOpSlot(page);
  await expect(page.locator('.cijferblok__toets[data-cijfer="1"]')).toBeDisabled();
  await expect(page.locator('.slot__boodschap')).toContainText('Even wachten');
  await zetPasskeyModus(page, 'ok');
  await page.getByRole('button', { name: /gebruiken$/ }).click();
  await expect(page.locator('#tabbalk')).toBeVisible();
});

test('zonder passkey op het toestel zegt de kaart het rustig en blijft de pincode werken', async ({ page }) => {
  await page.addInitScript(() => {
    window.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: async () => false };
  });
  await page.goto('./#/meer/vergrendeling');
  await expect(SLOT(page)).toBeVisible();
  await expect(FACE(page)).toBeDisabled();
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Dit toestel kan dit niet.')).toBeVisible();
});

// ---- Wat er tijdens het slot nieuw in <body> komt, is ook verborgen ----
test('een strook of viering die tijdens het slot in <body> komt, is niet zichtbaar en niet bereikbaar', async ({ page }) => {
  await zetSlotAan(page);
  await page.goto('./#/vandaag');
  await page.reload();
  await wachtOpSlot(page);

  await page.evaluate(() => {
    const strook = document.createElement('div');
    strook.className = 'strokenhouder';
    strook.setAttribute('role', 'status');
    strook.textContent = 'GEHEIM strook';
    document.body.append(strook);
    const viering = document.createElement('div');
    viering.style.cssText = 'position:fixed;inset:0;display:grid';
    viering.textContent = 'GEHEIM viering';
    document.body.append(viering);
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.body.children].filter((k) => k.id !== 'slot' && k.tagName !== 'SCRIPT').every((k) => getComputedStyle(k).display === 'none' && k.inert),
      ),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('GEHEIM');
  await expect(page.getByText('GEHEIM strook')).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'GEHEIM' })).toHaveCount(0);

  // Na het ontgrendelen is het slot weg en is de app weer bruikbaar.
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
});

test('een gewone blur (desktop: een klik naar een ander venster) legt geen gordijn en vraagt geen code (BESLISSING 532); pagehide vraagt de code', async ({ page }) => {
  await zetSlotAan(page);
  await page.goto('./#/vandaag');
  await page.reload();
  await wachtOpSlot(page);
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  // de inhoud blijft staan, hoe lang ook (een schermafbeelding toont het dagboek); meer in x-herstel.spec.js
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#slot')).toBeHidden();
  await page.evaluate(() => (window.__verschil += 60 * 60 * 1000));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#slot')).toBeHidden();
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('.cijferblok')).toHaveCount(0);

  // De pagina echt verlaten (pagehide) vraagt bij terugkeer wel de code.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('#slot')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await wachtOpSlot(page);
});

test('het deelmenu, het afdrukvenster en een bestandskiezer zetten de app niet op slot; daarna wel weer', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.share = () => new Promise((klaar) => (window.__deelKlaar = klaar));
    window.print = () => {};
  });
  await zetSlotAan(page);
  await page.goto('./#/vandaag');
  await page.reload();
  await wachtOpSlot(page);
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();

  // Deelmenu: de pagina gaat even naar de achtergrond terwijl navigator.share loopt.
  await page.evaluate(() => {
    window.__deel = navigator.share({ title: 'verslag' });
  });
  await zetZichtbaarheid(page, 'hidden');
  await zetZichtbaarheid(page, 'visible');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#slot')).toBeHidden();
  await expect(page.locator('#tabbalk')).toBeVisible();
  await page.evaluate(() => window.__deelKlaar());
  await page.waitForTimeout(1800);

  // Afdrukken.
  await page.evaluate(() => window.print());
  await zetZichtbaarheid(page, 'hidden');
  await zetZichtbaarheid(page, 'visible');
  await expect(page.locator('#slot')).toBeHidden();
  await page.waitForTimeout(1800);

  // Een bestandskiezer (profielfoto, back-up terugzetten).
  await page.evaluate(() => {
    const invoer = document.createElement('input');
    invoer.type = 'file';
    invoer.id = 'proefkiezer';
    invoer.style.cssText = 'position:fixed;top:80px;left:10px;z-index:9999;width:200px;height:40px';
    document.body.append(invoer);
  });
  const [kiezer] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#proefkiezer').click()]);
  await zetZichtbaarheid(page, 'hidden');
  await zetZichtbaarheid(page, 'visible');
  await expect(page.locator('#slot')).toBeHidden();
  await kiezer.setFiles([]);
  await page.waitForTimeout(1800);

  // Zonder systeemvenster vraagt terugkeren de code weer.
  await zetZichtbaarheid(page, 'hidden');
  await zetZichtbaarheid(page, 'visible');
  await wachtOpSlot(page);
});

test('elke stap van het instellen heeft een zichtbare Annuleren of Terug, zonder iets half te bewaren, en vandaar "Meer"', async ({ page }) => {
  await page.goto('./#/meer/vergrendeling');
  const annuleer = page.getByRole('button', { name: 'Annuleren' });
  const naarOverzicht = async () => {
    await expect(SLOT(page)).toHaveAttribute('aria-checked', 'false');
    const aan = await page.evaluate(
      () =>
        new Promise((klaar) => {
          const open = indexedDB.open('bloei-dagboek');
          open.onsuccess = () => {
            const v = open.result.transaction('instellingen').objectStore('instellingen').get('slot.aan');
            v.onsuccess = () => klaar(v.result?.waarde ?? false);
          };
        }),
    );
    expect(aan).toBe(false);
  };

  // Stap 1: code kiezen, en stap 2: code herhalen.
  await SLOT(page).click();
  await expect(annuleer).toBeVisible();
  await annuleer.click();
  await naarOverzicht();
  await SLOT(page).click();
  await tik(page, CODE);
  await expect(annuleer).toBeVisible();
  await annuleer.click();
  await naarOverzicht();
  // Vanaf het overzicht terug naar Meer.
  await page.getByRole('button', { name: `Terug naar ${TERUG}`, exact: true }).click();
  await expect(page).toHaveURL(/#\/meer$/);

  // Face ID aanbieden, wijzigen en uitzetten (een nagebootste passkey).
  await page.goto('./#/meer/vergrendeling');
  await zetSlotAan(page);
  await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
  await expect(annuleer).toBeVisible();
  await annuleer.click();
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  await SLOT(page).click();
  await expect(annuleer).toBeVisible();
  await annuleer.click();
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
});

test('Face ID: bij terugkeer naar de app opent een geslaagde passkey meteen, zonder dat de code nodig is', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await zetSlotAanMetPasskey(page);
  await page.goto('./#/vandaag');
  await expect(page.locator('#tabbalk')).toBeVisible();
  await page.evaluate(() => (window.__pkAanroepen = 0));
  await page.waitForTimeout(5500); // de vrijstelling van de vraag van het toestel is dan voorbij (NAZORG_TOESTEL_MS, BESLISSING 530)
  await zetZichtbaarheid(page, 'hidden');
  await expect(page.locator('#slot')).toBeVisible();
  await zetZichtbaarheid(page, 'visible');
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#slot')).toBeHidden();
  expect(await page.evaluate(() => window.__pkAanroepen)).toBeGreaterThan(0);
});

// ---- Pincode of Face ID: één keuze uit twee (BESLISSING 194) ----
const instellingUitDb = (page, sleutel) =>
  page.evaluate(
    (k) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const v = open.result.transaction('instellingen').objectStore('instellingen').get(k);
          v.onsuccess = () => {
            open.result.close();
            klaar(v.result?.waarde ?? null);
          };
        };
      }),
    sleutel,
  );

test('de schakelaar en de keuze staan er: Pincode gekozen, precies één gekozen, geen Windows Hello of vingerafdruk', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await page.goto('./#/meer/vergrendeling');
  await expect(SLOT(page)).toBeVisible();
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'false');
  const groep = page.getByRole('radiogroup', { name: /.+/ });
  await expect(groep.getByRole('radio')).toHaveCount(2);
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
  await expect(FACE(page)).toHaveAttribute('aria-checked', 'false');
  await expect(FACE(page)).toBeEnabled();
  await expect(page.getByText('Bloei opent met je code van zes cijfers.')).toBeVisible();
  await expect(page.getByText('Bloei opent met Face ID. Lukt dat even niet, dan gebruik je je code.')).toBeVisible();
  await expect(page.locator('#scherm')).not.toContainText(/Windows Hello|Touch ID|vingerafdruk/i);
  const [a, b] = await Promise.all([KIES_PIN(page).boundingBox(), FACE(page).boundingBox()]);
  expect(b.y).toBeGreaterThan(a.y); // onder elkaar
  expect(Math.abs(a.x - b.x)).toBeLessThan(2); // in dezelfde vorm
  expect(Math.abs(a.width - b.width)).toBeLessThan(2);
  // Toetsenbord: de pijltjes lopen niet in een codevraag vast; Tab bereikt de gekozen keuze.
  await KIES_PIN(page).focus();
  await expect(KIES_PIN(page)).toBeFocused();
});

test('Face ID kiezen met het slot uit: eerst een code, dan de toestelvraag; het slot staat aan met Face ID', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await page.goto('./#/meer/vergrendeling');
  await FACE(page).click();
  await expect(page.getByText(/^Kies eerst een code\. Die gebruik je als .* even niet lukt\.$/)).toBeVisible();
  await tik(page, CODE);
  await tik(page, CODE);
  await rondAf(page);
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  await expect(FACE(page)).toHaveAttribute('aria-checked', 'true');
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'false');
  expect(await instellingUitDb(page, 'slot.methode')).toBe('faceid');
  expect(await instellingUitDb(page, 'slot.passkeyId')).toBeTruthy();
  await expect(page.locator('.slotvoorbeeld__faceid')).toBeVisible(); // het voorbeeld volgt de keuze
  // Herladen: Face ID wordt meteen gevraagd (hier geannuleerd, zodat het slot zichtbaar blijft) en de code is de terugval.
  await zetPasskeyModus(page, 'annuleer');
  await page.reload();
  await wachtOpSlot(page);
  expect(await page.evaluate(() => window.__pkAanroepen)).toBeGreaterThan(0);
});

test('Pincode kiezen met het slot uit zet het slot aan met Pincode: geen knop Face ID en het toestel wordt niets gevraagd', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await page.goto('./#/meer/vergrendeling');
  await KIES_PIN(page).click();
  await tik(page, CODE);
  await tik(page, CODE);
  await rondAf(page); // meteen de herstelcode: geen sleutel en geen toestelvraag (BESLISSING 541)
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
  expect(await instellingUitDb(page, 'slot.methode')).toBe('pin');
  expect(await page.evaluate(() => window.__pkGemaakt)).toBe(0);
  expect(await instellingUitDb(page, 'slot.passkeyId')).toBeNull();
  await expect(page.locator('.slotvoorbeeld__faceid')).toHaveCount(0);
  await page.reload();
  await wachtOpSlot(page);
  await expect(page.getByRole('button', { name: /Face ID/ })).toHaveCount(0);
  expect(await page.evaluate(() => window.__pkAanroepen)).toBe(0);
  await zetVisibiliteitEnTerug(page);
  await expect(page.locator('#slot')).toBeVisible();
  expect(await page.evaluate(() => window.__pkAanroepen)).toBe(0);
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
});
async function zetVisibiliteitEnTerug(page) {
  await zetZichtbaarheid(page, 'hidden');
  await zetZichtbaarheid(page, 'visible');
}

test('Face ID kiezen en onderweg annuleren, of de toestelvraag mislukken: de code blijft (BESLISSING 530), Annuleren laat het slot uit en de keuze op Pincode', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await page.goto('./#/meer/vergrendeling');
  await FACE(page).click();
  await page.getByRole('button', { name: 'Annuleren' }).click();
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'false');
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');

  // De toestelvraag mislukt of wordt geannuleerd: niets wordt bewaard.
  await page.evaluate(() => sessionStorage.setItem('__pkc', 'fout'));
  await FACE(page).click();
  await tik(page, CODE);
  await tik(page, CODE);
  // BESLISSING 530: geen derde keer de code; ze kan opnieuw proberen, verder met alleen de pincode, of annuleren
  await expect(page.locator('[data-toestelopnieuw]')).toBeVisible();
  await expect(page.locator('.cijferblok')).toHaveCount(0);
  await page.getByRole('button', { name: 'Annuleren' }).click();
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'false');
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
  await expect(FACE(page)).toHaveAttribute('aria-checked', 'false');
  expect(await instellingUitDb(page, 'slot.pin')).toBeNull();
  await page.reload();
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#slot')).toBeHidden();
});

test('met het slot aan wisselt de keuze tussen Pincode en Face ID, exclusief; naar Pincode zonder codevraag en vergeet de passkey, naar Face ID met de code', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await zetSlotAanMetPasskey(page);
  // Naar Pincode: geen codevraag, de passkey is weg, de code blijft.
  await KIES_PIN(page).click();
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
  await expect(FACE(page)).toHaveAttribute('aria-checked', 'false');
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.cijferblok')).toHaveCount(0);
  expect(await instellingUitDb(page, 'slot.passkeyId')).toBeNull();
  expect(await instellingUitDb(page, 'slot.methode')).toBe('pin');
  expect(await instellingUitDb(page, 'slot.pin')).toBeTruthy();
  // Naar Face ID: eerst de huidige code (BESLISSING 403), dan de toestelvraag; de code blijft.
  await FACE(page).click();
  await tik(page, CODE);
  await expect(FACE(page)).toHaveAttribute('aria-checked', 'true');
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'false');
  expect(await instellingUitDb(page, 'slot.passkeyId')).toBeTruthy();
  // Een mislukte toestelvraag bij het wisselen laat Pincode staan met een rustige melding.
  await KIES_PIN(page).click();
  await page.evaluate(() => sessionStorage.setItem('__pkc', 'fout'));
  await FACE(page).click();
  await tik(page, CODE);
  await expect(page.getByText('Dat lukte niet. Je pincode blijft werken.')).toBeVisible();
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
  await expect(FACE(page)).toHaveAttribute('aria-checked', 'false');
  // Het slot uitzetten (code en bevestiging) zet alles uit.
  await SLOT(page).click();
  await tik(page, CODE);
  await page.getByRole('button', { name: 'Uitzetten', exact: true }).click();
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'false');
  expect(await instellingUitDb(page, 'slot.methode')).toBeNull();
  expect(await instellingUitDb(page, 'slot.passkeyId')).toBeNull();
});

test('BESLISSING 403: van Pincode naar Face ID vraagt eerst de huidige code; zonder de juiste code wordt er geen passkey aangemaakt', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await zetSlotAan(page);
  expect(await page.evaluate(() => window.__pkGemaakt)).toBe(0);

  // Een tik op Face ID toont het cijferblok voor de huidige code; het toestel wordt nog niets gevraagd.
  await FACE(page).click();
  await expect(page.locator('.cijferblok')).toBeVisible();
  await expect(page.getByText(TEKSTEN.slot.huidigeCode)).toBeVisible();
  expect(await page.evaluate(() => window.__pkGemaakt)).toBe(0);

  // Een foute code: een melding, geen passkey, en de poging telt mee (dezelfde teller als het slot).
  await tik(page, '999999');
  await expect(page.locator('.slot__boodschap')).toHaveText('Die code klopt niet.');
  expect(await page.evaluate(() => window.__pkGemaakt)).toBe(0);
  expect(await instellingUitDb(page, 'slot.fouten')).toBe(1);

  // Annuleren: niets veranderd.
  await page.getByRole('button', { name: 'Annuleren' }).click();
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
  expect(await instellingUitDb(page, 'slot.passkeyId')).toBeNull();
  expect(await instellingUitDb(page, 'slot.methode')).toBe('pin');
  expect(await page.evaluate(() => window.__pkGemaakt)).toBe(0);

  // Tijdens de wachttijd (na vijf fouten) lukt het ook niet, ook niet met de juiste code.
  await zetInstellingInDb(page, 'slot.fouten', 5);
  await zetInstellingInDb(page, 'slot.wachtTot', Date.now() + 10 * 60 * 1000);
  await FACE(page).click();
  await tik(page, CODE);
  await expect(page.locator('.slot__boodschap')).toContainText('Even wachten');
  expect(await page.evaluate(() => window.__pkGemaakt)).toBe(0);
  await page.getByRole('button', { name: 'Annuleren' }).click();
  await zetInstellingInDb(page, 'slot.wachtTot', 0);
  await zetInstellingInDb(page, 'slot.fouten', 0);

  // Met de juiste code: nu pas de toestelvraag, en het slot staat op Face ID.
  await FACE(page).click();
  await tik(page, CODE);
  await expect(FACE(page)).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.__pkGemaakt)).toBe(1);
  expect(await instellingUitDb(page, 'slot.passkeyId')).toBeTruthy();
  expect(await instellingUitDb(page, 'slot.methode')).toBe('faceid');
});

test('een oude stand zonder keuze wordt juist ingelezen: code met passkey is Face ID, alleen code is Pincode', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await zetSlotAanMetPasskey(page);
  await zetInstellingInDb(page, 'slot.methode', null);
  await zetPasskeyModus(page, 'annuleer');
  await page.reload();
  await wachtOpSlot(page);
  await tik(page, CODE);
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'vandaag');
  await page.goto('./#/meer/vergrendeling');
  await expect(FACE(page)).toBeVisible();
  await expect(FACE(page)).toHaveAttribute('aria-checked', 'true');
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'false');
  // Alleen een code (geen passkey, geen keuze): Pincode.
  await zetInstellingInDb(page, 'slot.passkeyId', null);
  await page.goto('./#/meer/vergrendeling');
  await page.reload();
  await wachtOpSlot(page);
  await expect(page.getByRole('button', { name: /Face ID/ })).toHaveCount(0);
  await tik(page, CODE);
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'vandaag');
  await page.goto('./#/meer/vergrendeling');
  await expect(KIES_PIN(page)).toBeVisible();
  await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
  await expect(FACE(page)).toHaveAttribute('aria-checked', 'false');
});

test('bij Face ID geldt de wachttijd na vijf foute codes ook in de terugval, en Face ID blijft mogelijk via de knop', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await zetSlotAanMetPasskey(page);
  await zetPasskeyModus(page, 'annuleer');
  await page.reload();
  await wachtOpSlot(page);
  for (let i = 0; i < 5; i++) await tik(page, '999999');
  await expect(page.locator('.slot__boodschap')).toContainText('Even wachten');
  await expect(page.locator('.cijferblok__toets[data-cijfer="1"]')).toBeDisabled();
  await expect(page.getByRole('button', { name: /Face ID gebruiken/ })).toBeVisible();
  await zetPasskeyModus(page, 'ok');
  await page.getByRole('button', { name: /Face ID gebruiken/ }).click();
  await expect(page.locator('#tabbalk')).toBeVisible();
});

test('Face ID kiezen is uitgeschakeld als het toestel het niet kan, met een rustige zin', async ({ page }) => {
  await page.addInitScript(() => {
    window.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: async () => false };
  });
  await page.goto('./#/meer/vergrendeling');
  await expect(FACE(page)).toBeDisabled();
  await expect(page.getByText('Dit toestel kan dit niet.')).toBeVisible();
  await expect(KIES_PIN(page)).toBeEnabled();
});

// ---- BESLISSING 234: Pincode en Face ID horen zichtbaar bij "Bloei vergrendelen" ----
for (const [breed, hoog] of [[1720, 950], [390, 844]]) {
  test(`de keuzes staan ingesprongen onder de schakelaar als één groep met het kopje Openen met (${breed} px), ook met het slot uit`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await page.goto('./#/meer/vergrendeling');
    await expect(SLOT(page)).toBeVisible();
    const groep = page.locator('.slot__groep');
    await expect(groep.getByText('Openen met', { exact: true })).toBeVisible();
    await expect(groep.getByRole('radio')).toHaveCount(2);
    const m = await page.evaluate(() => {
      const rij = document.querySelector('.slot__kaart .slot__rij').getBoundingClientRect();
      const g = document.querySelector('.slot__groep').getBoundingClientRect();
      const opties = [...document.querySelectorAll('.slot__optie')].map((o) => o.getBoundingClientRect());
      return { rijLinks: rij.left, groepLinks: g.left, groepRechts: g.right, rijRechts: rij.right, opties: opties.map((o) => [o.left, o.right]), horizontaal: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    expect(m.groepLinks, 'de groep springt in').toBeGreaterThan(m.rijLinks + 10);
    expect(m.groepRechts, 'de groep eindigt op dezelfde rand als de rij').toBeLessThanOrEqual(m.rijRechts + 1);
    expect(m.opties[0][0], 'beide keuzes beginnen op dezelfde plek').toBeCloseTo(m.opties[1][0], 0);
    expect(m.opties[0][1]).toBeCloseTo(m.opties[1][1], 0);
    expect(m.opties[0][0], 'de keuzes staan binnen de groep').toBeGreaterThan(m.groepLinks);
    expect(m.horizontaal).toBe(false);
    // Met het slot uit zien de keuzes er uitgeschakeld uit (het keuzerondje en de icoontegel zijn gedempt) maar zijn ze nog aantikbaar, en de uitleg erbij blijft leesbaar:
    // geen doorzichtigheid op de tekst, een contrast van minstens 4,5 : 1 voor de kop, de naam en de hint.
    await expect(groep).toHaveClass(/is-uit/);
    expect(await page.locator('.slot__optie').first().evaluate((el) => Number(getComputedStyle(el).opacity)), 'de tekst van de rij is niet doorzichtig').toBe(1);
    expect(await page.locator('.slot__optie .slot__radio').first().evaluate((el) => Number(getComputedStyle(el).opacity)), 'het keuzerondje is gedempt').toBeLessThan(1);
    const contrasten = await page.evaluate(() => {
      const naarRgb = (kleur) => {
        const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        c.clearRect(0, 0, 1, 1);
        c.fillStyle = kleur;
        c.fillRect(0, 0, 1, 1);
        return [...c.getImageData(0, 0, 1, 1).data];
      };
      const achtergrond = (el) => {
        for (let e = el; e; e = e.parentElement) {
          const k = naarRgb(getComputedStyle(e).backgroundColor);
          if (k[3] === 255) return k;
        }
        return [255, 255, 255, 255];
      };
      const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const contrast = (el) => {
        const a = lum(naarRgb(getComputedStyle(el).color));
        const b = lum(achtergrond(el));
        return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
      };
      return ['.slot__groepkop', '.slot__optielabel', '.slot__optiehint'].map((s) => [s, contrast(document.querySelector(s))]);
    });
    for (const [kiezer, waarde] of contrasten) expect(waarde, `contrast van ${kiezer}`).toBeGreaterThanOrEqual(4.5);
    await KIES_PIN(page).click();
    await expect(page.locator('.cijferblok')).toBeVisible(); // een tik zet het slot aan met die keuze (beslissing 194)
  });
}

test('een bewaarde herstelvraag uit een oudere versie wordt genegeerd en bij de eerstvolgende wijziging opgeruimd', async ({ page }) => {
  await zetSlotAan(page);
  await zetInstellingInDb(page, 'slot.vraag', 'Wat is de naam van je eerste huisdier?');
  await zetInstellingInDb(page, 'slot.antwoord', { zout: 'AA==', hash: 'AA==' });
  await page.reload();
  await wachtOpSlot(page);
  // De link voert nooit naar een vraag: alleen naar het rustige scherm.
  await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
  await expect(page.locator('#slot input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Terug', exact: true }).click();
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
  await page.goto('./#/meer/vergrendeling');
  await expect(page.getByText('Herstelvraag')).toHaveCount(0);
  expect(await instellingUitDb(page, 'slot.vraag')).not.toBeNull(); // nog niet aangeraakt
  await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
  await tik(page, CODE);
  await tik(page, '246810'); // BESLISSING 533: de nieuwe code een keer
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  expect(await instellingUitDb(page, 'slot.vraag')).toBeNull();
  expect(await instellingUitDb(page, 'slot.antwoord')).toBeNull();
});

test('R6-03: visibilitychange, focus en pageshow tegelijk bij terugkeer tonen het slot één keer en vragen Face ID één keer', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await zetSlotAanMetPasskey(page);
  await page.goto('./#/vandaag');
  await expect(page.locator('#tabbalk')).toBeVisible();
  await zetPasskeyModus(page, 'annuleer'); // geannuleerd: het slot blijft staan en elke vraag wordt geteld
  await page.waitForTimeout(5500); // de vrijstelling van de vraag van het toestel is dan voorbij (NAZORG_TOESTEL_MS, BESLISSING 530)
  await zetZichtbaarheid(page, 'hidden');
  await expect(page.locator('#slot')).toBeVisible();
  await page.evaluate(() => {
    window.__pkAanroepen = 0;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    // In één synchrone stap, zoals iOS ze bij terugkeer kort na elkaar stuurt.
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
  });
  await wachtOpSlot(page);
  // Geen vaste wachttijd: eerst is Face ID echt gevraagd, daarna blijven de telling en het slot stil. De drie terug()-oproepen wachten
  // elk alleen op een korte vraag aan de database (src/vergrendeling/slot.js); een tweede vraag zou dus vlak na de eerste komen, niet later.
  await expect.poll(() => page.evaluate(() => window.__pkAanroepen)).toBeGreaterThanOrEqual(1);
  await wachtTotStil(page, () => page.evaluate(() => [window.__pkAanroepen, document.querySelector('#slot')?.innerHTML.length ?? 0]));
  expect(await page.evaluate(() => window.__pkAanroepen)).toBe(1);
  await expect(page.locator('.cijferblok')).toHaveCount(1);
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
});

test('code vergeten met Face ID gekozen: het rustige scherm biedt de bevestiging met Face ID en de herstelcode aan', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await zetSlotAanMetPasskey(page);
  await zetPasskeyModus(page, 'annuleer');
  await page.reload();
  await wachtOpSlot(page);
  await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
  await expect(page.locator('#slot')).toContainText('Bevestig met Face ID of gebruik je herstelcode.');
  await expect(page.getByRole('button', { name: 'Bevestig met Face ID' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gebruik je herstelcode' })).toBeVisible();
});

test('BESLISSING 541: code vergeten met Pincode gekozen, op een toestel dat het kan: de weg van het toestel staat er zonder koppeling', async ({ page }) => {
  await nabootsPasskey(page, 'ok');
  await zetSlotAan(page);
  // het instellen vroeg het toestel niets
  expect(await page.evaluate(() => window.__pkGemaakt + window.__pkAanroepen)).toBe(0);
  await page.reload();
  await wachtOpSlot(page);
  await expect(page.locator('#slot').getByRole('button', { name: /gebruiken$/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
  await expect(page.locator('#slot')).toContainText('Bevestig met Face ID of gebruik je herstelcode. Daarna kies je een nieuwe code, en je dagboek blijft staan.');
  const namen = (await page.locator('#slot .slot__acties .knop').allTextContents()).map((n) => n.trim());
  expect(namen).toEqual(['Bevestig met Face ID', 'Gebruik je herstelcode', 'Alles wissen en opnieuw beginnen', 'Terug']);
  // pas bij de tik vraagt Bloei het toestel iets
  expect(await page.evaluate(() => window.__pkGemaakt + window.__pkAanroepen)).toBe(0);
});

// ---- Eén strenge controle voor elk antwoord van het toestel (passkey.js, controleerBevestiging) ----
// Het slot openen, de bevestiging van de huidige code (pincode wijzigen, een nieuwe herstelcode, uitzetten) en Face ID instellen kijken het antwoord
// na zoals het herstel (BESLISSING 541): zonder UV, op een andere challenge, van een andere oorsprong, voor een ander rpId, van het verkeerde type of
// met een ander id opent of wijzigt het niets. De controle gebeurt in de pagina, zonder server. Met een kloppend antwoord werkt alles zoals altijd.
test.describe('Face ID: alleen een kloppend antwoord telt', () => {
  const MISLUKT = TEKSTEN.slot.toestelMislukt;
  const aanroepen = (page) => page.evaluate(() => window.__pkAanroepen);
  const gemaakt = (page) => page.evaluate(() => window.__pkGemaakt);

  test('op het slotscherm: een antwoord dat niet klopt opent niets, zonder melding en zonder foute poging; een goed antwoord opent', async ({ page }) => {
    await nabootsPasskey(page, 'ok');
    await zetSlotAanMetPasskey(page);
    for (const slecht of SLECHT) {
      await zetSlecht(page, slecht);
      await page.reload();
      await wachtOpSlot(page);
      await expect.poll(() => aanroepen(page)).toBe(1); // de vraag startte vanzelf, één keer
      await page.getByRole('button', { name: 'Face ID gebruiken' }).click();
      await expect.poll(() => aanroepen(page)).toBe(2); // de knop vraagt het één keer opnieuw, geen extra systeemvenster
      await page.waitForTimeout(300);
      await expect(page.locator('#slot'), slecht.join('=')).toBeVisible();
      await expect(page.locator('#tabbalk')).toBeHidden();
      await expect(page.locator('#slot .slot__boodschap')).toHaveText('');
      expect(await instellingUitDb(page, 'slot.fouten')).toBe(0);
    }
    await zetSlecht(page, []);
    await page.getByRole('button', { name: 'Face ID gebruiken' }).click();
    await expect(page.locator('#tabbalk')).toBeVisible();
    await expect(page.locator('#slot')).toBeHidden();
  });

  test('pincode wijzigen, een nieuwe herstelcode en uitzetten: de bevestiging met Face ID laat alleen een kloppend antwoord door', async ({ page }) => {
    await nabootsPasskey(page, 'ok');
    await zetSlotAanMetPasskey(page);
    const pin = await instellingUitDb(page, 'slot.pin');
    const herstel = await instellingUitDb(page, 'slot.herstel');
    const bevestig = page.getByRole('button', { name: 'Bevestig met Face ID' });

    // Elke stroom: hoe ze opent en wat er na een geslaagde bevestiging komt.
    const stromen = [
      ['pincode wijzigen', () => page.getByRole('button', { name: 'Pincode wijzigen' }).click(), async () => {
        await expect(page.getByText(TEKSTEN.slot.pinNieuw)).toBeVisible();
        await page.getByRole('button', { name: 'Annuleren' }).click();
      }],
      ['een nieuwe herstelcode', () => page.getByRole('button', { name: 'Nieuwe herstelcode maken' }).click(), async () => {
        await expect(page.getByRole('heading', { name: TEKSTEN.slot.herstelNieuwTitel })).toBeVisible();
        expect(await instellingUitDb(page, 'slot.herstel')).not.toEqual(herstel);
        await rondAf(page);
      }],
      ['uitzetten', () => SLOT(page).click(), async () => {
        await expect(page.getByText(TEKSTEN.slot.uitzettenVraag)).toBeVisible();
        await page.getByRole('button', { name: 'Uitzetten', exact: true }).click();
        await expect(SLOT(page)).toHaveAttribute('aria-checked', 'false');
      }],
    ];
    for (const [naam, open, naGelukt] of stromen) {
      await open();
      await expect(page.getByText(TEKSTEN.slot.huidigeCode), naam).toBeVisible();
      for (const slecht of SLECHT) {
        await zetSlecht(page, slecht);
        await page.locator('.slot__boodschap').evaluate((el) => (el.textContent = ''));
        const voor = await aanroepen(page);
        await bevestig.click();
        await expect(page.locator('.slot__boodschap'), `${naam}: ${slecht.join('=')}`).toHaveText(MISLUKT);
        expect(await aanroepen(page)).toBe(voor + 1);
        // niets gewijzigd: nog altijd de vraag naar de huidige code, dezelfde code en herstelcode, het slot staat aan, geen foute poging
        await expect(page.getByText(TEKSTEN.slot.huidigeCode)).toBeVisible();
        await expect(page.locator('.cijferblok')).toBeVisible();
        expect(await instellingUitDb(page, 'slot.pin')).toEqual(pin);
        if (naam !== 'uitzetten') expect(await instellingUitDb(page, 'slot.herstel')).toEqual(herstel);
        expect(await instellingUitDb(page, 'slot.aan')).toBe(true);
        expect(await instellingUitDb(page, 'slot.fouten')).toBe(0);
      }
      await zetSlecht(page, []);
      await bevestig.click();
      await naGelukt();
    }
    expect(await instellingUitDb(page, 'slot.pin')).toBeNull();
  });

  test('Face ID instellen met het slot uit: een antwoord dat niet klopt bewaart niets en wordt vergeten; opnieuw proberen met een goed antwoord lukt', async ({ page }) => {
    await nabootsPasskey(page, 'ok');
    await page.goto('./#/meer/vergrendeling');
    await zetSlecht(page, SLECHT[0]);
    await FACE(page).click();
    await tik(page, CODE);
    await tik(page, CODE);
    // BESLISSING 530: geen derde keer de code, wel opnieuw proberen
    await expect(page.locator('[data-toestelopnieuw]')).toBeVisible();
    const opnieuw = page.getByRole('button', { name: TEKSTEN.slot.toestelOpnieuw });
    for (const slecht of SLECHT) {
      await zetSlecht(page, slecht);
      await page.locator('[data-toestelopnieuw] .slot__boodschap').evaluate((el) => (el.textContent = ''));
      const voor = await gemaakt(page);
      await opnieuw.click();
      await expect(page.locator('[data-toestelopnieuw] .slot__boodschap'), slecht.join('=')).toHaveText(MISLUKT);
      expect(await gemaakt(page)).toBe(voor + 1);
      expect(await instellingUitDb(page, 'slot.pin')).toBeNull();
      expect(await instellingUitDb(page, 'slot.passkeyId')).toBeNull();
    }
    // elke gemaakte sleutel die niet door de controle kwam, is meteen als onbekend gemeld
    expect((await page.evaluate(() => window.__pkVergeten)).length).toBe(SLECHT.length + 1);
    await zetSlecht(page, []);
    await opnieuw.click();
    await rondAf(page);
    await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
    expect(await instellingUitDb(page, 'slot.methode')).toBe('faceid');
    const id = await instellingUitDb(page, 'slot.passkeyId');
    expect(id).toBeTruthy();
    expect(await page.evaluate(() => window.__pkVergeten)).not.toContain(id);
  });

  test('van Pincode naar Face ID met het slot aan: een antwoord dat niet klopt laat Pincode staan met de rustige melding', async ({ page }) => {
    await nabootsPasskey(page, 'ok');
    await zetSlotAan(page);
    for (const slecht of SLECHT) {
      await zetSlecht(page, slecht);
      await FACE(page).click();
      await tik(page, CODE);
      await expect(page.getByText(TEKSTEN.slot.faceIdMislukt).first(), slecht.join('=')).toBeVisible();
      await expect(KIES_PIN(page)).toHaveAttribute('aria-checked', 'true');
      expect(await instellingUitDb(page, 'slot.methode')).toBe('pin');
      expect(await instellingUitDb(page, 'slot.passkeyId')).toBeNull();
    }
    await zetSlecht(page, []);
    await FACE(page).click();
    await tik(page, CODE);
    await expect(FACE(page)).toHaveAttribute('aria-checked', 'true');
    expect(await instellingUitDb(page, 'slot.methode')).toBe('faceid');
  });
});
