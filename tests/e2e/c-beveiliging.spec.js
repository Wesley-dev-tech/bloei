// Beveiliging en privacy van de gebouwde app (BESLISSING 329): injectie, het slot (gordijn en DOM), de pincode in de opslag,
// wissen, en dat er bij geen enkele handeling iets naar een ander adres gaat. Aanvulling op c-privacy, c-slot en c-meldingen.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { animatiesKlaar, domRustig, schermKlaar } from './wacht.js';
import { wachtTotStil, maaltijdblad } from './r-wacht.js';
import { vasteKlok } from './vaste-klok.js';
import { aanbod, authenticator, instelling, rondAf, stap, tik, zetPk, zetSessie } from './slot-hulp.js';

const OORSPRONG = `http://localhost:${process.env.PW_POORT || '4173'}`;
const CODE = '482915';

// Tekst die html of pdf-opmaak probeert te zijn, met emoji en vreemde tekens.
const HTML = `<img src=x onerror="window.__xss='img'"> "><svg onload="window.__xss='svg'"> <script>window.__xss='script'</script>`;
const RAAR = String.raw`(haakje) \backslash 🍲🥖 ‮omgekeerd‬ ZWJ‍teken ﷽`;
const MERK = 'Merkteken-dagboek-7Q';

// Verzamelt verzoeken naar een andere oorsprong, CSP-overtredingen en paginafouten.
function bewaak(page) {
  const uit = { vreemd: [], csp: [], fouten: [] };
  page.on('request', (v) => {
    const url = new URL(v.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== OORSPRONG) uit.vreemd.push(v.url());
  });
  page.on('console', (b) => /content security policy|refused to/i.test(b.text()) && uit.csp.push(b.text()));
  page.on('pageerror', (e) => uit.fouten.push(String(e)));
  return uit;
}

// Schrijft rechtstreeks in de database van de app (zoals ze na het invullen zou staan).
async function vul(page, { naam = HTML.slice(0, 60), tekst = HTML } = {}) {
  await page.evaluate(
    async ({ naam, tekst, raar, merk }) => {
      const nu = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const vandaag = `${nu.getFullYear()}-${p(nu.getMonth() + 1)}-${p(nu.getDate())}`;
      const db = await new Promise((klaar, mis) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onsuccess = () => klaar(q.result);
        q.onerror = () => mis(q.error);
      });
      const tx = db.transaction(['maaltijden', 'dagen', 'supplementen', 'favorieten', 'instellingen'], 'readwrite');
      const zet = (store, rij) => tx.objectStore(store).put(rij);
      const t = Date.now();
      zet('maaltijden', { datum: vandaag, soort: 'ontbijt', tijd: '08:00', tekst: tekst + ' ' + merk, fotoId: null, gevoel: 3, voorbeeld: false, gewijzigdOp: t });
      zet('maaltijden', { datum: vandaag, soort: 'middagmaal', tijd: '12:00', tekst: raar + ' ' + 'x'.repeat(2500), fotoId: null, gevoel: 3, voorbeeld: false, gewijzigdOp: t });
      zet('dagen', { datum: vandaag, notitie: tekst + '\n' + raar, stemming: 3, energie: 3, doelGehaald: false, voorbeeld: false, gewijzigdOp: t });
      zet('supplementen', { naam: tekst.slice(0, 80), dosis: tekst, hoeveelheid: raar.slice(0, 60), aanwijzing: tekst.slice(0, 60), momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: t });
      zet('favorieten', { tekst, sleutel: tekst.toLowerCase(), laatstGebruikt: t });
      zet('instellingen', { sleutel: 'profiel.naam', waarde: naam });
      zet('instellingen', { sleutel: 'delen.onderdelen', waarde: { eten: true, drinken: true, gewicht: false, notities: true } });
      await new Promise((klaar) => (tx.oncomplete = klaar));
      db.close();
    },
    { naam, tekst, raar: RAAR, merk: MERK },
  );
}

// Geen enkel element draagt een handler als attribuut, er is geen ingevoegde img/svg/script, en __xss bleef leeg.
async function geenUitgevoerdeHtml(page) {
  return page.evaluate(() => {
    const metHandler = [...document.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => /^on/i.test(a.name))).map((el) => el.tagName);
    return {
      xss: window.__xss ?? null,
      metHandler,
      imgX: document.querySelectorAll('img[src="x"]').length,
      scripts: [...document.querySelectorAll('script')].filter((s) => !s.src && !/bloei-thema/.test(s.textContent)).length,
    };
  });
}

test.describe('injectie', () => {
  test('html, lange tekst, emoji en vreemde tekens in naam, maaltijd, notitie, supplement en favoriet: op geen enkel scherm uitgevoerd of als opmaak getoond', async ({ page }) => {
    const b = bewaak(page);
    await page.goto('./#/vandaag');
    await expect(page.locator('#scherm')).toBeVisible();
    await vul(page);
    const vandaag = await page.evaluate(() => {
      const n = new Date();
      const p = (x) => String(x).padStart(2, '0');
      return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
    });
    let letterlijkGezien = 0;
    for (const route of ['vandaag', 'dagboek', `dagboek/dag/${vandaag}`, 'drinken', 'supplementen', 'gewicht', 'meer', 'meer/profiel', 'meer/favorieten', 'delen']) {
      await page.goto('./#/' + route);
      await page.reload();
      await expect(page.locator('#scherm')).toBeVisible();
      await domRustig(page); // het scherm is uitgebouwd, met alle gegevens erin (geen vaste wachttijd)
      expect(await geenUitgevoerdeHtml(page), route).toEqual({ xss: null, metHandler: [], imgX: 0, scripts: 0 });
      const tekst = await page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('textarea, input')].map((i) => i.value).join(' '));
      if (tekst.includes('<script>') || tekst.includes('<img src=x')) letterlijkGezien += 1;
    }
    // De tekst staat er letterlijk (als tekst), op meerdere schermen.
    expect(letterlijkGezien).toBeGreaterThanOrEqual(3);
    expect(b.csp).toEqual([]);
    expect(b.fouten).toEqual([]);
    expect(b.vreemd).toEqual([]);
  });

  test('het verslag met zulke tekst: het voorbeeld voert niets uit, de pdf is geldig en de bestandsnaam bevat geen tekst van de gebruiker', async ({ page }) => {
    const b = bewaak(page);
    await page.goto('./#/vandaag');
    await expect(page.locator('#scherm')).toBeVisible();
    await vul(page);
    await page.goto('./#/delen');
    await page.reload();
    await expect(page.locator('#scherm')).toBeVisible();
    expect(await geenUitgevoerdeHtml(page)).toEqual({ xss: null, metHandler: [], imgX: 0, scripts: 0 });
    const bewaar = page.getByRole('button', { name: 'Bewaren', exact: true });
    await expect(bewaar).toBeEnabled({ timeout: 15000 });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), bewaar.click()]);
    expect(download.suggestedFilename()).toMatch(/^bloei-verslag-\d{4}-\d{2}-\d{2}(-\d{4}-\d{2}-\d{2})?\.pdf$/);
    const pdf = readFileSync(await download.path()).toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).not.toContain('<script>');
    expect(await geenUitgevoerdeHtml(page)).toEqual({ xss: null, metHandler: [], imgX: 0, scripts: 0 });
    expect(b.csp).toEqual([]);
    expect(b.vreemd).toEqual([]);
  });
});

// ---- de vergrendeling ----
// BESLISSING 518 en 541: na de twee keer zes cijfers de herstelcode met het vinkje "Ik heb ze bewaard" en Verder (rondAf, slot-hulp.js); er is geen vraag
// meer om het toestel te koppelen. Pas daarna staat het slot aan. Geeft de getoonde herstelcode.
async function zetSlotAan(page) {
  await page.goto('./#/meer/vergrendeling');
  await page.getByRole('switch', { name: /^Bloei vergrendelen/ }).click();
  await tik(page, CODE);
  await tik(page, CODE);
  const herstelcode = await rondAf(page);
  await expect(page.getByRole('switch', { name: /^Bloei vergrendelen/ })).toHaveAttribute('aria-checked', 'true');
  return herstelcode;
}
// De stand van het slot en de app (verborgen of niet), om te wachten tot die na een blur of een terugkeer niet meer verandert.
const slotStand = (page) => page.evaluate(() => [document.getElementById('slot')?.hidden ?? null, document.getElementById('app')?.hidden ?? null, document.getElementById('slot')?.className ?? null]);
async function alleOpslag(page) {
  return page.evaluate(async () => {
    const uit = { idb: {}, local: { ...localStorage }, session: { ...sessionStorage } };
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
    return uit;
  });
}

