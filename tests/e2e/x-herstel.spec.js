// BESLISSING 518: de pincode altijd kunnen wijzigen, en een vergeten pincode herstellen zonder herstelvraag: met het toestel (een nagebootste
// platformauthenticator zoals in x-welkom-slot.spec.js) of met een herstelcode van twaalf tekens die Bloei één keer toont. Het dagboek blijft
// staan; "Alles wissen en opnieuw beginnen" blijft de laatste uitweg. Ook: bestaande gebruikers, uitzetten, twee tabbladen, een onderbroken
// stroom, de hoogte van de welkomkaart en dat de code nergens leesbaar staat. Schermafbeeldingen alleen op verzoek (SHOTDIR).
import { test, expect, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { animatiesKlaar } from './wacht.js';
import { vasteKlok } from './vaste-klok.js';
import { TEKSTEN } from '../../src/teksten.js';

const CODE = '123456';
const LEEG = { cookies: [], origins: [] };
const VERGRENDELING = './#/meer/vergrendeling';
const PIXEL = devices['Pixel 7'];
const ANDROID = { userAgent: PIXEL.userAgent, viewport: PIXEL.viewport, deviceScaleFactor: PIXEL.deviceScaleFactor, isMobile: true, hasTouch: true };

const SLOT = (page) => page.getByRole('switch', { name: /^Bloei vergrendelen/ });
const KIES_PIN = (page) => page.getByRole('radio', { name: /^Pincode/ });
const FACE = (page) => page.getByRole('radio', { name: /^Face ID/ });
const stap = (page) => page.locator('[data-herstelstap]');
const aanbod = (page) => page.locator('[data-toestelaanbod]');

async function tik(page, code) {
  for (const cijfer of code) await page.locator(`.cijferblok__toets[data-cijfer="${cijfer}"]`).click();
}

// BESLISSING 541: antwoorden zoals een echte platformauthenticator ze geeft (clientDataJSON met challenge en oorsprong, authenticatordata met de
// hash van het rpId en de vlaggen, bij create een attestationObject en getAuthenticatorData). window.__pkBouw.create(opties) en .get(opties).
// sessionStorage '__uv' = 'nee' laat de vlag UV weg (een toestel dat de gebruiker niet verifieerde). Elk nieuw id is anders ([7, 7, n]).
// sessionStorage '__pkfout' = 'challenge' (een andere challenge), 'oorsprong' (een andere oorsprong), 'rp' (de hash van een ander rpId), 'type' (het
// verkeerde type), 'id' (bij get een andere sleutel dan gevraagd, bij create een ander id in de authenticatordata dan rawId).
function pkBouwer() {
  const tekst = (s) => new TextEncoder().encode(s);
  const b64url = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const samen = (...delen) => Uint8Array.from(delen.flatMap((d) => [...d]));
  const kop = (soort, n) => (n < 24 ? [(soort << 5) | n] : n < 256 ? [(soort << 5) | 24, n] : [(soort << 5) | 25, n >> 8, n & 255]);
  const tk = (s) => [...kop(3, s.length), ...tekst(s)];
  let teller = 0;
  const fout = () => sessionStorage.getItem('__pkfout');
  async function data(o, soort, id) {
    const rp = fout() === 'rp' ? 'ander.example' : o.publicKey.rp?.id || o.publicKey.rpId || location.hostname;
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', tekst(rp)));
    const uv = sessionStorage.getItem('__uv') === 'nee' ? 0 : 0x04;
    const delen = [hash, Uint8Array.of(0x01 | uv | (soort === 'create' ? 0x40 : 0)), new Uint8Array(4)];
    const zichtbaar = soort === 'create' && fout() === 'id' ? Uint8Array.from(id, (x) => x ^ 0xff) : id;
    if (soort === 'create') delen.push(new Uint8Array(16), Uint8Array.of(0, zichtbaar.length), zichtbaar, Uint8Array.of(0xa0));
    return samen(...delen);
  }
  const client = (o, soort) =>
    tekst(JSON.stringify({
      type: 'webauthn.' + (fout() === 'type' ? (soort === 'create' ? 'get' : 'create') : soort),
      challenge: b64url(fout() === 'challenge' ? new Uint8Array(32) : o.publicKey.challenge),
      origin: fout() === 'oorsprong' ? 'https://ander.example' : location.origin,
      crossOrigin: false,
    }));
  window.__pkBouw = {
    create: async (o) => {
      // '__pkbasis' (sessionStorage): een hoger begin, zodat een id na herladen niet gelijk is aan een id van voor het herladen
      const id = Uint8Array.of(7, 7, Number(sessionStorage.getItem('__pkbasis') || 0) + ++teller);
      const ad = await data(o, 'create', id);
      const att = Uint8Array.from([...kop(5, 3), ...tk('fmt'), ...tk('none'), ...tk('attStmt'), 0xa0, ...tk('authData'), ...kop(2, ad.length), ...ad]);
      return { type: 'public-key', id: b64url(id), rawId: id.buffer, authenticatorAttachment: 'platform', response: { clientDataJSON: client(o, 'create').buffer, attestationObject: att.buffer, getAuthenticatorData: () => ad.buffer, getTransports: () => ['internal'] }, getClientExtensionResults: () => ({}) };
    },
    get: async (o) => {
      const id = fout() === 'id' ? Uint8Array.of(5, 5, 5) : new Uint8Array(o.publicKey.allowCredentials?.[0]?.id ?? [7, 7, 0]);
      return { type: 'public-key', id: b64url(id), rawId: id.buffer, authenticatorAttachment: 'platform', response: { clientDataJSON: client(o, 'get').buffer, authenticatorData: (await data(o, 'get')).buffer, signature: new ArrayBuffer(8), userHandle: null }, getClientExtensionResults: () => ({}) };
    },
  };
}

// Nagebootste platformauthenticator: 'ok' (Face ID, vingerafdruk of schermslot) of 'geen'. sessionStorage '__pk' = 'annuleer' laat de
// bevestiging (get) mislukken, '__pkweg' = 'ja' ook (de sleutel is weg, BESLISSING 638), '__pkc' = 'fout' het aanmaken (create), '__uv' = 'nee' laat de vlag UV weg, '__pkwacht' = 'ja' houdt create
// vast tot window.__pkLos() (een systeemvenster dat openstaat). Houdt bij: __pkGemaakt, __pkAanroepen, __pkOpties (de opties van elke vraag)
// en __pkVergeten (de id's die de app als onbekend meldde, ook na herladen via window.name).
async function authenticator(page, modus = 'ok') {
  await page.addInitScript(pkBouwer);
  await page.addInitScript((m) => {
    window.__pkGemaakt = 0;
    window.__pkAanroepen = 0;
    window.__pkOpties = [];
    try {
      window.__pkVergeten = JSON.parse(window.name);
    } catch {
      window.__pkVergeten = [];
    }
    if (!Array.isArray(window.__pkVergeten)) window.__pkVergeten = [];
    if (m === 'geen') {
      window.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: async () => false };
      return;
    }
    window.PublicKeyCredential = window.PublicKeyCredential || function () {};
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
    window.PublicKeyCredential.signalUnknownCredential = async (o) => {
      window.__pkVergeten.push(o.credentialId);
      window.name = JSON.stringify(window.__pkVergeten);
    };
    const opties = (soort, o) => ({ soort, userVerification: o.publicKey.userVerification ?? o.publicKey.authenticatorSelection?.userVerification ?? null, aanhechting: o.publicKey.authenticatorSelection?.authenticatorAttachment ?? null, naam: o.publicKey.user?.name ?? null });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        create: async (o) => {
          window.__pkGemaakt++;
          window.__pkOpties.push(opties('create', o));
          if (sessionStorage.getItem('__pkwacht') === 'ja') await new Promise((los) => (window.__pkLos = los));
          if (sessionStorage.getItem('__pkc') === 'fout') throw new DOMException('geannuleerd', 'NotAllowedError');
          return window.__pkBouw.create(o);
        },
        get: async (o) => {
          window.__pkAanroepen++;
          window.__pkOpties.push(opties('get', o));
          if (sessionStorage.getItem('__pk') === 'annuleer') throw new DOMException('geannuleerd', 'NotAllowedError');
          // BESLISSING 638: de passkey van het slot is uit de sleutelhanger verwijderd; een browser geeft dan dezelfde fout als bij annuleren
          if (sessionStorage.getItem('__pkweg') === 'ja') throw new DOMException('geen sleutel', 'NotAllowedError');
          return window.__pkBouw.get(o);
        },
      },
    });
  }, modus);
}
const zetPk = (page, modus) => page.evaluate((m) => sessionStorage.setItem('__pk', m), modus);
const zetSessie = (page, sleutel, waarde) => page.evaluate(([s, w]) => (w === null ? sessionStorage.removeItem(s) : sessionStorage.setItem(s, w)), [sleutel, waarde]);
const vergeten = (page) => page.evaluate(() => window.__pkVergeten);
const BEVESTIG = (page) => page.getByRole('button', { name: 'Bevestig met Face ID' });
const MISLUKT = 'Dat lukte niet. Probeer het opnieuw of kies een andere weg.';

const instelling = (page, sleutel) =>
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

async function zetInDb(page, paren) {
  await page.evaluate(
    (p) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const tx = open.result.transaction('instellingen', 'readwrite');
          for (const [sleutel, waarde] of Object.entries(p)) tx.objectStore('instellingen').put({ sleutel, waarde });
          tx.oncomplete = () => {
            open.result.close();
            klaar();
          };
        };
      }),
    paren,
  );
}

// Elke opslag van de pagina als tekst (IndexedDB, localStorage, sessionStorage), om naar een leesbare code te zoeken.
async function alleOpslag(page) {
  return page.evaluate(async () => {
    const uit = { idb: {}, local: { ...localStorage }, session: { ...sessionStorage }, adres: location.href };
    for (const info of await indexedDB.databases()) {
      const db = await new Promise((r) => {
        const q = indexedDB.open(info.name);
        q.onsuccess = () => r(q.result);
      });
      for (const naam of db.objectStoreNames) {
        uit.idb[info.name + '/' + naam] = await new Promise((r) => {
          const q = db.transaction(naam).objectStore(naam).getAll();
          q.onsuccess = () => r(q.result);
        });
      }
      db.close();
    }
    return JSON.stringify(uit);
  });
}
const varianten = (code) => [code, code.replace(/-/g, ''), ...code.split('-')];

// De stap na de code bij het instellen: meteen de herstelcode met het vinkje (BESLISSING 541: geen vraag "Je toestel als hulp"). Geeft de code.
async function rondAf(page) {
  await expect(stap(page)).toBeVisible();
  await expect(aanbod(page)).toHaveCount(0);
  const code = (await stap(page).locator('.herstel__code').textContent()).trim();
  await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
  await stap(page).getByRole('button', { name: 'Verder' }).click();
  return code;
}

async function zetSlotAan(page, { methode = 'pin' } = {}) {
  await page.goto(VERGRENDELING);
  if (methode === 'faceid') await FACE(page).click();
  else await SLOT(page).click();
  await tik(page, CODE);
  await tik(page, CODE);
  const herstelcode = await rondAf(page);
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  return herstelcode;
}

async function wachtOpSlot(page) {
  await expect(page.locator('#slot')).toBeVisible();
  await expect(page.locator('#slot .cijferblok')).toBeVisible();
}

async function drinkWater(page) {
  await page.goto('./#/vandaag');
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
}
async function waterStaatEr(page) {
  await page.goto('./#/vandaag');
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
}

async function naarHerstelcode(page) {
  await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
  await page.getByRole('button', { name: 'Gebruik je herstelcode' }).click();
  await expect(page.getByRole('heading', { name: 'Je herstelcode' })).toBeVisible();
}
const veld = (page) => page.getByRole('textbox', { name: 'Herstelcode' });

