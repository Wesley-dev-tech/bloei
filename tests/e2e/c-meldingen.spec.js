// Herinneringen via pushmeldingen (stap 13, BESLISSINGEN 30 tot 38, 112, 307, 309, 312, 313).
// Vier soorten (BESLISSING 736): dagboek, eten, drinken en supplementen, elk tot 3 uren; de gebruiker kiest elk uur zelf.
// Er gaat nooit een verzoek naar een echte pushdienst: een nep-PushManager en een nepdienst (page.route) bootsen ze na.
// Twee bouwversies (playwright.config.js, BESLISSING 408): zonder push-dienst en met een nepdienst (VITE_PUSH_URL en VITE_VAPID_PUBLIEK
// bij het bouwen, nooit het echte adres):
//   zonder:  npm run e2e -- c-meldingen        de tests zonder tag
//   met:     npm run e2e:push -- c-meldingen   de tests met de tag @push
import { test, expect } from '@playwright/test';
import { meetKaarten as meetKaartenZonderTegel } from './leeg-vlak.js';

// BESLISSING 568 en 569: in de kaart "Goed om te weten" staat de tekst van een weetje van een regel in het midden van haar tegel van 40 px. De gedeelde meting
// (leeg-vlak.js) telt alleen elementen zonder kinderen en dus de tegel niet; de strook boven en onder zo'n tekst leek daardoor een leeg vlak. Hier telt de tegel van
// een weetje mee als inhoud in de kaart .meldingen__goedkaart; elke andere kaart en de grens van 32 px blijven zoals ze zijn.
async function meetKaarten(page, wortel) {
  const gaten = await meetKaartenZonderTegel(page, wortel);
  const goed = await page.evaluate((sel) => [...document.querySelectorAll(sel + ' .meldingen__goedkaart')].filter((k) => k.offsetParent !== null).map((k) => {
    const r = k.getBoundingClientRect();
    const stijl = getComputedStyle(k);
    const binnenTop = r.top + parseFloat(stijl.paddingTop);
    const binnenBodem = r.bottom - parseFloat(stijl.paddingBottom);
    const blokken = [];
    for (const e of k.querySelectorAll('*')) {
      const b = e.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) continue;
      const toont = e.children.length === 0 || e.classList.contains('tegel') || ['svg', 'textarea', 'input', 'button'].includes(e.tagName.toLowerCase());
      if (toont) blokken.push([Math.max(b.top, binnenTop), Math.min(b.bottom, binnenBodem)]);
    }
    blokken.sort((a, b) => a[0] - b[0]);
    let gat = 0;
    let tot = binnenTop;
    for (const [van, naar] of blokken) {
      if (naar <= van) continue;
      gat = Math.max(gat, van - tot);
      tot = Math.max(tot, naar);
    }
    return Math.max(gat, binnenBodem - tot);
  }), wortel);
  let volgende = 0;
  return gaten.map((k) => (/meldingen__goedkaart/.test(k.naam) && goed[volgende] !== undefined ? { ...k, gat: goed[volgende++] } : k));
}
import { animatiesKlaar } from './wacht.js';

const DIENST = process.env.VITE_PUSH_URL || '';
const OORSPRONG = `http://localhost:${process.env.PW_POORT || '4173'}`;

// ---- hulp
const CORS = { 'access-control-allow-origin': OORSPRONG, 'access-control-allow-methods': 'POST, DELETE, OPTIONS', 'access-control-allow-headers': 'Content-Type' };

async function nepDienst(context) {
  const verzoeken = [];
  await context.route(DIENST + '/**', async (route) => {
    const v = route.request();
    if (v.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    verzoeken.push({ methode: v.method(), pad: new URL(v.url()).pathname, body: v.postData() });
    return route.fulfill({ status: 204, headers: CORS });
  });
  return verzoeken;
}
const posts = (verzoeken) => verzoeken.filter((v) => v.methode === 'POST');
const laatsteUren = (verzoeken) => (posts(verzoeken).length ? JSON.parse(posts(verzoeken).at(-1).body).uren : []);

// Een nep-PushManager: het abonnement bestaat alleen in sessionStorage; er wordt nooit een echte pushdienst aangeroepen.
async function nepPush(context, { toestemming = 'granted', ipad = false, standalone = false } = {}) {
  await context.addInitScript(
    ([toestemming, ipad, standalone]) => {
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
        async permissionState() {
          return toestemming === 'denied' ? 'denied' : 'granted';
        },
      };
      Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', { get: () => pm, configurable: true });
      if (!('PushManager' in window)) window.PushManager = function PushManager() {};
      if (toestemming === 'denied') Object.defineProperty(Notification, 'permission', { get: () => 'denied', configurable: true });
      if (ipad) {
        Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel', configurable: true });
        Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5, configurable: true });
      }
      if (standalone) Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
    },
    [toestemming, ipad, standalone],
  );
  if (toestemming !== 'denied') await context.grantPermissions(['notifications'], { origin: OORSPRONG });
}

const IDB = (page, bewerking, argumenten) =>
  page.evaluate(
    ({ bewerking, argumenten }) =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const winkels = Object.keys(argumenten);
          const tx = db.transaction(winkels, 'readwrite');
          for (const [winkel, acties] of Object.entries(argumenten)) {
            const w = tx.objectStore(winkel);
            if (acties === 'wis') w.clear();
            else for (const rij of acties) w[bewerking](rij);
          }
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    { bewerking, argumenten },
  );

const instelling = (sleutel, waarde) => ({ sleutel, waarde });
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

async function openScherm(page) {
  await page.goto('./#/meer/meldingen');
  await expect(page.locator('.meldingen .instelscherm')).toBeVisible();
}