test.describe('vergrendeling', () => {
  test('de pincode staat nergens leesbaar in de opslag (IndexedDB, localStorage, sessionStorage)', async ({ page }) => {
    await zetSlotAan(page);
    const alles = JSON.stringify(await alleOpslag(page));
    expect(alles).not.toContain(CODE);
    const pin = (await alleOpslag(page)).idb['bloei-dagboek/instellingen'].find((r) => r.sleutel === 'slot.pin').waarde;
    expect(Object.keys(pin).sort()).toEqual(['hash', 'lengte', 'rondes', 'zout']);
  });

  test('bij het openen staat er nooit iets van het dagboek in de pagina, de titel of de toegankelijkheidsboom, ook niet heel even', async ({ page }) => {
    await page.goto('./#/vandaag');
    await expect(page.locator('#scherm')).toBeVisible();
    await vul(page, { tekst: 'ontbijt', naam: 'Testnaam' });
    await zetSlotAan(page);
    // Vanaf het eerste ogenblik van de volgende lading: elke wijziging in de pagina en de titel nakijken op het merkteken.
    await page.addInitScript((merk) => {
      window.__gezien = [];
      const kijk = () => {
        const html = document.documentElement?.outerHTML ?? '';
        if (html.includes(merk) || document.title.includes(merk)) window.__gezien.push(performance.now());
      };
      new MutationObserver(kijk).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
    }, MERK);
    await page.goto('./#/vandaag');
    await page.reload();
    await expect(page.locator('.cijferblok')).toBeVisible();
    // Geen vaste wachttijd: het slot is opgekomen en de pagina is stil. Achter het slot tekent de app niets (toonRoute stopt meteen):
    // er is geen later moment waarop het dagboek nog zou kunnen verschijnen.
    await animatiesKlaar(page);
    await domRustig(page);
    expect(await page.evaluate(() => window.__gezien.length)).toBe(0);
    expect(await page.title()).toBe('Bloei');
    // De toegankelijkheidsboom toont alleen het slot.
    const boom = await page.locator('body').ariaSnapshot();
    expect(boom).not.toContain(MERK);
    expect(boom).not.toMatch(/Vandaag|Dagboek|Drinken|Supplementen|Gewicht/);
    // Na de juiste code komt het dagboek wel.
    await tik(page, CODE);
    await expect(page.locator('#tabbalk')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__gezien.length)).toBeGreaterThan(0);
  });

  test('naar de achtergrond: het gordijn ligt er meteen (in dezelfde tik, zonder te wachten op de database), en niets is zichtbaar of bereikbaar', async ({ page }) => {
    await page.goto('./#/vandaag');
    await vul(page, { tekst: 'ontbijt', naam: 'Testnaam' });
    await zetSlotAan(page);
    await page.goto('./#/vandaag');
    await page.reload();
    await tik(page, CODE);
    await expect(page.locator('#tabbalk')).toBeVisible();
    // BESLISSING 532: focusverlies (blur) alleen vergrendelt niet meer; zie de eigen test hieronder.
    for (const gebeurtenis of ['visibilitychange', 'pagehide']) {
      // Synchroon: meteen na het event, zonder await, moet het gordijn er al liggen.
      const meteen = await page.evaluate((g) => {
        if (g === 'visibilitychange') {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        } else window.dispatchEvent(new Event(g));
        const app = document.getElementById('app');
        return { slot: !document.getElementById('slot').hidden, appVerborgen: app.hidden && app.inert, tekst: document.body.innerText };
      }, gebeurtenis);
      expect(meteen.slot, gebeurtenis).toBe(true);
      expect(meteen.appVerborgen, gebeurtenis).toBe(true);
      expect(meteen.tekst, gebeurtenis).not.toContain(MERK);
      expect(meteen.tekst, gebeurtenis).not.toContain('Vandaag');
      expect(await page.locator('body').ariaSnapshot()).not.toMatch(/Vandaag|Drinken|Supplementen/);
      // Terug: het slot vraagt de code en daarna gaat het weer open.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });
      await expect(page.locator('.cijferblok')).toBeVisible();
      await tik(page, CODE);
      await expect(page.locator('#tabbalk')).toBeVisible();
    }
  });

  // BESLISSING 532 ("Nooit, alleen bij echt verlaten"): focusverlies terwijl de pagina zichtbaar blijft (een schermafbeeldingsprogramma, een
  // ander venster) vergrendelt niet: geen gordijn, geen code, de pagina blijft zoals ze was. Even streng als de test hierboven, omgekeerd.
  test('blur zonder verbergen: geen gordijn, de app zichtbaar en bereikbaar, het dagboek blijft in de pagina; ook na lange tijd en bij terugkeer van de focus', async ({ page }) => {
    await vasteKlok(page);
    await openMetSlot(page);
    await expect(page.locator('#scherm')).toContainText(MERK);
    await domRustig(page);
    const stand = () =>
      page.evaluate((merk) => {
        const app = document.getElementById('app');
        return {
          slotVerborgen: document.getElementById('slot').hidden,
          gordijn: document.getElementById('slot').classList.contains('slot--gordijn'),
          appZichtbaar: !app.hidden && !app.inert && getComputedStyle(app).display !== 'none',
          merkInPagina: document.documentElement.outerHTML.includes(merk) && document.body.innerText.includes(merk),
          cijferblok: document.querySelectorAll('.cijferblok').length,
        };
      }, MERK);
    const verwacht = { slotVerborgen: true, gordijn: false, appZichtbaar: true, merkInPagina: true, cijferblok: 0 };
    await page.evaluate(() => (document.getElementById('scherm').firstElementChild.__oud = true));
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    // synchroon, in dezelfde tik: er ligt niets
    expect(await stand()).toEqual(verwacht);
    expect(await page.locator('body').ariaSnapshot()).toContain('Vandaag');
    await page.clock.runFor(60 * 60 * 1000); // een uur zonder focus
    expect(await stand()).toEqual(verwacht);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.clock.runFor(1000);
    expect(await stand()).toEqual(verwacht);
    expect(await page.evaluate(() => document.getElementById('scherm').firstElementChild.__oud === true)).toBe(true);
  });

  test('blur en daarna echt verlaten (verborgen): meteen het gordijn, de pagina leeg, niets in de toegankelijkheidsboom; bij terugkeer de code', async ({ page }) => {
    await vasteKlok(page);
    await openMetSlot(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.clock.runFor(60 * 1000);
    const meteen = await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      const app = document.getElementById('app');
      return { slot: !document.getElementById('slot').hidden, appVerborgen: app.hidden && app.inert, kinderen: document.getElementById('scherm').childElementCount, tekst: document.body.innerText };
    });
    expect(meteen.slot).toBe(true);
    expect(meteen.appVerborgen).toBe(true);
    expect(meteen.kinderen).toBe(0);
    expect(meteen.tekst).not.toContain(MERK);
    expect(await page.locator('body').ariaSnapshot()).not.toMatch(/Vandaag|Drinken|Supplementen/);
    expect(await page.evaluate((merk) => document.documentElement.outerHTML.includes(merk), MERK)).toBe(false);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect(page.locator('.cijferblok')).toBeVisible();
    await tik(page, CODE);
    await expect(page.locator('#scherm')).toContainText(MERK);
  });

  test('blur terwijl een nieuwe herstelcode openstaat: niets verdwijnt en er komt geen slot; pas echt verlaten haalt de herstelcode uit de pagina', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'geen');
    await zetSlotAan(page);
    await page.getByRole('button', { name: 'Nieuwe herstelcode maken' }).click();
    await tik(page, CODE);
    await expect(stap(page)).toBeVisible();
    const code = await stap(page).locator('.herstel__code').textContent();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.clock.runFor(10 * 60 * 1000);
    await expect(page.locator('#slot')).toBeHidden();
    await expect(stap(page)).toBeVisible();
    await expect(stap(page).locator('.herstel__code')).toHaveText(code.trim());
    // echt verlaten: de code gaat uit de pagina
    await verberg(page);
    expect(await page.evaluate((c) => document.documentElement.outerHTML.includes(c.trim()), code)).toBe(false);
    await expect(page.locator('#slot')).toBeVisible();
  });

  test('met het slot uit blijft de app open bij een blur of naar de achtergrond', async ({ page }) => {
    await page.goto('./#/vandaag');
    await expect(page.locator('#tabbalk')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    // Geen vaste wachttijd: bij een blur kijkt het slot één keer in de database of het aan staat; wacht tot het slot en de app
    // niet meer veranderen (een gordijn zou er dan al liggen).
    await wachtTotStil(page, () => slotStand(page));
    await expect(page.locator('#slot')).toBeHidden();
  });

  test('na "alles wissen" vanuit het slot komt er geen slot meer bij een blur', async ({ page }) => {
    await authenticator(page, 'ok'); // BESLISSING 631: wissen vanuit het slot vraagt het toestel
    await zetSlotAan(page);
    await page.goto('./#/vandaag');
    await page.reload();
    await expect(page.locator('.cijferblok')).toBeVisible();
    await page.getByRole('button', { name: /code niet meer/i }).click();
    await page.locator('#slot').getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
    await page.locator('#slot').getByRole('button', { name: 'Doorgaan' }).click();
    await page.locator('#slot').getByRole('button', { name: 'Alles wissen', exact: true }).click();
    await expect(page.locator('[data-scherm="welkom"]')).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await wachtTotStil(page, () => slotStand(page)); // zie hierboven: het slot en de app veranderen niet meer (geen vaste wachttijd)
    await expect(page.locator('#slot')).toBeHidden();
  });
});

test.describe('wissen', () => {
  test('Profiel verwijderen: elke opslag is leeg (IndexedDB, localStorage, sessionStorage), de caches houden alleen app-bestanden, en de app start met het welkomscherm', async ({ page }) => {
    const b = bewaak(page);
    await page.goto('./#/vandaag');
    await expect(page.locator('#scherm')).toBeVisible();
    await vul(page, { tekst: 'ontbijt ' + MERK, naam: 'Testnaam' });
    await page.evaluate((merk) => {
      localStorage.setItem('bloei-uitleg', '{"x":1}');
      sessionStorage.setItem('iets', merk);
    }, MERK);
    await page.goto('./#/meer');
    await page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Ja, verwijder mijn profiel' }).click();
    const laatste = dlg.getByRole('button', { name: 'Ja, verwijder mijn profiel' });
    await expect(laatste).toBeEnabled({ timeout: 4000 });
    await laatste.click();
    await expect(page.locator('[data-scherm="welkom"]')).toBeVisible();

    const opslag = await alleOpslag(page);
    // Wat de app bij het opstarten zelf terugschrijft (migratievlaggen) is geen gegeven van haar.
    for (const [naam, rijen] of Object.entries(opslag.idb)) {
      const eigen = naam.endsWith('/instellingen') ? rijen.filter((r) => !/Omgezet$|uitgebreid$/.test(r.sleutel)) : rijen;
      expect(eigen, naam).toEqual([]);
    }
    expect(JSON.stringify(opslag)).not.toContain(MERK);
    expect(JSON.stringify(opslag)).not.toContain('Testnaam');
    expect(Object.keys(opslag.session)).toEqual([]);
    for (const s of Object.keys(opslag.local)) expect(['bloei-thema', 'bloei-vandaag-open']).toContain(s);
    const cache = await page.evaluate(async () => {
      const uit = [];
      for (const naam of await caches.keys()) for (const v of await (await caches.open(naam)).keys()) uit.push(new URL(v.url).pathname);
      return uit;
    });
    // App-bestanden, plus precies twee vaste tekstbestanden bij naam (BESLISSING 427: de licenties ook offline; robots.txt), zoals in c-privacy.
    for (const pad of cache) if (!['/licenties-derden.txt', '/robots.txt'].includes(pad)) expect(pad).toMatch(/\.(js|css|html|svg|png|woff2?|webmanifest)$|\/$/);
    expect(b.vreemd).toEqual([]);
  });
});