// =====================================================================================================================
test.describe('herstelcode en pincode', () => {
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  test('aanzetten toont de herstelcode één keer: Kopiëren, Bewaren als bestand, het vinkje is verplicht; nergens leesbaar bewaard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    await authenticator(page, 'ok');
    await page.goto(VERGRENDELING);
    await SLOT(page).click();
    await tik(page, CODE);
    await tik(page, CODE);
    // BESLISSING 541: meteen de herstelcode; geen vraag "Je toestel als hulp" en geen systeemvenster, ook al kan het toestel het
    await expect(stap(page)).toBeVisible();
    await expect(aanbod(page)).toHaveCount(0);
    await expect(page.getByText('Je toestel als hulp')).toHaveCount(0);
    expect(await page.evaluate(() => window.__pkGemaakt + window.__pkAanroepen)).toBe(0);
    await expect(page.getByRole('heading', { name: 'Je herstelcode' })).toBeFocused();
    const code = (await stap(page).locator('.herstel__code').textContent()).trim();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/);
    await expect(stap(page)).toContainText('Ze staat nergens anders en Bloei kan ze niet opnieuw tonen.');
    await expect(stap(page)).toContainText('Wie deze code heeft, kan een nieuwe pincode kiezen.');
    // voor een schermlezer teken per teken
    const voorlezen = await stap(page).locator('.alleen-lezer').textContent();
    expect(voorlezen).toContain(code.replace(/-/g, '').slice(0, 4).split('').join(' '));
    await expect(stap(page).locator('.herstel__code')).toHaveAttribute('aria-hidden', 'true');
    // nog niets bewaard zolang de stap openstaat
    expect(await instelling(page, 'slot.aan')).toBeFalsy();
    expect(await instelling(page, 'slot.pin')).toBeNull();
    // Kopiëren
    await stap(page).getByRole('button', { name: /^Kopi.ren$/ }).click();
    await expect(stap(page).locator('.herstel__melding')).toHaveText('De code staat op je klembord.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
    // Bewaren als bestand: een tekstbestandje met de code, zonder naam
    const [download] = await Promise.all([page.waitForEvent('download'), stap(page).getByRole('button', { name: 'Bewaren als bestand' }).click()]);
    expect(download.suggestedFilename()).toBe('bloei-herstelcode.txt');
    const inhoud = readFileSync(await download.path(), 'utf8');
    expect(inhoud).toContain(code);
    expect(inhoud).toContain('Wie deze code heeft, kan een nieuwe pincode kiezen.');
    expect(inhoud).not.toMatch(/Testnaam/);
    // het vinkje is verplicht
    const verder = stap(page).getByRole('button', { name: 'Verder' });
    await expect(verder).toBeDisabled();
    await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
    await expect(verder).toBeEnabled();
    await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
    await expect(verder).toBeDisabled();
    await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
    await verder.click();
    await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
    // Algemeen \u203a Vergrendeling: Pincode wijzigen en Herstelcode met de datum
    await expect(page.getByRole('button', { name: 'Pincode wijzigen' })).toBeVisible();
    await expect(page.locator('[data-uitleg="slot-herstel"]')).toContainText('Gemaakt op donderdag 12 november 2026.');
    await expect(page.getByRole('button', { name: 'Nieuwe herstelcode maken' })).toBeVisible();
    // BESLISSING 541: geen rij "Herstel met Face ID" en geen Koppelen meer; één zin zegt hoe het werkt als ze haar code vergeet
    await expect(page.locator('[data-uitleg="slot-toestel"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /koppel/i })).toHaveCount(0);
    await expect(page.locator('[data-vergeet]')).toHaveText('Vergeet je je code, dan kies je een nieuwe met Face ID of met je herstelcode.');
    expect(await page.evaluate(() => window.__pkGemaakt + window.__pkAanroepen)).toBe(0);
    expect(await instelling(page, 'slot.herstelId')).toBeNull();
    const herstel = await instelling(page, 'slot.herstel');
    expect(Object.keys(herstel).sort()).toEqual(['bevestigd', 'gemaakt', 'hash', 'rondes', 'zout']);
    expect(herstel.bevestigd).toBe(true);
    expect(herstel.rondes).toBe(600000);
    // nergens leesbaar: IndexedDB, localStorage, sessionStorage, adres, console
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    await expect(page.locator('#slot')).toBeHidden();
    const alles = await alleOpslag(page);
    for (const v of varianten(code)) expect(alles).not.toContain(v);
    expect(alles).not.toContain(CODE);
    for (const v of varianten(code)) expect(logs.join('\n')).not.toContain(v);
  });

  test('de pincode wijzigen: eerst de juiste huidige code (een foute telt mee), dan de nieuwe een keer (BESLISSING 533); de herstelcode blijft geldig', async ({ page }) => {
    await authenticator(page, 'geen');
    await zetSlotAan(page);
    const herstel = await instelling(page, 'slot.herstel');
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await expect(page.getByText('Geef je huidige code in.')).toBeVisible();
    // bij Pincode op een toestel zonder platformauthenticator geen knop voor het toestel
    await expect(page.getByRole('button', { name: /^Bevestig met/ })).toHaveCount(0);
    await tik(page, '000000');
    await expect(page.locator('.slot__boodschap')).toHaveText('Die code klopt niet.');
    expect(await instelling(page, 'slot.fouten')).toBe(1);
    await tik(page, CODE);
    await expect(page.getByText('Kies je nieuwe code van zes cijfers.')).toBeVisible();
    await tik(page, '246810'); // BESLISSING 533: de nieuwe code een keer
    await expect(page.getByRole('button', { name: 'Pincode wijzigen' })).toBeVisible();
    expect(await instelling(page, 'slot.herstel')).toEqual(herstel);
    expect(await instelling(page, 'slot.fouten')).toBe(0);
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    await expect(page.locator('.slot__boodschap')).toHaveText('Die code klopt niet.');
    await tik(page, '246810');
    await expect(page.locator('#slot')).toBeHidden();
  });

  test('herstel met de herstelcode (kleine letters en spaties): nieuwe pincode, het dagboek blijft, de oude herstelcode is verbruikt en er is een nieuwe', async ({ page }) => {
    await authenticator(page, 'geen');
    await drinkWater(page);
    const code = await zetSlotAan(page);
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.getByRole('heading', { name: 'Je code niet meer weten' })).toBeVisible();
    await expect(page.locator('#slot')).toContainText('Bloei kan je code niet terughalen.');
    await expect(page.locator('#slot')).toContainText('Gebruik je herstelcode. Daarna kies je een nieuwe code, en je dagboek blijft staan.');
    // de volgorde: de herstelweg boven, Alles wissen onderaan
    const namen = await page.locator('#slot .slot__acties .knop').allTextContents();
    expect(namen.map((n) => n.trim())).toEqual(['Gebruik je herstelcode', 'Alles wissen en opnieuw beginnen', 'Terug']);
    await page.getByRole('button', { name: 'Gebruik je herstelcode' }).click();
    await expect(veld(page)).toBeFocused();
    await veld(page).fill(code.toLowerCase().replace(/-/g, ' '));
    await page.keyboard.press('Enter');
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    // nog niets gewijzigd tot de nieuwe code bevestigd is
    const oudeHerstel = await instelling(page, 'slot.herstel');
    await tik(page, '135790');
    await tik(page, '135790');
    await expect(page.getByRole('heading', { name: 'Je nieuwe herstelcode' })).toBeVisible();
    await expect(stap(page)).toContainText('Je oude herstelcode werkt niet meer.');
    const nieuweCode = (await stap(page).locator('.herstel__code').textContent()).trim();
    expect(nieuweCode).not.toBe(code);
    // de nieuwe code is al bewaard (nog niet bevestigd), het slot is nog dicht
    expect((await instelling(page, 'slot.herstel')).hash).not.toBe(oudeHerstel.hash);
    expect((await instelling(page, 'slot.herstel')).bevestigd).toBe(false);
    await expect(page.locator('#app')).toBeHidden();
    await expect(stap(page).getByRole('button', { name: 'Verder' })).toBeDisabled();
    await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
    await stap(page).getByRole('button', { name: 'Verder' }).click();
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.getByText('Je nieuwe code is ingesteld.')).toBeVisible();
    expect((await instelling(page, 'slot.herstel')).bevestigd).toBe(true);
    await waterStaatEr(page);
    // de oude herstelcode werkt niet meer, de nieuwe wel; de nieuwe pincode opent
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    await veld(page).fill(code);
    await page.getByRole('button', { name: 'Verder' }).click();
    await expect(page.locator('#slot .slot__boodschap').first()).toHaveText('Die herstelcode klopt niet.');
    await veld(page).fill(nieuweCode);
    await page.getByRole('button', { name: 'Verder' }).click();
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    await page.getByRole('button', { name: 'Annuleren' }).click();
    await page.getByRole('button', { name: 'Terug', exact: true }).click();
    await tik(page, '135790');
    await expect(page.locator('#slot')).toBeHidden();
  });

  test('een foute herstelcode: een melding, na vijf een oplopende wachttijd (eigen teller), niets gewist; een verkeerde vorm telt niet', async ({ page }) => {
    await authenticator(page, 'geen');
    await drinkWater(page);
    const code = await zetSlotAan(page);
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    const boodschap = page.locator('.herstel__formulier .slot__boodschap');
    await veld(page).fill('abc');
    await page.keyboard.press('Enter');
    await expect(boodschap).toHaveText('Een herstelcode heeft twaalf letters en cijfers, zoals K7M2-9QXA-4RTP.');
    expect(await instelling(page, 'slot.herstelFouten')).toBe(0);
    const fout = code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A');
    for (let i = 1; i <= 4; i += 1) {
      await veld(page).fill(fout);
      await page.keyboard.press('Enter');
      await expect(boodschap).toHaveText('Die herstelcode klopt niet.');
      await expect.poll(() => instelling(page, 'slot.herstelFouten')).toBe(i);
    }
    await veld(page).fill(fout);
    await page.keyboard.press('Enter');
    await expect(boodschap).toContainText('Even wachten');
    await expect(veld(page)).toBeDisabled();
    // de pincode heeft haar eigen teller: die staat nog op nul
    expect(await instelling(page, 'slot.fouten')).toBe(0);
    // ook na herladen
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    await expect(veld(page)).toBeDisabled();
    await expect(boodschap).toContainText('Even wachten');
    // na de wachttijd werkt de juiste code; niets is gewist
    await page.clock.fastForward(31000);
    await expect(veld(page)).toBeEnabled();
    await veld(page).fill(code);
    await page.keyboard.press('Enter');
    await tik(page, '246802');
    await tik(page, '246802');
    await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
    await stap(page).getByRole('button', { name: 'Verder' }).click();
    await expect(page.locator('#slot')).toBeHidden();
    await waterStaatEr(page);
    expect(await instelling(page, 'slot.herstelFouten')).toBe(0);
  });

  test('een nieuwe herstelcode maken vraagt eerst de huidige code; de oude vervalt', async ({ page }) => {
    await authenticator(page, 'geen');
    const oud = await zetSlotAan(page);
    await page.getByRole('button', { name: 'Nieuwe herstelcode maken' }).click();
    await expect(page.getByText('Geef je huidige code in.')).toBeVisible();
    await tik(page, '999999');
    await expect(page.locator('.slot__boodschap')).toHaveText('Die code klopt niet.');
    await tik(page, CODE);
    await expect(page.getByRole('heading', { name: 'Je nieuwe herstelcode' })).toBeVisible();
    const nieuw = (await stap(page).locator('.herstel__code').textContent()).trim();
    expect(nieuw).not.toBe(oud);
    // al bewaard, nog niet bevestigd: het open punt
    expect((await instelling(page, 'slot.herstel')).bevestigd).toBe(false);
    await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
    await stap(page).getByRole('button', { name: 'Verder' }).click();
    await expect(page.getByText('Je nieuwe herstelcode is klaar.')).toBeVisible();
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    await veld(page).fill(oud);
    await page.keyboard.press('Enter');
    await expect(page.locator('.herstel__formulier .slot__boodschap')).toHaveText('Die herstelcode klopt niet.');
    await veld(page).fill(nieuw);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
  });
});