// BESLISSING 322: de weetjeskaart staat in de kolom met het kleinste verschil tussen de kolomeinden, direct onder de kaart erboven (gewone
// tussenruimte) en even breed als haar kolom; het verschil is begrensd; de kaarten zijn los (eigen schaduw).
async function verdeling(page, naast, { naam = '' } = {}) {
  const m = await page.evaluate(() => {
    const q = (s) => document.querySelector('.meldingen ' + s);
    const links = q('.meldingen__links');
    const rechts = q('.meldingen__rechts');
    const huidig = Math.abs(links.getBoundingClientRect().bottom - rechts.getBoundingClientRect().bottom);
    const goeds = [...document.querySelectorAll('.meldingen .meldingen__goed')];
    // De kaart erboven is de kaart die er op het scherm boven staat, niet het vorige element in de DOM: op de telefoon lossen de kolommen
    // op (display: contents, telefoon.css) en zet order de kaarten in een andere volgorde. De stroom is dan het instelscherm zelf.
    const stroomVan = (el) => (getComputedStyle(el.parentNode).display === 'contents' ? el.parentNode.parentElement : el.parentNode);
    const vakken = (houder) => [...houder.children].flatMap((c) => (getComputedStyle(c).display === 'contents' ? vakken(c) : [c]));
    const kaarten = goeds.map((g) => {
      const r = g.getBoundingClientRect();
      const stroom = stroomVan(g);
      const cs = getComputedStyle(stroom);
      const binnen = stroom.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const boven = vakken(stroom)
        .filter((e) => e !== g && e.getClientRects().length)
        .map((e) => e.getBoundingClientRect())
        .filter((b) => b.bottom <= r.top + 1 && b.left < r.right && b.right > r.left);
      const vorige = Math.max(...boven.map((b) => b.bottom));
      return { kolom: g.parentNode === links ? 'links' : 'rechts', gat: r.top - vorige, tussenruimte: parseFloat(cs.rowGap), breedte: Math.abs(r.width - (getComputedStyle(g.parentNode).display === 'contents' ? binnen : g.parentNode.getBoundingClientRect().width)), hoog: r.height };
    });
    // BESLISSING 322: hoogstens één kaart met de titel; geen rastercel zonder weetje; geen weetje over meer dan drie regels
    const titels = [...document.querySelectorAll('.meldingen .kaartkop')].filter((k) => /goed om te weten/i.test(k.textContent)).length;
    const vormen = [...document.querySelectorAll('.meldingen__goed .meldingen__weetjes')].map((lijst) => {
      const kolommen = getComputedStyle(lijst).display === 'grid' ? getComputedStyle(lijst).gridTemplateColumns.split(' ').filter(Boolean).length : 1;
      return { kolommen, aantal: lijst.children.length, kolom: lijst.closest('.meldingen__goed').parentNode === links ? 'L' : 'R' };
    });
    const vorm = vormen.map((v) => `${v.kolom}${v.kolommen}x${Math.ceil(v.aantal / v.kolommen)}`).join(' ');
    const leeg = vormen.some((v) => v.kolommen > 1 && v.aantal % v.kolommen !== 0);
    const regels = [...document.querySelectorAll('.meldingen__weetjetekst')].map((p) => p.getBoundingClientRect().height);
    const bijschrift = !q('.meldingen__bijschrift').hidden;
    const samenvatting = !!q('.meldingen__samenvatting') && !q('.meldingen__samenvatting').hidden;
    return { huidig, kaarten, titels, vorm, leeg, regelsMax: Math.max(...regels), bijschrift, samenvatting, gat: Math.min(...kaarten.map((k) => k.gat)), gatMax: Math.max(...kaarten.map((k) => k.gat)), tussenruimte: Math.min(...kaarten.map((k) => k.tussenruimte)), tussenruimteMax: Math.max(...kaarten.map((k) => k.tussenruimte)), breedte: Math.max(...kaarten.map((k) => k.breedte)), schaduw: getComputedStyle(q('.instel__lijst')).boxShadow !== 'none' };
  });
  expect(m.titels, JSON.stringify(m)).toBe(1);
  expect(m.leeg, JSON.stringify(m)).toBe(false);
  if (naast) expect(m.regelsMax, JSON.stringify(m)).toBeLessThanOrEqual(115); // liefst drie regels, hoogstens vijf (smalle kolom op 1024 px)
  expect(m.bijschrift && m.samenvatting, JSON.stringify(m)).toBe(false);
  // BESLISSING 324: op een breed scherm eindigen beide kolommen op dezelfde lijn
  if (naast) expect.soft(m.huidig, `${naam} ${JSON.stringify(m)}`).toBeLessThanOrEqual(2);
  // De gewone tussenruimte tussen de kaarten: de gap van de stroom (24 px breed, 16 px op de telefoon), op 1 px na.
  expect(m.tussenruimte, JSON.stringify(m)).toBeGreaterThanOrEqual(16);
  expect(m.gat, JSON.stringify(m)).toBeGreaterThanOrEqual(m.tussenruimte - 1);
  expect(m.gatMax, JSON.stringify(m)).toBeLessThanOrEqual(m.tussenruimteMax + 1);
  expect(m.breedte).toBeLessThanOrEqual(1);
  expect(m.schaduw).toBe(true);
  return m;
}

const schakelaar = (page, soort) => page.locator(`.meldingen [data-meldingen="${soort}"]`);
const slotUur = (page, nr) => page.locator('.meldingen__slot').nth(nr).locator('input');
// BESLISSING 714: Dagboek heeft dezelfde rijen als Drinken en Supplementen; het eerste tijdstip van Dagboek.
const dagboekUur = (page) => page.locator('.meldingen__slot:has([data-meldingen="dagboek-0"]) input');
const NBSP = /[  ]/g;

// ===================================================================== zonder push-dienst
test.describe('zonder push-dienst', () => {
  test('Herinneringen toont "niet beschikbaar", er zijn geen schakelaars en er gaat geen verzoek naar buiten', async ({ page }) => {
    const buiten = [];
    page.on('request', (v) => /^https?:/.test(v.url()) && !v.url().startsWith(OORSPRONG) && buiten.push(v.url()));
    await openScherm(page);
    await expect(page.locator('.meldingen')).toContainText('Herinneringen zijn op dit toestel niet beschikbaar.');
    await expect(page.locator('.meldingen [role="switch"]')).toHaveCount(0);
    await page.reload();
    await page.goto('./#/vandaag');
    await page.goto('./#/meer');
    expect(buiten).toEqual([]);
  });

  test('niet beschikbaar: de vier soorten staan uitgeschakeld in de kaart en de weetjes staan in de kortste kolom', async ({ page }) => {
    for (const [breedte, hoogte, naast] of [[1690, 1230, true], [1180, 820, true], [820, 1180, false], [390, 844, false]]) {
      await page.setViewportSize({ width: breedte, height: hoogte });
      await openScherm(page);
      await expect(page.locator('.meldingen__nep')).toHaveCount(5); // de vier soorten en "Details tonen in meldingen"
      await expect(page.locator('.meldingen [role="switch"], .meldingen button.schakelaar')).toHaveCount(0);
      await expect(page.locator('.meldingen__nep').first()).toHaveAttribute('aria-disabled', 'true');
      await animatiesKlaar(page); // de kaarten komen zacht op: pas meten als ze stilstaan
      await verdeling(page, naast);
      for (const k of await meetKaarten(page, '.meldingen .instelscherm')) expect(k.gat, `${breedte} ${k.naam}`).toBeLessThanOrEqual(32);
    }
  });

  test('tegenproef: een echt leeg vlak in de kaart Goed om te weten wordt nog gevangen (568, 569)', async ({ page }) => {
    await page.setViewportSize({ width: 1690, height: 1230 });
    await openScherm(page);
    await animatiesKlaar(page);
    await page.evaluate(() => {
      const w = document.querySelectorAll('.meldingen__goedkaart .meldingen__weetje');
      w[w.length - 1].style.marginTop = '90px';
    });
    const kaarten = (await meetKaarten(page, '.meldingen .instelscherm')).filter((k) => /meldingen__goedkaart/.test(k.naam));
    expect(kaarten.length, 'de kaart Goed om te weten staat in de meting').toBeGreaterThan(0);
    expect(Math.max(...kaarten.map((k) => k.gat)), 'een opgevoegd leeg vlak van 90 px wordt gemeten').toBeGreaterThan(32);
  });

  test('de CSP staat connect-src alleen op de eigen oorsprong, de weerdienst en de dienst voor de plaatsnaam toe', async ({ page }) => {
    await page.goto('./');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    // Zonder meldingsdienst in de testbouw: alleen de eigen oorsprong, en de weerdienst en de dienst voor de plaatsnaam (niet in de demo).
    expect(csp.split('; ').find((regel) => regel.startsWith('connect-src'))).toMatch(/^connect-src 'self'( https:\/\/api\.open-meteo\.com https:\/\/nominatim\.openstreetmap\.org)?$/);
  });
});