// ---- het slot leegt de pagina (voorstel C) ----
const verberg = (page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
const toonWeer = (page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
async function ontgrendel(page) {
  await expect(page.locator('.cijferblok')).toBeVisible();
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
}
const vandaagSleutel = (page) =>
  page.evaluate(() => {
    const n = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
  });
const leesDb = (page, store, sleutel) =>
  page.evaluate(
    ([store, sleutel]) =>
      new Promise((klaar) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onsuccess = () => {
          const r = q.result.transaction(store).objectStore(store).get(sleutel);
          r.onsuccess = () => {
            q.result.close();
            klaar(r.result ?? null);
          };
        };
      }),
    [store, sleutel],
  );
// Met het slot aan en open, op een scherm.
async function openMetSlot(page, route = 'vandaag') {
  await page.goto('./#/vandaag');
  await expect(page.locator('#scherm')).toBeVisible();
  await vul(page, { tekst: 'ontbijt ' + MERK, naam: 'Testnaam' });
  await zetSlotAan(page);
  await page.goto('./#/' + route);
  await page.reload();
  await ontgrendel(page);
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', route);
}

test.describe('het slot haalt het dagboek uit de pagina', () => {
  // BESLISSING 715: na het slot opent de app ALTIJD op Vandaag, bovenaan (ook na een seconde weg); vroeger (465) dezelfde scrollstand.
  test('achter het slot staat er niets meer in de pagina; na het openen Vandaag bovenaan, dezelfde gegevens en de focus op het scherm', async ({ page }) => {
    const b = bewaak(page);
    await openMetSlot(page);
    await expect(page.locator('#scherm')).toContainText(MERK);
    const hoogte = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const doel = Math.min(500, Math.floor(hoogte / 2));
    expect(doel).toBeGreaterThan(50);
    // De stijl zet scroll-behavior: smooth: zonder 'instant' bewaarde het slot een stand halverwege het glijden (wisselvallig, 58 of 389 in plaats van het doel).
    await page.evaluate((y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' }), doel);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThanOrEqual(doel - 2);
    await verberg(page);
    const dicht = await page.evaluate((merk) => ({
      kinderen: document.getElementById('scherm').childElementCount,
      inPagina: document.documentElement.outerHTML.includes(merk),
      titel: document.title,
    }), MERK);
    expect(dicht).toEqual({ kinderen: 0, inPagina: false, titel: 'Bloei' });
    await toonWeer(page);
    await expect(page.locator('.cijferblok')).toBeVisible();
    expect(await page.evaluate((merk) => document.documentElement.outerHTML.includes(merk), MERK)).toBe(false);
    expect(await page.title()).toBe('Bloei');
    await tik(page, CODE);
    await expect(page.locator('#tabbalk')).toBeVisible();
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'vandaag');
    await expect(page.locator('#scherm')).toContainText(MERK);
    // BESLISSING 715: bovenaan, niet meer op de stand van voor het slot. Wacht een herstel af dat eventueel nog laat zou komen.
    await domRustig(page);
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('scherm');
    expect(await page.title()).not.toBe('');

    // BESLISSING 715: ook vanaf een ander scherm opent het slot op Vandaag; en ook daar staat achter het slot niets van het dagboek.
    await page.goto('./#/meer/profiel');
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'meer/profiel');
    await verberg(page);
    expect(await page.evaluate((merk) => document.documentElement.outerHTML.includes(merk) || document.getElementById('scherm').childElementCount > 0, MERK)).toBe(false);
    await toonWeer(page);
    await ontgrendel(page);
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'vandaag');
    await expect(page.locator('#scherm')).toContainText(MERK);
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBeLessThanOrEqual(2);
    expect(b.fouten).toEqual([]);
  });

  test('een gewone blur (desktop) leegt niets en tekent niets opnieuw', async ({ page }) => {
    await openMetSlot(page);
    await expect(page.locator('#scherm .maaltijd').first()).toBeVisible();
    await domRustig(page); // het scherm is uitgebouwd: een late tekening verving anders het gemerkte element (wisselvallig, 1 op 135)
    await page.evaluate(() => (document.getElementById('scherm').firstElementChild.__oud = true));
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('#slot')).toBeHidden(); // BESLISSING 532: een blur vergrendelt niet meer
    expect(await page.evaluate(() => document.getElementById('scherm').childElementCount)).toBeGreaterThan(0);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('#slot')).toBeHidden();
    expect(await page.evaluate(() => document.getElementById('scherm').firstElementChild.__oud === true)).toBe(true);
  });

  test('met het slot uit: naar de achtergrond en terug laat de pagina staan zoals ze was', async ({ page }) => {
    await page.goto('./#/vandaag');
    await expect(page.locator('#tabbalk')).toBeVisible();
    await expect(page.locator('#scherm .maaltijd').first()).toBeVisible();
    await page.evaluate(() => (document.getElementById('scherm').firstElementChild.__oud = true));
    await verberg(page);
    await toonWeer(page);
    await wachtTotStil(page, () => slotStand(page)); // het slot en de app veranderen niet meer (geen vaste wachttijd)
    await expect(page.locator('#slot')).toBeHidden();
    expect(await page.evaluate(() => document.getElementById('scherm').firstElementChild?.__oud === true)).toBe(true);
  });

  // BESLISSING 715: een veld op het scherm zelf (geen venster) houdt het scherm niet vast: na het slot staat Vandaag er. Daarom per
  // geval: de waarde staat in de database, en wie daarna terug naar het scherm gaat, ziet ze er staan. Een herlading opent ook Vandaag.
  test('geen verlies van invoer: maaltijd, notitie, naam, dagdoel, kan water en streefgewicht, net getypt en meteen op slot', async ({ page }) => {
    await openMetSlot(page);
    const dag = await vandaagSleutel(page);

    // Maaltijd op Vandaag (bewaart 400 ms na de laatste toets)
    await page.goto('./#/vandaag');
    const volgende = page.locator('.maaltijd.is-uitgelicht');
    const soort = await volgende.getAttribute('data-soort');
    await volgende.locator('> .rij').click();
    await maaltijdblad(page, soort).locator('textarea').fill('net getypt maaltijd'); // BESLISSING 419: het invulvenster is een blad
    await verberg(page);
    await toonWeer(page);
    await ontgrendel(page);
    expect((await leesDb(page, 'maaltijden', [dag, soort]))?.tekst).toBe('net getypt maaltijd');
    await expect(page.locator('#scherm')).toContainText('net getypt maaltijd');

    // Notitie op de dag
    await page.goto(`./#/dagboek/dag/${dag}`);
    await page.getByRole('textbox', { name: 'Nog iets over vandaag?' }).fill('net getypt notitie');
    await verberg(page);
    await toonWeer(page);
    await ontgrendel(page);
    expect((await leesDb(page, 'dagen', dag))?.notitie).toBe('net getypt notitie');
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'vandaag');
    await page.goto(`./#/dagboek/dag/${dag}`);
    await expect(page.getByRole('textbox', { name: 'Nog iets over vandaag?' })).toHaveValue('net getypt notitie');

    // Naam
    await page.goto('./#/meer/profiel');
    await page.getByRole('textbox', { name: 'Je naam' }).fill('Nieuwenaam');
    await verberg(page);
    await toonWeer(page);
    await ontgrendel(page);
    expect((await leesDb(page, 'instellingen', 'profiel.naam'))?.waarde).toBe('Nieuwenaam');
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'vandaag');
    await page.goto('./#/meer/profiel');
    await expect(page.getByRole('textbox', { name: 'Je naam' })).toHaveValue('Nieuwenaam');

    // Dagdoel en kan water (stappers, bewaren uitgesteld)
    await page.goto('./#/meer/instellingen');
    const voorDoel = (await leesDb(page, 'instellingen', 'drinken.dagdoelMl'))?.waarde ?? 2500;
    const voorGlas = (await leesDb(page, 'instellingen', 'drinken.glasMl'))?.waarde ?? 800;
    await page.getByRole('button', { name: /, Dagdoel$/ }).last().click();
    await page.getByRole('button', { name: /, Grootte van een kan water$/ }).last().click();
    await verberg(page);
    await toonWeer(page);
    await ontgrendel(page);
    expect((await leesDb(page, 'instellingen', 'drinken.dagdoelMl'))?.waarde).toBeGreaterThan(voorDoel);
    expect((await leesDb(page, 'instellingen', 'drinken.glasMl'))?.waarde).toBeGreaterThan(voorGlas);

    // Streefgewicht (stapper, bewaren uitgesteld)
    await page.evaluate(
      () =>
        new Promise((klaar) => {
          const q = indexedDB.open('bloei-dagboek');
          q.onsuccess = () => {
            const tx = q.result.transaction('instellingen', 'readwrite');
            tx.objectStore('instellingen').put({ sleutel: 'gewicht.streefKg', waarde: 65 });
            tx.oncomplete = () => {
              q.result.close();
              klaar();
            };
          };
        }),
    );
    await page.goto('./#/meer/gewicht');
    await page.reload();
    await ontgrendel(page);
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'vandaag'); // BESLISSING 715: een herlading opent Vandaag
    await page.goto('./#/meer/gewicht');
    await page.getByRole('button', { name: /, Streefgewicht$/ }).last().click();
    await verberg(page);
    await toonWeer(page);
    await ontgrendel(page);
    expect((await leesDb(page, 'instellingen', 'gewicht.streefKg'))?.waarde).toBeGreaterThan(65);
  });

  // Een half ingevuld venster zou bij het opruimen van het scherm zonder bewaren dichtgaan; dan blijft de pagina liever staan (verborgen,
  // inert, niet in de toegankelijkheidsboom) tot het slot opengaat.
  // BESLISSING 715: met onbewaarde invoer in een venster blijft het scherm staan; zonder zo'n venster opent het slot op Vandaag.
  test('een open venster met invoer blijft staan en komt terug; een venster zonder invoer gaat dicht', async ({ page }) => {
    await openMetSlot(page);
    // Na een herlading staat Vandaag er (715): het scherm Supplementen openen we daarna, binnen het bezoek.
    await page.goto('./#/supplementen');
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'supplementen');
    await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
    await page.getByRole('dialog').getByRole('textbox', { name: 'Naam' }).fill('Half getypt');
    await verberg(page);
    expect(await page.locator('body').ariaSnapshot()).not.toContain('Half getypt');
    await toonWeer(page);
    await ontgrendel(page);
    await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Naam' })).toHaveValue('Half getypt');
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'supplementen');
    // Netjes afsluiten zonder te bewaren.
    await page.getByRole('dialog').getByRole('button', { name: 'Annuleren' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Niet bewaren' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Zonder invoer: de vraag "Profiel verwijderen" gaat dicht bij het slot en komt niet terug.
    await page.goto('./#/meer');
    await page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await verberg(page);
    expect(await page.evaluate(() => document.querySelectorAll('dialog[open]').length)).toBe(0);
    await toonWeer(page);
    await ontgrendel(page);
    expect(await page.evaluate(() => document.querySelectorAll('dialog[open]').length)).toBe(0);
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'vandaag'); // BESLISSING 715: geen invoer, dus Vandaag
  });

  test('een andere hash achter het slot tekent niets; na het openen staat het nieuwe scherm er, één keer getekend', async ({ page }) => {
    await openMetSlot(page);
    await verberg(page);
    // Geen vaste wachttijd: wacht tot de hashchange echt verwerkt is (de app luistert eerder dan deze luisteraar) en getekend zou zijn.
    await page.evaluate(
      () =>
        new Promise((klaar) => {
          window.addEventListener('hashchange', () => requestAnimationFrame(() => requestAnimationFrame(klaar)), { once: true });
          window.location.hash = '#/drinken';
        }),
    );
    expect(await page.evaluate(() => document.getElementById('scherm').childElementCount)).toBe(0);
    await page.evaluate(() => {
      window.__tekeningen = 0;
      new MutationObserver((l) => l.forEach((m) => m.target.id === 'scherm' && m.addedNodes.length && (window.__tekeningen += 1))).observe(document.getElementById('scherm'), { childList: true });
    });
    await toonWeer(page);
    await ontgrendel(page);
    await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'drinken');
    await domRustig(page); // het scherm is uitgebouwd: elke tekening is dan geteld (geen vaste wachttijd)
    expect(await page.evaluate(() => window.__tekeningen)).toBeLessThanOrEqual(2); // de schil en de inhoud van één tekening
  });

  test('een lopende rondleiding stopt netjes bij het slot en start niet vanzelf opnieuw', async ({ page }) => {
    const b = bewaak(page);
    await openMetSlot(page);
    await page.getByRole('button', { name: 'Rondleiding van dit scherm' }).first().click();
    await expect(page.locator('.uitleg__kaart[role="dialog"]')).toBeVisible();
    await verberg(page);
    await expect(page.locator('.uitleg__kaart[role="dialog"]')).toHaveCount(0);
    await toonWeer(page);
    await ontgrendel(page);
    // Een rondleiding start vanzelf 250 ms nadat een scherm getekend is (wachtOpEerste in src/uitleg/rondleiding.js). Geen vaste
    // wachttijd: het scherm blijft langer stil dan die 250 ms, dus een automatische start had al plaatsgevonden.
    await domRustig(page, { rust: 400 });
    await expect(page.locator('.uitleg__kaart[role="dialog"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rondleiding van dit scherm' }).first()).toBeVisible();
    expect(b.fouten).toEqual([]);
  });
});