// =====================================================================================================================
test.describe('herstel met het toestel', () => {
  test.beforeEach(async ({ page }) => vasteKlok(page));

  test('Face ID gekozen: bevestigen met het toestel, een nieuwe pincode, het dagboek blijft; geweigerd blijft dicht', async ({ page }) => {
    await authenticator(page, 'ok');
    await drinkWater(page);
    await zetSlotAan(page, { methode: 'faceid' });
    await zetPk(page, 'annuleer');
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.locator('#slot')).toContainText('Bevestig met Face ID of gebruik je herstelcode. Daarna kies je een nieuwe code, en je dagboek blijft staan.');
    const namen = (await page.locator('#slot .slot__acties .knop').allTextContents()).map((n) => n.trim());
    expect(namen).toEqual(['Bevestig met Face ID', 'Gebruik je herstelcode', 'Alles wissen en opnieuw beginnen', 'Terug']);
    // geweigerd: een rustige melding, niets gewijzigd, geen foute poging; BESLISSING 638: de zin zegt dat de volgende tik het anders vraagt
    await page.getByRole('button', { name: 'Bevestig met Face ID' }).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(TEKSTEN.slot.toestelTerugval);
    await expect(page.locator('#slot .cijferblok')).toHaveCount(0);
    expect(await instelling(page, 'slot.fouten')).toBe(0);
    // toegestaan, via de eenmalige weg (638)
    await zetPk(page, 'ok');
    const herstel = await instelling(page, 'slot.herstel');
    await page.getByRole('button', { name: 'Bevestig met Face ID' }).click();
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    expect(await page.evaluate(() => window.__pkOpties.at(-1).soort)).toBe('create');
    await tik(page, '864200');
    await tik(page, '864200');
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.getByText('Je nieuwe code is ingesteld.')).toBeVisible();
    await waterStaatEr(page);
    // de herstelcode blijft geldig (het toestel verbruikt niets)
    expect(await instelling(page, 'slot.herstel')).toEqual(herstel);
    await zetPk(page, 'annuleer');
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    await expect(page.locator('#slot .slot__boodschap').first()).toHaveText('Die code klopt niet.');
    await tik(page, '864200');
    await expect(page.locator('#slot')).toBeHidden();
  });

  // BESLISSING 541: met Pincode en zonder iets te koppelen. Geweigerd, geannuleerd en zonder UV-vlag openen en wijzigen niets; geslaagd geeft een
  // nieuwe pincode (twee keer), het dagboek en de herstelcode blijven; de sleutel van één keer wordt telkens meteen als onbekend gemeld.
  test('Pincode zonder koppeling: de weg staat er; geannuleerd en zonder UV-vlag wijzigt niets; geslaagd geeft een nieuwe pincode', async ({ page }) => {
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    await authenticator(page, 'ok');
    await drinkWater(page);
    await zetSlotAan(page);
    expect(await instelling(page, 'slot.methode')).toBe('pin');
    expect(await instelling(page, 'slot.passkeyId')).toBeNull();
    expect(await instelling(page, 'slot.herstelId')).toBeNull();
    const pinVoor = await instelling(page, 'slot.pin');
    const herstel = await instelling(page, 'slot.herstel');
    await page.reload();
    await wachtOpSlot(page);
    // methode Pincode: het slot vraagt het toestel niets
    expect(await page.evaluate(() => window.__pkGemaakt + window.__pkAanroepen)).toBe(0);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.locator('#slot')).toContainText('Bevestig met Face ID of gebruik je herstelcode. Daarna kies je een nieuwe code, en je dagboek blijft staan.');
    const namen = (await page.locator('#slot .slot__acties .knop').allTextContents()).map((n) => n.trim());
    expect(namen).toEqual(['Bevestig met Face ID', 'Gebruik je herstelcode', 'Alles wissen en opnieuw beginnen', 'Terug']);
    const ongewijzigd = async () => {
      await expect(page.locator('#slot .cijferblok')).toHaveCount(0);
      await expect(page.locator('#app')).toBeHidden();
      expect(await instelling(page, 'slot.pin')).toEqual(pinVoor);
      expect(await instelling(page, 'slot.herstel')).toEqual(herstel);
      expect(await instelling(page, 'slot.fouten')).toBe(0);
      expect(await instelling(page, 'slot.passkeyId')).toBeNull();
      expect(await instelling(page, 'slot.herstelId')).toBeNull();
    };
    // 1. geannuleerd of verlopen (NotAllowedError): een rustige melding, niets gewijzigd, geen foute poging, de andere wegen blijven
    await zetSessie(page, '__pkc', 'fout');
    await BEVESTIG(page).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(MISLUKT);
    await ongewijzigd();
    await expect(page.getByRole('button', { name: 'Gebruik je herstelcode' })).toBeVisible();
    expect(await vergeten(page)).toEqual([]); // er werd geen sleutel gemaakt
    // 2. create slaagt maar zonder de vlag UV: geweigerd; de gemaakte sleutel wordt toch vergeten
    await zetSessie(page, '__pkc', null);
    await zetSessie(page, '__uv', 'nee');
    await BEVESTIG(page).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(MISLUKT);
    await ongewijzigd();
    await expect.poll(() => vergeten(page)).toEqual(['BwcB']); // het id [7, 7, 1] in base64url
    // 3. geslaagd: de vraag aan het toestel is een sleutel voor één keer op de platformauthenticator, met UV verplicht en zonder naam
    await zetSessie(page, '__uv', null);
    await BEVESTIG(page).click();
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    // nog niets gewijzigd tot de nieuwe code twee keer bevestigd is
    expect(await instelling(page, 'slot.pin')).toEqual(pinVoor);
    await tik(page, '864200');
    await tik(page, '864200');
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.getByText('Je nieuwe code is ingesteld.')).toBeVisible();
    await waterStaatEr(page);
    const vragen = await page.evaluate(() => window.__pkOpties);
    expect(vragen).toHaveLength(3);
    for (const v of vragen) expect(v).toEqual({ soort: 'create', userVerification: 'required', aanhechting: 'platform', naam: 'Bloei herstel' });
    expect(await page.evaluate(() => window.__pkAanroepen)).toBe(0);
    // de sleutel van één keer is meteen vergeten en nergens bewaard; de herstelcode blijft geldig (het toestel verbruikt niets)
    await expect.poll(() => vergeten(page)).toEqual(['BwcB', 'BwcC']);
    expect(await instelling(page, 'slot.herstel')).toEqual(herstel);
    expect(await instelling(page, 'slot.passkeyId')).toBeNull();
    expect(await instelling(page, 'slot.herstelId')).toBeNull();
    expect(await instelling(page, 'slot.methode')).toBe('pin');
    const alles = await alleOpslag(page);
    expect(alles).not.toContain('BwcC');
    expect(alles).not.toContain('864200');
    expect(alles).not.toContain('herstelId');
    expect(logs.join('\n')).not.toMatch(/BwcB|BwcC|864200/);
    // de nieuwe code opent, de oude niet meer
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    await expect(page.locator('#slot .slot__boodschap').first()).toHaveText('Die code klopt niet.');
    await tik(page, '864200');
    await expect(page.locator('#slot')).toBeHidden();
  });

  // Dezelfde strenge controle als op het slotscherm en in de wijzigstromen (passkey.js, controleerBevestiging): elk antwoord dat niet klopt, opent
  // niets en wijzigt niets, met de rustige melding; daarna lukt het met een goed antwoord. Met Face ID (get op de passkey) en met Pincode (create).
  // BESLISSING 638: bij Face ID neemt de knop na een mislukte get bij de volgende tik de eenmalige weg (create). Daarom hier eerst elk slecht
  // antwoord op de get, telkens na herladen (dan begint het slot weer met de bewaarde sleutel), en daarna elk slecht antwoord op de terugval.
  const SLECHT = [['__uv', 'nee'], ['__pkfout', 'challenge'], ['__pkfout', 'oorsprong'], ['__pkfout', 'rp'], ['__pkfout', 'type'], ['__pkfout', 'id']];
  for (const methode of ['faceid', 'pin']) {
    test(`een antwoord dat niet klopt (zonder UV, challenge, oorsprong, rpId, type, id) wijzigt niets; een goed antwoord geeft een nieuwe pincode (${methode})`, async ({ page }) => {
      await authenticator(page, 'ok');
      await drinkWater(page);
      await zetSlotAan(page, { methode });
      const pinVoor = await instelling(page, 'slot.pin');
      const herstel = await instelling(page, 'slot.herstel');
      const passkeyId = await instelling(page, 'slot.passkeyId');
      const tellers = () => page.evaluate(() => window.__pkGemaakt + window.__pkAanroepen);
      const laatsteSoort = () => page.evaluate(() => window.__pkOpties.at(-1)?.soort);
      const nietsGewijzigd = async () => {
        await expect(page.locator('#slot .cijferblok')).toHaveCount(0);
        await expect(page.locator('#app')).toBeHidden();
        expect(await instelling(page, 'slot.pin')).toEqual(pinVoor);
        expect(await instelling(page, 'slot.herstel')).toEqual(herstel);
        expect(await instelling(page, 'slot.passkeyId')).toEqual(passkeyId);
        expect(await instelling(page, 'slot.fouten')).toBe(0);
      };
      if (methode === 'faceid') {
        // de sleutels van één keer na herladen krijgen een ander id dan de passkey van het slot (in de nabootsing begint de teller per pagina)
        await zetSessie(page, '__pkbasis', '100');
        for (const [sleutel, waarde] of SLECHT) {
          await zetSessie(page, '__uv', null);
          await zetSessie(page, '__pkfout', null);
          await zetSessie(page, sleutel, waarde);
          // het slechte antwoord geldt al bij herladen: Face ID opent het slot dan niet vanzelf
          await page.reload();
          await wachtOpSlot(page);
          await page.waitForTimeout(300);
          await expect(page.locator('#app')).toBeHidden();
          await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
          const voor = await tellers();
          await BEVESTIG(page).click();
          await expect(page.locator('#slot .slot__boodschap'), `get ${sleutel}=${waarde}`).toHaveText(TEKSTEN.slot.toestelTerugval);
          expect(await tellers()).toBe(voor + 1); // één vraag per tik, geen tweede systeemvenster vanzelf
          expect(await laatsteSoort()).toBe('get');
          await nietsGewijzigd();
        }
      } else {
        await zetSessie(page, SLECHT[0][0], SLECHT[0][1]);
        await page.reload();
        await wachtOpSlot(page);
        await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
      }
      for (const [sleutel, waarde] of SLECHT) {
        await zetSessie(page, '__uv', null);
        await zetSessie(page, '__pkfout', null);
        await zetSessie(page, sleutel, waarde);
        await page.locator('#slot .slot__boodschap').evaluate((el) => (el.textContent = ''));
        const voor = await tellers();
        await BEVESTIG(page).click();
        await expect(page.locator('#slot .slot__boodschap'), `${sleutel}=${waarde}`).toHaveText(MISLUKT);
        expect(await tellers()).toBe(voor + 1); // één vraag per tik, geen extra systeemvenster
        // bij Pincode altijd, bij Face ID na de terugval (638): een sleutel voor één keer
        expect(await laatsteSoort()).toBe('create');
        await nietsGewijzigd();
      }
      // elke sleutel van één keer is meteen als onbekend gemeld, ook als hij niet door de controle kwam; de passkey van het slot nooit
      await expect.poll(async () => (await vergeten(page)).length).toBe(SLECHT.length);
      if (passkeyId) expect(await vergeten(page)).not.toContain(passkeyId);
      await zetSessie(page, '__uv', null);
      await zetSessie(page, '__pkfout', null);
      await BEVESTIG(page).click();
      await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
      await tik(page, '864200');
      await tik(page, '864200');
      await expect(page.locator('#slot')).toBeHidden();
      await waterStaatEr(page);
      expect(await instelling(page, 'slot.pin')).not.toEqual(pinVoor);
    });
  }

  test('kan het toestel het niet, dan staat de weg er niet (geen dode knop); zonder herstelcode blijft alleen de laatste uitweg', async ({ page }) => {
    await authenticator(page, 'geen');
    await zetSlotAan(page);
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.getByRole('button', { name: /^Bevestig met/ })).toHaveCount(0);
    await expect(page.locator('#slot')).toContainText('Gebruik je herstelcode. Daarna kies je een nieuwe code, en je dagboek blijft staan.');
    await expect(page.getByRole('button', { name: 'Gebruik je herstelcode' })).toBeVisible();
    // geen herstelcode en een toestel dat het niet kan: alleen de laatste uitweg, met een zin die zegt waarom
    await zetInDb(page, { 'slot.herstel': null });
    await page.getByRole('button', { name: 'Terug', exact: true }).click();
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.locator('#slot')).toContainText('Je hebt geen herstelcode, en Bloei kan op dit toestel niet met Face ID bevestigen.');
    await expect(page.locator('#slot')).not.toContainText('gekoppeld');
    // BESLISSING 631: ook alles wissen vraagt het toestel; hier kan dat niet, en dat staat er eerlijk
    await expect(page.locator('#slot')).toContainText('Opnieuw beginnen kan op dit toestel niet, want alles wissen vraagt eerst Face ID.');
    const namen = (await page.locator('#slot .slot__acties .knop').allTextContents()).map((n) => n.trim());
    expect(namen).toEqual(['Alles wissen en opnieuw beginnen', 'Terug']);
    const pinVoor = await instelling(page, 'slot.pin');
    await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
    await expect(page.getByRole('heading', { name: 'Alles wissen kan hier niet' })).toBeVisible();
    expect((await page.locator('#slot .slot__acties .knop').allTextContents()).map((n) => n.trim())).toEqual(['Terug']);
    expect(await page.evaluate(() => window.__pkGemaakt + window.__pkAanroepen)).toBe(0);
    expect(await instelling(page, 'slot.pin')).toEqual(pinVoor);
    await page.getByRole('button', { name: 'Terug', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Je code niet meer weten' })).toBeVisible();
  });

  test('zonder herstelcode op een toestel dat het kan: de weg van het toestel staat er wel', async ({ page }) => {
    await authenticator(page, 'ok');
    await zetSlotAan(page);
    await zetInDb(page, { 'slot.herstel': null });
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.locator('#slot')).toContainText('Bevestig met Face ID. Daarna kies je een nieuwe code, en je dagboek blijft staan.');
    const namen = (await page.locator('#slot .slot__acties .knop').allTextContents()).map((n) => n.trim());
    expect(namen).toEqual(['Bevestig met Face ID', 'Alles wissen en opnieuw beginnen', 'Terug']);
  });

  test('een oude koppeling (slot.herstelId) wordt bij de volgende start vergeten en uit de opslag gehaald; de passkey van Face ID blijft', async ({ page }) => {
    await authenticator(page, 'ok');
    await zetSlotAan(page);
    // zoals een vorige versie het bewaarde na "Ja, koppel mijn toestel"
    await zetInDb(page, { 'slot.herstelId': 'AQIDBA' });
    await page.reload();
    await wachtOpSlot(page);
    await expect.poll(() => page.evaluate(() => new Promise((klaar) => {
      const open = indexedDB.open('bloei-dagboek');
      open.onsuccess = () => {
        const v = open.result.transaction('instellingen').objectStore('instellingen').count('slot.herstelId');
        v.onsuccess = () => {
          open.result.close();
          klaar(v.result);
        };
      };
    }))).toBe(0);
    await expect.poll(() => vergeten(page)).toEqual(['AQIDBA']);
    // het slot zelf is niet geopend en werkt zoals voorheen; de weg van het toestel staat er zonder koppeling
    await expect(page.locator('#app')).toBeHidden();
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(BEVESTIG(page)).toBeVisible();
    await page.getByRole('button', { name: 'Terug', exact: true }).click();
    await tik(page, CODE);
    await expect(page.locator('#slot')).toBeHidden();
    // bij Face ID blijft de passkey van het slot staan, ook als een oude rij toevallig hetzelfde id had
    await page.goto(VERGRENDELING);
    await FACE(page).click();
    await tik(page, CODE);
    await expect(FACE(page)).toHaveAttribute('aria-checked', 'true');
    const passkeyId = await instelling(page, 'slot.passkeyId');
    await zetInDb(page, { 'slot.herstelId': passkeyId });
    await zetPk(page, 'annuleer'); // het slot vraagt Face ID meteen; hier niet laten openen
    await page.reload();
    await wachtOpSlot(page);
    await expect.poll(() => instelling(page, 'slot.herstelId')).toBeNull();
    expect(await instelling(page, 'slot.passkeyId')).toBe(passkeyId);
    expect(await vergeten(page)).not.toContain(passkeyId);
  });

  test('onderbroken: Terug of een ander tabblad tijdens de vraag van het toestel; een geslaagde bevestiging zonder nieuwe code wijzigt niets', async ({ page, context }) => {
    await authenticator(page, 'ok');
    await zetSlotAan(page);
    const pinVoor = await instelling(page, 'slot.pin');
    await page.reload();
    await wachtOpSlot(page);
    // 1. het systeemvenster staat open en ze tikt Terug: de late bevestiging opent geen nieuwe code
    await zetSessie(page, '__pkwacht', 'ja');
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await BEVESTIG(page).click();
    await expect.poll(() => page.evaluate(() => typeof window.__pkLos)).toBe('function');
    await expect(BEVESTIG(page)).toBeDisabled(); // een tweede tik vraagt niets nieuws
    await page.getByRole('button', { name: 'Terug', exact: true }).click();
    await wachtOpSlot(page);
    await page.evaluate(() => window.__pkLos());
    await expect.poll(() => vergeten(page)).toHaveLength(1);
    await expect(page.locator('#slot .cijferblok')).toBeVisible();
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toHaveCount(0);
    expect(await instelling(page, 'slot.pin')).toEqual(pinVoor);
    // 2. geslaagd, maar de app sluit voor er een nieuwe code is: niets gewijzigd, dicht, de oude code werkt
    await zetSessie(page, '__pkwacht', null);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await BEVESTIG(page).click();
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    await tik(page, '111222');
    await page.reload();
    await wachtOpSlot(page);
    expect(await instelling(page, 'slot.pin')).toEqual(pinVoor);
    // 3. een ander tabblad wijzigt de code terwijl het systeemvenster hier openstaat: de bevestiging hier blijft wat ze is (een echte bevestiging
    // op dit toestel) en wijzigt zelf niets; Annuleren laat de code van het andere tabblad staan
    await zetSessie(page, '__pkwacht', 'ja');
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await BEVESTIG(page).click();
    await expect.poll(() => page.evaluate(() => typeof window.__pkLos)).toBe('function');
    const b = await context.newPage();
    await vasteKlok(b);
    await authenticator(b, 'ok');
    await b.goto('./#/meer/vergrendeling');
    await wachtOpSlot(b);
    await tik(b, CODE);
    await expect(b.locator('#slot')).toBeHidden();
    await b.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await tik(b, CODE);
    await tik(b, '246810');
    await expect(b.getByText('Je pincode is gewijzigd.')).toBeVisible();
    await page.evaluate(() => window.__pkLos());
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    const pinNa = await instelling(page, 'slot.pin');
    expect(pinNa).not.toEqual(pinVoor);
    await page.getByRole('button', { name: 'Annuleren' }).click();
    expect(await instelling(page, 'slot.pin')).toEqual(pinNa);
    await page.getByRole('button', { name: 'Terug', exact: true }).click();
    await tik(page, '246810');
    await expect(page.locator('#slot')).toBeHidden();
    await b.close();
  });
});