// ===================================================================== met push-dienst
test.describe('met push-dienst', { tag: '@push' }, () => {
  test('de CSP laat het adres van de dienst toe in connect-src', async ({ page }) => {
    await page.goto('./');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp.split('; ')).toContain(`connect-src 'self' ${new URL(DIENST).origin}`);
  });

  test('met alles uit is er geen abonnement en gaat er geen enkel verzoek naar de dienst', async ({ page, context }) => {
    await nepPush(context);
    const verzoeken = await nepDienst(context);
    await openScherm(page);
    for (const s of ['hoofd', 'dagboek', 'eten', 'drinken', 'supplementen']) await expect(schakelaar(page, s)).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.meldingen [role="switch"]')).toHaveCount(6); // geen tijdstippen zichtbaar zolang een soort uit staat; de zesde is "Details tonen in meldingen"
    await expect(schakelaar(page, 'details')).toHaveAttribute('aria-checked', 'false'); // standaard uit
    await expect(schakelaar(page, 'details')).toBeDisabled(); // alles uit: niets te kiezen
    await page.reload();
    await page.goto('./#/vandaag');
    await page.waitForTimeout(1500);
    expect(verzoeken).toEqual([]);
  });

  test('dagboek aan: één POST met alleen het abonnement en de uren; een uur wijzigen stuurt de nieuwe lijst zonder het oude; herladen onthoudt', async ({ page, context }) => {
    await nepPush(context);
    const verzoeken = await nepDienst(context);
    await openScherm(page);

    await schakelaar(page, 'dagboek').click();
    await expect(schakelaar(page, 'dagboek')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => verzoeken.length, { timeout: 8000 }).toBe(1);
    expect(verzoeken[0]).toMatchObject({ methode: 'POST', pad: '/abonnement' });
    const body = JSON.parse(verzoeken[0].body);
    expect(Object.keys(body).sort()).toEqual(['abonnement', 'uren']);
    expect(Object.keys(body.abonnement).sort()).toEqual(['endpoint', 'keys']);
    expect(body.uren).toEqual(['20:00']);
    expect(verzoeken[0].body).not.toMatch(/Testnaam|ontbijt|middagmaal|avondmaal|kg|gewicht|naam|capsule|dagboek|drinken|supplement|weegdag/i);

    // een uur wijzigen: één nieuwe POST, zonder het oude uur
    await dagboekUur(page).fill('19:45');
    await expect.poll(() => verzoeken.length, { timeout: 8000 }).toBe(2);
    expect(JSON.parse(verzoeken[1].body).uren).toEqual(['19:45']);

    // BESLISSING 713: per minuut, niets wordt afgerond (vroeger werd 19:52 hier 19:45)
    await expect(dagboekUur(page)).toHaveAttribute('step', '60');
    await dagboekUur(page).fill('19:52');
    await expect(dagboekUur(page)).toHaveValue('19:52');
    await expect.poll(() => verzoeken.length, { timeout: 8000 }).toBe(3);
    expect(JSON.parse(verzoeken[2].body).uren).toEqual(['19:52']);

    // herladen: schakelaar en uur blijven
    await page.reload();
    await expect(schakelaar(page, 'dagboek')).toHaveAttribute('aria-checked', 'true');
    await expect(dagboekUur(page)).toHaveValue('19:52');
    await expect(schakelaar(page, 'drinken')).toHaveAttribute('aria-checked', 'false');

    // alles uit: DELETE, abonnement weg
    await schakelaar(page, 'dagboek').click();
    await expect.poll(() => verzoeken.at(-1)?.methode, { timeout: 8000 }).toBe('DELETE');
    expect(JSON.parse(verzoeken.at(-1).body)).toEqual({ endpoint: expect.stringContaining('https://web.push.apple.com/'), auth: 'NepAuthNepAuthNep' });
    expect(await page.evaluate(() => sessionStorage.getItem('nep-abonnement'))).toBeNull();
    expect(await lees(page, 'meldingen.abonnement')).toBeNull();
  });

  test('drinken: tijdstippen wijzigen, toevoegen en weghalen; elk uur blijft na herladen', async ({ page, context }) => {
    await nepPush(context);
    const verzoeken = await nepDienst(context);
    await openScherm(page);

    await schakelaar(page, 'drinken').click();
    await expect(page.locator('.meldingen__slot')).toHaveCount(3);
    await expect.poll(() => verzoeken.length, { timeout: 8000 }).toBeGreaterThan(0);
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).toEqual(['11:00', '15:00', '19:00']);

    // het tweede tijdstip wijzigen: de nieuwe lijst, zonder 15:00
    await slotUur(page, 1).fill('15:30');
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).toEqual(['11:00', '15:30', '19:00']);

    // één tijdstip uitzetten
    await schakelaar(page, 'drinken-0').click();
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).toEqual(['15:30', '19:00']);
    await schakelaar(page, 'drinken-0').click();
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).toEqual(['11:00', '15:30', '19:00']);

    // BESLISSING 736: drie is het maximum, er valt niets toe te voegen
    await expect(page.getByRole('button', { name: 'Tijdstip toevoegen' })).toHaveCount(0);

    // weghalen
    await page.getByRole('button', { name: 'Tijdstip 1 weghalen' }).click();
    await expect(page.locator('.meldingen__slot')).toHaveCount(2);
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).not.toContain('11:00');

    // toevoegen (tot 3)
    await page.getByRole('button', { name: 'Tijdstip toevoegen' }).first().click();
    await expect(page.locator('.meldingen__slot')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Tijdstip toevoegen' })).toHaveCount(0); // maximum bereikt
    await expect.poll(() => laatsteUren(verzoeken).length, { timeout: 8000 }).toBe(3);
    const nieuw = await slotUur(page, 2).inputValue();
    expect(laatsteUren(verzoeken)).toContain(nieuw);

    // twee gelijke tijdstippen binnen één soort worden samengevoegd
    const eerste = await slotUur(page, 0).inputValue();
    await slotUur(page, 1).fill(eerste);
    await expect(page.locator('.meldingen__slot')).toHaveCount(2);
    await expect.poll(() => new Set(laatsteUren(verzoeken)).size === laatsteUren(verzoeken).length, { timeout: 8000 }).toBe(true);

    // herladen: dezelfde uren
    const staat = await page.locator('.meldingen__slot input').evaluateAll((els) => els.map((e) => e.value));
    await page.reload();
    await expect(page.locator('.meldingen__slot')).toHaveCount(2);
    expect(await page.locator('.meldingen__slot input').evaluateAll((els) => els.map((e) => e.value))).toEqual(staat);
  });

  test('supplementen: drie tijdstippen met eigen uur, maximum van drie', async ({ page, context }) => {
    await nepPush(context);
    const verzoeken = await nepDienst(context);
    await openScherm(page);
    await schakelaar(page, 'supplementen').click();
    await expect(page.locator('.meldingen__slot')).toHaveCount(3);
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).toEqual(['08:00', '13:00', '19:00']);
    await expect(page.getByRole('button', { name: 'Tijdstip toevoegen' })).toHaveCount(0);
    await slotUur(page, 0).fill('07:30');
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).toEqual(['07:30', '13:00', '19:00']);
    await page.getByRole('button', { name: 'Tijdstip 3 weghalen' }).click();
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).toEqual(['07:30', '13:00']);
    await expect(page.getByRole('button', { name: 'Tijdstip toevoegen' })).toHaveCount(1);
  });

  test('de hoofdschakelaar zet alles aan of uit in één tik; uit meldt het toestel af', async ({ page, context }) => {
    await nepPush(context);
    const verzoeken = await nepDienst(context);
    await openScherm(page);
    await schakelaar(page, 'hoofd').click();
    for (const s of ['dagboek', 'eten', 'drinken', 'supplementen']) await expect(schakelaar(page, s)).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).toEqual(['08:00', '11:00', '12:00', '13:00', '15:00', '19:00', '20:00']);

    await schakelaar(page, 'hoofd').click();
    for (const s of ['dagboek', 'eten', 'drinken', 'supplementen']) await expect(schakelaar(page, s)).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => verzoeken.at(-1)?.methode, { timeout: 8000 }).toBe('DELETE');
    await page.reload();
    await expect(schakelaar(page, 'hoofd')).toHaveAttribute('aria-checked', 'false');
  });

  test('Details tonen in meldingen: standaard uit, uitgeschakeld zolang alles uit staat, het voorbeeld volgt, wordt bewaard en er gaat niets naar de dienst', async ({ page, context }) => {
    await nepPush(context);
    const verzoeken = await nepDienst(context);
    await openScherm(page);
    const details = schakelaar(page, 'details');
    const kaartjes = () => page.locator('.meldingen .meldingen__stapel > .meldingen__melding .meldingen__tekst').allTextContents();
    await expect(details).toHaveAttribute('aria-checked', 'false');
    await expect(details).toBeDisabled();
    await expect(page.locator('.meldingen__details .schakelaar__uitleg')).toHaveText('Zonder details staat er alleen dat Bloei klaarligt.');
    // onder de drie soorten, in dezelfde vorm als hun rijen (zelfde tegel)
    const plaats = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const tegel = (s) => document.querySelector(s + ' .tegel, ' + s + ' [class*="tegel"]').getBoundingClientRect();
      return { onder: r('.meldingen__details').top >= Math.max(...[...document.querySelectorAll('.meldingen__soort')].map((e) => e.getBoundingClientRect().bottom)) - 1, tegelX: Math.abs(tegel('.meldingen__details').left - tegel('.meldingen__soort').left), tegelB: Math.abs(tegel('.meldingen__details').width - tegel('.meldingen__soort').width) };
    });
    expect(plaats).toEqual({ onder: true, tegelX: 0, tegelB: 0 });

    await schakelaar(page, 'drinken').click();
    await expect(details).toBeEnabled();
    await expect.poll(() => verzoeken.length, { timeout: 8000 }).toBeGreaterThan(0);
    for (const tekst of await kaartjes()) expect(tekst).toBe('Bloei ligt klaar.');
    const voor = verzoeken.length;

    await details.click();
    await expect(details).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await kaartjes()).every((tekst) => tekst !== 'Bloei ligt klaar.')).toBe(true);
    expect(await lees(page, 'meldingen.details')).toBe(true);
    await page.waitForTimeout(1000);
    expect(verzoeken.length).toBe(voor);

    await page.reload();
    await expect(schakelaar(page, 'details')).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(1000);
    const naHerladen = verzoeken.length; // bij het opstarten synchroniseert de app het abonnement zelf één keer
    await schakelaar(page, 'details').click();
    await expect(schakelaar(page, 'details')).toHaveAttribute('aria-checked', 'false');
    expect(await lees(page, 'meldingen.details')).toBe(false);
    await page.waitForTimeout(1000);
    expect(verzoeken.length).toBe(naHerladen);
  });

  // BESLISSING 710: met de vergrendeling aan is de schakelaar gewoon te bedienen, met de gewone ondertitel, en het slot laat de keuze staan.
  test('Details tonen in meldingen: met de vergrendeling aan te bedienen, het voorbeeld volgt, en het slot verandert de keuze niet', async ({ page, context }) => {
    await nepPush(context);
    await nepDienst(context);
    await openScherm(page);
    await IDB(page, 'put', { instellingen: [instelling('meldingen.drinken', [{ aan: true, uur: '11:00' }]), instelling('meldingen.details', true)] });
    // de vergrendeling staat pas aan nadat de app open is (anders blokkeert het slotscherm); daarna het scherm opnieuw openen
    await IDB(page, 'put', { instellingen: [instelling('slot.aan', true)] });
    await page.goto('./#/vandaag');
    await openScherm(page);
    const details = schakelaar(page, 'details');
    const kaartjes = () => page.locator('.meldingen .meldingen__stapel > .meldingen__melding .meldingen__tekst').allTextContents();
    // het slot aanzetten liet de keuze staan
    expect(await lees(page, 'slot.aan')).toBe(true);
    await expect(details).toHaveAttribute('aria-checked', 'true');
    await expect(details).toBeEnabled();
    await expect(page.locator('.meldingen__details .schakelaar__uitleg')).toHaveText('Zonder details staat er alleen dat Bloei klaarligt.');
    await expect(page.locator('.meldingen .meldingen__slotnota')).toHaveCount(0);
    await expect.poll(async () => (await kaartjes()).every((tekst) => tekst !== 'Bloei ligt klaar.')).toBe(true);

    await details.click();
    await expect(details).toHaveAttribute('aria-checked', 'false');
    expect(await lees(page, 'meldingen.details')).toBe(false);
    await expect.poll(async () => (await kaartjes()).every((tekst) => tekst === 'Bloei ligt klaar.')).toBe(true);

    await schakelaar(page, 'details').click();
    await expect(schakelaar(page, 'details')).toHaveAttribute('aria-checked', 'true');
    expect(await lees(page, 'meldingen.details')).toBe(true);
    expect(await lees(page, 'slot.aan')).toBe(true);
  });

  test('een soort uitzetten haalt zijn uren weg bij de dienst, de andere blijven', async ({ page, context }) => {
    await nepPush(context);
    const verzoeken = await nepDienst(context);
    await openScherm(page);
    await schakelaar(page, 'hoofd').click();
    await expect.poll(() => laatsteUren(verzoeken).length, { timeout: 8000 }).toBe(7);
    await schakelaar(page, 'supplementen').click();
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).toEqual(['11:00', '12:00', '15:00', '19:00', '20:00']);
  });

  // BESLISSING 736: een vierde soort, Eten, tussen Dagboek en Drinken, met dezelfde rijen en hoogstens drie tijdstippen.
  test('eten: de soort staat tussen Dagboek en Drinken, standaard uit, en heeft hoogstens drie tijdstippen', async ({ page, context }) => {
    await nepPush(context);
    const verzoeken = await nepDienst(context);
    await openScherm(page);
    const volgorde = await page.locator('.meldingen__soort [data-meldingen]').evaluateAll((els) => els.map((e) => e.dataset.meldingen));
    expect(volgorde).toEqual(['dagboek', 'eten', 'drinken', 'supplementen']);
    await expect(schakelaar(page, 'eten')).toHaveAttribute('aria-checked', 'false');
    await schakelaar(page, 'eten').click();
    await expect(page.locator('.meldingen__slot')).toHaveCount(1);
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).toEqual(['12:00']);
    const toevoegen = page.locator('[data-meldingen="eten-toevoegen"]');
    await toevoegen.click();
    await expect(page.locator('.meldingen__slot')).toHaveCount(2);
    await toevoegen.click();
    await expect(page.locator('.meldingen__slot')).toHaveCount(3);
    await expect(toevoegen).toHaveCount(0);
    await expect.poll(() => laatsteUren(verzoeken).length, { timeout: 8000 }).toBe(3);
    await page.reload();
    await expect(page.locator('.meldingen__slot')).toHaveCount(3);
  });

  test('een oude stand met vier tijdstippen bij Drinken houdt er stil de eerste drie over, op het toestel en bij de dienst', async ({ page, context }) => {
    await nepPush(context);
    const verzoeken = await nepDienst(context);
    await openScherm(page);
    const vier = ['08:00', '11:00', '15:00', '19:00'].map((uur) => ({ aan: true, uur }));
    await IDB(page, 'put', { instellingen: [instelling('meldingen.drinken', vier)] });
    await page.reload();
    await expect(page.locator('.meldingen__slot')).toHaveCount(3);
    await expect(page.locator('[data-meldingen="drinken-toevoegen"]')).toHaveCount(0);
    await expect.poll(() => lees(page, 'meldingen.drinken')).toEqual(vier.slice(0, 3));
    await schakelaar(page, 'drinken-0').click();
    await schakelaar(page, 'drinken-0').click();
    await expect.poll(() => laatsteUren(verzoeken), { timeout: 8000 }).toEqual(['08:00', '11:00', '15:00']);
  });

  // De volgorde (wissen.js): eerst het leegmaken in één transactie, dan het afmelden bij de dienst, dan de rij van het abonnement weg. Zolang dat
  // loopt, blijft de dialoog open met al haar knoppen uitgeschakeld (niets wat dan getikt wordt, overleeft de wis).
  test('"Profiel verwijderen" wist alles, meldt het toestel daarna af bij de dienst en laat geen rij van het abonnement achter', async ({ page, context }) => {
    await nepPush(context);
    const verzoeken = await nepDienst(context);
    await openScherm(page);
    await schakelaar(page, 'dagboek').click();
    await expect.poll(() => verzoeken.length, { timeout: 8000 }).toBe(1);
    expect(await lees(page, 'meldingen.abonnement')).toBeTruthy();

    // de afmelding bij de dienst even ophouden, om de dialoog tijdens het wissen te bekijken
    let deleteGezien = false;
    let geefVrij;
    const dienstWacht = new Promise((klaar) => (geefVrij = klaar));
    await page.route(DIENST + '/**', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteGezien = true;
        await dienstWacht;
      }
      return route.fallback();
    });

    await page.goto('./#/meer');
    await page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Ja, verwijder mijn profiel' }).click();
    const laatste = dlg.getByRole('button', { name: 'Ja, verwijder mijn profiel' });
    await expect(laatste).toBeEnabled({ timeout: 4000 });
    await laatste.click();
    await expect.poll(() => deleteGezien, { timeout: 4000 }).toBe(true);
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('button')).toHaveCount(2);
    await expect(dlg.locator('button:enabled')).toHaveCount(0);
    await expect(dlg).toHaveAttribute('aria-busy', 'true');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeVisible();
    geefVrij();

    await expect(page).toHaveURL(/#\/welkom$/);
    expect(verzoeken.map((v) => v.methode)).toEqual(['POST', 'DELETE']);
    expect(await page.evaluate(() => sessionStorage.getItem('nep-abonnement'))).toBeNull();
    // geen rij van het abonnement meer, ook niet leeg, ook niet na het opstarten op het welkomscherm
    await page.waitForTimeout(1000);
    expect(await lees(page, 'meldingen.abonnement')).toBeUndefined();
  });

  test('toestemming geweigerd: uitleg in plaats van schakelaars', async ({ page, context }) => {
    await nepPush(context, { toestemming: 'denied' });
    const verzoeken = await nepDienst(context);
    await openScherm(page);
    await expect(page.locator('.meldingen')).toContainText('Je hebt meldingen geweigerd.');
    await expect(page.locator('.meldingen')).toContainText('Instellingen');
    await expect(page.locator('.meldingen [role="switch"]')).toHaveCount(0);
    expect(verzoeken).toEqual([]);
    // BESLISSING 324: ook hier eindigen de kolommen gelijk
    for (const [b, hh] of [[1690, 1230], [1440, 900], [1180, 820], [1024, 768]]) {
      await page.setViewportSize({ width: b, height: hh });
      await openScherm(page);
      await page.reload();
      await expect(page.locator('.meldingen__nep')).toHaveCount(5);
      await verdeling(page, true, { naam: `${b}x${hh}` });
    }
  });

  async function nieuwToestel(browser, opties, init) {
    const context = await browser.newContext({ ...opties, baseURL: OORSPRONG + '/', storageState: undefined, hasTouch: true, viewport: { width: 820, height: 1180 } });
    await nepPush(context, init);
    const verzoeken = await nepDienst(context);
    const page = await context.newPage();
    await page.goto('./');
    await page.evaluate(() => new Promise((klaar) => { const q = indexedDB.open('bloei-dagboek'); q.onsuccess = () => { const tx = q.result.transaction('instellingen', 'readwrite'); tx.objectStore('instellingen').put({ sleutel: 'start.klaar', waarde: true }); tx.oncomplete = () => { q.result.close(); klaar(); }; }; }));
    // De app leest start.klaar één keer bij het opstarten (src/data/instellingen.js, migreerStart): pas na een herlading geldt de gezaaide waarde.
    // Zonder herlading bleef het scherm op Welkom (openScherm wijzigt alleen de hash, dezelfde pagina).
    await page.reload();
    await expect(page.locator('#scherm[data-scherm]')).not.toHaveAttribute('data-scherm', 'welkom');
    return { context, page, verzoeken };
  }

  test('iPhone en iPad in Safari (niet op het beginscherm): installatiestappen in plaats van schakelaars', async ({ browser }) => {
    const gevallen = [
      { naam: 'iPhone', opties: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' }, init: {} },
      { naam: 'iPad met iPad-user-agent', opties: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' }, init: {} },
      { naam: 'iPad die zich als Mac voordoet', opties: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' }, init: { ipad: true } },
    ];
    for (const g of gevallen) {
      const { context, page, verzoeken } = await nieuwToestel(browser, g.opties, g.init);
      await openScherm(page);
      await expect(page.locator('.meldingen'), g.naam).toContainText('Zet Bloei eerst op je beginscherm');
      await expect(page.locator('.meldingen'), g.naam).toContainText('Deel-knop');
      await expect(page.locator('.meldingen'), g.naam).toContainText('Zet op beginscherm');
      await expect(page.locator('.meldingen [role="switch"]'), g.naam).toHaveCount(0);
      expect(verzoeken, g.naam).toEqual([]);
      for (const [b, hh] of [[1690, 1230], [1180, 820]]) {
        await page.setViewportSize({ width: b, height: hh });
        await openScherm(page);
        await page.reload();
        await expect(page.locator('.meldingen .instelscherm')).toBeVisible();
        await verdeling(page, true, { naam: `${g.naam} ${b}x${hh}` });
      }
      await context.close();
    }
  });

  test('een iPad op het beginscherm krijgt de schakelaars', async ({ browser }) => {
    const { context, page } = await nieuwToestel(
      browser,
      { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' },
      { ipad: true, standalone: true },
    );
    await openScherm(page);
    await expect(schakelaar(page, 'hoofd')).toBeVisible();
    await context.close();
  });

  // ---- de service worker toont de juiste tekst
  test.describe('pushsignaal in de service worker', () => {
    async function pushEnLees(page, context) {
      const cdp = await context.newCDPSession(page);
      const registraties = new Map();
      cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => e.registrations.forEach((r) => registraties.set(r.scopeURL, r.registrationId)));
      await cdp.send('ServiceWorker.enable');
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        (await reg.getNotifications()).forEach((n) => n.close());
      });
      await expect.poll(() => registraties.size).toBeGreaterThan(0);
      await cdp.send('ServiceWorker.deliverPushMessage', { origin: OORSPRONG, registrationId: [...registraties.values()][0], data: '' });
      let uit = [];
      await expect
        .poll(async () => {
          uit = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ titel: n.title, tekst: n.body, pad: n.data?.pad, tag: n.tag })));
          return uit.length;
        })
        .toBeGreaterThan(0);
      return { ...uit[0], tekst: uit[0].tekst.replace(NBSP, ' ') };
    }

    const dagVandaag = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const uurNu = () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    const maaltijd = (soort) => ({ datum: dagVandaag(), soort, tijd: '12:00', tekst: 'Soep en brood', fotoId: null, gevoel: null, voorbeeld: false, gewijzigdOp: Date.now() });
    const drank = (ml) => ({ datum: dagVandaag(), tijdstip: Date.now(), soort: 'water', ml, voorbeeld: false });
    const supplement = () => ({ id: 1, naam: 'Testmiddel', dosis: '', hoeveelheid: '', aanwijzing: '', momenten: ['ochtend', 'middag', 'avond'], ritme: { soort: 'dagelijks' }, volgorde: 0, actief: true, voorbeeld: false, aangemaaktOp: Date.now() });

    async function start(page, context, { settings = [], maaltijden = [], dranken = [], supplementen = [] } = {}) {
      await nepPush(context);
      await nepDienst(context);
      await page.goto('./');
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await IDB(page, 'put', { instellingen: [instelling('start.klaar', true), instelling('meldingen.details', true), ...settings] });
      await IDB(page, 'put', { maaltijden: 'wis', dranken: 'wis', supplementen: 'wis', momentinnames: 'wis' });
      await IDB(page, 'put', { maaltijden: maaltijden.map(maaltijd), dranken, supplementen });
    }

    test('dagboek: leeg, deels ingevuld en alles in orde', async ({ page, context }) => {
      await start(page, context, { settings: [instelling('meldingen.dagboek', { aan: true, uur: uurNu() })] });
      let m = await pushEnLees(page, context);
      expect(m).toMatchObject({ titel: 'Bloei', tekst: 'Je dag van vandaag is nog leeg. Even bijschrijven?', pad: '#/vandaag' });

      await IDB(page, 'put', { maaltijden: [maaltijd('ontbijt'), maaltijd('middagmaal')] });
      m = await pushEnLees(page, context);
      expect(m.tekst).toBe('Nog open voor vandaag: je avondmaal en je drinkdoel.');

      await IDB(page, 'put', { maaltijden: [maaltijd('avondmaal')], dranken: [drank(2600)] });
      m = await pushEnLees(page, context);
      expect(m.tekst).toBe('Alles staat erin voor vandaag. Slaapwel.');
    });

    test('drinken: onder het dagdoel, nog niets en dagdoel gehaald', async ({ page, context }) => {
      await start(page, context, { settings: [instelling('meldingen.drinken', [{ aan: true, uur: uurNu() }])] });
      let m = await pushEnLees(page, context);
      expect(m).toMatchObject({ titel: 'Drinken', pad: '#/drinken' });
      expect(m.tekst).toBe('Tijd voor een glas water? Je dagdoel is 2,5 l.');
      await IDB(page, 'put', { dranken: [drank(1200)] });
      m = await pushEnLees(page, context);
      expect(m.tekst).toBe('Je zit aan 1,2 l van 2,5 l. Tijd voor een glas water?');
      await IDB(page, 'put', { dranken: [drank(1500)] });
      m = await pushEnLees(page, context);
      expect(m.tekst).toBe('Je dagdoel is gehaald.');
    });

    test('supplementen: nog open met het tijdvak, daarna afgevinkt', async ({ page, context }) => {
      await start(page, context, { settings: [instelling('meldingen.supplementenUren', [{ aan: true, uur: uurNu() }])], supplementen: [supplement()] });
      let m = await pushEnLees(page, context);
      expect(m).toMatchObject({ titel: 'Supplementen', pad: '#/supplementen' });
      expect(m.tekst).toMatch(/^Je supplementen van van(ochtend|middag|avond) staan nog open\.$/);
      expect(m.tekst).not.toContain('Testmiddel');
      const moment = ['ochtend', 'middag', 'avond'].find((x) => m.tekst.includes('van' + x));
      await IDB(page, 'put', { momentinnames: [{ datum: dagVandaag(), supplementId: 1, moment, tijdstip: Date.now(), voorbeeld: false }] });
      m = await pushEnLees(page, context);
      expect(m.tekst).toBe(`Je supplementen van van${moment} zijn afgevinkt.`);
    });

    test('zonder de schakelaar "Details tonen in meldingen" (standaard) staat er voor elke soort alleen de algemene tekst', async ({ page, context }) => {
      await start(page, context, { settings: [instelling('meldingen.details', undefined)], maaltijden: ['ontbijt'], dranken: [drank(800)], supplementen: [supplement()] });
      await IDB(page, 'put', { instellingen: [instelling('meldingen.dagboek', { aan: true, uur: uurNu() })] });
      let m = await pushEnLees(page, context);
      expect(m).toMatchObject({ titel: 'Bloei', tekst: 'Bloei ligt klaar.', pad: '#/vandaag' });
      await IDB(page, 'put', { instellingen: [instelling('meldingen.dagboek', { aan: false, uur: '20:00' }), instelling('meldingen.drinken', [{ aan: true, uur: uurNu() }])] });
      m = await pushEnLees(page, context);
      expect(m).toMatchObject({ titel: 'Bloei', tekst: 'Bloei ligt klaar.', pad: '#/vandaag', tag: `bloei-algemeen-${uurNu()}` });
      await IDB(page, 'put', { instellingen: [instelling('meldingen.drinken', [{ aan: false, uur: '11:00' }]), instelling('meldingen.supplementenUren', [{ aan: true, uur: uurNu() }])] });
      m = await pushEnLees(page, context);
      expect(m).toMatchObject({ titel: 'Bloei', tekst: 'Bloei ligt klaar.', pad: '#/vandaag' });
      // BESLISSING 348: drinken en supplementen op hetzelfde tijdstip geven dezelfde tag, dus één melding op het toestel
      const tag = m.tag;
      await IDB(page, 'put', { instellingen: [instelling('meldingen.drinken', [{ aan: true, uur: uurNu() }])] });
      m = await pushEnLees(page, context);
      expect(m.tag).toBe(tag);
      expect(await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).length)).toBe(1);
    });

    // BESLISSING 710: de vergrendeling beslist niet meer mee; met het slot aan volgt de melding de schakelaar "Details tonen in meldingen".
    // (Vroeger: "met de vergrendeling aan staat er altijd alleen de algemene tekst", BESLISSING 335.)
    test('met de vergrendeling aan en details aan staan de details in de melding', async ({ page, context }) => {
      await start(page, context, {
        settings: [instelling('slot.aan', true), instelling('meldingen.drinken', [{ aan: true, uur: uurNu() }])],
        maaltijden: ['ontbijt'],
        dranken: [drank(800)],
      });
      let m = await pushEnLees(page, context);
      expect(m).toMatchObject({ titel: 'Drinken', pad: '#/drinken', tekst: 'Je zit aan 0,8 l van 2,5 l. Tijd voor een glas water?' });
      await IDB(page, 'put', { instellingen: [instelling('meldingen.drinken', [{ aan: false, uur: '11:00' }]), instelling('meldingen.supplementenUren', [{ aan: true, uur: uurNu() }])], supplementen: [supplement()] });
      m = await pushEnLees(page, context);
      expect(m).toMatchObject({ titel: 'Supplementen', pad: '#/supplementen' });
      expect(m.tekst).toMatch(/^Je supplementen van van(ochtend|middag|avond) staan nog open\.$/);
    });

    test('met de vergrendeling aan en details uit staat er alleen de algemene tekst', async ({ page, context }) => {
      await start(page, context, {
        settings: [instelling('slot.aan', true), instelling('meldingen.details', false), instelling('meldingen.drinken', [{ aan: true, uur: uurNu() }])],
        maaltijden: ['ontbijt'],
        dranken: [drank(800)],
      });
      let m = await pushEnLees(page, context);
      expect(m.tekst).toBe('Bloei ligt klaar.');
      expect(m.titel).toBe('Bloei');
      expect(`${m.titel} ${m.tekst}`).not.toMatch(/drink|water|supplement|ontbijt|l van/i);
      await IDB(page, 'put', { instellingen: [instelling('meldingen.drinken', [{ aan: false, uur: '11:00' }]), instelling('meldingen.supplementenUren', [{ aan: true, uur: uurNu() }])], supplementen: [supplement()] });
      m = await pushEnLees(page, context);
      expect(m.tekst).toBe('Bloei ligt klaar.');
      expect(m.titel).toBe('Bloei');
    });

    // BESLISSING 716: Dagboek, Drinken en Supplementen op hetzelfde tijdstip geven bij een signaal drie meldingen (met details).
    async function pushEnLeesAlle(page, context, aantal) {
      await pushEnLees(page, context);
      let uit = [];
      await expect
        .poll(async () => {
          uit = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ titel: n.title, tekst: n.body, pad: n.data?.pad, tag: n.tag })));
          return uit.length;
        })
        .toBe(aantal);
      return uit.map((m) => ({ ...m, tekst: m.tekst.replaceAll(NBSP, ' ') }));
    }
    const drieOpNu = () => [
      instelling('meldingen.dagboek', { aan: true, uur: uurNu() }),
      instelling('meldingen.drinken', [{ aan: true, uur: uurNu() }]),
      instelling('meldingen.supplementenUren', [{ aan: true, uur: uurNu() }]),
    ];

    test('drie soorten op hetzelfde tijdstip: drie meldingen met details, elk met een eigen tag; een tik opent het scherm van die soort en sluit alleen die melding', async ({ page, context }) => {
      await start(page, context, { settings: drieOpNu(), maaltijden: ['ontbijt'], dranken: [drank(800)], supplementen: [supplement()] });
      const uit = await pushEnLeesAlle(page, context, 3);
      const per = Object.fromEntries(uit.map((m) => [m.titel, m]));
      expect(Object.keys(per).sort()).toEqual(['Bloei', 'Drinken', 'Supplementen']);
      expect(per.Drinken).toMatchObject({ pad: '#/drinken', tekst: 'Je zit aan 0,8 l van 2,5 l. Tijd voor een glas water?' });
      expect(per.Supplementen.pad).toBe('#/supplementen');
      expect(per.Supplementen.tekst).toMatch(/^Je supplementen van van(ochtend|middag|avond) staan nog open\.$/);
      expect(per.Bloei.pad).toBe('#/vandaag');
      expect(per.Bloei.tekst).toBe('Nog open voor vandaag: je middagmaal en je avondmaal.');
      expect(new Set(uit.map((m) => m.tag)).size).toBe(3);

      const sw = context.serviceWorkers()[0];
      // Een tik op de melding van Drinken: de app gaat naar Drinken en alleen die melding verdwijnt.
      await sw.evaluate(async () => {
        const n = (await self.registration.getNotifications()).find((x) => x.title === 'Drinken');
        let klaar;
        const e = new Event('notificationclick');
        e.notification = n;
        e.waitUntil = (p) => (klaar = p);
        self.dispatchEvent(e);
        await klaar;
      });
      await expect(page).toHaveURL(/#\/drinken$/);
      const over = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.title).sort());
      expect(over).toEqual(['Bloei', 'Supplementen']);
    });

    test('drie soorten op hetzelfde tijdstip zonder details: een algemene melding, geen drie', async ({ page, context }) => {
      await start(page, context, { settings: [...drieOpNu(), instelling('meldingen.details', false)], supplementen: [supplement()] });
      const uit = await pushEnLeesAlle(page, context, 1);
      expect(uit[0]).toMatchObject({ titel: 'Bloei', tekst: 'Bloei ligt klaar.', pad: '#/vandaag' });
      expect(uit[0].tag).toMatch(/^bloei-algemeen-\d\d:\d\d$/);
    });
  });

  // ---- indeling
  for (const [naam, breedte, hoogte, naast] of [
    ['bureaublad 1690x1230', 1690, 1230, true],
    ['telefoon 390x844', 390, 844, false],
    ['iPad staand 820x1180', 820, 1180, false],
    ['iPad liggend 1180x820', 1180, 820, true],
  ]) {
    test(`indeling op ${naam}: rijen niet uitgerekt, kolommen gelijk, geen leeg vlak, tikvlakken van 44 px`, async ({ page, context }) => {
      await nepPush(context);
      await page.setViewportSize({ width: breedte, height: hoogte });
      await openScherm(page);
      await schakelaar(page, 'hoofd').click();
      await expect(schakelaar(page, 'dagboek')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('.meldingen__slot')).toHaveCount(8); // 714 en 736: Dagboek 1, Eten 1, Drinken 3, Supplementen 3

      const rijen = await page.evaluate(() => [...document.querySelectorAll('.meldingen .instel__lijst > .kaart .rij')].map((r) => r.getBoundingClientRect().height));
      expect(rijen.length).toBeGreaterThanOrEqual(12);
      for (const hoogteRij of rijen) expect(hoogteRij).toBeLessThanOrEqual(72);

      for (const k of await meetKaarten(page, '.meldingen .instelscherm')) expect(k.gat, k.naam).toBeLessThanOrEqual(32);
      const titels = await page.evaluate(() => [document.querySelector('.meldingen .instel__lijst .kaartkop'), document.querySelector('.meldingen .instel__voorbeeld .kaartkop')].map((e) => e.getBoundingClientRect().top));
      if (naast) expect(Math.abs(titels[0] - titels[1])).toBeLessThanOrEqual(2);
      // BESLISSINGEN 322 en 324: losse kaarten; "Goed om te weten" staat in een kolom, direct onder de kaart erboven; de kolommen eindigen gelijk
      await verdeling(page, naast);

      // tikvlakken van minstens 44 px, en tekst in de velden van minstens 16 px (anders zoomt Safari in)
      const klein = await page.evaluate(() =>
        [...document.querySelectorAll('.meldingen [role="switch"], .meldingen .tijdveld__invoer, .meldingen .chip, .meldingen .meldingen__weg, .meldingen .meldingen__toevoegen .knop')]
          .map((e) => [e.className, e.getBoundingClientRect().height, e.getBoundingClientRect().width])
          .filter(([, h, b]) => h < 44 || b < 44),
      );
      expect(klein, JSON.stringify(klein)).toEqual([]);
      const lettertypes = await page.evaluate(() => [...document.querySelectorAll('.meldingen .tijdveld__invoer')].map((e) => parseFloat(getComputedStyle(e).fontSize)));
      for (const px of lettertypes) expect(px).toBeGreaterThanOrEqual(16);

      // geen horizontale scroll
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      // alles uit, en alleen dagboek aan: ook dan eindigen de kolommen gelijk en heeft geen kaart een leeg vlak
      await schakelaar(page, 'hoofd').click();
      await expect(schakelaar(page, 'dagboek')).toHaveAttribute('aria-checked', 'false');
      await verdeling(page, naast);
      await schakelaar(page, 'dagboek').click();
      await expect(schakelaar(page, 'dagboek')).toHaveAttribute('aria-checked', 'true');
      await verdeling(page, naast);
      for (const k of await meetKaarten(page, '.meldingen .instelscherm')) expect(k.gat, k.naam).toBeLessThanOrEqual(32);
    });
  }

  // BESLISSING 324: in elke stand eindigen de kolommen op dezelfde lijn; het voorbeeld toont één kaartje per tijdstip dat aan staat, in tijdsvolgorde.
  const uren = ['08:00', '10:30', '13:00', '15:45'];
  const lijst = (n, aan = true) => uren.slice(0, n).map((uur) => ({ aan, uur }));
  const STANDEN = [
    ['alles uit', { dagboek: { aan: false, uur: '20:00' }, drinken: [], supplementen: [] }],
    ['alleen dagboek', { dagboek: { aan: true, uur: '20:00' }, drinken: [], supplementen: [] }],
    ['drinken 1', { dagboek: { aan: false, uur: '20:00' }, drinken: lijst(1), supplementen: [] }],
    ['drinken 2', { dagboek: { aan: false, uur: '20:00' }, drinken: lijst(2), supplementen: [] }],
    ['drinken 3', { dagboek: { aan: false, uur: '20:00' }, drinken: lijst(3), supplementen: [] }],
    // 714: Dagboek als lijst (tot 3 tijdstippen); de standen hierboven bewaren nog de oude vorm { aan, uur } en tonen zo dat die blijft werken.
    ['alles aan met het maximum', { dagboek: { aan: true, uur: '07:15', tijdstippen: [{ aan: true, uur: '07:15' }, { aan: true, uur: '12:30' }, { aan: true, uur: '20:00' }] }, eten: lijst(3), drinken: lijst(3), supplementen: lijst(3) }], // 736: 3 per soort
  ];
  for (const [breedte, hoogte] of [[1690, 1230], [1440, 900], [1180, 820], [1024, 768]]) {
    test(`kolommen eindigen gelijk op ${breedte}x${hoogte} in elke stand`, async ({ page, context }) => {
      await nepPush(context);
      await page.setViewportSize({ width: breedte, height: hoogte });
      await openScherm(page);
      // BESLISSING 335: elke stand met details uit en aan; BESLISSING 710: ook beide met de vergrendeling aan, die niets meer verandert aan de details
      for (const [naam, s, details, slot] of STANDEN.flatMap(([n, st]) => [[`${n}, details uit`, st, false, false], [`${n}, details aan`, st, true, false], [`${n}, details uit, vergrendeling aan`, st, false, true], [`${n}, details aan, vergrendeling aan`, st, true, true]])) {
        await IDB(page, 'put', { instellingen: [instelling('meldingen.dagboek', s.dagboek), instelling('meldingen.eten', s.eten ?? []), instelling('meldingen.drinken', s.drinken), instelling('meldingen.supplementenUren', s.supplementen), instelling('meldingen.details', details), instelling('slot.aan', false)] });
        await page.reload();
        if (slot) {
          // de vergrendeling staat pas aan nadat de app open is (anders blokkeert het slotscherm); daarna het scherm opnieuw openen
          await IDB(page, 'put', { instellingen: [instelling('slot.aan', true)] });
          await page.goto('./#/vandaag');
          await openScherm(page);
        }
        await expect(page.locator('.meldingen .instelscherm')).toBeVisible();
        await expect(page.locator('.meldingen .meldingen__stapel > .meldingen__melding').first()).toBeVisible();
        const dagboekUren = Array.isArray(s.dagboek.tijdstippen) ? s.dagboek.tijdstippen.filter((k) => k.aan).map((k) => k.uur) : s.dagboek.aan ? [s.dagboek.uur] : [];
        const verwacht = dagboekUren.length + (s.eten ?? []).length + s.drinken.length + s.supplementen.length;
        const m = await verdeling(page, true, { naam });
        const stapel = await page.evaluate(() => [...document.querySelectorAll('.meldingen .meldingen__stapel > .meldingen__melding')].map((e) => [e.getBoundingClientRect().height, e.querySelector('.meldingen__nu').textContent, e.classList.contains('meldingen__melding--gedempt')]));
        // BESLISSING 348: zonder details één kaartje per uniek tijdstip, anders één per soort en tijdstip (710: los van de vergrendeling)
        const alleUren = [...dagboekUren, ...(s.eten ?? []).map((k) => k.uur), ...s.drinken.map((k) => k.uur), ...s.supplementen.map((k) => k.uur)];
        const uniek = new Set(alleUren).size;
        expect(stapel.length, naam).toBe((!details ? uniek : verwacht) || 4); // niets aan: een voorbeeld per soort (736: vier)
        if (!details) expect(new Set(stapel.map((k) => k[1])).size, naam).toBe(stapel.length);
        // geen inkorting met puntjes meer: drie regels mogen
        for (const [hoogteKaartje] of stapel) expect.soft(hoogteKaartje, naam).toBeLessThanOrEqual(112);
        // BESLISSING 335: het voorbeeld volgt de schakelaar; uit staat er in elk kaartje de algemene tekst (710: ook met de vergrendeling aan volgt het de schakelaar)
        const kaartjes = await page.locator('.meldingen .meldingen__stapel > .meldingen__melding').evaluateAll((els) => els.map((e) => [e.querySelector('.meldingen__titel').textContent, e.querySelector('.meldingen__tekst').textContent]));
        // BESLISSING 587 en 588 (goedgekeurd): staat er nog niets aan, dan toont het voorbeeld per soort een eigen meldingstekst (710: ook met de vergrendeling
        // aan); met echte herinneringen zonder details blijft het de algemene tekst (348).
        if (!verwacht) {
          expect(kaartjes.length, naam).toBe(4);
          expect(new Set(kaartjes.map(([, tekst]) => tekst)).size, `${naam}: per soort een eigen tekst`).toBe(4);
          expect(kaartjes.every(([, tekst]) => tekst !== 'Bloei ligt klaar.'), naam).toBe(true);
        } else if (!details) for (const [titel, tekst] of kaartjes) expect([titel, tekst], naam).toEqual(['Bloei', 'Bloei ligt klaar.']);
        else expect(kaartjes.every(([, tekst]) => tekst !== 'Bloei ligt klaar.'), naam).toBe(true);
        const sw = schakelaar(page, 'details');
        await expect(sw, naam).toHaveAttribute('aria-checked', String(details));
        // BESLISSING 710: de vergrendeling blokkeert de schakelaar niet meer en verandert de ondertitel niet; alleen zolang niets aan staat valt er niets te kiezen
        if (!verwacht) await expect(sw, naam).toBeDisabled();
        else await expect(sw, naam).toBeEnabled();
        await expect(page.locator('.meldingen .meldingen__details .schakelaar__uitleg'), naam).toHaveText('Zonder details staat er alleen dat Bloei klaarligt.');
        await expect(page.locator('.meldingen .meldingen__slotnota'), naam).toHaveCount(0);
        if (verwacht) {
          const tijden = stapel.map((k) => k[1]);
          expect(tijden, naam).toEqual([...tijden].sort());
          expect(stapel.some((k) => k[2]), naam).toBe(false);
        }
        const rijen = await page.evaluate(() => [...document.querySelectorAll('.meldingen .instel__lijst .rij')].map((r) => r.getBoundingClientRect().height));
        for (const r of rijen) expect.soft(r, `${naam} ${JSON.stringify(m)}`).toBeLessThanOrEqual(72);
        for (const k of await meetKaarten(page, '.meldingen .instelscherm')) expect.soft(k.gat, `${naam} ${k.naam}`).toBeLessThanOrEqual(32);
      }
      // niets verspringt terwijl een tijdveld focus heeft
      const veld = page.locator('.meldingen__slot input').first();
      await veld.focus();
      const voor = await page.evaluate(() => [document.activeElement.getBoundingClientRect().top, document.querySelector('.meldingen .meldingen__links').getBoundingClientRect().bottom]);
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      const na = await page.evaluate(() => [document.activeElement.getBoundingClientRect().top, document.querySelector('.meldingen .meldingen__links').getBoundingClientRect().bottom]);
      expect(na[0]).toBeCloseTo(voor[0], 0);
      expect(na[1]).toBeCloseTo(voor[1], 0);
    });
  }
});

// ===================================================================== algemeen (beide versies)
test('Algemeen heeft de rij Herinneringen en de kaart "Jouw instellingen" is even hoog als "Over"', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/meer');
  const rij = page.locator('.meer__menu .rij', { hasText: 'Herinneringen' });
  await expect(rij).toContainText('Een melding op het uur dat jij kiest');
  const maten = await page.evaluate(() => ({
    menu: document.querySelector('.meer__menu').getBoundingClientRect().height,
    over: document.querySelector('.over').getBoundingClientRect().height,
  }));
  expect(Math.abs(maten.menu - maten.over)).toBeLessThanOrEqual(1);
  await rij.click();
  await expect(page).toHaveURL(/#\/meer\/meldingen$/);
});