// ---- controle van 16 november: het slot na een systeemvenster, en kapotte adressen ----
test.describe('het slot na een systeemvenster (deelmenu)', () => {
  // De vrijstelling van een systeemvenster mag het slot niet blijvend uitschakelen: ging de pagina tijdens het deelmenu naar de
  // achtergrond en kwam ze niet terug voor de vrijstelling afliep (Android: het verslag staat nu in de gekozen app), dan gaat het slot alsnog dicht.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__verschil = 0;
      const echt = Date.now.bind(Date);
      Date.now = () => echt() + window.__verschil;
      navigator.share = () => new Promise((klaar) => (window.__deelKlaar = klaar));
    });
  });

  test('het deelmenu sluit terwijl de pagina op de achtergrond staat: het slot gaat dicht en de pagina wordt geleegd', async ({ page }) => {
    await openMetSlot(page);
    await page.evaluate(() => {
      window.__deel = navigator.share({ title: 'verslag' });
    });
    await verberg(page);
    await expect(page.locator('#slot')).toBeHidden(); // vrijgesteld: het deelmenu ligt erover
    await page.evaluate(() => window.__deelKlaar());
    // Na de korte marge van de vrijstelling ligt het slot er, en staat er niets meer van het dagboek in de pagina.
    await expect(page.locator('#slot')).toBeVisible({ timeout: 4000 });
    expect(await page.evaluate((merk) => document.documentElement.outerHTML.includes(merk), MERK)).toBe(false);
    await toonWeer(page);
    await ontgrendel(page);
    await expect(page.locator('#scherm')).toContainText(MERK);
  });

  test('een deelmenu dat blijft hangen tot de vrijstelling verloopt: bij terugkeer vraagt het slot de code', async ({ page }) => {
    await openMetSlot(page);
    await page.evaluate(() => {
      window.__deel = navigator.share({ title: 'verslag' });
    });
    await verberg(page);
    await page.evaluate(() => (window.__verschil = 4 * 60 * 1000)); // voorbij het maximum van drie minuten
    await toonWeer(page);
    await expect(page.locator('.cijferblok')).toBeVisible({ timeout: 4000 });
    expect(await page.evaluate((merk) => document.documentElement.outerHTML.includes(merk), MERK)).toBe(false);
  });

  test('een gewoon deelmenu (de pagina komt terug terwijl het nog open is) zet de app niet op slot', async ({ page }) => {
    await openMetSlot(page);
    await page.evaluate(() => {
      window.__deel = navigator.share({ title: 'verslag' });
    });
    await verberg(page);
    await toonWeer(page);
    await page.evaluate(() => window.__deelKlaar());
    await page.waitForTimeout(2000);
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.locator('#scherm')).toContainText(MERK);
  });
});

test.describe('kapotte of vreemde adressen', () => {
  // BESLISSING 721: een herlading houdt het scherm, dus de hash wordt ook bij een herlading gelezen. Elke hash krijgt een eigen, nieuw tabblad
  // (een verse start met die hash), en daarna nog een herlading: hetzelfde scherm, weer zonder vast te lopen.
  test('een kapotte %-reeks of een erfde naam in de hash laat de app niet vastlopen', async ({ context }) => {
    for (const [hash, scherm] of [
      ['#/dagboek/dag/%E0%A4%A', 'vandaag'],
      ['#/drinken/%', 'vandaag'],
      ['#/dagboek/constructor', 'dagboek'],
      ['#/dagboek/__proto__/2026-01-01', 'dagboek'],
      ['#/dagboek/toString', 'dagboek'],
    ]) {
      const page = await context.newPage();
      const b = bewaak(page);
      await page.goto('./' + hash);
      await expect(page.locator('#scherm'), hash).toHaveAttribute('data-scherm', scherm);
      await expect(page.locator('#tabbalk'), hash).toBeVisible();
      await page.reload();
      await expect(page.locator('#scherm'), hash).toHaveAttribute('data-scherm', scherm);
      await expect(page.locator('#tabbalk'), hash).toBeVisible();
      expect(b.fouten, hash).toEqual([]);
      expect(b.vreemd, hash).toEqual([]);
      await page.close();
    }
  });
});

test.describe('niets verlaat het toestel', () => {
  test('bij elke handeling (thema, uitleg, verslag en pdf, vergrendeling instellen en ontgrendelen) gaat er geen verzoek naar een ander adres en geen CSP-fout', async ({ page }) => {
    const b = bewaak(page);
    await page.goto('./#/vandaag');
    await expect(page.locator('#scherm')).toBeVisible();
    await page.locator('.drankknop[data-soort="water"]').click();
    // Thema's
    await page.goto('./#/meer');
    for (const thema of ['Salie', 'Nacht', 'Poeder']) {
      const knop = page.getByRole('radio', { name: new RegExp('^' + thema) }).first();
      if (await knop.count()) await knop.click();
    }
    // Uitleg
    await page.goto('./#/meer/uitleg');
    await schermKlaar(page, '#/meer/uitleg'); // het scherm Uitleg is uitgebouwd (geen vaste wachttijd)
    // Verslag en pdf
    await page.goto('./#/delen');
    const bewaar = page.getByRole('button', { name: 'Bewaren', exact: true });
    await expect(bewaar).toBeEnabled({ timeout: 15000 });
    await Promise.all([page.waitForEvent('download', { timeout: 20000 }), bewaar.click()]);
    // Vergrendeling instellen, herladen, ontgrendelen
    await zetSlotAan(page);
    await page.reload();
    await tik(page, CODE);
    await expect(page.locator('#tabbalk')).toBeVisible();
    // Elk scherm
    for (const route of ['vandaag', 'dagboek', 'drinken', 'supplementen', 'gewicht', 'meer', 'meer/profiel', 'meer/instellingen', 'meer/meldingen', 'meer/vergrendeling', 'meer/uitleg', 'delen']) {
      await page.goto('./#/' + route);
      await expect(page.locator('#scherm')).toBeVisible();
    }
    expect(b.vreemd).toEqual([]);
    expect(b.csp).toEqual([]);
    expect(b.fouten).toEqual([]);
  });
});

// ---- BESLISSING 518: de herstelcode en het herstellen van een vergeten pincode ----
// x-herstel.spec.js toetst hoe het herstellen werkt. Hier staat wat het slot daarbij moet BEWAKEN: niets leesbaar bewaard, een rem die blijft staan
// en niet te omzeilen is, geen weg naar een nieuwe code of naar binnen zonder de huidige code of het toestel, geen dagboek in de pagina terwijl
// het herstelscherm openstaat, en alles weg bij wissen. De demo heeft er niets van.
const NIEUW = '246810';
const DERDE = '135790';
const FOUT = 'ABCD-EFGH-JKMN'; // een geldige vorm, maar niet de code (kans 1 op 31 tot de twaalfde)
const SLOTSCHAKELAAR = (page) => page.getByRole('switch', { name: /^Bloei vergrendelen/ });
const veld = (page) => page.getByRole('textbox', { name: 'Herstelcode' });
const foutmelding = (page) => page.locator('.herstel__formulier .slot__boodschap');
const varianten = (code) => [code, code.replace(/-/g, ''), ...code.split('-')];

async function wachtOpSlot(page) {
  await expect(page.locator('#slot')).toBeVisible();
  await expect(page.locator('#slot .cijferblok')).toBeVisible();
}
async function naarHerstelcode(page) {
  await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
  await page.getByRole('button', { name: 'Gebruik je herstelcode' }).click();
  await expect(page.getByRole('heading', { name: 'Je herstelcode' })).toBeVisible();
}
// De herstelcode die nu in de stap staat; het vinkje en Verder volgen met bevestigStap.
const getoondeCode = async (page) => (await stap(page).locator('.herstel__code').textContent()).trim();
async function bevestigStap(page) {
  await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
  await stap(page).getByRole('button', { name: 'Verder' }).click();
}
// Alles van het slot dat de herstelstroom kan wijzigen.
const SLOTSLEUTELS = ['slot.aan', 'slot.pin', 'slot.methode', 'slot.passkeyId', 'slot.herstel']; // slot.herstelId bestaat niet meer (BESLISSING 541)
const staat = async (page) => Object.fromEntries(await Promise.all(SLOTSLEUTELS.map(async (k) => [k, await instelling(page, k)])));

// Alles wat de pagina nu van zichzelf toont of weet, als tekst: de pagina, de invoerwaarden, de titel en het adres.
const paginaTekst = (page) =>
  page.evaluate(() =>
    JSON.stringify({
      html: document.documentElement.outerHTML,
      waarden: [...document.querySelectorAll('input, textarea')].map((i) => i.value),
      titel: document.title,
      adres: location.href,
    }),
  );