// =====================================================================================================================
// BESLISSING 541 met de echte WebAuthn van Chrome: een virtuele platformauthenticator (Chrome DevTools Protocol), geen nabootsing in de pagina.
// Zo komen clientDataJSON, de authenticatordata, de vlag UV en getAuthenticatorData van de browser zelf.
test.describe('herstel met het toestel, echte WebAuthn (virtuele authenticator)', () => {
  test('met gebruikersverificatie: een nieuwe pincode; zonder: geweigerd, niets gewijzigd; zonder authenticator: geen weg', async ({ page, context }) => {
    await vasteKlok(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable', { enableUI: false });
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    await drinkWater(page);
    await zetSlotAan(page);
    expect(await instelling(page, 'slot.passkeyId')).toBeNull();
    const pinVoor = await instelling(page, 'slot.pin');
    // het instellen maakte geen sleutel
    expect((await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials).toHaveLength(0);
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(BEVESTIG(page)).toBeVisible();
    // 1. het toestel verifieert de gebruiker niet: Chrome weigert (userVerification 'required'), niets gewijzigd
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
    await BEVESTIG(page).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(MISLUKT, { timeout: 20000 });
    expect(await instelling(page, 'slot.pin')).toEqual(pinVoor);
    await expect(page.locator('#app')).toBeHidden();
    // 2. met verificatie: geslaagd
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
    await BEVESTIG(page).click();
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    await tik(page, '864200');
    await tik(page, '864200');
    await expect(page.locator('#slot')).toBeHidden();
    await waterStaatEr(page);
    expect(await instelling(page, 'slot.passkeyId')).toBeNull();
    const sleutels = (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
    console.log(`echte WebAuthn: sleutels in de virtuele authenticator na het herstel: ${sleutels.length} (signalUnknownCredential: ${await page.evaluate(() => typeof PublicKeyCredential.signalUnknownCredential)})`);
    expect(sleutels.length).toBeLessThanOrEqual(2);
    // 3. zonder authenticator met UV: de weg staat er niet
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: false, automaticPresenceSimulation: true } });
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.getByRole('heading', { name: 'Je code niet meer weten' })).toBeVisible();
    const uvpaa = await page.evaluate(() => PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    if (!uvpaa) await expect(page.getByRole('button', { name: /^Bevestig met/ })).toHaveCount(0);
    else console.log('echte WebAuthn: dit Chrome meldt nog een platformauthenticator met UV (bv. Windows Hello); stap 3 niet nagekeken');
  });

  test('BESLISSING 631: alles wissen vanuit het slot; zonder gebruikersverificatie geweigerd en niets gewist, met verificatie alles gewist', async ({ page, context }) => {
    await vasteKlok(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable', { enableUI: false });
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    await drinkWater(page);
    await zetSlotAan(page);
    const pinVoor = await instelling(page, 'slot.pin');
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
    await page.getByRole('button', { name: 'Doorgaan' }).click();
    // 1. het toestel verifieert de gebruiker niet: Chrome weigert, niets gewist, ze blijft op de vraag
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
    await page.getByRole('button', { name: 'Alles wissen', exact: true }).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText('Dat lukte niet. Er is niets gewist.', { timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Zeker weten?' })).toBeVisible();
    expect(await instelling(page, 'slot.pin')).toEqual(pinVoor);
    // 2. met verificatie: alles gewist, de app start opnieuw met het welkomscherm
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
    await page.getByRole('button', { name: 'Alles wissen', exact: true }).click();
    await expect(page.locator('[data-scherm="welkom"]')).toBeVisible({ timeout: 20000 });
    expect(await instelling(page, 'slot.pin')).toBeNull();
    expect(await instelling(page, 'slot.aan')).toBeFalsy();
  });
});

// =====================================================================================================================
// BESLISSING 638: kan Bloei niet bevestigen met de bewaarde sleutel van het slot (methode Face ID; de passkey is bv. uit de sleutelhanger of het
// wachtwoordbeheer verwijderd), dan neemt dezelfde knop bij de volgende tik de eenmalige bevestiging met het toestel (toestelweg.js), voor het
// herstel van de code en voor het wissen. Nooit een tweede vraag vanzelf (WebAuthn wil een tik), dezelfde gebruikersverificatie, dezelfde controle.
test.describe('BESLISSING 638: terugval op de eenmalige bevestiging', () => {
  const TERUGVAL = () => TEKSTEN.slot.toestelTerugval;
  const HERSTELD_PINCODE = () => TEKSTEN.slot.hersteldPincode.replace('{naam}', 'Face ID');
  const WIS_TERUGVAL = () => TEKSTEN.slot.wisTerugval;
  const WIS_MISLUKT = 'Dat lukte niet. Er is niets gewist.';
  const soorten = (page) => page.evaluate(() => window.__pkOpties.map((o) => o.soort));
  const NIEUWE_CODE = 'Kies een nieuwe code. Je dagboek blijft staan.';
  const naarWisVraag = async (page) => {
    await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
    await page.getByRole('button', { name: 'Doorgaan' }).click();
    await expect(page.getByRole('heading', { name: 'Zeker weten?' })).toBeVisible();
  };
  const WIS = (page) => page.getByRole('button', { name: 'Alles wissen', exact: true });

  // Face ID ingesteld, met water in het dagboek; daarna het slot dicht, zonder dat de vraag van het slotscherm het opent.
  async function faceIdDicht(page, sessie = {}) {
    await vasteKlok(page);
    await authenticator(page, 'ok');
    await drinkWater(page);
    await zetSlotAan(page, { methode: 'faceid' });
    const passkeyId = await instelling(page, 'slot.passkeyId');
    expect(passkeyId).toBeTruthy();
    await zetPk(page, 'annuleer');
    for (const [s, w] of Object.entries(sessie)) await zetSessie(page, s, w);
    await page.reload();
    await wachtOpSlot(page);
    await expect.poll(() => page.evaluate(() => window.__pkAanroepen)).toBe(1); // de vraag van het slotscherm zelf
    await zetPk(page, null);
    return { passkeyId, pin: await instelling(page, 'slot.pin') };
  }

  test('de sleutel is er: Bevestig met Face ID vraagt de passkey van het slot (get), zoals voorheen; niets nieuws gemaakt', async ({ page }) => {
    const { passkeyId } = await faceIdDicht(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await BEVESTIG(page).click();
    await expect(page.getByText(NIEUWE_CODE)).toBeVisible();
    expect(await soorten(page)).toEqual(['get', 'get']);
    expect(await page.evaluate(() => window.__pkGemaakt)).toBe(0);
    expect(await vergeten(page)).toEqual([]);
    expect(await instelling(page, 'slot.passkeyId')).toBe(passkeyId);
  });

  test('de sleutel is weg: de eerste tik meldt het rustig zonder tweede vraag, de volgende tik bevestigt eenmalig en geeft een nieuwe code', async ({ page }) => {
    const { passkeyId, pin } = await faceIdDicht(page, { __pkweg: 'ja', __pkbasis: '100' });
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await BEVESTIG(page).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(TERUGVAL());
    expect(await soorten(page)).toEqual(['get', 'get']); // geen create vanzelf
    expect(await instelling(page, 'slot.pin')).toEqual(pin);
    await expect(BEVESTIG(page)).toBeEnabled(); // dezelfde knop, hetzelfde scherm
    await BEVESTIG(page).click();
    await expect(page.getByText(NIEUWE_CODE)).toBeVisible();
    expect(await soorten(page)).toEqual(['get', 'get', 'create']);
    const opties = await page.evaluate(() => window.__pkOpties.at(-1));
    expect(opties).toEqual({ soort: 'create', userVerification: 'required', aanhechting: 'platform', naam: 'Bloei herstel' });
    await tik(page, '864200');
    await tik(page, '864200');
    await expect(page.locator('#slot')).toBeHidden();
    // BESLISSING 643: na een herstel via de terugval staat de methode op Pincode, en de strook zegt dat
    await expect(page.locator('.strook')).toHaveText(HERSTELD_PINCODE());
    expect(await instelling(page, 'slot.methode')).toBe('pin');
    expect(await instelling(page, 'slot.passkeyId')).toBeNull();
    await waterStaatEr(page);
    expect(await instelling(page, 'slot.pin')).not.toEqual(pin);
    // eerst de sleutel van één keer (meteen vergeten), dan, na het bewaren, de passkey van het slot (zoals Face ID uitzetten bij Vergrendeling)
    await expect.poll(async () => (await vergeten(page)).length).toBe(2);
    expect((await vergeten(page))[1]).toBe(passkeyId);
    // herladen: het slot vraagt het toestel niets meer (geen Face ID die elke keer mislukt), de nieuwe code opent
    await page.reload();
    await wachtOpSlot(page);
    await expect(page.getByRole('button', { name: 'Face ID gebruiken' })).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__pkAanroepen)).toBe(0); // de nieuwe pagina vroeg het toestel niets
    await tik(page, '864200');
    await expect(page.locator('#slot')).toBeHidden();
  });

  // BESLISSING 643: alleen de eenmalige weg zet om. Lukt de gewone vraag met de passkey van het slot, dan blijft Face ID staan, met de gewone strook.
  test('de sleutel is er: na het herstel blijft Face ID de methode en blijft de passkey bewaard', async ({ page }) => {
    const { passkeyId } = await faceIdDicht(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await BEVESTIG(page).click();
    await expect(page.getByText(NIEUWE_CODE)).toBeVisible();
    await tik(page, '864200');
    await tik(page, '864200');
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.locator('.strook')).toHaveText(TEKSTEN.slot.hersteld);
    expect(await instelling(page, 'slot.methode')).toBe('faceid');
    expect(await instelling(page, 'slot.passkeyId')).toBe(passkeyId);
    expect(await vergeten(page)).toEqual([]);
  });

  // BESLISSING 643: de zin na het herstel via de terugval, waar hij verschijnt (de strook na het openen). Schermafbeeldingen alleen met SHOTDIR.
  for (const [b, h] of [[390, 844], [1280, 800], [320, 480]]) {
    test(`de zin na een herstel via de terugval in beeld (${b}x${h})`, async ({ page }) => {
      await page.setViewportSize({ width: b, height: h });
      await faceIdDicht(page, { __pkweg: 'ja', __pkbasis: '100' });
      await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
      await BEVESTIG(page).click();
      await expect(page.locator('#slot .slot__boodschap')).toHaveText(TERUGVAL());
      await BEVESTIG(page).click();
      await expect(page.getByText(NIEUWE_CODE)).toBeVisible();
      await tik(page, '864200');
      await tik(page, '864200');
      await expect(page.locator('#slot')).toBeHidden();
      const strook = page.locator('.strook');
      await expect(strook).toHaveText(HERSTELD_PINCODE());
      await animatiesKlaar(page);
      // de strook staat helemaal in beeld, zonder horizontale scroll
      const r = await strook.evaluate((e) => {
        const b = e.getBoundingClientRect();
        return { links: b.left, rechts: b.right, boven: b.top, onder: b.bottom, vw: window.innerWidth, vh: window.innerHeight, sw: document.documentElement.scrollWidth };
      });
      expect(r.links).toBeGreaterThanOrEqual(0);
      expect(r.rechts).toBeLessThanOrEqual(r.vw);
      expect(r.boven).toBeGreaterThanOrEqual(0);
      expect(r.onder).toBeLessThanOrEqual(r.vh);
      expect(r.sw).toBeLessThanOrEqual(r.vw);
      if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/643-strook-${b}x${h}.png` });
      // de strook blijft lang genoeg staan om drie zinnen te lezen (8 s), daarna verdwijnt ze
      await page.waitForTimeout(4000);
      await expect(strook).toBeVisible();
    });
  }

  test('de sleutel is weg: alles wissen meldt het eerst rustig (niets gewist), de volgende tik bevestigt eenmalig en wist alles', async ({ page }) => {
    const { pin } = await faceIdDicht(page, { __pkweg: 'ja' });
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await naarWisVraag(page);
    await WIS(page).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(WIS_TERUGVAL());
    await expect(page.getByRole('heading', { name: 'Zeker weten?' })).toBeVisible();
    expect(await soorten(page)).toEqual(['get', 'get']);
    expect(await instelling(page, 'slot.pin')).toEqual(pin);
    await WIS(page).click();
    await expect(page.locator('[data-scherm="welkom"]')).toBeVisible({ timeout: 20000 });
    expect(await instelling(page, 'slot.pin')).toBeNull();
    expect(await instelling(page, 'slot.aan')).toBeFalsy();
  });

  // De twee zinnen in beeld, op telefoon (ook de zichtbare hoogtes uit CLAUDE.md) en desktop: geen horizontale scroll, tikvlakken van 44 px,
  // de knop onder de zin blijft dezelfde. Schermafbeeldingen alleen met SHOTDIR.
  for (const [b, h] of [[390, 844], [1280, 800], [390, 660], [360, 560], [320, 480]]) {
    test(`de zinnen van de terugval in beeld (${b}x${h})`, async ({ page }) => {
      await page.setViewportSize({ width: b, height: h });
      await faceIdDicht(page, { __pkweg: 'ja' });
      await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
      await BEVESTIG(page).click();
      await expect(page.locator('#slot .slot__boodschap')).toHaveText(TERUGVAL());
      await nagekeken(page, `638-kwijt-terugval-${b}x${h}`);
      // herladen: een nieuw slot begint weer met de bewaarde sleutel, dus ook bij het wissen eerst de zin
      await page.reload();
      await wachtOpSlot(page);
      await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
      await naarWisVraag(page);
      await WIS(page).click();
      await expect(page.locator('#slot .slot__boodschap')).toHaveText(WIS_TERUGVAL());
      await nagekeken(page, `638-wis-terugval-${b}x${h}`);
    });
  }

  for (const [naam, sessie] of [
    ['geannuleerd', { __pk: 'annuleer', __pkc: 'fout' }],
    ['zonder gebruikersverificatie', { __pkweg: 'ja', __uv: 'nee' }],
  ]) {
    test(`${naam}, met de bewaarde sleutel en bij de terugval: geen nieuwe code en niets gewist`, async ({ page }) => {
      const { passkeyId, pin } = await faceIdDicht(page);
      const herstel = await instelling(page, 'slot.herstel');
      for (const [s, w] of Object.entries(sessie)) await zetSessie(page, s, w);
      const nietsGewijzigd = async () => {
        expect(await instelling(page, 'slot.pin')).toEqual(pin);
        expect(await instelling(page, 'slot.herstel')).toEqual(herstel);
        expect(await instelling(page, 'slot.passkeyId')).toBe(passkeyId);
        expect(await instelling(page, 'slot.aan')).toBe(true);
        await expect(page.locator('#app')).toBeHidden();
      };
      // het herstel: eerst de bewaarde sleutel, dan de eenmalige weg; beide geweigerd
      await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
      await BEVESTIG(page).click();
      await expect(page.locator('#slot .slot__boodschap')).toHaveText(TERUGVAL());
      await BEVESTIG(page).click();
      await expect(page.locator('#slot .slot__boodschap')).toHaveText(MISLUKT);
      expect(await soorten(page)).toEqual(['get', 'get', 'create']);
      await expect(page.getByText(NIEUWE_CODE)).toHaveCount(0);
      await nietsGewijzigd();
      // het wissen in hetzelfde slot: meteen de eenmalige weg (de terugval geldt tot het slot opengaat), geweigerd, niets gewist
      await naarWisVraag(page);
      await WIS(page).click();
      await expect(page.locator('#slot .slot__boodschap')).toHaveText(WIS_MISLUKT);
      expect(await soorten(page)).toEqual(['get', 'get', 'create', 'create']);
      await nietsGewijzigd();
      // na herladen begint het weer met de bewaarde sleutel: ook bij het wissen eerst de rustige zin van de terugval
      await page.reload();
      await wachtOpSlot(page);
      await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
      await naarWisVraag(page);
      const voor = (await soorten(page)).length;
      await WIS(page).click();
      await expect(page.locator('#slot .slot__boodschap')).toHaveText(WIS_TERUGVAL());
      await WIS(page).click();
      await expect(page.locator('#slot .slot__boodschap')).toHaveText(WIS_MISLUKT);
      expect((await soorten(page)).slice(voor)).toEqual(['get', 'create']);
      await nietsGewijzigd();
      await page.getByRole('button', { name: 'Laten staan' }).click();
      await page.getByRole('button', { name: 'Terug', exact: true }).click();
      await tik(page, CODE);
      await expect(page.locator('#slot')).toBeHidden();
      await waterStaatEr(page);
    });
  }
});

// BESLISSING 638 met de echte WebAuthn van Chrome (virtuele platformauthenticator): de passkey van het slot wordt echt uit de authenticator gehaald.
test.describe('BESLISSING 638: terugval, echte WebAuthn (virtuele authenticator)', () => {
  test('de passkey van het slot is verwijderd: herstel en wissen lukken via de eenmalige weg, alleen met gebruikersverificatie', async ({ page, context }) => {
    test.setTimeout(150000);
    await vasteKlok(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable', { enableUI: false });
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    await drinkWater(page);
    await zetSlotAan(page, { methode: 'faceid' });
    const passkeyId = await instelling(page, 'slot.passkeyId');
    expect(passkeyId).toBeTruthy();
    // de passkey van het slot uit het wachtwoordbeheer halen
    const sleutels = (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
    expect(sleutels).toHaveLength(1);
    await cdp.send('WebAuthn.removeCredential', { authenticatorId, credentialId: sleutels[0].credentialId });
    const pinVoor = await instelling(page, 'slot.pin');
    await page.reload();
    await wachtOpSlot(page);
    // 1. het herstel: de eerste tik (get) mislukt rustig; zonder verificatie geweigerd; met verificatie een nieuwe code
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await BEVESTIG(page).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(TEKSTEN.slot.toestelTerugval, { timeout: 70000 });
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
    await BEVESTIG(page).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(MISLUKT, { timeout: 20000 });
    expect(await instelling(page, 'slot.pin')).toEqual(pinVoor);
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
    await BEVESTIG(page).click();
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    await tik(page, '864200');
    await tik(page, '864200');
    await expect(page.locator('#slot')).toBeHidden();
    // BESLISSING 643: de methode staat nu op Pincode, zonder verwijzing naar de verdwenen passkey
    expect(await instelling(page, 'slot.methode')).toBe('pin');
    expect(await instelling(page, 'slot.passkeyId')).toBeNull();
    await waterStaatEr(page);
    // 2. het wissen, in een nieuw slot: er is geen passkey meer, dus meteen de eenmalige weg; zonder verificatie niets gewist, met verificatie alles
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
    await page.getByRole('button', { name: 'Doorgaan' }).click();
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
    await page.getByRole('button', { name: 'Alles wissen', exact: true }).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText('Dat lukte niet. Er is niets gewist.', { timeout: 20000 });
    expect(await instelling(page, 'slot.aan')).toBe(true);
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
    await page.getByRole('button', { name: 'Alles wissen', exact: true }).click();
    await expect(page.locator('[data-scherm="welkom"]')).toBeVisible({ timeout: 20000 });
    expect(await instelling(page, 'slot.pin')).toBeNull();
  });
});

// =====================================================================================================================
test.describe('bestaande gebruikers, uitzetten, alles wissen', () => {
  test.beforeEach(async ({ page }) => vasteKlok(page));

  // Een slot zoals een oudere versie het bewaarde: code en aan, geen herstelcode.
  async function oudSlot(page) {
    await page.goto('./#/vandaag');
    await expect(page.locator('#tabbalk')).toBeVisible();
    await page.evaluate(async (code) => {
      const b64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u)));
      const zout = crypto.getRandomValues(new Uint8Array(16));
      const sleutel = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
      const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: zout, iterations: 600000 }, sleutel, 256);
      await new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const tx = open.result.transaction('instellingen', 'readwrite');
          const s = tx.objectStore('instellingen');
          s.put({ sleutel: 'slot.pin', waarde: { zout: b64(zout), hash: b64(hash), rondes: 600000, lengte: 6 } });
          s.put({ sleutel: 'slot.methode', waarde: 'pin' });
          s.put({ sleutel: 'slot.aan', waarde: true });
          tx.oncomplete = () => {
            open.result.close();
            klaar();
          };
        };
      });
    }, CODE);
  }

  test('wie het slot al had zonder herstelcode, krijgt na het ontgrendelen één keer het aanbod; bij Vergrendeling blijft het een open punt', async ({ page }) => {
    await authenticator(page, 'geen');
    await oudSlot(page);
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    const strook = page.locator('.strook').filter({ hasText: 'Maak een herstelcode, voor als je je code niet meer weet.' });
    await expect(strook).toBeVisible();
    expect(await instelling(page, 'slot.herstelAanbod')).toBe(true);
    // een tweede keer niet
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    await expect(page.locator('#tabbalk')).toBeVisible();
    await expect(strook).toHaveCount(0);
    // het open punt op Vergrendeling, en de weg om er een te maken
    await page.goto(VERGRENDELING);
    const rij = page.locator('[data-uitleg="slot-herstel"]');
    await expect(rij).toContainText('Nog geen herstelcode.');
    await expect(rij).toHaveAttribute('data-open-punt', '');
    await page.getByRole('button', { name: 'Herstelcode maken' }).click();
    await tik(page, CODE);
    await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
    await stap(page).getByRole('button', { name: 'Verder' }).click();
    await expect(rij).toContainText('Gemaakt op donderdag 12 november 2026.');
    await expect(rij).not.toHaveAttribute('data-open-punt', '');
  });

  test('de strook van het aanbod brengt haar naar Vergrendeling', async ({ page }) => {
    await authenticator(page, 'geen');
    await oudSlot(page);
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    await page.locator('.strook').getByRole('button', { name: 'Maken' }).click();
    await expect(page).toHaveURL(/#\/meer\/vergrendeling$/);
  });

  test('het slot uitzetten wist ook de herstelcode en een oude koppeling met het toestel', async ({ page }) => {
    await authenticator(page, 'ok');
    await zetSlotAan(page);
    // een oude rij uit de tijd van "Je toestel als hulp" (zonder herladen, dus nog niet opgeruimd bij het opstarten)
    await zetInDb(page, { 'slot.herstelId': 'AQIDBA' });
    await SLOT(page).click();
    await tik(page, CODE);
    await expect(page.getByRole('dialog')).toContainText('Je pincode en je herstelcode vervallen dan.');
    await page.getByRole('button', { name: 'Uitzetten', exact: true }).click();
    await expect(SLOT(page)).toHaveAttribute('aria-checked', 'false');
    for (const sleutel of ['slot.pin', 'slot.herstel', 'slot.herstelId', 'slot.passkeyId', 'slot.methode']) expect(await instelling(page, sleutel), sleutel).toBeNull();
    expect(await instelling(page, 'slot.aan')).toBe(false);
    // de rij is echt weg (niet alleen leeg), en de sleutel is als onbekend gemeld
    expect(await alleOpslag(page)).not.toContain('slot.herstelId');
    expect(await vergeten(page)).toContain('AQIDBA');
    await page.reload();
    await expect(page.locator('#tabbalk')).toBeVisible();
    await expect(page.locator('#slot')).toBeHidden();
  });

  test('"Alles wissen en opnieuw beginnen" werkt nog, ook met herstelwegen, met de dubbele bevestiging en daarna het toestel (BESLISSING 631)', async ({ page }) => {
    await authenticator(page, 'ok');
    await drinkWater(page);
    await zetSlotAan(page, { methode: 'faceid' });
    const passkeyId = await instelling(page, 'slot.passkeyId');
    await zetPk(page, 'annuleer');
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
    await page.getByRole('button', { name: 'Doorgaan' }).click();
    // bij Face ID vraagt Bloei de passkey van het slot; geannuleerd: niets gewist, ze blijft op de vraag (BESLISSING 638: met de zin van de terugval)
    const vragenVoor = await page.evaluate(() => window.__pkAanroepen);
    await page.getByRole('button', { name: 'Alles wissen', exact: true }).click();
    await expect(page.locator('#slot .slot__boodschap')).toHaveText(TEKSTEN.slot.wisTerugval);
    expect(await page.evaluate(() => window.__pkAanroepen)).toBe(vragenVoor + 1);
    expect(await page.evaluate(() => window.__pkOpties.at(-1))).toMatchObject({ soort: 'get', userVerification: 'required' });
    await expect(page.getByRole('heading', { name: 'Zeker weten?' })).toBeVisible();
    expect(await instelling(page, 'slot.passkeyId')).toBe(passkeyId);
    expect(await instelling(page, 'slot.pin')).toBeTruthy();
    // het toestel bevestigt (de volgende tik: de eenmalige weg, 638): alles gewist
    await zetPk(page, 'ok');
    await page.getByRole('button', { name: 'Alles wissen', exact: true }).click();
    await expect(page.locator('[data-scherm="welkom"]')).toBeVisible({ timeout: 10000 });
    for (const sleutel of ['slot.pin', 'slot.herstel', 'slot.passkeyId', 'slot.aan']) expect(await instelling(page, sleutel), sleutel).toBeFalsy();
  });
});

// =====================================================================================================================
test.describe('twee tabbladen en een onderbroken stroom', () => {
  test('een gewijzigde of herstelde code in het ene tabblad vergrendelt het andere; de oude code werkt daar niet meer', async ({ page, context }) => {
    await vasteKlok(page);
    await authenticator(page, 'geen');
    const code = await zetSlotAan(page);
    const b = await context.newPage();
    await vasteKlok(b);
    await authenticator(b, 'geen');
    await b.goto('./#/vandaag');
    await wachtOpSlot(b);
    await tik(b, CODE);
    await expect(b.locator('#tabbalk')).toBeVisible();
    // A wijzigt de code: B gaat dicht en vraagt de nieuwe
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await tik(page, CODE);
    await tik(page, '246810');
    await expect(page.getByText('Je pincode is gewijzigd.')).toBeVisible();
    await wachtOpSlot(b);
    await tik(b, CODE);
    await expect(b.locator('#slot .slot__boodschap').first()).toHaveText('Die code klopt niet.');
    await tik(b, '246810');
    await expect(b.locator('#slot')).toBeHidden();
    // B is dicht (herladen) terwijl A herstelt met de herstelcode: daarna werkt in B alleen de nieuwe code
    await b.reload();
    await wachtOpSlot(b);
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    await veld(page).fill(code);
    await page.keyboard.press('Enter');
    await tik(page, '135790');
    await tik(page, '135790');
    await expect(stap(page)).toBeVisible();
    await tik(b, '246810');
    await expect(b.locator('#slot .slot__boodschap').first()).toHaveText('Die code klopt niet.');
    await tik(b, '135790');
    await expect(b.locator('#slot')).toBeHidden();
    await b.close();
  });

  test('onderbroken: tijdens het instellen staat het slot uit; tijdens een herstel blijft het dicht met de oude code en de oude herstelcode, of met de nieuwe', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'geen');
    // 1. de app sluit terwijl de herstelcode bij het instellen openstaat: niets bewaard, geen slot
    await page.goto(VERGRENDELING);
    await SLOT(page).click();
    await tik(page, CODE);
    await tik(page, CODE);
    await expect(stap(page)).toBeVisible();
    await page.reload();
    await expect(page.locator('#tabbalk')).toBeVisible();
    await expect(page.locator('#slot')).toBeHidden();
    expect(await instelling(page, 'slot.aan')).toBeFalsy();
    expect(await instelling(page, 'slot.pin')).toBeNull();
    expect(await instelling(page, 'slot.herstel')).toBeNull();
    // 2. herstel: de code klopt, de app sluit vóór de nieuwe pincode: dicht, oude pincode en oude herstelcode werken nog
    const code = await zetSlotAan(page);
    const pinVoor = await instelling(page, 'slot.pin');
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    await veld(page).fill(code);
    await page.keyboard.press('Enter');
    await tik(page, '135790');
    await page.reload();
    await wachtOpSlot(page);
    expect(await instelling(page, 'slot.pin')).toEqual(pinVoor);
    await naarHerstelcode(page);
    await veld(page).fill(code);
    await page.keyboard.press('Enter');
    // 3. de nieuwe pincode is bewaard, de app sluit terwijl de nieuwe herstelcode openstaat: dicht, de nieuwe pincode opent, de oude
    // herstelcode werkt niet meer, en de niet-bevestigde code is een open punt
    await tik(page, '135790');
    await tik(page, '135790');
    await expect(stap(page)).toBeVisible();
    const nieuw = (await stap(page).locator('.herstel__code').textContent()).trim();
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    await expect(page.locator('#slot .slot__boodschap').first()).toHaveText('Die code klopt niet.');
    await tik(page, '135790');
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.locator('.strook').filter({ hasText: 'Maak een herstelcode' })).toBeVisible();
    await page.goto(VERGRENDELING);
    await expect(page.locator('[data-uitleg="slot-herstel"]')).toContainText('Je bevestigde nog niet dat je ze bewaarde.');
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    await veld(page).fill(code);
    await page.keyboard.press('Enter');
    await expect(page.locator('.herstel__formulier .slot__boodschap')).toHaveText('Die herstelcode klopt niet.');
    await veld(page).fill(nieuw);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
  });
});

// =====================================================================================================================
// De welkomkaart houdt haar hoogte (BESLISSINGEN 512 tot 514), ook met het cijferblok, de herstelcode en "Dat lukte niet"; zonder de stap
// "Je toestel als hulp" (BESLISSING 541) verandert ze niet.
const MATEN = [
  ['360x740', { viewport: { width: 360, height: 740 } }],
  ['390x844', { viewport: { width: 390, height: 844 } }],
  ['Pixel 7', ANDROID],
  ['820x1180', { viewport: { width: 820, height: 1180 } }],
  ['1280x800', { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }],
];
const GOEDGEKEURD = { '360x740': 545, '390x844': 545, 'Pixel 7': 545, // BESLISSING 668 en 672: de Android-kaart is even hoog als die van de iPhone (was 557)
    '820x1180': 616, '1280x800': 663 };
for (const [naam, opties] of MATEN) {
  test.describe(`welkomkaart met de herstelcode (${naam})`, () => {
    test.use({ ...opties, storageState: LEEG });
    test('elke stap even hoog, alles binnen de kaart, niets verspringt', async ({ page }) => {
      await vasteKlok(page);
      await authenticator(page, 'ok');
      await page.goto('./');
      await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
      await animatiesKlaar(page);
      const kaart = page.locator('.welkom__kaart');
      const hoogte = () => kaart.evaluate((e) => Math.round(e.getBoundingClientRect().height * 10) / 10);
      const alles = () =>
        page.evaluate(() => {
          const k = document.querySelector('.welkom__kaart').getBoundingClientRect();
          const uit = [];
          for (const el of document.querySelectorAll('.welkom__slotvak button, .welkom__slotvak p, .welkom__slotvak h2')) {
            const r = el.getBoundingClientRect();
            if (!r.height || getComputedStyle(el).position === 'absolute') continue;
            if (r.top < k.top - 0.5 || r.bottom > k.bottom + 0.5 || r.left < k.left - 0.5 || r.right > k.right + 0.5) uit.push(el.textContent.trim().slice(0, 30));
            if (el.scrollWidth > el.clientWidth + 1 && el.tagName === 'BUTTON') uit.push('breed: ' + el.textContent.trim().slice(0, 30));
          }
          return { uit, horizontaal: document.documentElement.scrollWidth > window.innerWidth };
        });
      const h1 = await hoogte();
      const verder = page.locator('.welkom__knoppen .knop--primair');
      for (let n = 2; n <= 5; n += 1) { // vijf stappen sinds 0.4.5 (stap 2 is de geboortedatum)
        await verder.click();
        await expect(page.getByText(`Stap ${n} van 5`)).toBeVisible();
      }
      await animatiesKlaar(page);
      const h4 = await hoogte();
      await verder.click();
      await expect(page.locator('.welkom .cijferblok')).toBeVisible();
      const hCode = await hoogte();
      await tik(page, CODE);
      const hCode2 = await hoogte();
      await tik(page, CODE);
      // BESLISSING 541: na de tweede keer meteen de herstelcode, zonder "Je toestel als hulp" en zonder systeemvenster
      await expect(stap(page)).toBeVisible();
      await expect(aanbod(page)).toHaveCount(0);
      expect(await page.evaluate(() => window.__pkGemaakt + window.__pkAanroepen)).toBe(0);
      await animatiesKlaar(page);
      const hHerstel = await hoogte();
      const mHerstel = await alles();
      for (const k of await stap(page).locator('button').all()) expect((await k.boundingBox()).height, await k.textContent()).toBeGreaterThanOrEqual(44);
      if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/welkom-herstelcode-${naam.replace(/\s/g, '')}.png` });
      // De methode van het toestel, waarvan de vraag niet lukt: de stap "Dat lukte niet" (BESLISSING 530) in dezelfde kaart. Annuleren onder de
      // herstelcode brengt haar terug bij de keuze, zonder iets te bewaren.
      await stap(page).getByRole('button', { name: 'Annuleren' }).click();
      await expect(page.getByText('Stap 5 van 5')).toBeVisible();
      expect(await instelling(page, 'slot.pin')).toBeNull();
      await page.getByRole('radio', { name: /^Face ID|^Vingerafdruk/ }).click();
      await page.evaluate(() => sessionStorage.setItem('__pkc', 'fout'));
      await verder.click();
      await tik(page, CODE);
      await tik(page, CODE);
      await expect(page.locator('[data-toestelopnieuw]')).toBeVisible();
      await animatiesKlaar(page);
      const hOpnieuw = await hoogte();
      const mOpnieuw = await alles();
      if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/welkom-dat-lukte-niet-${naam.replace(/\s/g, '')}.png` });
      await page.getByRole('button', { name: 'Alleen de pincode' }).click();
      await expect(stap(page)).toBeVisible();
      await animatiesKlaar(page);
      const hHerstel2 = await hoogte();
      console.log(`welkomkaart ${naam}: stap 1 ${h1}, stap 4 ${h4}, cijferblok ${hCode} en ${hCode2}, herstelcode ${hHerstel}, dat lukte niet ${hOpnieuw}, herstelcode na Face ID ${hHerstel2}`);
      for (const h of [h4, hCode, hCode2, hHerstel, hOpnieuw, hHerstel2]) expect(Math.abs(h - h1)).toBeLessThanOrEqual(1);
      // de hoogte die de eigenaar goedkeurde (BESLISSING 514): ze blijft dezelfde zonder de stap van het toestel
      expect(Math.abs(h1 - GOEDGEKEURD[naam])).toBeLessThanOrEqual(1);
      expect(mHerstel).toEqual({ uit: [], horizontaal: false });
      expect(mOpnieuw).toEqual({ uit: [], horizontaal: false });
      // en verder: het slot staat aan met de pincode en de app is open
      await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
      await stap(page).getByRole('button', { name: 'Verder' }).click();
      await expect(page).toHaveURL(/#\/vandaag$/);
      expect(await instelling(page, 'slot.aan')).toBe(true);
      expect(await instelling(page, 'slot.methode')).toBe('pin');
      expect(await instelling(page, 'slot.herstelId')).toBeNull();
      expect((await instelling(page, 'slot.herstel')).bevestigd).toBe(true);
    });
  });
}

// =====================================================================================================================
// De schermen in beeld (schermafbeeldingen alleen met SHOTDIR): Vergrendeling met Pincode wijzigen en Herstelcode, en het scherm
// "Je code niet meer weten" met de twee wegen, in Poeder en Nacht en met de naam van Android. Telkens: geen horizontale scroll, tikvlakken van 44 px.
async function nagekeken(page, naam, deel = null) {
  await animatiesKlaar(page);
  const m = await page.evaluate(() => ({
    horizontaal: document.documentElement.scrollWidth > window.innerWidth,
    klein: [...document.querySelectorAll('.slot-scherm .slot__kaart button, .slot-scherm .slot__instel button, #slot button')].filter((b) => b.getClientRects().length && b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim().slice(0, 30)),
  }));
  expect(m, naam).toEqual({ horizontaal: false, klein: [] });
  if (!process.env.SHOTDIR) return;
  await page.screenshot({ path: `${process.env.SHOTDIR}/${naam}.png` });
  if (deel) {
    await page.locator('.strook').evaluateAll((s) => s.forEach((e) => e.remove()));
    await deel.scrollIntoViewIfNeeded();
    await deel.screenshot({ path: `${process.env.SHOTDIR}/${naam}-ontgrendelen.png` });
  }
}

test.describe('de schermen in beeld', () => {
  test('Vergrendeling (390 en 1280) en Je code niet meer weten (Poeder en Nacht)', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'ok');
    await zetSlotAan(page);
    await nagekeken(page, 'vergrendeling-390', page.locator('.slot__kaart').nth(1));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    await expect(page.locator('[data-uitleg="slot-herstel"]')).toBeVisible();
    await nagekeken(page, 'vergrendeling-1280', page.locator('.slot__kaart').nth(1));
    // "Je code niet meer weten" op 1280: de weg van het toestel zonder koppeling, de wegen even breed en gecentreerd
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(BEVESTIG(page)).toBeVisible();
    const breed = await page.locator('#slot .slot__wegen .knop').evaluateAll((ks) => ks.map((k) => Math.round(k.getBoundingClientRect().width)));
    expect(breed).toHaveLength(2);
    expect(Math.abs(breed[0] - breed[1])).toBeLessThanOrEqual(1);
    await nagekeken(page, 'kwijt-1280');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const thema of ['poeder', 'nacht']) {
      await page.evaluate((th) => localStorage.setItem('bloei-thema', th), thema);
      await zetInDb(page, { 'thema.keuze': thema });
      await page.reload();
      await wachtOpSlot(page);
      await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
      await expect(page.getByRole('button', { name: 'Bevestig met Face ID' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Gebruik je herstelcode' })).toBeVisible();
      // BESLISSING 522: de wegen en de laatste uitweg even breed, gecentreerd, niet van rand tot rand
      const breedtes = await page.locator('#slot .slot__acties .knop--primair, #slot .slot__acties .knop--secundair').evaluateAll((ks) => ks.map((k) => { const r = k.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.left + r.width / 2)]; }));
      expect(new Set(breedtes.map(([b]) => b)).size).toBe(1);
      for (const [, m] of breedtes) expect(Math.abs(m - 195)).toBeLessThanOrEqual(2);
      expect(breedtes[0][0]).toBeLessThan(330);
      await nagekeken(page, `kwijt-390-${thema}`);
      await page.getByRole('button', { name: 'Gebruik je herstelcode' }).click();
      await nagekeken(page, `herstelcode-ingeven-390-${thema}`);
    }
  });

  test.describe('op Android', () => {
    test.use(ANDROID);
    test('Je code niet meer weten met de naam van Android, nergens Face ID', async ({ page }) => {
      await vasteKlok(page);
      await authenticator(page, 'ok');
      await zetSlotAan(page);
      await expect(page.locator('[data-uitleg="slot-toestel"]')).toHaveCount(0);
      await expect(page.locator('[data-vergeet]')).toHaveText('Vergeet je je code, dan kies je een nieuwe met je vingerafdruk of schermslot, of met je herstelcode.');
      await nagekeken(page, 'vergrendeling-android', page.locator('.slot__kaart').nth(1));
      await page.reload();
      await wachtOpSlot(page);
      await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
      await expect(page.locator('#slot')).toContainText('Bevestig met je vingerafdruk of schermslot, of gebruik je herstelcode.');
      await expect(page.getByRole('button', { name: 'Bevestig met je vingerafdruk of schermslot' })).toBeVisible();
      expect(await page.locator('#slot').innerText()).not.toMatch(/Face ID/);
      await nagekeken(page, 'kwijt-android');
      // zonder herstelcode en op een toestel dat het niet kan: de zin met de naam van Android
      await zetInDb(page, { 'slot.herstel': null });
      await page.evaluate(() => (window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => false));
      await page.getByRole('button', { name: 'Terug', exact: true }).click();
      await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
      await expect(page.locator('#slot')).toContainText('Je hebt geen herstelcode, en Bloei kan op dit toestel niet met je vingerafdruk of schermslot bevestigen.');
      expect(await page.locator('#slot').innerText()).not.toMatch(/Face ID/);
    });
  });
});

// =====================================================================================================================
// BESLISSING 530: in elke stroom die een pincode instelt, tikt ze de code precies TWEE keer (kiezen, bevestigen), wat ze ook kiest bij het
// toestel en wat het systeemvenster ook doet. Het systeemvenster wordt nagebootst met focusverlies: blur en visibilitychange (verborgen) tijdens
// navigator.credentials.create/get, en de pagina komt pas LAAT terug (2,5 s na het sluiten, zoals Chromium op Windows met Windows Hello).
// Het slot mag dan niet dichtgaan en de stap mag niet opnieuw beginnen.
async function systeemvenster(page) {
  await page.addInitScript(pkBouwer);
  await page.addInitScript(() => {
    window.__pkGemaakt = 0;
    window.__pkAanroepen = 0;
    window.__zicht = 'visible';
    window.__terug = 0; // hoeveel keer de pagina na een systeemvenster terugkwam
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__zicht });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__zicht === 'hidden' });
    const weg = () => {
      window.dispatchEvent(new Event('blur'));
      window.__zicht = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    };
    const laatTerug = () =>
      setTimeout(() => {
        window.__zicht = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
        window.__terug += 1;
      }, 2500);
    // uitkomst: 'ok', 'annuleer' (NotAllowedError), 'fout' (een andere fout), 'tijd' (time-out: pas na een tijd NotAllowedError)
    const venster = async (sleutel) => {
      weg();
      const uitkomst = sessionStorage.getItem(sleutel) || 'ok';
      await new Promise((r) => setTimeout(r, uitkomst === 'tijd' ? 1500 : 300));
      laatTerug();
      if (uitkomst === 'annuleer' || uitkomst === 'tijd') throw new DOMException('geannuleerd', 'NotAllowedError');
      if (uitkomst === 'fout') throw new DOMException('mislukt', 'InvalidStateError');
    };
    window.PublicKeyCredential = window.PublicKeyCredential || function () {};
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        create: async (o) => {
          window.__pkGemaakt++;
          await venster('__pkc');
          return window.__pkBouw.create(o);
        },
        get: async (o) => {
          window.__pkAanroepen++;
          await venster('__pk');
          return window.__pkBouw.get(o);
        },
      },
    });
  });
}

// Telt elke volledig ingetikte code (zes cijfers) van deze test.
function teller() {
  let n = 0;
  return {
    tik: async (page, code) => {
      await tik(page, code);
      n += 1;
    },
    get aantal() {
      return n;
    },
  };
}

// Wacht tot de pagina na het laatste systeemvenster terug is, en kijkt dan dat er geen code gevraagd wordt en de stap dezelfde bleef.
async function naHetVenster(page, stapLocator, aantalVensters) {
  await stapLocator.evaluate((el) => (el.__merk = 'zelfde'));
  await expect.poll(() => page.evaluate(() => window.__terug)).toBe(aantalVensters);
  await animatiesKlaar(page);
  await expect(page.locator('#slot')).toBeHidden();
  await expect(page.locator('.cijferblok')).toHaveCount(0);
  expect(await stapLocator.evaluate((el) => el.__merk)).toBe('zelfde');
}

async function bewaar(page) {
  await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
  await stap(page).getByRole('button', { name: 'Verder' }).click();
}

// [naam, methode, wat ze doet bij het toestel, uitkomsten van de systeemvensters na elkaar, verwachte methode]
// BESLISSING 541: bij Pincode is er geen vraag "Je toestel als hulp" meer en dus ook geen systeemvenster.
const STROMEN = [
  ['Pincode, geen systeemvenster', 'pin', 'pin', [], 'pin'],
  ['Face ID geslaagd', 'faceid', 'faceid', ['ok'], 'faceid'],
  ['Face ID geannuleerd, dan alleen de pincode', 'faceid', 'faceid-zonder', ['annuleer'], 'pin'],
  ['Face ID mislukt, dan opnieuw en geslaagd', 'faceid', 'faceid-opnieuw', ['fout', 'ok'], 'faceid'],
];

// De stappen na de twee keer code, voor alle stromen gelijk (welkomscherm en Vergrendeling). Geeft het aantal systeemvensters.
async function naDeCode(page, wat, uitkomsten) {
  const zet = (u) => page.evaluate((x) => sessionStorage.setItem('__pkc', x), u);
  let vensters = 0;
  if (wat === 'pin') {
    // meteen de herstelcode, zonder vraag en zonder systeemvenster
    await expect(stap(page)).toBeVisible();
    await expect(aanbod(page)).toHaveCount(0);
  } else {
    // methode Face ID: het venster opende al na de tweede code
    vensters += 1;
    if (wat !== 'faceid') {
      await expect(page.locator('[data-toestelopnieuw]')).toBeVisible();
      await naHetVenster(page, page.locator('[data-toestelopnieuw]'), vensters);
      if (wat === 'faceid-zonder') await page.getByRole('button', { name: 'Alleen de pincode' }).click();
      else {
        await zet(uitkomsten[1]);
        await page.getByRole('button', { name: 'Opnieuw proberen' }).click();
        vensters += 1;
      }
    }
  }
  await expect(stap(page)).toBeVisible();
  if (vensters) await naHetVenster(page, stap(page), vensters);
  else {
    await animatiesKlaar(page);
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.locator('.cijferblok')).toHaveCount(0);
    expect(await page.evaluate(() => window.__terug)).toBe(0);
  }
  await bewaar(page);
  return vensters;
}

test.describe('BESLISSING 530: de code precies twee keer bij het instellen', () => {
  for (const [naam, methode, wat, uitkomsten, verwacht] of STROMEN) {
    test.describe(naam, () => {
      test.describe('welkomscherm', () => {
        test.use({ storageState: LEEG });
        test('twee keer de code, geen slot en geen nieuwe start na het systeemvenster', async ({ page }) => {
          await vasteKlok(page);
          await systeemvenster(page);
          const t = teller();
          await page.goto('./');
          await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
          for (let n = 2; n <= 5; n += 1) {
            await page.locator('.welkom__knoppen .knop--primair').click();
            await expect(page.getByText(`Stap ${n} van 5`)).toBeVisible();
          }
          if (methode === 'faceid') {
            await page.getByRole('radio', { name: /^Face ID/ }).click();
            await page.evaluate((u) => sessionStorage.setItem('__pkc', u), uitkomsten[0]);
          }
          await page.locator('.welkom__knoppen .knop--primair').click();
          await t.tik(page, CODE);
          await t.tik(page, CODE);
          const vensters = await naDeCode(page, wat, uitkomsten);
          await expect(page).toHaveURL(/#\/vandaag$/);
          await expect(page.locator('#slot')).toBeHidden();
          await expect(page.locator('.cijferblok')).toHaveCount(0);
          expect(t.aantal).toBe(2);
          expect(await page.evaluate(() => window.__pkGemaakt)).toBe(vensters);
          expect(await instelling(page, 'slot.aan')).toBe(true);
          expect(await instelling(page, 'slot.methode')).toBe(verwacht);
        });
      });

      test('Algemeen \u203a Vergrendeling: twee keer de code, geen slot en geen nieuwe start na het systeemvenster', async ({ page }) => {
        await vasteKlok(page);
        await systeemvenster(page);
        const t = teller();
        await page.goto(VERGRENDELING);
        if (methode === 'faceid') {
          await page.evaluate((u) => sessionStorage.setItem('__pkc', u), uitkomsten[0]);
          await FACE(page).click();
        } else await SLOT(page).click();
        await t.tik(page, CODE);
        await t.tik(page, CODE);
        const vensters = await naDeCode(page, wat, uitkomsten);
        await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
        await expect(page.locator('#slot')).toBeHidden();
        await expect(page.locator('.cijferblok')).toHaveCount(0);
        expect(t.aantal).toBe(2);
        expect(await page.evaluate(() => window.__pkGemaakt)).toBe(vensters);
        expect(await instelling(page, 'slot.methode')).toBe(verwacht);
      });
    });
  }

  test('met het slot aan: naar Face ID (huidige code 1 keer), dan de pincode wijzigen met het toestel (nieuwe code 1 keer); het slot gaat niet dicht', async ({ page }) => {
    await vasteKlok(page);
    await systeemvenster(page);
    await page.goto(VERGRENDELING);
    await SLOT(page).click();
    await tik(page, CODE);
    await tik(page, CODE);
    await bewaar(page);
    await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
    // BESLISSING 541: geen Koppelen meer
    await expect(page.getByRole('button', { name: /koppel/i })).toHaveCount(0);
    expect(await page.evaluate(() => window.__pkGemaakt)).toBe(0);
    const t = teller();
    // naar Face ID: 1 keer de huidige code, dan het venster (laat terug): geen slot, geen tweede code
    await FACE(page).click();
    await t.tik(page, CODE);
    await expect(FACE(page)).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => page.evaluate(() => window.__terug)).toBe(1);
    await animatiesKlaar(page);
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.locator('.cijferblok')).toHaveCount(0);
    // de pincode wijzigen met het toestel (de passkey van Face ID): geen huidige code, de nieuwe 1 keer
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await page.getByRole('button', { name: 'Bevestig met Face ID' }).click();
    await expect(page.getByText('Kies je nieuwe code van zes cijfers.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__terug)).toBe(2);
    await expect(page.locator('#slot')).toBeHidden();
    await t.tik(page, '246810'); // BESLISSING 533: de nieuwe code een keer
    await expect(page.getByText('Je pincode is gewijzigd.')).toBeVisible();
    await animatiesKlaar(page);
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.locator('.cijferblok')).toHaveCount(0);
    expect(t.aantal).toBe(2); // naar Face ID 1, wijzigen met het toestel 1
  });

  test('herstel na een vergeten code: met het toestel (zonder koppeling) de nieuwe code 2 keer, met de herstelcode ook 2 keer', async ({ page }) => {
    await vasteKlok(page);
    await systeemvenster(page);
    await page.goto(VERGRENDELING);
    await SLOT(page).click();
    await tik(page, CODE);
    await tik(page, CODE);
    await expect(stap(page)).toBeVisible();
    const code = (await stap(page).locator('.herstel__code').textContent()).trim();
    await bewaar(page);
    await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await wachtOpSlot(page);
    const t = teller();
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await page.getByRole('button', { name: 'Bevestig met Face ID' }).click();
    // het systeemvenster sluit laat (2,5 s, zoals Windows Hello): de stap blijft dezelfde en het slot begint niet opnieuw
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__terug)).toBe(1);
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    await t.tik(page, '135790');
    await t.tik(page, '135790');
    await expect(page.locator('#slot')).toBeHidden();
    expect(t.aantal).toBe(2);
    expect(await page.evaluate(() => window.__pkGemaakt)).toBe(1);
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    await veld(page).fill(code);
    await page.keyboard.press('Enter');
    await t.tik(page, '864200');
    await t.tik(page, '864200');
    await bewaar(page);
    await expect(page.locator('#slot')).toBeHidden();
    expect(t.aantal).toBe(4);
  });
});


// =====================================================================================================================
// BESLISSING 532 (eigenaar: "Nooit, alleen bij echt verlaten"): alleen focusverlies (blur terwijl de pagina zichtbaar blijft, bv. een
// schermafbeeldingsprogramma) doet niets: geen gordijn, geen code, hoe lang het ook duurt. Echt verlaten (verborgen, pagehide) blijft: meteen dicht.
// De vrijstelling voor systeemvensters van de app blijft werken. Met een vaste klok (page.clock), zonder echte wachttijd.
const blur = (page) => page.evaluate(() => window.dispatchEvent(new Event('blur')));
const focus = (page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));
const zet = (page, staat) =>
  page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    document.dispatchEvent(new Event('visibilitychange'));
  }, staat);

async function openMetSlotEnGegevens(page) {
  await vasteKlok(page);
  await authenticator(page, 'geen');
  await drinkWater(page);
  await zetSlotAan(page);
  await page.goto('./#/vandaag');
  await page.reload();
  await wachtOpSlot(page);
  await tik(page, CODE);
  await expect(page.locator('#slot')).toBeHidden();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
  await page.locator('.strook').evaluateAll((s) => s.forEach((e) => e.remove()));
  await animatiesKlaar(page);
}

test.describe('BESLISSING 532: schermafbeeldingen en focusverlies', () => {
  test('blur zonder verbergen: geen gordijn, ook niet na een uur; de inhoud blijft staan en een schermafbeelding toont het dagboek; focus vraagt geen code', async ({ page, browser }) => {
    await openMetSlotEnGegevens(page);
    const voor = await page.screenshot();
    await blur(page);
    await page.clock.runFor(1000);
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
    expect(await page.evaluate(() => document.getElementById('scherm').childElementCount)).toBeGreaterThan(0);
    const na = await page.screenshot();
    // een uur zonder focus: nog altijd niets
    await page.clock.runFor(60 * 60 * 1000);
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0,8');
    await focus(page);
    await page.clock.runFor(1000);
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.locator('.cijferblok')).toHaveCount(0);
    // De schermafbeelding na de blur toont hetzelfde als ervoor: het dagboek, niet het gordijn. Niet byte voor byte: Chrome rastert onder
    // belasting soms opnieuw, met een randje anders afgevlakt (gemeten op 2 van 40 runs: alleen randen van ronde vormen en de schaduw van de
    // tabbalk, hoogstens 12 van 255 per kleur, de inhoud gelijk). Elk pixel mag daarom hoogstens VERSCHIL afwijken; het gordijn (een leeg vlak met
    // het logo) wijkt over bijna het hele beeld veel meer af. Vergeleken in een eigen pagina, los van de app.
    const VERSCHIL = 32;
    const vergelijk = await browser.newPage();
    const uit = await vergelijk.evaluate(
      async ([a, b, grens]) => {
        const laad = (src) => new Promise((klaar, fout) => Object.assign(new Image(), { onload() { klaar(this); }, onerror: fout, src }));
        const pixels = (beeld) => {
          const c = Object.assign(document.createElement('canvas'), { width: beeld.width, height: beeld.height });
          const x = c.getContext('2d');
          x.drawImage(beeld, 0, 0);
          return x.getImageData(0, 0, beeld.width, beeld.height).data;
        };
        const [ba, bb] = await Promise.all([laad(a), laad(b)]);
        if (ba.width !== bb.width || ba.height !== bb.height) return { maat: false };
        const [pa, pb] = [pixels(ba), pixels(bb)];
        let anders = 0;
        let max = 0;
        for (let k = 0; k < pa.length; k += 4) {
          const d = Math.max(Math.abs(pa[k] - pb[k]), Math.abs(pa[k + 1] - pb[k + 1]), Math.abs(pa[k + 2] - pb[k + 2]));
          max = Math.max(max, d);
          if (d > grens) anders += 1;
        }
        return { maat: true, anders, max };
      },
      ['data:image/png;base64,' + voor.toString('base64'), 'data:image/png;base64,' + na.toString('base64'), VERSCHIL],
    );
    await vergelijk.close();
    if (!na.equals(voor)) {
      await test.info().attach('voor.png', { body: voor, contentType: 'image/png' });
      await test.info().attach('na.png', { body: na, contentType: 'image/png' });
      console.log(`BESLISSING 532: de schermafbeeldingen verschillen in de afvlakking, hoogstens ${uit.max} van 255`);
    }
    expect(uit).toEqual({ maat: true, anders: 0, max: expect.any(Number) });
  });

  test('echt verlaten (verborgen) blijft: meteen het gordijn en de pagina leeg, de code bij terugkeer; ook na een blur ervoor', async ({ page }) => {
    await openMetSlotEnGegevens(page);
    await blur(page);
    const meteen = await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      return { slot: !document.getElementById('slot').hidden, app: document.getElementById('app').hidden, leeg: document.getElementById('scherm').childElementCount === 0 };
    });
    expect(meteen).toEqual({ slot: true, app: true, leeg: true });
    await zet(page, 'visible');
    await focus(page);
    await expect(page.locator('#slot .cijferblok')).toBeVisible();
    await tik(page, CODE);
    await expect(page.locator('#slot')).toBeHidden();
    // pagehide ook
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect(page.locator('#slot')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await expect(page.locator('#slot .cijferblok')).toBeVisible();
  });

  test('de vrijstelling blijft: een deelmenu dat de pagina verbergt zet ze niet op slot; blijft ze verborgen na het deelmenu, dan alsnog dicht', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.share = () => new Promise((klaar) => (window.__deelKlaar = klaar));
    });
    await openMetSlotEnGegevens(page);
    // gewoon deelmenu: verborgen, terug terwijl het nog open is
    await page.evaluate(() => {
      window.__deel = navigator.share({ title: 'verslag' });
    });
    await blur(page);
    await zet(page, 'hidden');
    await expect(page.locator('#slot')).toBeHidden();
    await zet(page, 'visible');
    await focus(page);
    await page.evaluate(() => window.__deelKlaar());
    await page.clock.runFor(3000);
    await expect(page.locator('#slot')).toBeHidden();
    // het deelmenu sluit terwijl de pagina verborgen blijft (Android: in de gekozen app): na de marge gaat het slot dicht
    await page.evaluate(() => {
      window.__deel = navigator.share({ title: 'verslag' });
    });
    await zet(page, 'hidden');
    await page.evaluate(() => window.__deelKlaar());
    await page.clock.runFor(3000);
    await expect(page.locator('#slot')).toBeVisible();
    await zet(page, 'visible');
    await expect(page.locator('#slot .cijferblok')).toBeVisible();
  });
});

// =====================================================================================================================
// Twee zwaktes (testteamlid beveiliging): (1) na "Alles wissen" vanuit het slot staat er niets meer van het slot in de opslag, ook niet de tellers;
// (2) bij echt verlaten staat een getoonde of ingetikte herstelcode niet meer in de pagina; bij terugkeer is ze er weer.
test.describe('Alles wissen en de herstelcode bij echt verlaten', () => {
  test.beforeEach(async ({ page }) => vasteKlok(page));

  test('Alles wissen vanuit het slot, midden in een herstel met een lopende rem: geen enkele slotrij blijft over', async ({ page }) => {
    await authenticator(page, 'ok'); // BESLISSING 631: wissen vanuit het slot vraagt het toestel
    const code = await zetSlotAan(page);
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    await veld(page).fill(code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A'));
    await page.keyboard.press('Enter');
    await expect(page.locator('.herstel__formulier .slot__boodschap')).toHaveText('Die herstelcode klopt niet.');
    await page.getByRole('button', { name: 'Terug', exact: true }).click();
    await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
    await page.getByRole('button', { name: 'Doorgaan' }).click();
    await page.getByRole('button', { name: 'Alles wissen', exact: true }).click();
    await expect(page.locator('[data-scherm="welkom"]')).toBeVisible({ timeout: 10000 });
    const rijen = await page.evaluate(
      () =>
        new Promise((klaar) => {
          const open = indexedDB.open('bloei-dagboek');
          open.onsuccess = () => {
            const v = open.result.transaction('instellingen').objectStore('instellingen').getAll();
            v.onsuccess = () => {
              open.result.close();
              klaar(v.result.map((r) => r.sleutel).filter((s) => s.startsWith('slot.')));
            };
          };
        }),
    );
    expect(rijen).toEqual([]);
  });

  const codeInPagina = (page, code) => page.evaluate((c) => document.documentElement.outerHTML.includes(c) || [...document.querySelectorAll('input')].some((i) => i.value.replace(/[\s-]/g, '').toUpperCase().includes(c.replace(/-/g, ''))), code);

  test('tijdens een herstel: de ingetikte en de nieuwe herstelcode zijn weg bij verbergen en terug bij terugkeer', async ({ page }) => {
    await authenticator(page, 'geen');
    const code = await zetSlotAan(page);
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    await veld(page).fill(code);
    await zet(page, 'hidden');
    expect(await codeInPagina(page, code)).toBe(false);
    await zet(page, 'visible');
    await expect(veld(page)).toHaveValue(code);
    await page.keyboard.press('Enter');
    await tik(page, '135790');
    await tik(page, '135790');
    await expect(stap(page)).toBeVisible();
    const nieuw = (await stap(page).locator('.herstel__code').textContent()).trim();
    await zet(page, 'hidden');
    expect(await codeInPagina(page, nieuw)).toBe(false);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect(await codeInPagina(page, nieuw)).toBe(false);
    await zet(page, 'visible');
    await expect(stap(page).locator('.herstel__code')).toHaveText(nieuw);
    await bewaar(page);
    await expect(page.locator('#slot')).toBeHidden();
  });

  test('bij het aanzetten in Vergrendeling (het slot staat nog uit): de getoonde herstelcode is weg bij verbergen en terug bij terugkeer', async ({ page }) => {
    await authenticator(page, 'geen');
    await page.goto(VERGRENDELING);
    await SLOT(page).click();
    await tik(page, CODE);
    await tik(page, CODE);
    await expect(stap(page)).toBeVisible();
    const code = (await stap(page).locator('.herstel__code').textContent()).trim();
    await zet(page, 'hidden');
    expect(await codeInPagina(page, code)).toBe(false);
    await zet(page, 'visible');
    await expect(stap(page).locator('.herstel__code')).toHaveText(code);
    await bewaar(page);
    await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
  });

  test.describe('in het welkomscherm', () => {
    test.use({ storageState: LEEG });
    test('de getoonde herstelcode is weg bij verbergen en terug bij terugkeer', async ({ page }) => {
      await authenticator(page, 'geen');
      await page.goto('./');
      await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
      for (let n = 2; n <= 5; n += 1) {
        await page.locator('.welkom__knoppen .knop--primair').click();
        await expect(page.getByText(`Stap ${n} van 5`)).toBeVisible();
      }
      await page.locator('.welkom__knoppen .knop--primair').click();
      await tik(page, CODE);
      await tik(page, CODE);
      await expect(stap(page)).toBeVisible();
      const code = (await stap(page).locator('.herstel__code').textContent()).trim();
      await zet(page, 'hidden');
      expect(await codeInPagina(page, code)).toBe(false);
      await zet(page, 'visible');
      await expect(stap(page).locator('.herstel__code')).toHaveText(code);
      await bewaar(page);
      await expect(page).toHaveURL(/#\/vandaag$/);
    });
  });
});

// =====================================================================================================================
// BESLISSING 533: Pincode wijzigen = de huidige code (of het toestel) en de nieuwe code EEN keer. Vangnet: Ongedaan maken in de strook zet de vorige
// code terug; de vorige afgeleide staat alleen in het geheugen, tot de strook weg is. Zonder bevestigde herstelcode noemt de strook die ook.
test.describe('BESLISSING 533: pincode wijzigen in twee keer', () => {
  test.beforeEach(async ({ page }) => vasteKlok(page));
  const pinVan = (page) => instelling(page, 'slot.pin');

  test('1 + 1 keer de code; Ongedaan maken zet de vorige code terug: de oude werkt weer, de nieuwe niet', async ({ page }) => {
    await authenticator(page, 'geen');
    await zetSlotAan(page);
    const oud = await pinVan(page);
    const t = teller();
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await t.tik(page, CODE);
    await expect(page.getByText('Kies je nieuwe code van zes cijfers.')).toBeVisible();
    await t.tik(page, '246810');
    const strook = page.locator('.strook').filter({ hasText: 'Je pincode is gewijzigd.' });
    await expect(strook).toBeVisible();
    await expect(page.locator('.cijferblok')).toHaveCount(0);
    expect(t.aantal).toBe(2);
    expect((await pinVan(page)).hash).not.toBe(oud.hash);
    await strook.getByRole('button', { name: 'Ongedaan maken' }).click();
    await expect(page.getByText('Je vorige pincode geldt weer.')).toBeVisible();
    expect(await pinVan(page)).toEqual(oud);
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, '246810');
    await expect(page.locator('#slot .slot__boodschap').first()).toHaveText('Die code klopt niet.');
    await tik(page, CODE);
    await expect(page.locator('#slot')).toBeHidden();
  });

  test('met het toestel (de passkey van Face ID): 0 + 1 keer de code', async ({ page }) => {
    await authenticator(page, 'ok');
    await zetSlotAan(page, { methode: 'faceid' });
    const t = teller();
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await page.getByRole('button', { name: 'Bevestig met Face ID' }).click();
    await t.tik(page, '246810');
    await expect(page.getByText('Je pincode is gewijzigd.')).toBeVisible();
    expect(t.aantal).toBe(1);
  });

  test('na het verdwijnen van de strook kan ongedaan maken niet meer en staat de vorige afgeleide nergens', async ({ page }) => {
    await authenticator(page, 'geen');
    await zetSlotAan(page);
    const oud = await pinVan(page);
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await tik(page, CODE);
    await tik(page, '246810');
    await expect(page.getByText('Je pincode is gewijzigd.')).toBeVisible();
    await page.clock.runFor(7000);
    await expect(page.locator('.strook').filter({ hasText: 'Je pincode is gewijzigd.' })).toHaveCount(0);
    const alles = await alleOpslag(page);
    expect(alles).not.toContain(oud.hash);
    expect(alles).not.toContain(oud.zout);
  });

  test('zonder bevestigde herstelcode noemt de strook de herstelcode', async ({ page }) => {
    await authenticator(page, 'geen');
    await zetSlotAan(page);
    await zetInDb(page, { 'slot.herstel': null });
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    await page.goto(VERGRENDELING);
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await tik(page, CODE);
    await tik(page, '246810');
    await expect(page.locator('.strook')).toContainText('Je pincode is gewijzigd. Maak ook een herstelcode, voor als je ze niet meer weet.');
    await expect(page.locator('.strook').getByRole('button', { name: 'Ongedaan maken' })).toBeVisible();
  });

  test('twee tabbladen: na wijzigen gaat het andere dicht; na ongedaan maken opent daar de oude code', async ({ page, context }) => {
    await authenticator(page, 'geen');
    await zetSlotAan(page);
    const b = await context.newPage();
    await vasteKlok(b);
    await authenticator(b, 'geen');
    await b.goto('./#/vandaag');
    await wachtOpSlot(b);
    await tik(b, CODE);
    await expect(b.locator('#slot')).toBeHidden();
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await tik(page, CODE);
    await tik(page, '246810');
    await wachtOpSlot(b);
    await page.locator('.strook').getByRole('button', { name: 'Ongedaan maken' }).click();
    await expect(page.getByText('Je vorige pincode geldt weer.')).toBeVisible();
    await tik(b, '246810');
    await expect(b.locator('#slot .slot__boodschap').first()).toHaveText('Die code klopt niet.');
    await tik(b, CODE);
    await expect(b.locator('#slot')).toBeHidden();
    await b.close();
  });
});