// Waar staat er nog iets van deze geheimen (met streepjes, zonder, en per groep)? Geeft de plekken, zonder het geheim zelf te noemen.
async function waarStaat(page, geheimen, logs, plekken) {
  const tekst = {};
  if (plekken.includes('opslag')) tekst.opslag = JSON.stringify(await alleOpslag(page));
  if (plekken.includes('pagina')) tekst.pagina = await paginaTekst(page);
  if (plekken.includes('console')) tekst.console = logs.join('\n');
  const gevonden = [];
  geheimen.forEach((g, i) => {
    for (const v of varianten(g)) for (const [plek, t] of Object.entries(tekst)) if (t.includes(v)) gevonden.push(`${plek}: geheim ${i + 1}`);
  });
  return [...new Set(gevonden)];
}

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

test.describe('herstelcode en pincode: nergens leesbaar', () => {
  test('de herstelcodes, de pincodes en wat je intikte staan nergens leesbaar: niet in de opslag, het adres, de titel, de console of de pagina nadat de stap gesloten is', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'ok');
    const b = bewaak(page);
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    page.on('pageerror', (e) => logs.push(String(e)));
    const schoon = async (wat, geheimen, plekken = ['opslag', 'pagina', 'console']) => expect(await waarStaat(page, geheimen, logs, plekken), wat).toEqual([]);

    // 1. Aanzetten: de code staat alleen in de stap (BESLISSING 541: er is geen vraag om het toestel te koppelen)
    await page.goto('./#/meer/vergrendeling');
    await SLOTSCHAKELAAR(page).click();
    await tik(page, CODE);
    await tik(page, CODE);
    await expect(stap(page)).toBeVisible();
    await expect(aanbod(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /koppel mijn toestel/ })).toHaveCount(0);
    const code1 = await getoondeCode(page);
    await schoon('aanzetten, stap open', [CODE, code1], ['opslag', 'console']);
    await bevestigStap(page);
    await expect(SLOTSCHAKELAAR(page)).toHaveAttribute('aria-checked', 'true');
    await schoon('aanzetten, stap gesloten', [CODE, code1]);

    // 2. Pincode wijzigen
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    await expect(page.locator('#tabbalk')).toBeVisible();
    await page.goto('./#/meer/vergrendeling');
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await tik(page, CODE);
    await tik(page, NIEUW); // BESLISSING 533: de nieuwe code een keer
    await expect(page.getByText('Je pincode is gewijzigd.')).toBeVisible();
    await schoon('pincode gewijzigd', [CODE, NIEUW, code1]);

    // 3. Een nieuwe herstelcode: ze wordt bewaard voor ze getoond wordt, maar nooit leesbaar
    await page.getByRole('button', { name: 'Nieuwe herstelcode maken' }).click();
    await tik(page, NIEUW);
    await expect(stap(page)).toBeVisible();
    const code2 = await getoondeCode(page);
    expect(code2).not.toBe(code1);
    await schoon('nieuwe herstelcode, stap open', [CODE, NIEUW, code1, code2], ['opslag', 'console']);
    await bevestigStap(page);
    await expect(page.getByText('Je nieuwe herstelcode is klaar.')).toBeVisible();
    await schoon('nieuwe herstelcode, stap gesloten', [CODE, NIEUW, code1, code2]);

    // 4. Herstellen met een foute en dan de juiste herstelcode (kleine letters en spaties), een nieuwe pincode en een nieuwe herstelcode
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    await veld(page).fill(FOUT.toLowerCase());
    await page.keyboard.press('Enter');
    await expect(foutmelding(page)).toHaveText('Die herstelcode klopt niet.');
    await schoon('foute herstelcode ingetikt', [FOUT, code1, code2], ['opslag', 'console']);
    await veld(page).fill(code2.toLowerCase().replace(/-/g, ' '));
    await page.keyboard.press('Enter');
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    await tik(page, DERDE);
    await tik(page, DERDE);
    await expect(stap(page)).toBeVisible();
    const code3 = await getoondeCode(page);
    await schoon('herstel, stap open', [CODE, NIEUW, DERDE, FOUT, code1, code2, code3], ['opslag', 'console']);
    // wat ze intikte en de oude codes staan niet meer in de pagina; alleen de nieuwe code staat er
    await schoon('herstel, stap open, de pagina', [CODE, NIEUW, DERDE, FOUT, code1, code2], ['pagina']);
    await bevestigStap(page);
    await expect(page.locator('#slot')).toBeHidden();
    await schoon('na het herstel', [CODE, NIEUW, DERDE, FOUT, code1, code2, code3]);
    expect(b.fouten).toEqual([]);
    expect(b.csp).toEqual([]);
    expect(b.vreemd).toEqual([]);
  });
});

test.describe('herstelcode: de rem blijft staan', () => {
  test('foute herstelcodes: de wachttijd loopt op (30 s, 1, 5, 15 en weer 15 minuten), is niet te omzeilen, geldt ook na Terug en in een tweede tabblad, en niets wordt gewist', async ({ page, context }) => {
    await vasteKlok(page);
    await authenticator(page, 'geen');
    // Elke afgeleide (PBKDF2) tellen: tijdens een wachttijd mag er geen enkele herstelcode meer gecontroleerd worden.
    await page.addInitScript(() => {
      window.__hashes = 0;
      const echt = crypto.subtle.deriveBits.bind(crypto.subtle);
      crypto.subtle.deriveBits = (...a) => {
        window.__hashes += 1;
        return echt(...a);
      };
    });
    await page.goto('./#/vandaag');
    await vul(page, { tekst: 'ontbijt', naam: 'Testnaam' });
    const code = await zetSlotAan(page);
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    const poging = async (tekst, n) => {
      await veld(page).fill(tekst);
      await page.keyboard.press('Enter');
      await expect.poll(() => instelling(page, 'slot.herstelFouten')).toBe(n);
    };
    const restWacht = async () => (await instelling(page, 'slot.herstelWachtTot')) - (await page.evaluate(() => Date.now()));
    for (let n = 1; n <= 4; n += 1) await poging(FOUT.toLowerCase(), n);
    const wachttijden = [30000, 60000, 300000, 900000, 900000];
    for (let i = 0; i < wachttijden.length; i += 1) {
      if (i > 0) {
        await page.clock.fastForward(wachttijden[i - 1] + 1000);
        await expect(veld(page)).toBeEnabled();
      }
      await poging(FOUT, 5 + i);
      await expect(veld(page)).toBeDisabled();
      await expect(foutmelding(page)).toContainText('Even wachten');
      const rest = await restWacht();
      expect(rest, `wachttijd na fout ${5 + i}`).toBeGreaterThan(wachttijden[i] - 10000);
      expect(rest, `wachttijd na fout ${5 + i}`).toBeLessThanOrEqual(wachttijden[i]);
      if (i !== 0) continue;
      // De eerste wachttijd: de invoer open forceren en de juiste code insturen helpt niet; er wordt niets gecontroleerd en niets gewijzigd
      const hashes = await page.evaluate(() => window.__hashes);
      await page.evaluate(() => document.querySelectorAll('.herstel__formulier input, .herstel__formulier button').forEach((e) => (e.disabled = false)));
      await veld(page).fill(code);
      await page.keyboard.press('Enter');
      await page.clock.runFor(2000); // de teller van het slot zet de invoer opnieuw uit
      await expect(veld(page)).toBeDisabled();
      expect(await page.evaluate(() => window.__hashes)).toBe(hashes);
      await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toHaveCount(0);
      expect(await instelling(page, 'slot.herstelFouten')).toBe(5);
      // Terug en opnieuw naar de herstelcode: nog steeds dicht; de pincode heeft haar eigen teller
      await page.getByRole('button', { name: 'Terug', exact: true }).click();
      await page.getByRole('button', { name: 'Gebruik je herstelcode' }).click();
      await expect(veld(page)).toBeDisabled();
      expect(await instelling(page, 'slot.fouten')).toBe(0);
      // Een tweede tabblad deelt de rem
      const b2 = await context.newPage();
      await vasteKlok(b2);
      await authenticator(b2, 'geen');
      await b2.goto('./#/vandaag');
      await wachtOpSlot(b2);
      await naarHerstelcode(b2);
      await expect(veld(b2)).toBeDisabled();
      await expect(foutmelding(b2)).toContainText('Even wachten');
      await b2.close();
    }
    // Na de laatste wachttijd werkt de juiste code, en het dagboek staat er nog
    await page.clock.fastForward(901000);
    await expect(veld(page)).toBeEnabled();
    await veld(page).fill(code);
    await page.keyboard.press('Enter');
    await tik(page, NIEUW);
    await tik(page, NIEUW);
    await expect(stap(page)).toBeVisible();
    await bevestigStap(page);
    await expect(page.locator('#slot')).toBeHidden();
    expect((await leesDb(page, 'maaltijden', [await vandaagSleutel(page), 'ontbijt']))?.tekst).toContain(MERK);
    expect(await instelling(page, 'slot.herstelFouten')).toBe(0);
  });
});

// ---- geen weg naar een nieuwe code, een nieuw toestel of een uitgezet slot zonder de huidige code of het toestel ----
const HANDELINGEN = [
  { naam: 'de pincode wijzigen', start: (p) => p.getByRole('button', { name: 'Pincode wijzigen' }).click(), bereikt: (p) => expect(p.getByText('Kies je nieuwe code van zes cijfers.')).toBeVisible(), toestelVraag: true },
  { naam: 'een nieuwe herstelcode maken', start: (p) => p.getByRole('button', { name: 'Nieuwe herstelcode maken' }).click(), bereikt: (p) => expect(stap(p)).toBeVisible(), toestelVraag: true },
  { naam: 'het slot uitzetten', start: (p) => SLOTSCHAKELAAR(p).click(), bereikt: (p) => expect(p.getByRole('dialog')).toBeVisible(), toestelVraag: true },
  { naam: 'overschakelen naar Face ID', start: (p) => p.getByRole('radio', { name: /^Face ID/ }).click(), bereikt: (p) => expect.poll(() => p.evaluate(() => window.__pkGemaakt)).toBe(1), toestelVraag: true },
];

// Van Pincode naar Face ID (met de huidige code), op het scherm Vergrendeling.
async function naarFaceId(page) {
  await page.getByRole('radio', { name: /^Face ID/ }).click();
  await expect(page.getByText('Geef je huidige code in.')).toBeVisible();
  await tik(page, CODE);
  await expect.poll(() => instelling(page, 'slot.methode')).toBe('faceid');
}

test.describe('zonder de huidige code kan niemand het slot wijzigen', () => {
  for (const h of HANDELINGEN) {
    test(`${h.naam}: foute codes tellen mee, een wachttijd weert ook de juiste code, annuleren en herladen laten alles zoals het was`, async ({ page }) => {
      await vasteKlok(page);
      await authenticator(page, 'ok');
      await zetSlotAan(page);
      const voor = await staat(page);
      await h.start(page);
      await expect(page.getByText('Geef je huidige code in.')).toBeVisible();
      // de methode is Pincode (geen passkey van het slot): geen knop die de code overslaat
      await expect(page.getByRole('button', { name: /^Bevestig met/ })).toHaveCount(0);
      const boodschap = page.locator('.slot__instel .slot__boodschap');
      for (let n = 1; n <= 5; n += 1) {
        await tik(page, '000000');
        await expect.poll(() => instelling(page, 'slot.fouten')).toBe(n);
      }
      await expect(boodschap).toContainText('Even wachten');
      // Tijdens de wachttijd weigert het slot ook de juiste code: de melding telt door (nu minder seconden) en er verandert niets
      const eerste = await boodschap.textContent();
      await page.clock.runFor(5000);
      await tik(page, CODE);
      await expect(boodschap).not.toHaveText(eerste);
      await expect(boodschap).toContainText('Even wachten');
      await expect(page.getByText('Geef je huidige code in.')).toBeVisible();
      expect(await staat(page)).toEqual(voor);
      // Annuleren: alles zoals het was
      await page.getByRole('button', { name: 'Annuleren' }).click();
      await expect(page.getByRole('button', { name: 'Pincode wijzigen' })).toBeVisible();
      expect(await staat(page)).toEqual(voor);
      // Na de wachttijd opent de juiste code de volgende stap, en tot de laatste bevestiging blijft de stand zoals ze was
      await h.start(page);
      await page.clock.fastForward(31000);
      await tik(page, CODE);
      await h.bereikt(page);
      if (h.naam === 'overschakelen naar Face ID') {
        await expect.poll(async () => (await staat(page))['slot.methode']).toBe('faceid');
        return;
      }
      // Herladen halverwege: het slot is dicht en de oude code werkt nog. Er is niets half gewijzigd; alleen een nieuwe herstelcode is al bewaard
      // voor ze getoond werd (de oude vervalt dan meteen, BESLISSING 518), nog niet bevestigd.
      await page.reload();
      await wachtOpSlot(page);
      const na = await staat(page);
      if (h.naam === 'een nieuwe herstelcode maken') {
        expect(na['slot.herstel']).toMatchObject({ bevestigd: false, rondes: 600000 });
        expect(na['slot.herstel'].hash).not.toBe(voor['slot.herstel'].hash);
        expect({ ...na, 'slot.herstel': null }).toEqual({ ...voor, 'slot.herstel': null });
      } else expect(na).toEqual(voor);
      await tik(page, CODE);
      await expect(page.locator('#tabbalk')).toBeVisible();
    });
  }

  // BESLISSING 541: de toestelweg bij "Je code niet meer weten" staat er zonder koppeling. Elke mislukking opent niets en wijzigt niets.
  const MISLUKT = 'Dat lukte niet. Probeer het opnieuw of kies een andere weg.';
  // BESLISSING 638: de passkey van het slot lukte niet; de volgende tik neemt de eenmalige bevestiging
  const TERUGVAL = 'Dat lukte niet. Tik nog eens, dan bevestig je op een andere manier met je toestel.';
  const BEVESTIG = (page) => page.getByRole('button', { name: 'Bevestig met Face ID' });
  const naarKwijt = async (page) => {
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.getByRole('heading', { name: 'Je code niet meer weten' })).toBeVisible();
  };
  // Elke manier waarop het toestel (of wat zich zo voordoet) geen geldige bevestiging geeft: [naam, sleutel in sessionStorage, waarde, geldt bij create, geldt bij get].
  const MISLUKKINGEN = [
    ['geannuleerd (create)', '__pkc', 'fout', true, false],
    ['geannuleerd (get)', '__pk', 'annuleer', false, true],
    ['zonder gebruikersverificatie (UV)', '__uv', 'nee', true, true],
    ['een antwoord op een andere challenge', '__pkfout', 'challenge', true, true],
    ['een antwoord van een andere oorsprong', '__pkfout', 'oorsprong', true, true],
    ['een antwoord voor een andere site (rpId)', '__pkfout', 'rp', true, true],
    ['het verkeerde type antwoord', '__pkfout', 'type', true, true],
    ['een ander id in de authenticatordata dan in het antwoord', '__pkfout', 'id', true, false],
  ];
  const zonderSleutel = (page) => Promise.all(['__pkc', '__pk', '__uv', '__pkfout'].map((k) => zetSessie(page, k, null)));
  const optiesVan = (page, soort) => page.evaluate((s) => window.__pkOpties.filter((o) => o.soort === s), soort);

  test('methode Pincode: de toestelweg staat er zonder koppeling; geannuleerd, zonder UV, met een andere challenge, oorsprong, site, type of id opent niets en wijzigt niets; elke keer een nieuwe uitdaging en een nieuwe sleutel die meteen vergeten wordt, en niets ervan leesbaar bewaard', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'ok');
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    page.on('pageerror', (e) => logs.push(String(e)));
    await zetSlotAan(page);
    const voor = await staat(page);
    expect(voor['slot.methode']).toBe('pin');
    expect(voor['slot.passkeyId']).toBeNull();
    expect(await instelling(page, 'slot.herstelId')).toBeNull();
    await naarKwijt(page);
    await expect(BEVESTIG(page)).toBeVisible(); // zonder dat er ooit gekoppeld is
    const pogingen = MISLUKKINGEN.filter((m) => m[3]);
    for (const [naam, sleutel, waarde] of pogingen) {
      await zetSessie(page, sleutel, waarde);
      await BEVESTIG(page).click();
      await expect(page.locator('#slot .slot__boodschap'), naam).toHaveText(MISLUKT);
      await expect(page.getByRole('heading', { name: 'Je code niet meer weten' }), naam).toBeVisible();
      await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.'), naam).toHaveCount(0);
      await expect(page.locator('#tabbalk'), naam).toBeHidden();
      await expect(page.locator('#slot')).toBeVisible();
      expect(await staat(page), naam).toEqual(voor);
      expect((await instelling(page, 'slot.fouten')) ?? 0, naam).toBe(0);
      await zonderSleutel(page);
    }
    // Wat de app het toestel vroeg: gebruikersverificatie verplicht, de platformauthenticator, geen attestation, geen naam van de gebruiker, een
    // sleutel die niet blijft staan, geen lijst met toegestane sleutels en elke keer een nieuwe uitdaging van 32 bytes.
    const gevraagd = await optiesVan(page, 'create');
    expect(gevraagd).toHaveLength(pogingen.length);
    for (const o of gevraagd) {
      expect(o).toMatchObject({ userVerification: 'required', aanhechting: 'platform', attestation: 'none', residentKey: 'discouraged', toegestaan: [], naam: 'Bloei herstel' });
      expect(o.challenge).toHaveLength(32);
    }
    expect(new Set(gevraagd.map((o) => o.challenge.join(','))).size).toBe(pogingen.length);
    expect(await optiesVan(page, 'get')).toHaveLength(0);
    // Elke sleutel die het toestel toch maakte is meteen als onbekend gemeld (alle pogingen behalve die waar het maken zelf mislukte)
    await expect.poll(() => page.evaluate(() => window.__pkVergeten.length)).toBe(pogingen.length - 1);
    // Het goede antwoord: dan, en alleen dan, mag ze een nieuwe code kiezen; er is nog niets gewijzigd
    await BEVESTIG(page).click();
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    expect(await staat(page)).toEqual(voor);
    await expect.poll(() => page.evaluate(() => window.__pkVergeten.length)).toBe(pogingen.length);
    const ids = await page.evaluate(() => window.__pkVergeten);
    expect(new Set(ids).size).toBe(ids.length);
    await expect(page.locator('#tabbalk')).toBeHidden();
    // Geen sleutel, geen id en geen code leesbaar: niet in IndexedDB, localStorage, sessionStorage, het adres, de titel, de pagina of de console
    expect(await waarStaat(page, [...ids, CODE], logs, ['opslag', 'pagina', 'console'])).toEqual([]);
    await tik(page, NIEUW);
    await tik(page, NIEUW);
    // Via het toestel (anders dan via de herstelcode) blijft de herstelcode zoals ze was: er komt geen nieuwe stap
    await expect(page.locator('#tabbalk')).toBeVisible();
    const na = await staat(page);
    expect(na['slot.herstel']).toEqual(voor['slot.herstel']);
    expect(na['slot.methode']).toBe('pin');
    expect(na['slot.passkeyId']).toBeNull();
    expect(na['slot.pin'].hash).not.toBe(voor['slot.pin'].hash);
    expect(await instelling(page, 'slot.herstelId')).toBeNull();
    expect(await waarStaat(page, [...ids, CODE, NIEUW], logs, ['opslag', 'pagina', 'console'])).toEqual([]);
  });

  test('methode Face ID: bij "Je code niet meer weten" vraagt de app de passkey van het slot (get, geen nieuwe sleutel); geannuleerd, zonder UV, met een andere challenge, oorsprong, site of type opent niets en wijzigt niets', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'ok');
    await zetSlotAan(page);
    await naarFaceId(page);
    const voor = await staat(page);
    expect(voor['slot.passkeyId']).toBeTruthy();
    const eigen = Array.from(Buffer.from(voor['slot.passkeyId'], 'base64url'));
    // Het slot probeert zelf Face ID bij het openen; met een slecht antwoord mislukt dat ook, zodat het slot dicht blijft.
    // BESLISSING 638: na een mislukte get neemt de volgende tik de eenmalige weg (create). Daarom elke poging in een nieuw slot (herladen):
    // telkens precies één get op de passkey van het slot, met de rustige zin van de terugval, en nog geen create.
    const pogingen = MISLUKKINGEN.filter((m) => m[4]);
    const gevraagd = [];
    for (const [naam, sleutel, waarde] of pogingen) {
      await zonderSleutel(page);
      await zetSessie(page, sleutel, waarde);
      await naarKwijt(page);
      const eerder = (await optiesVan(page, 'get')).length;
      await BEVESTIG(page).click();
      await expect(page.locator('#slot .slot__boodschap'), naam).toHaveText(TERUGVAL);
      await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.'), naam).toHaveCount(0);
      await expect(page.locator('#tabbalk'), naam).toBeHidden();
      expect(await staat(page), naam).toEqual(voor);
      const nieuw = (await optiesVan(page, 'get')).slice(eerder);
      expect(nieuw, naam).toHaveLength(1);
      gevraagd.push(...nieuw);
      expect(await optiesVan(page, 'create'), naam).toHaveLength(0); // geen nieuwe sleutel vanzelf
    }
    for (const o of gevraagd) {
      expect(o.userVerification).toBe('required');
      expect(o.toegestaan).toEqual([eigen]); // alleen de passkey van het slot
      expect(o.challenge).toHaveLength(32);
    }
    expect(new Set(gevraagd.map((o) => o.challenge.join(','))).size).toBe(pogingen.length);
    expect(await page.evaluate(() => window.__pkVergeten)).toEqual([]);
    // een nieuw slot met een kloppend antwoord op de get: de vraag van het slotscherm zelf geannuleerd, daarna Bevestig met Face ID
    await zonderSleutel(page);
    await zetPk(page, 'annuleer');
    await naarKwijt(page);
    await zonderSleutel(page);
    await BEVESTIG(page).click();
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    expect(await optiesVan(page, 'create')).toHaveLength(0); // bevestigd met de passkey van het slot (get), niets nieuws gemaakt
    expect(await staat(page)).toEqual(voor);
    await tik(page, NIEUW);
    await tik(page, NIEUW);
    await expect(page.locator('#tabbalk')).toBeVisible();
    const na = await staat(page);
    expect(na['slot.passkeyId']).toBe(voor['slot.passkeyId']); // de passkey van het slot blijft
    expect(na['slot.pin'].hash).not.toBe(voor['slot.pin'].hash);
  });

  test('methode Face ID: pincode wijzigen, de herstelcode vernieuwen en het slot uitzetten: een geweigerde bevestiging met het toestel (annuleren) laat alles zoals het was en telt niet als foute poging', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'ok');
    await zetSlotAan(page);
    await naarFaceId(page);
    const voor = await staat(page);
    const eigen = Array.from(Buffer.from(voor['slot.passkeyId'], 'base64url'));
    await zetPk(page, 'annuleer');
    const acties = HANDELINGEN.filter((h) => h.toestelVraag && h.naam !== 'overschakelen naar Face ID');
    expect(acties).toHaveLength(3);
    const eerder = (await optiesVan(page, 'get')).length;
    for (const h of acties) {
      await h.start(page);
      await expect(page.getByText('Geef je huidige code in.')).toBeVisible();
      await BEVESTIG(page).click();
      await expect(page.locator('.slot__instel .slot__boodschap')).toHaveText(MISLUKT);
      await expect(page.locator('.cijferblok')).toBeVisible();
      expect(await staat(page), h.naam).toEqual(voor);
      expect((await instelling(page, 'slot.fouten')) ?? 0).toBe(0);
      await page.getByRole('button', { name: 'Annuleren' }).click();
      await expect(page.getByRole('button', { name: 'Pincode wijzigen' })).toBeVisible();
    }
    const gevraagd = (await optiesVan(page, 'get')).slice(eerder);
    expect(gevraagd).toHaveLength(acties.length);
    for (const o of gevraagd) {
      expect(o.userVerification).toBe('required');
      expect(o.toegestaan).toEqual([eigen]);
      expect(o.challenge).toHaveLength(32);
    }
    expect(new Set(gevraagd.map((o) => o.challenge.join(','))).size).toBe(acties.length);
  });

  test('een oude rij slot.herstelId (uit de tijd van "Je toestel als hulp") verdwijnt bij de start: de sleutel wordt als onbekend gemeld, niets anders van het slot verandert, en de passkey van Face ID blijft staan', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'ok');
    await zetSlotAan(page);
    const voor = await staat(page);
    await zetInDb(page, { 'slot.herstelId': 'AQIDBA' });
    expect(await instelling(page, 'slot.herstelId')).toBe('AQIDBA');
    await page.reload();
    await wachtOpSlot(page);
    await expect.poll(() => instelling(page, 'slot.herstelId')).toBeNull();
    expect(await page.evaluate(() => window.__pkVergeten)).toEqual(['AQIDBA']);
    expect(await staat(page)).toEqual(voor);
    // Nog een keer herladen: er is niets meer op te ruimen en er wordt niets nieuws gemeld
    await page.reload();
    await wachtOpSlot(page);
    expect(await page.evaluate(() => window.__pkVergeten)).toEqual(['AQIDBA']);
    // Is de oude rij gelijk aan de passkey van Face ID, dan verdwijnt de rij maar wordt die passkey nooit als onbekend gemeld
    await tik(page, CODE);
    await expect(page.locator('#tabbalk')).toBeVisible();
    await page.goto('./#/meer/vergrendeling');
    await naarFaceId(page);
    const faceId = await instelling(page, 'slot.passkeyId');
    expect(faceId).toBeTruthy();
    await zetInDb(page, { 'slot.herstelId': faceId });
    await zetPk(page, 'annuleer');
    await page.reload();
    await wachtOpSlot(page);
    await expect.poll(() => instelling(page, 'slot.herstelId')).toBeNull();
    expect(await instelling(page, 'slot.passkeyId')).toBe(faceId);
    expect(await instelling(page, 'slot.methode')).toBe('faceid');
    expect(await page.evaluate(() => window.__pkVergeten)).toEqual(['AQIDBA']);
  });
});

// ---- het dagboek blijft uit de pagina zolang het herstelscherm openstaat ----
test.describe('het herstelscherm lekt geen dagboek', () => {
  test('bij de weg met de herstelcode en bij de weg met het toestel: op elk scherm van het slot niets van het dagboek in de pagina, de titel of de toegankelijkheidsboom; het komt pas terug na de nieuwe code', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'ok');
    await page.goto('./#/vandaag');
    await vul(page, { tekst: 'ontbijt', naam: 'Testnaam' });
    const code = await zetSlotAan(page);
    // Vanaf het eerste ogenblik van elke volgende lading: elke wijziging in de pagina nakijken op het merkteken en de naam.
    await page.addInitScript((merk) => {
      window.__gezien = [];
      const kijk = () => {
        const html = document.documentElement?.outerHTML ?? '';
        if (html.includes(merk) || html.includes('Testnaam') || document.title.includes(merk)) window.__gezien.push(performance.now());
      };
      new MutationObserver(kijk).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
    }, MERK);
    const dichtEnLeeg = async (wat) => {
      const m = await page.evaluate((merk) => {
        const overig = [...document.body.children].filter((k) => k.id !== 'slot' && k.tagName !== 'SCRIPT');
        const html = document.documentElement.outerHTML;
        return {
          slot: !document.getElementById('slot').hidden,
          overigVerborgen: overig.every((k) => (k.hidden || getComputedStyle(k).display === 'none') && k.inert),
          merk: html.includes(merk) || html.includes('Testnaam'),
          scherm: document.getElementById('scherm')?.childElementCount ?? 0,
          titel: document.title,
          gezien: window.__gezien.length,
        };
      }, MERK);
      expect(m, wat).toEqual({ slot: true, overigVerborgen: true, merk: false, scherm: 0, titel: 'Bloei', gezien: 0 });
      const boom = await page.locator('body').ariaSnapshot();
      expect(boom, wat).not.toContain(MERK);
      expect(boom, wat).not.toContain('Testnaam');
      await expect(page.locator('#tabbalk'), wat).toBeHidden();
    };
    await page.goto('./#/vandaag');
    await page.reload();
    await wachtOpSlot(page);
    await dichtEnLeeg('het slot');

    // De weg met de herstelcode
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.getByRole('heading', { name: 'Je code niet meer weten' })).toBeVisible();
    await dichtEnLeeg('code niet meer weten');
    await page.getByRole('button', { name: 'Gebruik je herstelcode' }).click();
    await expect(veld(page)).toBeVisible();
    await dichtEnLeeg('de herstelcode ingeven');
    await veld(page).fill(FOUT);
    await page.keyboard.press('Enter');
    await expect(foutmelding(page)).toHaveText('Die herstelcode klopt niet.');
    await dichtEnLeeg('na een foute herstelcode');
    await veld(page).fill(code);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    await dichtEnLeeg('een nieuwe code kiezen');
    await tik(page, NIEUW);
    await tik(page, NIEUW);
    await expect(stap(page)).toBeVisible();
    const nieuweCode = await getoondeCode(page);
    await dichtEnLeeg('de nieuwe herstelcode');
    await bevestigStap(page);
    await expect(page.locator('#tabbalk')).toBeVisible();
    await expect(page.locator('#slot')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__gezien.length)).toBeGreaterThan(0);
    // De codes staan na het sluiten van de stap nergens meer in de pagina
    const pagina = await paginaTekst(page);
    for (const v of [...varianten(code), ...varianten(nieuweCode), FOUT, CODE, NIEUW]) expect(pagina).not.toContain(v);

    // De weg met het toestel (BESLISSING 541: zonder koppelen, met een sleutel voor één keer)
    await page.goto('./#/vandaag');
    await page.reload();
    await wachtOpSlot(page);
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await dichtEnLeeg('code niet meer weten, met toestel');
    await page.getByRole('button', { name: 'Bevestig met Face ID' }).click();
    await expect(page.getByText('Kies een nieuwe code. Je dagboek blijft staan.')).toBeVisible();
    await dichtEnLeeg('een nieuwe code kiezen, met toestel');
    await tik(page, DERDE);
    await tik(page, DERDE);
    await expect(page.locator('#tabbalk')).toBeVisible();
    await expect(page.locator('#scherm')).toContainText(MERK);
  });
});

// ---- Alles wissen wist ook de herstelgegevens ----
test.describe('alles wissen wist ook de herstelgegevens', () => {
  // Geen rij met een sleutel van het slot, elke tabel leeg (behalve wat de app bij het opstarten zelf terugschrijft), geen herstelcode ergens.
  async function allesWeg(page, herstelcodes) {
    const opslag = await alleOpslag(page);
    const instellingen = opslag.idb['bloei-dagboek/instellingen'] ?? [];
    expect(instellingen.filter((r) => r.sleutel.startsWith('slot.')).map((r) => `${r.sleutel} = ${JSON.stringify(r.waarde)}`)).toEqual([]);
    for (const [naam, rijen] of Object.entries(opslag.idb)) {
      const eigen = naam.endsWith('/instellingen') ? rijen.filter((r) => !/Omgezet$|uitgebreid$/.test(r.sleutel)) : rijen;
      expect(eigen, naam).toEqual([]);
    }
    const alles = JSON.stringify(opslag);
    for (const code of herstelcodes) for (const v of varianten(code)) expect(alles).not.toContain(v);
    expect(alles).not.toContain(CODE);
  }
  const sleutelsVergeten = (page) => page.evaluate(() => window.__pkVergeten);

  test('Profiel verwijderen: ook de herstelcode, de rem, de passkey van Face ID en een oude rij slot.herstelId zijn weg; het toestel hoort dat die sleutels niet meer bestaan', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'ok');
    const b = bewaak(page);
    await page.goto('./#/vandaag');
    await vul(page, { tekst: 'ontbijt ' + MERK, naam: 'Testnaam' });
    const code = await zetSlotAan(page);
    await naarFaceId(page);
    const passkeyId = await instelling(page, 'slot.passkeyId');
    expect(passkeyId).toBeTruthy();
    // Een lopende rem op de herstelcode en een oude rij slot.herstelId (BESLISSING 541), zoals na een slechte dag
    const oudId = 'AQIDBA';
    await zetInDb(page, { 'slot.herstelFouten': 7, 'slot.herstelWachtTot': Date.now() + 600000, 'slot.herstelAanbod': true, 'slot.fouten': 3, 'slot.herstelId': oudId });
    await page.goto('./#/meer');
    await page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Ja, verwijder mijn profiel' }).click();
    const laatste = dlg.getByRole('button', { name: 'Ja, verwijder mijn profiel' });
    await expect(laatste).toBeEnabled({ timeout: 4000 });
    await laatste.click();
    await expect(page.locator('[data-scherm="welkom"]')).toBeVisible();
    await allesWeg(page, [code]);
    expect(await sleutelsVergeten(page)).toEqual(expect.arrayContaining([passkeyId, oudId]));
    // En ook na herladen is er geen slot en geen weg om te herstellen
    await page.reload();
    await expect(page.locator('[data-scherm="welkom"]')).toBeVisible();
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Ik ken mijn code niet meer' })).toHaveCount(0);
    await allesWeg(page, [code]);
    expect(b.fouten).toEqual([]);
    expect(b.vreemd).toEqual([]);
  });

  test('Alles wissen vanuit het slot, midden in een herstel met een lopende rem: ook dan is elke sleutel van het slot weg', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'ok');
    await page.goto('./#/vandaag');
    await vul(page, { tekst: 'ontbijt ' + MERK, naam: 'Testnaam' });
    const code = await zetSlotAan(page);
    // Een oude rij slot.herstelId (BESLISSING 541): de start ruimt ze op, en het wissen laat in elk geval niets achter
    const herstelId = 'AQIDBA';
    await zetInDb(page, { 'slot.herstelId': herstelId });
    await page.reload();
    await wachtOpSlot(page);
    await naarHerstelcode(page);
    await veld(page).fill(FOUT);
    await page.keyboard.press('Enter');
    await expect(foutmelding(page)).toHaveText('Die herstelcode klopt niet.');
    await expect.poll(() => instelling(page, 'slot.herstelFouten')).toBe(1);
    await page.getByRole('button', { name: 'Terug', exact: true }).click();
    await page.locator('#slot').getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
    await page.locator('#slot').getByRole('button', { name: 'Doorgaan' }).click();
    await page.locator('#slot').getByRole('button', { name: 'Alles wissen', exact: true }).click();
    await expect(page.locator('[data-scherm="welkom"]')).toBeVisible({ timeout: 10000 });
    await allesWeg(page, [code]);
    expect(await sleutelsVergeten(page)).toContain(herstelId);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await wachtTotStil(page, () => slotStand(page));
    await expect(page.locator('#slot')).toBeHidden();
  });
});

// ---- de demo heeft er niets van ----
test.describe('de demo heeft geen herstelcode en geen herstelscherm', { tag: '@demo' }, () => {
  test('met slot- en herstelgegevens in de demodatabase: geen slot, geen herstelstrook, geen herstelrijen op Vergrendeling, en er wordt niets bijgeschreven', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    await page.evaluate(
      () =>
        new Promise((klaar, mis) => {
          const q = indexedDB.open('bloei-demo');
          q.onsuccess = () => {
            const tx = q.result.transaction('instellingen', 'readwrite');
            const s = tx.objectStore('instellingen');
            s.put({ sleutel: 'slot.aan', waarde: true });
            s.put({ sleutel: 'slot.pin', waarde: { hash: 'x', zout: 'y', rondes: 1, lengte: 6 } });
            s.put({ sleutel: 'slot.methode', waarde: 'pin' });
            s.put({ sleutel: 'slot.herstel', waarde: { hash: 'x', zout: 'y', rondes: 1, gemaakt: 1, bevestigd: false } });
            s.put({ sleutel: 'slot.herstelId', waarde: 'AQIDBA' });
            tx.oncomplete = () => {
              q.result.close();
              klaar();
            };
            tx.onerror = () => mis(tx.error);
          };
        }),
    );
    await page.reload();
    await expect(page.locator('#scherm[data-scherm]')).toBeVisible();
    await expect(page.locator('#slot')).toBeHidden();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('pagehide'));
    });
    await expect(page.locator('#slot')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Ik ken mijn code niet meer' })).toHaveCount(0);
    await expect(page.locator('.strook').filter({ hasText: 'herstelcode' })).toHaveCount(0);
    await page.goto('./#/meer/vergrendeling');
    await expect(page.getByText('In de demo staat de vergrendeling uit.')).toBeVisible();
    await schermKlaar(page, '#/meer/vergrendeling');
    await expect(SLOTSCHAKELAAR(page)).toBeDisabled();
    await expect(SLOTSCHAKELAAR(page)).toHaveAttribute('aria-checked', 'false');
    for (const naam of ['Pincode wijzigen', 'Nieuwe herstelcode maken', 'Herstelcode maken', 'Toestel koppelen', 'Toestel ontkoppelen']) await expect(page.getByRole('button', { name: naam })).toHaveCount(0);
    for (const haak of ['slot-pin', 'slot-herstel', 'slot-toestel']) await expect(page.locator(`[data-uitleg="${haak}"]`)).toHaveCount(0);
    // Niets bijgeschreven door de herstelstroom (het aanbod voor bestaande gebruikers, tellers)
    const rijen = await page.evaluate(
      () =>
        new Promise((klaar) => {
          const q = indexedDB.open('bloei-demo');
          q.onsuccess = () => {
            const r = q.result.transaction('instellingen').objectStore('instellingen').getAll();
            r.onsuccess = () => {
              q.result.close();
              klaar(r.result.map((x) => x.sleutel).filter((k) => k.startsWith('slot.')).sort());
            };
          };
        }),
    );
    expect(rijen).toEqual(['slot.aan', 'slot.herstel', 'slot.herstelId', 'slot.methode', 'slot.pin']);
  });
});

// ---- BESLISSING 533: Pincode wijzigen met een keer de nieuwe code en "Ongedaan maken" als vangnet ----
// x-herstel.spec.js toetst het gewone gebruik. Hier: de vorige afgeleide staat ook tijdens de zes seconden nergens in de opslag, na de zes seconden, bij
// verbergen en bij pagehide kan er niets meer teruggezet worden, en in een ander tabblad gewijzigd betekent dat Ongedaan maken niets doet.
test.describe('pincode wijzigen: het vangnet is geen achterdeur', () => {
  const pinRij = (page) => instelling(page, 'slot.pin');
  async function wijzigNaarNieuw(page) {
    await page.getByRole('button', { name: 'Pincode wijzigen' }).click();
    await tik(page, CODE);
    await expect(page.getByText('Kies je nieuwe code van zes cijfers.')).toBeVisible();
    await tik(page, NIEUW);
    await expect(page.locator('.strook').filter({ hasText: 'Je pincode is gewijzigd.' })).toBeVisible();
  }
  const opKnop = (page) => page.locator('.strook').getByRole('button', { name: 'Ongedaan maken' });

  test('de vorige code staat ook tijdens de zes seconden nergens: niet als code, niet als afgeleide (zout en hash) in IndexedDB, localStorage of sessionStorage', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'geen');
    await zetSlotAan(page);
    const oud = await pinRij(page);
    await wijzigNaarNieuw(page);
    const nieuw = await pinRij(page);
    expect(nieuw.hash).not.toBe(oud.hash);
    const opslag = JSON.stringify(await alleOpslag(page));
    expect(opslag).not.toContain(oud.hash);
    expect(opslag).not.toContain(oud.zout);
    expect(opslag).not.toContain(CODE);
    expect(opslag).not.toContain(NIEUW);
  });

  for (const [naam, verlaat] of [
    ['na zes seconden', (page) => page.clock.runFor(6500)],
    ['bij verbergen (de app wordt verlaten)', (page) => verberg(page)],
    ['bij pagehide', (page) => page.evaluate(() => window.dispatchEvent(new Event('pagehide')))],
  ]) {
    test(`Ongedaan maken is er niet meer ${naam}: de nieuwe code blijft gelden, de vorige werkt niet`, async ({ page }) => {
      await vasteKlok(page);
      await authenticator(page, 'geen');
      await zetSlotAan(page);
      await wijzigNaarNieuw(page);
      const nieuw = await pinRij(page);
      await verlaat(page);
      if (naam !== 'na zes seconden') {
        // terug in de app: de code is nodig; een strook die er nog zou staan, zet niets terug
        await toonWeer(page);
        await expect(page.locator('.cijferblok')).toBeVisible();
        await tik(page, NIEUW);
        await expect(page.locator('#slot')).toBeHidden();
      }
      if (await opKnop(page).count()) await opKnop(page).click();
      await page.clock.runFor(1000);
      await expect(page.getByText('Je vorige pincode geldt weer.')).toHaveCount(0);
      expect(await pinRij(page)).toEqual(nieuw);
      await page.reload();
      await wachtOpSlot(page);
      await tik(page, CODE);
      await expect(page.locator('#slot .slot__boodschap').first()).toHaveText('Die code klopt niet.');
      await tik(page, NIEUW);
      await expect(page.locator('#slot')).toBeHidden();
    });
  }

  test('de code is intussen elders gewijzigd (ander tabblad): Ongedaan maken doet niets, de code van dat andere tabblad blijft gelden', async ({ page }) => {
    await vasteKlok(page);
    await authenticator(page, 'geen');
    await zetSlotAan(page);
    await wijzigNaarNieuw(page);
    // Wat een ander tabblad zou schrijven: een pincode met een andere afgeleide (hier die van DERDE), terwijl de strook nog openstaat.
    await page.evaluate(async (code) => {
      const b64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u)));
      const zout = crypto.getRandomValues(new Uint8Array(16));
      const sleutel = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
      const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: zout, iterations: 600000 }, sleutel, 256);
      await new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const tx = open.result.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'slot.pin', waarde: { zout: b64(zout), hash: b64(hash), rondes: 600000, lengte: 6 } });
          tx.oncomplete = () => {
            open.result.close();
            klaar();
          };
        };
      });
    }, DERDE);
    const derde = await pinRij(page);
    await expect(opKnop(page)).toBeVisible(); // de strook staat er nog: het gaat om wat de knop doet
    await opKnop(page).click();
    await page.clock.runFor(1000);
    await expect(page.getByText('Je vorige pincode geldt weer.')).toHaveCount(0);
    expect(await pinRij(page)).toEqual(derde);
    await page.reload();
    await wachtOpSlot(page);
    await tik(page, CODE);
    await expect(page.locator('#slot .slot__boodschap').first()).toHaveText('Die code klopt niet.');
    await tik(page, NIEUW);
    await expect(page.locator('#slot .slot__boodschap').first()).toHaveText('Die code klopt niet.');
    await tik(page, DERDE);
    await expect(page.locator('#slot')).toBeHidden();
  });
});
